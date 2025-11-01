"""
RAG 검색 서비스 - Bedrock + pgvector 통합
"""
import boto3
import json
from django.conf import settings
from django.utils import timezone
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class RAGSearchService:
    """RAG 기반 비디오 검색 서비스"""
    
    def __init__(self):
        self.bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
        self.embedding_model = 'amazon.titan-embed-text-v1'
        self.llm_model = 'anthropic.claude-3-5-sonnet-20241022-v2:0'  # Claude 3.5 Sonnet v2
    
    def create_embedding(self, text: str) -> List[float]:
        """텍스트를 Bedrock으로 임베딩 벡터로 변환"""
        try:
            response = self.bedrock.invoke_model(
                modelId=self.embedding_model,
                body=json.dumps({
                    "inputText": text
                })
            )
            
            result = json.loads(response['body'].read())
            return result['embedding']
            
        except Exception as e:
            logger.error(f"Failed to create embedding: {str(e)}")
            return []
    
    def search_similar_events(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """유사한 이벤트 검색"""
        from .models_cloud import VideoAnalysis
        from .tier_manager import update_search_stats
        
        # 1. 쿼리를 임베딩으로 변환
        query_embedding = self.create_embedding(query)
        if not query_embedding:
            return []
        
        # 2. Hot 데이터에서 먼저 검색 (pgvector 사용)
        # TODO: pgvector 설치 후 실제 벡터 검색으로 교체
        hot_analyses = VideoAnalysis.objects.filter(
            storage_tier='hot',
            embedding_json__isnull=False
        ).select_related('video')[:limit*2]  # 넉넉하게 가져와서 유사도로 필터링
        
        # 3. 임시로 JSON 기반 유사도 계산 (나중에 pgvector로 교체)
        results = []
        for analysis in hot_analyses:
            if analysis.embedding_json:
                # 간단한 코사인 유사도 계산 (실제로는 pgvector 사용)
                similarity = self.calculate_cosine_similarity(
                    query_embedding, 
                    analysis.embedding_json
                )
                
                if similarity > 0.7:  # 유사도 임계값
                    # 검색 통계 업데이트
                    update_search_stats(analysis)
                    
                    results.append({
                        'analysis': analysis,
                        'similarity': similarity,
                        'video': analysis.video,
                        'timestamp': analysis.frame_timestamp,
                        'description': analysis.scene_description,
                        'confidence': analysis.confidence_score
                    })
        
        # 4. 유사도 순으로 정렬
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        # 5. Hot에서 결과가 부족하면 Warm 데이터도 검색
        if len(results) < limit:
            warm_results = self.search_warm_data(query, query_embedding, limit - len(results))
            results.extend(warm_results)
        
        return results[:limit]
    
    def search_warm_data(self, query: str, query_embedding: List[float], limit: int) -> List[Dict[str, Any]]:
        """Warm 데이터에서 검색 (S3에서 로드)"""
        from .models_cloud import VideoAnalysis
        from .tier_manager import get_tier_manager
        
        # Warm 상태의 분석 데이터 조회
        warm_analyses = VideoAnalysis.objects.filter(
            storage_tier='warm'
        ).select_related('video')[:limit*3]
        
        results = []
        tier_manager = get_tier_manager()
        
        for analysis in warm_analyses:
            try:
                # S3에서 Warm 데이터 로드
                if hasattr(analysis, 's3_warm_key'):
                    warm_data = self.load_warm_data(analysis.s3_warm_key)
                    
                    # 텍스트 기반 간단 매칭 (임베딩 없음)
                    if query.lower() in warm_data.get('scene_description', '').lower():
                        # 자주 검색되면 Hot으로 승격
                        analysis.update_access_stats()
                        if analysis.hotness_score >= 30:
                            tier_manager.promote_to_hot(analysis)
                        
                        results.append({
                            'analysis': analysis,
                            'similarity': 0.5,  # 텍스트 매칭이므로 중간 점수
                            'video': analysis.video,
                            'timestamp': analysis.frame_timestamp,
                            'description': warm_data.get('scene_description', ''),
                            'confidence': warm_data.get('confidence_score', 0.0),
                            'source': 'warm'
                        })
                        
                        if len(results) >= limit:
                            break
                            
            except Exception as e:
                logger.error(f"Failed to load warm data for analysis {analysis.id}: {str(e)}")
        
        return results
    
    def load_warm_data(self, s3_key: str) -> Dict[str, Any]:
        """S3에서 Warm 데이터 로드"""
        try:
            s3_client = boto3.client('s3')
            response = s3_client.get_object(
                Bucket=settings.S3_WARM_BUCKET,
                Key=s3_key
            )
            return json.loads(response['Body'].read())
        except Exception as e:
            logger.error(f"Failed to load warm data from {s3_key}: {str(e)}")
            return {}
    
    def calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """코사인 유사도 계산 (임시, pgvector로 교체 예정)"""
        try:
            import numpy as np
            
            # 벡터 정규화
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            # 코사인 유사도
            dot_product = np.dot(vec1, vec2)
            norm_vec1 = np.linalg.norm(vec1)
            norm_vec2 = np.linalg.norm(vec2)
            
            if norm_vec1 == 0 or norm_vec2 == 0:
                return 0.0
            
            return dot_product / (norm_vec1 * norm_vec2)
            
        except Exception as e:
            logger.error(f"Failed to calculate cosine similarity: {str(e)}")
            return 0.0
    
    def generate_answer(self, query: str, search_results: List[Dict[str, Any]]) -> str:
        """검색 결과를 바탕으로 Bedrock으로 최종 답변 생성"""
        if not search_results:
            return "검색 결과가 없습니다. 다른 키워드로 다시 시도해보세요."
        
        # 컨텍스트 구성
        context_parts = []
        for i, result in enumerate(search_results, 1):
            analysis = result['analysis']
            video = result['video']
            
            context_parts.append(f"""
            {i}. 비디오: {video.filename}
               시점: {result['timestamp']:.1f}초
               내용: {result['description']}
               신뢰도: {result['confidence']:.2f}
               유사도: {result['similarity']:.2f}
            """)
        
        context = "\n".join(context_parts)
        
        prompt = f"""
        사용자 질문: {query}
        
        관련 영상 분석 결과:
        {context}
        
        위 영상 분석 결과를 바탕으로 사용자의 질문에 정확하고 도움이 되는 답변을 제공해주세요.
        각 결과의 시점과 내용을 구체적으로 언급하여 답변해주세요.
        """
        
        try:
            response = self.bedrock.invoke_model(
                modelId=self.llm_model,
                body=json.dumps({
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000,
                    "temperature": 0.7
                })
            )
            
            result = json.loads(response['body'].read())
            return result['content'][0]['text']
            
        except Exception as e:
            logger.error(f"Failed to generate answer: {str(e)}")
            return f"답변 생성 중 오류가 발생했습니다: {str(e)}"
    
    def search_and_answer(self, query: str) -> Dict[str, Any]:
        """통합 검색 및 답변 생성"""
        logger.info(f"Processing query: {query}")
        
        # 1. 유사한 이벤트 검색
        search_results = self.search_similar_events(query)
        
        # 2. 답변 생성
        answer = self.generate_answer(query, search_results)
        
        # 3. 결과 정리
        result = {
            'query': query,
            'answer': answer,
            'search_results': [
                {
                    'video_filename': r['video'].filename,
                    'timestamp': r['timestamp'],
                    'description': r['description'],
                    'similarity': r['similarity'],
                    'confidence': r['confidence']
                }
                for r in search_results
            ],
            'total_results': len(search_results),
            'timestamp': timezone.now().isoformat()
        }
        
        logger.info(f"Query processed successfully, found {len(search_results)} results")
        return result

# 편의 함수
def search_videos(query: str) -> Dict[str, Any]:
    """비디오 검색 편의 함수"""
    service = RAGSearchService()
    return service.search_and_answer(query)