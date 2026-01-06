"""
하이브리드 RAG 검색 서비스
- Text2SQL (정확한 조건 검색)
- pgvector (의미 기반 유사도 검색)
- 결과 병합 및 Bedrock RAG 응답
"""
import json
from typing import List, Dict, Optional, Tuple
from django.db import connection
from apps.db.models import Event
from apps.db.search_service import RAGSearchService
from apps.api.bedrock_service import get_bedrock_service


class HybridSearchService:
    """Text2SQL + pgvector 하이브리드 검색"""
    
    def __init__(self):
        self.bedrock_service = get_bedrock_service()
        self.rag_search = RAGSearchService()
    
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
        # 2. pgvector 의미 기반 유사도 검색
        # ============================================
        if use_vector_search:
            print(f"🧠 pgvector 유사도 검색 시작")
            vector_events = self._vector_search(prompt, video)
            
            for event in vector_events:
                if event.id not in event_ids_seen:
                    all_events.append(event)
                    event_ids_seen.add(event.id)
            
            print(f"✅ pgvector 결과: {len(vector_events)}개 (중복 제외)")
        
        # ============================================
        # 3. 결과 병합 및 순서 정렬
        # ============================================
        # timestamp 순으로 정렬
        all_events.sort(key=lambda e: e.timestamp)
        
        print(f"📊 총 {len(all_events)}개 이벤트 발견 (중복 제거 후)")
        
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
    
    def _vector_search(self, prompt: str, video=None, limit: int = 5) -> List[Event]:
        """pgvector로 의미 기반 유사도 검색"""
        try:
            # 임베딩 생성
            query_embedding = self.rag_search.create_embedding(prompt)
            if not query_embedding:
                print(f"⚠️ 임베딩 생성 실패")
                return []
            
            # pgvector 유사도 검색
            # Event 모델의 embedding 필드 활용
            from django.contrib.postgres.aggregates import ArrayAgg
            from pgvector.django import CosineDistance
            
            queryset = Event.objects.filter(
                embedding__isnull=False
            )
            
            # 특정 비디오로 필터링
            if video:
                queryset = queryset.filter(video=video)
            
            # 유사도 검색 (코사인 거리)
            similar_events = queryset.annotate(
                distance=CosineDistance('embedding', query_embedding)
            ).filter(
                distance__lt=0.3  # 유사도 임계값 (거리가 작을수록 유사)
            ).order_by('distance')[:limit]
            
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
