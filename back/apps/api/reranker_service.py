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
    
    def __init__(self):
        # Cohere Rerank 모델은 도쿄 리전(ap-northeast-1)에서만 지원됨
        # 서울 리전(ap-northeast-2)에서는 지원하지 않음
        self.bedrock = boto3.client('bedrock-runtime', region_name='ap-northeast-1')
        # Cohere Rerank 모델 사용 (도쿄 리전에서 v3-5 지원 확인됨)
        self.rerank_model = 'cohere.rerank-v3-5:0'
    
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
        
        try:
            # 문서 텍스트 추출
            doc_texts = [
                doc.get('text', doc.get('description', str(doc)))
                for doc in documents
            ]
            
            # Cohere Rerank API 호출
            response = self.bedrock.invoke_model(
                modelId=self.rerank_model,
                body=json.dumps({
                    "query": query,
                    "documents": doc_texts,
                    "top_n": min(top_k, len(documents)),
                    "return_documents": False  # 인덱스만 반환
                })
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
            logger.error(f"❌ Reranking failed: {str(e)}")
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

def get_reranker() -> BedrockReranker:
    """Reranker 싱글톤 인스턴스 반환"""
    global _reranker_instance
    if _reranker_instance is None:
        _reranker_instance = BedrockReranker()
    return _reranker_instance
