"""
Bedrock Reranker 서비스
- 벡터 검색 후보군을 다시 정밀하게 순위 매김
- Precision 향상 및 할루시네이션 감소
"""
import boto3
import json
from typing import List, Dict, Tuple
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class BedrockReranker:
    """Amazon Bedrock Reranking 서비스"""
    
    def __init__(self, enable_rerank=True):
        """
        Args:
            enable_rerank: Rerank 기능 활성화 여부 (기본값: True)
                          - AWS Bedrock에서 Cohere Rerank 모델 액세스가 필요
                          - Model Access에서 cohere.rerank-v3-5:0 활성화 필요
        """
        self.enable_rerank = enable_rerank
        
        if enable_rerank:
            # Cohere Rerank 모델은 도쿄 리전(ap-northeast-1)에서만 지원됨
            # 서울 리전(ap-northeast-2)에서는 지원하지 않음
            
            # 명시적으로 리전 지정 (환경변수 AWS_DEFAULT_REGION 무시)
            from django.conf import settings
            
            client_config = {
                'service_name': 'bedrock-runtime',
                'region_name': 'ap-northeast-1'  # 도쿄 리전 강제 지정
            }
            
            # AWS 자격증명이 설정에 있으면 명시적으로 전달
            aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
            aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
            
            if aws_access_key and aws_secret_key:
                client_config['aws_access_key_id'] = aws_access_key
                client_config['aws_secret_access_key'] = aws_secret_key
                logger.info("🔑 명시적 AWS 자격증명 사용")
            else:
                logger.info("🔑 IAM Role 또는 환경 자격증명 사용")
            
            self.bedrock = boto3.client(**client_config)
            self.rerank_model = 'cohere.rerank-v3-5:0'
            
            logger.info(f"🔧 Reranker 초기화 완료:")
            logger.info(f"   Model: {self.rerank_model}")
            logger.info(f"   Region: ap-northeast-1 (도쿄)")
            logger.info(f"   Note: 서울 리전(ap-northeast-2)에서는 Cohere Rerank 미지원")
        else:
            logger.info("⚠️ Reranker 비활성화됨 (Fallback 모드)")
            self.bedrock = None
            self.rerank_model = None
    
    def rerank(
        self, 
        query: str, 
        documents: List[Dict], 
        top_k: int = 5
    ) -> List[Tuple[Dict, float]]:
        """
        검색 결과를 Reranking하여 상위 K개 반환
        
        Args:
            query: 사용자 질문
            documents: 검색된 문서 리스트 (각각 'text' 필드 필요)
            top_k: 반환할 상위 개수
        
        Returns:
            [(document, relevance_score), ...] 형태의 리스트
        """
        if not documents:
            return []
        
        # Rerank 비활성화 시 바로 fallback
        if not self.enable_rerank:
            logger.info(f"⚠️ Rerank 비활성화 - Fallback: 상위 {top_k}개 반환")
            return [(doc, 1.0) for doc in documents[:top_k]]
        
        try:
            # 문서 텍스트 추출
            doc_texts = [
                doc.get('text', doc.get('description', str(doc)))
                for doc in documents
            ]
            
            # 요청 body 구성
            request_body = {
                "query": query,
                "documents": doc_texts,
                "top_n": min(top_k, len(documents)),
                "return_documents": False,  # 인덱스만 반환
                "api_version": 2  # Cohere Rerank v3-5는 api_version 2 필요
            }
            
            logger.info(f"🔄 Rerank 요청:")
            logger.info(f"   Model ID: {self.rerank_model}")
            logger.info(f"   Region: ap-northeast-1")
            logger.info(f"   Documents: {len(doc_texts)}개")
            logger.info(f"   Query: {query[:100]}...")
            logger.info(f"   Top N: {request_body['top_n']}")
            
            # Cohere Rerank API 호출
            response = self.bedrock.invoke_model(
                modelId=self.rerank_model,
                body=json.dumps(request_body)
            )
            
            result = json.loads(response['body'].read())
            
            # 결과 매핑: (원본 document, relevance_score)
            reranked = []
            for item in result.get('results', []):
                index = item['index']
                relevance_score = item['relevance_score']
                
                if index < len(documents):
                    reranked.append((documents[index], relevance_score))
            
            logger.info(f"✅ Reranked {len(documents)} → {len(reranked)} documents")
            return reranked
            
        except Exception as e:
            logger.error(f"❌ Rerank 실패:")
            logger.error(f"   Model ID: {self.rerank_model}")
            logger.error(f"   Region: ap-northeast-1")
            logger.error(f"   Error Type: {type(e).__name__}")
            logger.error(f"   Error Message: {str(e)}")
            
            # ClientError인 경우 더 자세한 정보
            if hasattr(e, 'response'):
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_msg = e.response.get('Error', {}).get('Message', 'Unknown')
                logger.error(f"   AWS Error Code: {error_code}")
                logger.error(f"   AWS Error Message: {error_msg}")
                logger.error(f"   HTTP Status: {e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 'Unknown')}")
            
            logger.info(f"⚠️ Fallback: 상위 {top_k}개 반환")
            # Fallback: 원본 순서 그대로 반환
            return [(doc, 1.0) for doc in documents[:top_k]]
    
    def rerank_events(
        self,
        query: str,
        events: List,  # Event 모델 객체 리스트
        top_k: int = 5
    ) -> List[Tuple[any, float]]:
        """
        Event 객체들을 Reranking
        
        Returns:
            [(Event 객체, relevance_score), ...] 정렬된 리스트
        """
        if not events:
            return []
        
        # Event를 document 형태로 변환
        documents = []
        for event in events:
            doc = {
                'text': event.searchable_text or event.description,
                'event_id': event.id,
                'timestamp': event.timestamp,
                'event_type': event.event_type,
                'confidence': event.confidence,
                'objects': event.objects_detected
            }
            documents.append(doc)
        
        # Reranking 수행
        reranked_docs = self.rerank(query, documents, top_k)
        
        # Event 객체와 매핑
        event_map = {event.id: event for event in events}
        
        reranked_events = []
        for doc, score in reranked_docs:
            event_id = doc['event_id']
            if event_id in event_map:
                reranked_events.append((event_map[event_id], score))
        
        return reranked_events


# 싱글톤 인스턴스
_reranker_instance = None

def get_reranker(enable_rerank=True) -> BedrockReranker:
    """
    Reranker 싱글톤 인스턴스 반환
    
    Args:
        enable_rerank: Rerank 기능 활성화 여부
                      - True: Cohere Rerank 모델 사용 (AWS Bedrock Model Access 필요)
                      - False: Fallback 모드 (원본 순서 유지)
    """
    global _reranker_instance
    if _reranker_instance is None:
        _reranker_instance = BedrockReranker(enable_rerank=enable_rerank)
    return _reranker_instance
