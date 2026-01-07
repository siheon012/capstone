"""
AWS Bedrock 서비스 모듈
- Text2SQL: 자연어 프롬프트를 SQL로 변환
- RAG: 검색된 데이터를 자연어로 정리
"""
import json
import boto3
from typing import Dict, Optional, List, Tuple
from datetime import datetime
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
        
        **중요 - attributes JSON 필드 구조 (JSONB 타입):**
        db_event.attributes에는 다음 정보가 저장되어 있습니다:
        - age: FLOAT - 정확한 나이 (예: 6.88, 16.61, 45.8)
        - obj_id: INTEGER - 객체 추적 ID
        - scene_analysis: TEXT - AI 장면 분석 텍스트
        - location: INTEGER - 화면상 위치 (1=왼쪽, 2=가운데, 3=오른쪽)
        - area_of_interest: INTEGER - 관심 영역 (1=왼쪽, 2=가운데, 3=오른쪽)
        
        **PostgreSQL JSON 쿼리 방법:**
        - 정확한 나이: (attributes->>'age')::float
        - 위치: (attributes->>'location')::int
        - 관심 영역: (attributes->>'area_of_interest')::int
        - 장면 분석: attributes->>'scene_analysis'
        
        중요사항:
        1. timestamp는 FLOAT 타입이며 초(seconds) 단위입니다.
        2. 테이블명은 반드시 db_video, db_event를 사용하세요.
        3. JOIN 시 db_event.video_id = db_video.video_id를 사용하세요.
        4. 시간 관련 질문은 timestamp 컬럼을 사용하세요.
        5. 위치 정보 (bbox): bbox_x, bbox_y, bbox_width, bbox_height 사용
        6. 성별 검색: gender 컬럼 사용 (male/female)
        7. 행동 검색: action 컬럼 사용
        8. **정확한 나이 검색**: (attributes->>'age')::float 사용
           - "20세 이상" → WHERE (attributes->>'age')::float >= 20
           - "10대" → WHERE (attributes->>'age')::float BETWEEN 10 AND 19
           - "30세 남성" → WHERE (attributes->>'age')::float >= 30 AND gender = 'male'
        9. **화면 위치 검색**: (attributes->>'location')::int 사용
           - "왼쪽" → WHERE (attributes->>'location')::int = 1
           - "가운데" → WHERE (attributes->>'location')::int = 2
           - "오른쪽" → WHERE (attributes->>'location')::int = 3
        10. **관심 영역 검색**: (attributes->>'area_of_interest')::int 사용
           - "관심 영역이 왼쪽" → WHERE (attributes->>'area_of_interest')::int = 1
           - "관심 영역이 오른쪽" → WHERE (attributes->>'area_of_interest')::int = 3
        11. 나이대 검색 (대략적): age_group 컬럼 사용 (young/middle/old)
        12. **objects_detected JSONB 필드 검색**:
           - "칼을 든 사람" → WHERE objects_detected::text LIKE '%칼%'
           - "담배 피우는 사람" → WHERE objects_detected::text LIKE '%담배%'
        13. **attributes JSON 필드의 하위 필드들**:
           - age: (attributes->>'age')::float - 정확한 나이
           - location: (attributes->>'location')::int - 화면 위치 (1=왼쪽, 2=가운데, 3=오른쪽)
           - area_of_interest: (attributes->>'area_of_interest')::int - 관심 영역 (1=왼쪽, 2=가운데, 3=오른쪽)
           - action_detected: attributes->>'action_detected' - 감지된 행동
           - gender_score: (attributes->>'gender_score')::float - 성별 신뢰도 (0-1)
           - obj_id: (attributes->>'obj_id')::int - 객체 추적 ID
           - scene_analysis: attributes->>'scene_analysis' - 장면 분석 텍스트
           - orientataion: attributes->>'orientataion' - 방향 정보
        
        **JSONB 쿼리 예시**:
        - 나이: WHERE (attributes->>'age')::float BETWEEN 20 AND 30
        - 객체 (정확 매칭): WHERE objects_detected::jsonb ? '칼'
        - 객체 (부분 매칭): WHERE objects_detected::text ILIKE '%칼%'
        - 위치: WHERE (attributes->>'location')::int = 1
        
        14. **실제 시각 기준 조회 (중요)**:
            - 사용자 질문에 '오후 2시', '어제', '오늘 아침' 등 실제 시각이 포함되면:
            - db_video.recorded_at (촬영 시작 시각) + (db_event.timestamp * INTERVAL '1 second')로 계산
            - 예: "어제 오후 2시" → WHERE db_video.recorded_at + (db_event.timestamp * INTERVAL '1 second') 
              BETWEEN '2026-01-07 14:00:00' AND '2026-01-07 15:00:00'
            - 현재 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
        
        15. **집계 및 통계 쿼리**:
            - "몇 번?" → COUNT(*) 사용
            - "가장 많이?" → GROUP BY ... ORDER BY COUNT(*) DESC LIMIT 1
            - "평균 나이" → AVG((attributes->>'age')::float)
            - "시간대별 분포" → EXTRACT(HOUR FROM recorded_at + (timestamp * INTERVAL '1 second'))
            - 예: "남성이 몇 번 나타났어?" → SELECT COUNT(*) FROM db_event WHERE gender='male'
            - 예: "가장 많이 온 시간대는?" → SELECT EXTRACT(HOUR FROM db_video.recorded_at + (db_event.timestamp * INTERVAL '1 second')) as hour, COUNT(*) FROM db_event JOIN db_video ON db_event.video_id = db_video.video_id GROUP BY hour ORDER BY COUNT(*) DESC LIMIT 1
        
        16. **중복 제거**:
            - 동일 인물이 여러 프레임에 나올 수 있으므로 필요시 DISTINCT 사용
            - 예: "몇 명의 남성?" → SELECT COUNT(DISTINCT (attributes->>'obj_id')::int) WHERE gender='male'
        
        17. **event_type 전체 목록 (무인 점포 특화)**:
            - theft: 도난 (물건을 몰래 가져가는 행위)
            - collapse: 쓰러짐 (사람이 바닥에 쓰러진 상태)
            - sitting: 점거 (오래 앉아있거나 공간 점거)
            - loitering: 배회 (의심스럽게 배회하는 행동)
            - intrusion: 침입 (허가되지 않은 영역 진입)
            - fighting: 싸움/폭력 (신체적 충돌)
            - vandalism: 기물 파손
            - person_enter: 사람 진입
            - person_exit: 사람 퇴장
            - interaction: 상호작용 (물건 집기, 대화 등)
            - anomaly: 일반적 이상 행동
            - walking: 걷기
            - standing: 서있기
            - picking: 물건 집기
            - **사용자 질문의 의도를 파악하여 가장 적합한 event_type으로 매핑하세요**
            - 예: "싸움" → event_type='fighting', "물건 훔침" → event_type='theft'
        
        18. **JSONB 검색 최적화**:
            - 정확 매칭(성능 우선): objects_detected::jsonb ? '칼'
            - 부분 매칭(유연성 우선): objects_detected::text ILIKE '%칼%' (대소문자 무시)
            - 예: "칼 든 사람" → WHERE objects_detected::jsonb ? '칼' OR objects_detected::text ILIKE '%knife%'
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
   - 인물 정보: gender, age_group, emotion, (attributes->>'age')::float
   - 행동 정보: action, event_type, interaction_target, attributes->>'action_detected'
   - 위치 정보: bbox_x, bbox_y, bbox_width, bbox_height
   - 화면 위치: (attributes->>'location')::int, (attributes->>'area_of_interest')::int
   - 신뢰도: confidence, (attributes->>'gender_score')::float
   - 기타: (attributes->>'obj_id')::int, attributes->>'scene_analysis', attributes->>'orientataion'
