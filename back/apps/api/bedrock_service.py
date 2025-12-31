"""
AWS Bedrock 서비스 모듈
- Text2SQL: 자연어 프롬프트를 SQL로 변환
- RAG: 검색된 데이터를 자연어로 정리
"""
import json
import boto3
from typing import Dict, Optional, List, Tuple
from django.conf import settings
from apps.db.models import Event, Video


def get_event_schema() -> str:
    """
    Event 모델에서 실제 필드 정보를 읽어 스키마 문자열 생성
    models.py와 자동 동기화
    """
    field_descriptions = []
    
    # Event 모델의 모든 필드 순회
    for field in Event._meta.get_fields():
        field_name = field.name
        field_type = field.get_internal_type()
        
        # 관계 필드는 스킵
        if field_type in ['ManyToManyField', 'ManyToOneRel', 'OneToOneRel']:
            continue
        
        # 필드 타입을 SQL 타입으로 매핑
        type_mapping = {
            'AutoField': 'INTEGER',
            'BigAutoField': 'BIGINT',
            'IntegerField': 'INTEGER',
            'FloatField': 'FLOAT',
            'CharField': 'VARCHAR',
            'TextField': 'TEXT',
            'BooleanField': 'BOOLEAN',
            'DateTimeField': 'TIMESTAMP',
            'DateField': 'DATE',
            'JSONField': 'JSONB',
            'ForeignKey': 'INTEGER',
        }
        
        sql_type = type_mapping.get(field_type, 'TEXT')
        
        # VectorField 처리
        if 'VectorField' in field_type:
            sql_type = 'VECTOR'
        # ArrayField 처리  
        elif 'ArrayField' in field_type:
            sql_type = 'TEXT[]'
        
        # 필드 설명 추가
        help_text = getattr(field, 'help_text', '')
        verbose_name = getattr(field, 'verbose_name', field_name)
        
        # 주요 필드에 대한 상세 설명
        detailed_info = {
            'timestamp': 'FLOAT - 이벤트 발생 시간(초, 영상 시작점 기준)',
            'event_type': "VARCHAR(50) - 이벤트 타입 (person_enter, person_exit, interaction, anomaly, picking, walking, standing, theft=도난, collapse=쓰러짐, sitting=점거)",
            'gender': "VARCHAR(10) - 성별 (male, female)",
            'age_group': "VARCHAR(20) - 나이대 (young, middle, old)",
            'action': "VARCHAR(100) - 행동 (walking, standing, picking 등)",
            'emotion': "VARCHAR(20) - 감정 (happy, neutral, sad)",
            'bbox_x': 'INTEGER - 바운딩 박스 X 좌표',
            'bbox_y': 'INTEGER - 바운딩 박스 Y 좌표',
            'bbox_width': 'INTEGER - 바운딩 박스 너비',
            'bbox_height': 'INTEGER - 바운딩 박스 높이',
            'confidence': 'FLOAT - 신뢰도 (0-1)',
            'interaction_target': 'VARCHAR(100) - 상호작용 대상',
        }
        
        if field_name in detailed_info:
            field_descriptions.append(f"        - {field_name}: {detailed_info[field_name]}")
        elif field_name in ['id', 'video_id', 'video']:
            # Primary/Foreign key는 간단하게
            if field_name == 'id':
                field_descriptions.append(f"        - {field_name}: {sql_type} (Primary Key)")
            elif field_name == 'video_id' or field_name == 'video':
                field_descriptions.append(f"        - video_id: INTEGER (Foreign Key -> db_video.video_id)")
        else:
            # 기타 필드
            desc = help_text or verbose_name
            field_descriptions.append(f"        - {field_name}: {sql_type} - {desc}")
    
    return "\n".join(field_descriptions)


