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
        
        # ============================================
        # 1. Text2SQL 정확한 조건 검색
        # ============================================
        if use_text2sql:
            print(f"🔍 Text2SQL 검색 시작")
            sql_events = self._text2sql_search(prompt, video)
            
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
        if not all_events:
            return [], "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다."
        
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
        
        video_name = video.name if video else "알 수 없음"
        
        response_text = self.bedrock_service.format_timeline_response(
            prompt=prompt,
            events=events_data,
            video_name=video_name
        )
        
        return all_events, response_text
    
    def _text2sql_search(self, prompt: str, video=None) -> List[Event]:
        """Text2SQL로 정확한 조건 검색"""
        try:
            # Bedrock Text2SQL
            video_id = video.video_id if video else None
            text2sql_result = self.bedrock_service.text_to_sql(
                prompt=prompt,
                video_id=video_id
            )
            
            if text2sql_result.get('error'):
                print(f"⚠️ Text2SQL 오류: {text2sql_result['error']}")
                return []
            
            sql_query = text2sql_result.get('sql')
            if not sql_query:
                return []
            
            print(f"📝 생성된 SQL: {sql_query}")
            
            # SQL 실행
            with connection.cursor() as cursor:
                cursor.execute(sql_query)
                query_results = cursor.fetchall()
            
            # Event 객체 조회
            events = []
            for result in query_results:
                timestamp_value = result[0]
                
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
            
            return events
            
        except Exception as e:
            print(f"❌ Text2SQL 검색 오류: {str(e)}")
            return []
    
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
