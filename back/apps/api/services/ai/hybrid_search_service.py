"""
하이브리드 RAG 검색 서비스
- Text2SQL (정확한 조건 검색)
- pgvector (의미 기반 유사도 검색)
- Bedrock Reranker (정밀도 향상)
- 결과 병합 및 Bedrock RAG 응답
"""
import json
from typing import List, Dict, Optional, Tuple
from django.db import connection
from apps.db.models import Event
from apps.api.services import RAGSearchService, get_bedrock_service, get_reranker_service
from apps.api.services.ai.event_windowing_service import EventWindowingService


class HybridSearchService:
    """Text2SQL + pgvector + Reranker 하이브리드 검색"""
    
    def __init__(self):
        self.bedrock_service = get_bedrock_service()
        self.rag_search = RAGSearchService()
        self.reranker = get_reranker_service()  # Reranker 추가
        self.windowing_service = EventWindowingService(window_size=2)  # Windowing 추가
    
    def hybrid_search(
        self, 
        prompt: str, 
        video=None,
        use_vector_search: bool = True,
        use_text2sql: bool = True
    ) -> Tuple[List[Event], str]:
        """
        하이브리드 검색: Text2SQL + pgvector
        
        Args:
            prompt: 사용자 프롬프트
            video: 대상 비디오
            use_vector_search: pgvector 유사도 검색 사용 여부
            use_text2sql: Text2SQL 검색 사용 여부
            
        Returns:
            (이벤트 리스트, 응답 텍스트)
        """
        all_events = []
        event_ids_seen = set()  # 중복 제거용
        sql_query_results = []  # SQL 쿼리 원본 결과 저장
        
        # ============================================
        # 1. Text2SQL 정확한 조건 검색
        # ============================================
        if use_text2sql:
            print(f"🔍 Text2SQL 검색 시작")
            sql_events, sql_results = self._text2sql_search(prompt, video)
            sql_query_results = sql_results  # SQL 결과 저장
            
            for event in sql_events:
                if event.id not in event_ids_seen:
                    all_events.append(event)
                    event_ids_seen.add(event.id)
            
            print(f"✅ Text2SQL 결과: {len(sql_events)}개")
        
        # ============================================
        # 2. pgvector 의미 기반 유사도 검색 (Recall 확대)
        # ============================================
        if use_vector_search:
            print(f"🧠 pgvector 유사도 검색 시작 (후보군 30개)")
            # Reranking을 위해 후보군을 더 많이 가져옴 (10 → 30)
            vector_events = self._vector_search(prompt, video, limit=30)
            
            for event in vector_events:
                if event.id not in event_ids_seen:
                    all_events.append(event)
                    event_ids_seen.add(event.id)
            
            print(f"✅ pgvector 결과: {len(vector_events)}개 (중복 제외)")
        
        # ============================================
        # 3. Bedrock Reranker로 정밀도 향상 ⭐ NEW
        # ============================================
        if len(all_events) > 5:
            print(f"🎯 Reranking 시작: {len(all_events)}개 → 상위 5개")
            
            # Event Windowing으로 컨텍스트 강화 후 Reranker에 전달
            rerank_docs = []
            for event in all_events:
                context_text = self.windowing_service.create_windowed_text(event)
                rerank_docs.append({
                    'id': event.id,
                    'text': context_text,  # 윈도잉된 텍스트
                    'original_obj': event
                })
            
            reranked_results = self.reranker.rerank(
                query=prompt,
                documents=rerank_docs,
                top_k=5,
                max_chunks=30
            )
            
            # (doc_dict, relevance_score) 튜플에서 original_obj 추출
            all_events = [doc['original_obj'] for doc, score in reranked_results]
            
            # 로깅: Reranking 점수
            for i, (doc, score) in enumerate(reranked_results):
                event = doc['original_obj']
                event_desc = getattr(event, 'description', '') or getattr(event, 'searchable_text', '')[:50]
                print(f"  #{i+1}: {getattr(event, 'event_type', 'unknown')} (score: {score:.3f}) - {event_desc}")
            
            print(f"📊 최종 {len(all_events)}개 이벤트 선택 (✅ Reranking 완료)")
        
        # ============================================
        # 4. 결과 정렬 (Reranking 후에는 이미 순서가 최적화됨)
        # ============================================
        # Reranking이 안 된 경우에만 timestamp 정렬
        elif all_events:
            all_events.sort(key=lambda e: e.timestamp)
            print(f"📊 최종 {len(all_events)}개 이벤트 선택 (Reranking 미실행 - {len(all_events)}개 ≤ 5)")
        else:
            print(f"📊 최종 {len(all_events)}개 이벤트 선택")
        
        # ============================================
        # 4. Bedrock RAG로 자연어 응답 생성
        # ============================================
        video_name = video.name if video else "알 수 없음"
        
        # Event 객체가 없어도 SQL 쿼리 결과가 있으면 사용
        if not all_events and sql_query_results:
            print(f"⚠️ Event 객체는 없지만 SQL 쿼리 결과({len(sql_query_results)}개)로 답변 생성")
            
            response_text = self.bedrock_service.format_timeline_response(
                prompt=prompt,
                events=sql_query_results,  # SQL 쿼리 결과 직접 사용
                video_name=video_name
            )
            
            return [], response_text
        
        # Event 객체도 없고 SQL 결과도 없으면
        if not all_events:
            print("⚠️ 결과가 없어 기본 답변 반환")
            return [], "요청하신 조건에 해당하는 데이터를 찾을 수 없습니다."
        
        # Event 객체를 딕셔너리로 변환
        events_data = []
        for event in all_events:
            events_data.append({
                'timestamp': event.timestamp,
                'event_type': getattr(event, 'event_type', 'unknown'),
                'action_detected': getattr(event, 'action_detected', '알 수 없음'),
                'location': getattr(event, 'location', '알 수 없음'),
                'age': getattr(event, 'age', '알 수 없음'),
                'gender': getattr(event, 'gender', '알 수 없음'),
                'scene_analysis': getattr(event, 'scene_analysis', None),
            })
        
        response_text = self.bedrock_service.format_timeline_response(
            prompt=prompt,
            events=events_data,
            video_name=video_name
        )
        
        return all_events, response_text
    
    def _text2sql_search(self, prompt: str, video=None) -> Tuple[List[Event], List[dict]]:
        """
        Text2SQL로 정확한 조건 검색
        
        Returns:
            (Event 객체 리스트, SQL 쿼리 결과 딕셔너리 리스트)
        """
        try:
            # Bedrock Text2SQL
            video_id = video.video_id if video else None
            text2sql_result = self.bedrock_service.text_to_sql(
                prompt=prompt,
                video_id=video_id
            )
            
            if text2sql_result.get('error'):
                print(f"⚠️ Text2SQL 오류: {text2sql_result['error']}")
                return [], []
            
            sql_query = text2sql_result.get('sql')
            if not sql_query:
                return [], []
            
            print(f"📝 생성된 SQL: {sql_query}")
            
            # SQL 실행 (예외 처리)
            try:
                with connection.cursor() as cursor:
                    cursor.execute(sql_query)
                    query_results = cursor.fetchall()
                    column_names = [desc[0] for desc in cursor.description] if cursor.description else []
            except Exception as sql_error:
                print(f"❌ SQL 실행 오류: {sql_error}")
                print(f"📝 실패한 SQL: {sql_query}")
                return [], []
            
            if not query_results:
                return [], []
            
            # SQL 결과를 딕셔너리로 변환
            sql_results_dict = []
            for result in query_results:
                result_dict = dict(zip(column_names, result))
                sql_results_dict.append(result_dict)
            
            print(f"📊 SQL 쿼리 결과: {len(sql_results_dict)}개 행")
            
            # Event 객체 조회 시도 (id 컬럼이 있는 경우에만)
            events = []
            if 'id' in column_names:
                for result_dict in sql_results_dict:
                    event_id = result_dict.get('id')
                    if event_id:
                        try:
                            event = Event.objects.get(id=event_id)
                            events.append(event)
                        except Event.DoesNotExist:
                            print(f"⚠️ Event ID {event_id} not found")
            else:
                # id가 없으면 timestamp로 시도
                for result_dict in sql_results_dict:
                    timestamp_value = result_dict.get('timestamp')
                    if timestamp_value is not None:
                        if video:
                            event_objs = Event.objects.filter(
                                timestamp=timestamp_value, 
                                video=video
                            )
                        else:
                            event_objs = Event.objects.filter(
                                timestamp=timestamp_value
                            )
                        
                        if event_objs.exists():
                            events.append(event_objs.first())
            
            print(f"📊 Event 객체: {len(events)}개")
            return events, sql_results_dict
            
        except Exception as e:
            print(f"❌ Text2SQL 검색 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return [], []
    
    def _extract_metadata_keywords(self, prompt: str) -> Dict[str, List[str]]:
        """
        사용자 질문에서 메타데이터 키워드 추출
        
        Returns:
            {
                'objects': ['칼', '담배', '술', ...],
                'actions': ['걷기', '서있기', ...],
                'persons': ['남자', '여자', ...]
            }
        """
        keywords = {
            'objects': [],
            'actions': [],
            'persons': []
        }
        
        # 객체 키워드 (objects_detected 필드에서 검색)
        object_keywords = ['칼', '담배', '술', '가위', '총', '무기', '병', '음료', '콜라', '사이다']
        for keyword in object_keywords:
            if keyword in prompt:
                keywords['objects'].append(keyword)
        
        # 행동 키워드 (action_detected 필드)
        action_keywords = ['걷기', '서있기', '앉기', '뛰기', '넘어짐', '쓰러짐', '싸움', '도난', '훔침']
        for keyword in action_keywords:
            if keyword in prompt:
                keywords['actions'].append(keyword)
        
        # 인물 키워드 (gender, age 필드)
        if '남자' in prompt or '남성' in prompt:
            keywords['persons'].append('male')
        if '여자' in prompt or '여성' in prompt:
            keywords['persons'].append('female')
        
        return keywords
    
    def _vector_search(self, prompt: str, video=None, limit: int = 5) -> List[Event]:
        """
        pgvector로 의미 기반 유사도 검색 + Metadata Filtering
        
        Args:
            prompt: 사용자 질문
            video: 대상 비디오 (선택)
            limit: 반환할 최대 이벤트 수
            
        Returns:
            유사도 + Metadata 필터링된 이벤트 리스트
        """
        try:
            # 1. 메타데이터 키워드 추출
            metadata_keywords = self._extract_metadata_keywords(prompt)
            
            # 2. 임베딩 생성
            query_embedding = self.rag_search.create_embedding(prompt)
            if not query_embedding:
                print(f"⚠️ 임베딩 생성 실패")
                return []
            
            # 3. 기본 쿼리셋 구성
            from django.contrib.postgres.aggregates import ArrayAgg
            from pgvector.django import CosineDistance
            from django.db.models import Q
            
            queryset = Event.objects.filter(
                embedding__isnull=False
            )
            
            # 특정 비디오로 필터링
            if video:
                queryset = queryset.filter(video=video)
            
            # 4. Metadata Filtering 적용 ⭐ NEW
            # objects_detected JSONB 필드 활용
            if metadata_keywords['objects']:
                print(f"🔍 객체 필터링: {metadata_keywords['objects']}")
                object_filters = Q()
                for obj in metadata_keywords['objects']:
                    # JSONB 필드에서 객체 검색
                    object_filters |= Q(objects_detected__icontains=obj)
                queryset = queryset.filter(object_filters)
            
            # action_detected 필터링
            if metadata_keywords['actions']:
                print(f"🔍 행동 필터링: {metadata_keywords['actions']}")
                action_filters = Q()
                for action in metadata_keywords['actions']:
                    action_filters |= Q(action_detected__icontains=action)
                queryset = queryset.filter(action_filters)
            
            # gender 필터링
            if metadata_keywords['persons']:
                print(f"🔍 성별 필터링: {metadata_keywords['persons']}")
                queryset = queryset.filter(gender__in=metadata_keywords['persons'])
            
            # 5. pgvector 유사도 검색
            similar_events = queryset.annotate(
                distance=CosineDistance('embedding', query_embedding)
            ).filter(
                distance__lt=0.3  # 유사도 임계값 (거리가 작을수록 유사)
            ).order_by('distance')[:limit]
            
            filtered_count = queryset.count()
            result_count = len(similar_events)
            print(f"📊 Metadata 필터링: {filtered_count}개 후보 → pgvector 검색: {result_count}개")
            
            return list(similar_events)
            
        except Exception as e:
            print(f"❌ pgvector 검색 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return []


# 싱글톤 인스턴스
_hybrid_search_service = None

def get_hybrid_search_service() -> HybridSearchService:
    """하이브리드 검색 서비스 싱글톤 인스턴스"""
    global _hybrid_search_service
    
    if _hybrid_search_service is None:
        _hybrid_search_service = HybridSearchService()
    
    return _hybrid_search_service
