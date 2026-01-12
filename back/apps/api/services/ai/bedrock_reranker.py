"""
AWS Bedrock Reranker 서비스
- 벡터 검색 결과를 재정렬하여 정확도 향상
- Cohere Rerank 또는 Claude를 활용한 재정렬
"""
import json
import boto3
from typing import List, Dict, Tuple
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class BedrockReranker:
    """Bedrock을 활용한 검색 결과 재정렬 서비스"""
    
    def __init__(self):
        """Bedrock 클라이언트 초기화"""
        # Cohere Rerank는 특정 리전에서만 지원됨
        # ap-northeast-2 (서울) - 미지원 ❌
        # ap-northeast-1 (도쿄) - 지원 ✅
        # us-east-1, us-west-2 등도 지원
        self.region = 'ap-northeast-1'  # Tokyo 리전 강제 설정 (Cohere Rerank 지원)
        
        # AWS 자격증명 설정
        aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
        aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
        
        client_kwargs = {
            'service_name': 'bedrock-runtime',
            'region_name': self.region
        }
        
        if aws_access_key and aws_secret_key:
            client_kwargs['aws_access_key_id'] = aws_access_key
            client_kwargs['aws_secret_access_key'] = aws_secret_key
            logger.info("🔑 명시적 AWS 자격증명 사용 (Reranker)")
        else:
            logger.info("🔑 IAM Role 또는 환경 자격증명 사용 (Reranker)")
        
        self.bedrock = boto3.client(**client_kwargs)
        self.rerank_model = 'cohere.rerank-v3-5:0'  # Cohere Rerank v3.5
        
        logger.info(f"✅ Bedrock Reranker 초기화 완료:")
        logger.info(f"   Model: {self.rerank_model}")
        logger.info(f"   Region: {self.region} (Tokyo - Cohere 지원)")
        logger.info(f"   Note: Seoul(ap-northeast-2)에서는 Cohere Rerank 미지원")
    
    def rerank(
        self, 
        query: str, 
        documents: List[Dict], 
        top_k: int = 5,
        max_chunks: int = 30
    ) -> List[Tuple[Dict, float]]:
        """
        검색 결과를 재정렬
        
        Args:
            query: 사용자 질문
            documents: 검색된 문서 리스트 (각 dict는 'text' 키 필요)
            top_k: 최종 반환할 문서 개수
            max_chunks: Reranker에 전달할 최대 문서 개수 (속도 최적화)
            
        Returns:
            [(document, relevance_score), ...] - 관련도 순으로 정렬
        """
        if not documents:
            logger.warning("재정렬할 문서가 없습니다.")
            return []
        
        # 최대 개수 제한 (Reranker API 제한 고려)
        documents = documents[:max_chunks]
        
        try:
            # Cohere Rerank API 요청 형식
            doc_texts = []
            for doc in documents:
                # Dict이고 'text' 키가 있는 경우 (윈도잉된 텍스트)
                if isinstance(doc, dict) and 'text' in doc:
                    doc_texts.append(doc['text'])
                # Event 객체인 경우 searchable_text 사용
                elif hasattr(doc, 'searchable_text'):
                    doc_texts.append(doc.searchable_text)
                # Dict이지만 'text' 키가 없는 경우
                elif isinstance(doc, dict):
                    doc_texts.append(str(doc))
                else:
                    doc_texts.append(str(doc))
            
            body = {
                "query": query,
                "documents": doc_texts,
                "top_n": top_k,
                "api_version": 2  # 원본 문서는 이미 가지고 있음
            }
            # AS-IS (현재 문제 있는 코드 예상)
            
            response = self.bedrock.invoke_model(
                modelId=self.rerank_model,
                body=json.dumps(body),
                contentType='application/json',
                accept='application/json'
            )
            
            response_body = json.loads(response['body'].read())
            
            # Rerank 결과 파싱
            reranked_results = []
            for result in response_body.get('results', []):
                index = result['index']
                relevance_score = result['relevance_score']
                
                if index < len(documents):
                    reranked_results.append((documents[index], relevance_score))
            
            logger.info(f"✅ Rerank 완료: {len(documents)}개 → {len(reranked_results)}개 (top_k={top_k})")
            for i, (doc, score) in enumerate(reranked_results[:5]):
                logger.info(f"   Top {i+1}: score={score:.3f}")
            return reranked_results
            
        except Exception as e:
            logger.error(f"❌ Rerank 실패: {str(e)}")
            logger.error(f"   Model: {self.rerank_model}")
            logger.error(f"   Region: {self.region}")
            logger.error(f"   Documents: {len(documents)}개")
            if hasattr(e, 'response'):
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_msg = e.response.get('Error', {}).get('Message', 'Unknown')
                logger.error(f"   AWS Error Code: {error_code}")
                logger.error(f"   AWS Error Message: {error_msg}")
            logger.warning(f"⚠️ Fallback: 원본 순서로 상위 {top_k}개 반환 (score=1.0)")
            # Fallback: 원본 순서 그대로 반환
            return [(doc, 1.0) for doc in documents[:top_k]]
    
    def rerank_with_claude(
        self,
        query: str,
        documents: List[Dict],
        top_k: int = 5
    ) -> List[Tuple[Dict, float]]:
        """
        Claude를 활용한 재정렬 (Fallback 또는 대안)
        - Cohere Rerank API가 없는 경우 사용
        
        Args:
            query: 사용자 질문
            documents: 검색된 문서 리스트
            top_k: 최종 반환할 문서 개수
            
        Returns:
            [(document, relevance_score), ...]
        """
        if not documents:
            return []
        
        try:
            # Claude에게 각 문서의 관련도를 0-1 점수로 평가하도록 요청
            doc_texts = []
            for i, doc in enumerate(documents[:20]):  # Claude는 최대 20개 정도로 제한
                if hasattr(doc, 'searchable_text'):
                    text = doc.searchable_text
                else:
                    text = doc.get('text', str(doc)) if isinstance(doc, dict) else str(doc)
                
                doc_texts.append(f"[문서 {i}]\n{text}\n")
            
            prompt = f"""다음은 사용자 질문과 검색된 문서 목록입니다.
각 문서가 질문과 얼마나 관련있는지 0.0~1.0 점수로 평가하고, 상위 {top_k}개만 선택하세요.

**질문:** {query}

**문서 목록:**
{"".join(doc_texts)}

**요청:**
각 문서 번호와 관련도 점수를 JSON 배열로 반환하세요.
형식: [{{"index": 0, "score": 0.95}}, {{"index": 2, "score": 0.87}}, ...]
점수가 높은 순서로 정렬하고, 상위 {top_k}개만 포함하세요.
"""
            
            # Claude 호출
            messages = [{"role": "user", "content": prompt}]
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": messages,
                "temperature": 0.1
            }

            
            
            response = self.bedrock.invoke_model(
                modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
                body=json.dumps(body)
            )
            
            response_body = json.loads(response['body'].read())
            response_text = response_body['content'][0]['text']
            
            # JSON 파싱
            import re
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                scores = json.loads(json_match.group())
                
                reranked_results = []
                for item in scores:
                    index = item['index']
                    score = item['score']
                    if index < len(documents):
                        reranked_results.append((documents[index], score))
                
                logger.info(f"✅ Claude Rerank 완료: {len(reranked_results)}개")
                return reranked_results
            
            # 파싱 실패 시 원본 반환
            return [(doc, 1.0) for doc in documents[:top_k]]
            
        except Exception as e:
            logger.error(f"❌ Claude Rerank 실패: {str(e)}")
            return [(doc, 1.0) for doc in documents[:top_k]]


# 싱글톤 인스턴스
_reranker_service = None

def get_reranker_service() -> BedrockReranker:
    """Reranker 서비스 싱글톤 인스턴스 반환"""
    global _reranker_service
    
    if _reranker_service is None:
        _reranker_service = BedrockReranker()
    
    return _reranker_service