class BedrockService:
    """AWS Bedrock을 활용한 AI 서비스"""
    
    def __init__(self):
        """Bedrock 클라이언트 초기화"""
        self.region = settings.AWS_BEDROCK_REGION
        self.model_id = settings.AWS_BEDROCK_MODEL_ID
        
        # AWS 자격증명 설정 (환경에 따라 자동 선택)
        # ECS/Fargate: IAM Role 자동 사용 (가장 안전)
        # 로컬: AWS_ACCESS_KEY_ID 사용
        aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
        aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
        
        # Bedrock Runtime 클라이언트 생성
        client_kwargs = {
            'service_name': 'bedrock-runtime',
            'region_name': self.region
        }
        
        # 로컬 개발 환경에서만 명시적 자격증명 사용
        if aws_access_key and aws_secret_key:
            client_kwargs['aws_access_key_id'] = aws_access_key
            client_kwargs['aws_secret_access_key'] = aws_secret_key
            print(f"🔑 Bedrock: 명시적 자격증명 사용 (로컬 개발)")
        else:
            print(f"🔐 Bedrock: IAM Role 자동 인증 사용 (ECS/Fargate)")
        
        self.bedrock_runtime = boto3.client(**client_kwargs)
        
        # Bedrock Agent Runtime (Knowledge Base용)
        agent_kwargs = {
            'service_name': 'bedrock-agent-runtime',
            'region_name': self.region
        }
        
        if aws_access_key and aws_secret_key:
            agent_kwargs['aws_access_key_id'] = aws_access_key
            agent_kwargs['aws_secret_access_key'] = aws_secret_key
        
        self.bedrock_agent = boto3.client(**agent_kwargs)
        
        print(f"✅ Bedrock 서비스 초기화: region={self.region}, model={self.model_id}")
    
    def _invoke_claude(self, prompt: str, system_prompt: str = None, max_tokens: int = 2000) -> str:
        """
        Claude 모델 호출
        
        Args:
            prompt: 사용자 프롬프트
            system_prompt: 시스템 프롬프트 (선택사항)
            max_tokens: 최대 토큰 수
            
        Returns:
            Claude의 응답 텍스트
        """
        try:
            # Claude 3 요청 바디 구성
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "messages": messages,
                "temperature": 0.1,
                "top_p": 0.9,
            }
            
            # 시스템 프롬프트가 있으면 추가
            if system_prompt:
                body["system"] = system_prompt
            
            # Bedrock API 호출
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps(body)
            )
            
            # 응답 파싱
            response_body = json.loads(response['body'].read())
            
            # Claude 3 응답 구조: content[0].text
            if 'content' in response_body and len(response_body['content']) > 0:
                return response_body['content'][0]['text']
            
            return ""
            
        except Exception as e:
            print(f"❌ Claude 호출 오류: {str(e)}")
            raise
    
    def text_to_sql(self, prompt: str, video_id: Optional[int] = None) -> Dict[str, any]:
        """
        자연어 프롬프트를 SQL 쿼리로 변환
        
        Args:
            prompt: 사용자의 자연어 프롬프트
            video_id: 특정 비디오로 제한할 경우 video_id
            
        Returns:
            {
                "sql": "생성된 SQL 쿼리",
                "explanation": "SQL 쿼리 설명",
                "error": "에러 메시지 (있을 경우)"
            }
        """
        # 동적으로 Event 모델에서 스키마 생성
        event_fields = get_event_schema()
        
        # 데이터베이스 스키마 정보
        schema_info = f"""
        데이터베이스 스키마:
        
        테이블: db_video (비디오 정보)
        - video_id: INTEGER (Primary Key)
        - name: VARCHAR(255) - 비디오 이름
        - filename: VARCHAR(255) - 파일명
        - duration: FLOAT - 비디오 길이(초)
        - recorded_at: TIMESTAMP - 촬영 시각
        - created_at: TIMESTAMP - 생성 시각
        
        테이블: db_event (이벤트 정보)
{event_fields}
        
        중요사항:
        1. timestamp는 FLOAT 타입이며 초(seconds) 단위입니다.
        2. 테이블명은 반드시 db_video, db_event를 사용하세요.
        3. JOIN 시 db_event.video_id = db_video.video_id를 사용하세요.
        4. 시간 관련 질문은 timestamp 컬럼을 사용하세요.
        5. 위치 정보는 bbox_x, bbox_y를 사용하세요.
        6. 성별 검색 시 gender 컬럼을 사용하세요.
        7. 행동 검색 시 action 컬럼을 사용하세요.
        """
        
        # 비디오 필터 조건
        video_filter = ""
        if video_id:
            video_filter = f"\n\n특정 비디오 필터: video_id = {video_id} 조건을 반드시 포함하세요."
        
        # Text2SQL 프롬프트
        text2sql_prompt = f"""당신은 PostgreSQL 전문가입니다. 다음 사용자 질문을 SQL 쿼리로 변환하세요.

{schema_info}
{video_filter}

사용자 질문: "{prompt}"

요구사항:
1. PostgreSQL 문법을 사용하세요.
2. 반드시 실행 가능한 SQL만 생성하세요.
3. SELECT 문만 생성하세요 (INSERT, UPDATE, DELETE 금지).
4. 사용자 질문에 맞는 컬럼들을 선택하세요:
   - 시간 정보: timestamp, duration
   - 인물 정보: gender, age_group, emotion
   - 행동 정보: action, event_type, interaction_target
   - 위치 정보: bbox_x, bbox_y, bbox_width, bbox_height
   - 신뢰도: confidence
5. 반드시 id와 timestamp는 포함하세요 (이벤트 조회용).
6. 시간 범위 질문의 경우 timestamp 컬럼으로 필터링하세요.
7. 이벤트 타입 관련 질문은 event_type 컬럼을 사용하세요.
8. 결과는 timestamp 순으로 정렬하세요 (ORDER BY timestamp).

예시:
- "남성이 나타난 시점" → SELECT id, timestamp, gender WHERE gender='male'
- "6초에 인물의 성별과 위치" → SELECT id, timestamp, gender, bbox_x, bbox_y WHERE timestamp=6
- "도난 사건" → SELECT id, timestamp, event_type, action WHERE event_type='theft'
- "노인이 서있는 장면" → SELECT id, timestamp, age_group, action WHERE age_group='old' AND action='standing'

응답 형식 (JSON):
{{
    "sql": "실행 가능한 SQL 쿼리",
    "explanation": "쿼리 설명",
    "selected_fields": ["id", "timestamp", "gender", ...] // 선택한 컬럼 목록
}}

JSON 형식으로만 응답하세요."""

        try:
            # Claude 호출
            response = self._invoke_claude(
                prompt=text2sql_prompt,
                system_prompt="당신은 SQL 변환 전문가입니다. 항상 유효한 PostgreSQL 쿼리를 생성하세요.",
                max_tokens=1500
            )
            
            print(f"🤖 Bedrock Text2SQL 응답: {response}")
            
            # JSON 파싱
            # Claude가 ```json ... ``` 형식으로 응답할 수 있으므로 처리
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            
            result = json.loads(response)
            
            # SQL 후처리
            sql = result.get("sql", "")
            
            # 세미콜론 제거
            sql = sql.rstrip(";").strip()
            
            return {
                "sql": sql,
                "explanation": result.get("explanation", ""),
                "error": None
            }
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON 파싱 오류: {str(e)}")
            print(f"응답 내용: {response}")
            return {
                "sql": None,
                "explanation": None,
                "error": f"응답 파싱 실패: {str(e)}"
            }
        except Exception as e:
            print(f"❌ Text2SQL 오류: {str(e)}")
            return {
                "sql": None,
                "explanation": None,
                "error": str(e)
            }
    
    def format_timeline_response(
        self, 
        prompt: str, 
        events: List[Dict], 
        video_name: str = None
    ) -> str:
        """
        검색된 이벤트들을 자연어로 정리하여 응답 생성
        
        Args:
            prompt: 사용자의 원래 질문
            events: 검색된 이벤트 리스트
            video_name: 비디오 이름
            
        Returns:
            자연어로 정리된 응답
        """
        if not events:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다."
        
        # 이벤트 정보를 텍스트로 구성
        events_text = ""
        for i, event in enumerate(events, 1):
            timestamp = event.get('timestamp', 0)
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            
            event_type = event.get('event_type', 'unknown')
            event_type_kr = {
                'theft': '도난',
                'collapse': '쓰러짐',
                'sitting': '점거'
            }.get(event_type, event_type)
            
            action = event.get('action_detected', '알 수 없음')
            location = event.get('location', '알 수 없음')
            age = event.get('age', '알 수 없음')
            gender = event.get('gender', '알 수 없음')
            
            events_text += f"""
이벤트 {i}:
- 시간: {minutes}분 {seconds}초
- 유형: {event_type_kr}
- 행동: {action}
- 위치: {location}
- 인물: {gender}, 약 {age}세
"""
        
        # RAG 프롬프트
        rag_prompt = f"""다음 CCTV 영상 분석 결과를 바탕으로 사용자 질문에 답변하세요.

사용자 질문: "{prompt}"

비디오: {video_name or '알 수 없음'}

검색된 이벤트 정보:
{events_text}

요구사항:
1. 자연스러운 한국어로 답변하세요.
2. 각 이벤트의 시간(xx분 yy초)을 명확히 언급하세요.
3. 이벤트가 여러 개면 순서대로 설명하세요.
4. 구체적이고 유용한 정보를 제공하세요.
5. 존댓말을 사용하세요.

답변:"""

        try:
            response = self._invoke_claude(
                prompt=rag_prompt,
                system_prompt="당신은 CCTV 영상 분석 결과를 설명하는 전문가입니다. 명확하고 정확한 정보를 제공하세요.",
                max_tokens=2000
            )
            
            return response.strip()
            
        except Exception as e:
            print(f"❌ RAG 응답 생성 오류: {str(e)}")
            # 오류 시 기본 응답 생성
            return self._generate_default_response(events)
    
    def _generate_default_response(self, events: List[Dict]) -> str:
        """
        Bedrock 호출 실패 시 기본 응답 생성
        """
        if not events:
            return "이벤트를 찾을 수 없습니다."
        
        response_parts = []
        for i, event in enumerate(events, 1):
            timestamp = event.get('timestamp', 0)
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            
            event_type = event.get('event_type', 'unknown')
            event_type_kr = {
                'theft': '도난',
                'collapse': '쓰러짐',
                'sitting': '점거'
            }.get(event_type, event_type)
            
            response_parts.append(
                f"{i}. {minutes}분 {seconds}초에 {event_type_kr} 이벤트가 감지되었습니다."
            )
        
        return "\n".join(response_parts)
    
    def retrieve_from_knowledge_base(
        self, 
        query: str, 
        knowledge_base_id: str = None,
        max_results: int = 5
    ) -> List[Dict]:
        """
        Bedrock Knowledge Base에서 관련 정보 검색
        
        Args:
            query: 검색 쿼리
            knowledge_base_id: Knowledge Base ID (없으면 설정에서 가져옴)
            max_results: 최대 결과 개수
            
        Returns:
            검색된 결과 리스트
        """
        kb_id = knowledge_base_id or settings.AWS_BEDROCK_KNOWLEDGE_BASE_ID
        
        if not kb_id:
            print("⚠️ Knowledge Base ID가 설정되지 않았습니다.")
            return []
        
        try:
            response = self.bedrock_agent.retrieve(
                knowledgeBaseId=kb_id,
                retrievalQuery={
                    'text': query
                },
                retrievalConfiguration={
                    'vectorSearchConfiguration': {
                        'numberOfResults': max_results
                    }
                }
            )
            
            results = []
            for item in response.get('retrievalResults', []):
                results.append({
                    'content': item.get('content', {}).get('text', ''),
                    'score': item.get('score', 0.0),
                    'location': item.get('location', {})
                })
            
            return results
            
        except Exception as e:
            print(f"❌ Knowledge Base 검색 오류: {str(e)}")
            return []


# 싱글톤 인스턴스
_bedrock_service = None

def get_bedrock_service() -> BedrockService:
    """Bedrock 서비스 싱글톤 인스턴스 반환"""
    global _bedrock_service
    
    if _bedrock_service is None:
        _bedrock_service = BedrockService()
    
    return _bedrock_service