5. 반드시 id와 timestamp는 포함하세요 (이벤트 조회용).
6. 시간 범위 질문의 경우 timestamp 컬럼으로 필터링하세요.
7. 이벤트 타입 관련 질문은 event_type 컬럼을 사용하세요.
8. 결과는 timestamp 순으로 정렬하세요 (ORDER BY timestamp).
9. **나이 관련 질문은 반드시 (attributes->>'age')::float 사용** (age_group은 대략적)
10. **화면 위치 질문은 (attributes->>'location')::int 사용** (1=왼쪽, 2=가운데, 3=오른쪽)
11. **관심 영역 질문은 (attributes->>'area_of_interest')::int 사용**
12. **attributes JSON 필드는 ->> 연산자로 접근**하고 필요시 ::타입으로 캐스팅하세요

예시 (정확한 나이):
- "20세 남성" → SELECT id, timestamp, gender, (attributes->>'age')::float as age WHERE gender='male' AND (attributes->>'age')::float >= 20 AND (attributes->>'age')::float < 21
- "30세 이상 남성" → SELECT id, timestamp, gender, (attributes->>'age')::float as age WHERE gender='male' AND (attributes->>'age')::float >= 30
- "10대 여성" → SELECT id, timestamp, gender, (attributes->>'age')::float as age WHERE gender='female' AND (attributes->>'age')::float BETWEEN 10 AND 19
- "남성의 나이는?" → SELECT id, timestamp, gender, (attributes->>'age')::float as age WHERE gender='male'

예시 (위치):
- "왼쪽에 있던 시간" → SELECT id, timestamp, (attributes->>'location')::int as location WHERE (attributes->>'location')::int = 1
- "오른쪽 관심 영역" → SELECT id, timestamp, (attributes->>'area_of_interest')::int as area WHERE (attributes->>'area_of_interest')::int = 3
- "가운데 남성" → SELECT id, timestamp, gender, (attributes->>'location')::int as location WHERE gender='male' AND (attributes->>'location')::int = 2

예시 (행동 및 기타):
- "감지된 행동은?" → SELECT id, timestamp, attributes->>'action_detected' as action_detected
- "객체 ID가 5인 경우" → SELECT id, timestamp, (attributes->>'obj_id')::int as obj_id WHERE (attributes->>'obj_id')::int = 5
- "성별 신뢰도 높은 이벤트" → SELECT id, timestamp, gender, (attributes->>'gender_score')::float as gender_score WHERE (attributes->>'gender_score')::float > 0.9

예시 (일반):
- "남성이 나타난 시점" → SELECT id, timestamp, gender WHERE gender='male'
- "6초에 인물의 성별과 위치" → SELECT id, timestamp, gender, bbox_x, bbox_y WHERE timestamp=6
- "도난 사건" → SELECT id, timestamp, event_type, action WHERE event_type='theft'

예시 (실제 시각):
- "어제 오후 2시에 무슨 일이?" → SELECT id, timestamp, event_type FROM db_event JOIN db_video ON db_event.video_id = db_video.video_id WHERE db_video.recorded_at + (db_event.timestamp * INTERVAL '1 second') BETWEEN '2026-01-07 14:00:00' AND '2026-01-07 15:00:00'
- "오늘 아침 남성" → SELECT id, timestamp, gender FROM db_event JOIN db_video ON db_event.video_id = db_video.video_id WHERE gender='male' AND EXTRACT(HOUR FROM db_video.recorded_at + (db_event.timestamp * INTERVAL '1 second')) BETWEEN 6 AND 12

예시 (집계):
- "남성이 몇 번 나타났어?" → SELECT COUNT(*) as count FROM db_event WHERE gender='male'
- "20대 여성이 물건을 집어간 기록" → SELECT id, timestamp, gender, (attributes->>'age')::float as age, action FROM db_event WHERE gender='female' AND (attributes->>'age')::float BETWEEN 20 AND 29 AND (action ILIKE '%pick%' OR event_type='picking')
- "최근 1시간 동안 이상 행동(신뢰도 0.8 이상)" → SELECT id, timestamp, event_type, confidence FROM db_event JOIN db_video ON db_event.video_id = db_video.video_id WHERE event_type IN ('anomaly', 'theft', 'intrusion') AND confidence >= 0.8 AND db_video.recorded_at + (db_event.timestamp * INTERVAL '1 second') >= NOW() - INTERVAL '1 hour'
- "가장 많이 감지된 나이대는?" → SELECT CASE WHEN (attributes->>'age')::float < 20 THEN '10대' WHEN (attributes->>'age')::float < 30 THEN '20대' WHEN (attributes->>'age')::float < 40 THEN '30대' ELSE '40대 이상' END as age_range, COUNT(*) as count FROM db_event WHERE (attributes->>'age')::float IS NOT NULL GROUP BY age_range ORDER BY count DESC LIMIT 1

예시 (복합 조건):
- "왼쪽에 있던 남성 중 30세 이상" → SELECT id, timestamp, gender, (attributes->>'age')::float as age, (attributes->>'location')::int as location WHERE gender='male' AND (attributes->>'age')::float >= 30 AND (attributes->>'location')::int = 1
- "칼을 든 사람이 있었나?" → SELECT id, timestamp, event_type, objects_detected FROM db_event WHERE objects_detected::jsonb ? '칼' OR objects_detected::text ILIKE '%knife%' OR objects_detected::text ILIKE '%칼%'

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
            if timestamp:
                minutes = int(timestamp // 60)
                seconds = int(timestamp % 60)
                time_str = f"{minutes}분 {seconds}초"
            else:
                time_str = "시간 정보 없음"
            
            # 이벤트 정보를 동적으로 구성
            event_info = f"데이터 {i}:\n"
            
            # timestamp는 별도 처리
            if timestamp:
                event_info += f"- 시간: {time_str}\n"
            
            # 나머지 모든 필드를 동적으로 추가
            for key, value in event.items():
                if key == 'timestamp':
                    continue  # 이미 처리함
                
                # 필드명을 한국어로 변환
                field_name_kr = {
                    'event_type': '유형',
                    'action_detected': '행동',
                    'location': '위치',
                    'age': '나이',
                    'gender': '성별',
                    'gender_score': '성별 신뢰도',
                    'scene_analysis': '장면 분석',
                    'action': '행동',
                    'emotion': '감정',
                    'age_group': '연령대',
                }.get(key, key)
                
                # 값 변환
                if key == 'event_type':
                    value = {
                        'theft': '도난',
                        'collapse': '쓰러짐',
                        'sitting': '점거',
                        'walking': '걷기',
                        'standing': '서있기'
                    }.get(value, value)
                elif key == 'gender':
                    value = {'male': '남성', 'female': '여성'}.get(value, value)
                elif key == 'location':
                    if isinstance(value, int):
                        value = {1: '왼쪽', 2: '가운데', 3: '오른쪽'}.get(value, f'위치 {value}')
                
                if value is not None and value != '':
                    event_info += f"- {field_name_kr}: {value}\n"
            
            events_text += event_info + "\n"
        
        # RAG 프롬프트
        rag_prompt = f"""다음은 CCTV 영상 분석 결과입니다. 사용자 질문에 대해 이 데이터를 바탕으로 답변하세요.

사용자 질문: "{prompt}"

비디오: {video_name or '알 수 없음'}

검색된 데이터:
{events_text}

요구사항:
1. 자연스러운 한국어로 답변하세요.
2. 데이터에 있는 정보를 정확하게 전달하세요.
3. 시간 정보가 있다면 명확히 언급하세요.
4. 여러 데이터가 있으면 요약하거나 대표값을 제시하세요.
5. 존댓말을 사용하세요.
6. 데이터가 부족하면 솔직하게 "정보가 부족합니다"라고 말하세요.

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
    
    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Bedrock Titan Embeddings V2로 텍스트를 벡터로 변환
        
        Args:
            text: 임베딩할 텍스트
            
        Returns:
            1024차원 임베딩 벡터 (Titan v2 권장 차원)
            실패 시 None
        """
        if not text or not text.strip():
            print("⚠️ 임베딩할 텍스트가 비어있습니다.")
            return None
        
        try:
            # Titan Embeddings V2 - 다중 차원(Matryoshka) 지원, 문맥 이해도 향상
            # 1024 dimensions (v2 권장 차원, 속도와 정확도 최적화)
            embedding_model_id = "amazon.titan-embed-text-v2:0"
            
            # 텍스트 길이 제한 (Titan v2: 8192 토큰)
            max_chars = 30000  # 안전 마진
            if len(text) > max_chars:
                text = text[:max_chars]
                print(f"⚠️ 텍스트가 너무 길어 {max_chars}자로 자릅니다.")
            
            # Bedrock Embeddings API 호출 (v2 형식)
            body = json.dumps({
                "inputText": text,
                "dimensions": 1024,  # v2는 차원 지정 가능 (256, 512, 1024)
                "normalize": True     # 정규화로 코사인 유사도 최적화
            })
            
            response = self.bedrock_runtime.invoke_model(
                modelId=embedding_model_id,
                body=body,
                contentType='application/json',
                accept='application/json'
            )
            
            # 응답 파싱
            response_body = json.loads(response['body'].read())
            
            # embedding 벡터 추출
            embedding = response_body.get('embedding')
            
            if embedding and len(embedding) == 1024:
                return embedding
            else:
                print(f"⚠️ 예상치 못한 임베딩 차원: {len(embedding) if embedding else 0}")
                return None
            
        except Exception as e:
            print(f"❌ Embedding 생성 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return None


# 싱글톤 인스턴스
_bedrock_service = None

def get_bedrock_service() -> BedrockService:
    """Bedrock 서비스 싱글톤 인스턴스 반환"""
    global _bedrock_service
    
    if _bedrock_service is None:
        _bedrock_service = BedrockService()
    
    return _bedrock_service
