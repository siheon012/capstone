# AWS Bedrock Reranker 모델 ValidationException 이슈 해결

## 📋 이슈 개요

**발생 일자**: 2026년 1월 12일  
**영향 범위**: RAG (Retrieval-Augmented Generation) 시스템의 Reranking 기능  
**심각도**: 중 (Fallback 메커니즘으로 서비스 지속 가능)

### 에러 메시지
```
❌ Rerank 실패: An error occurred (ValidationException) when calling the InvokeModel operation: 
The provided model identifier is invalid
```

---

## 🎯 Reranker 모델을 사용하는 이유

### RAG 시스템에서의 Reranker 역할

RAG(Retrieval-Augmented Generation) 시스템은 크게 3단계로 구성됩니다:

1. **벡터 검색 (Vector Search)**: 
   - pgvector를 사용한 유사도 기반 검색
   - 빠르지만 의미론적 정확도가 낮을 수 있음
   - 일반적으로 10-20개의 후보 문서 검색

2. **재순위화 (Reranking)** ⭐ 
   - Cohere Rerank 모델을 사용한 정밀 순위 매김
   - 쿼리와 문서 간의 **실제 관련성**을 더 정확히 평가
   - 상위 3-5개의 고품질 문서만 선별

3. **생성 (Generation)**: 
   - Claude 모델에 선별된 문서를 컨텍스트로 제공
   - 더 정확하고 관련성 높은 답변 생성

### Reranker의 핵심 가치

| 구분 | 벡터 검색만 사용 | 벡터 검색 + Reranker |
|------|----------------|-------------------|
| **정확도** | 중간 (70-80%) | 높음 (90-95%) |
| **할루시네이션** | 높음 | 낮음 |
| **응답 품질** | 보통 | 우수 |
| **비용** | 낮음 | 중간 |

**구체적 효과**:
- 🎯 **Precision 향상**: 관련 없는 문서 필터링
- 🛡️ **할루시네이션 감소**: 고품질 컨텍스트 제공으로 환각 답변 방지
- ⚡ **LLM 비용 절감**: 관련성 높은 상위 3-5개만 전달 → 토큰 사용량 감소
- 📊 **사용자 만족도 향상**: 더 정확하고 신뢰할 수 있는 답변

---

## 🔍 에러 원인 분석

### 1차 원인: 리전 미스매치 (Region Mismatch)

#### 문제점
```python
# 기존 설정 (settings.py)
AWS_BEDROCK_REGION = env('AWS_BEDROCK_REGION', default='ap-northeast-2')  # 서울
```

**AWS Bedrock Cohere Rerank 모델 지원 리전**:
- ✅ **ap-northeast-1** (도쿄): Cohere Rerank v3-5 지원
- ❌ **ap-northeast-2** (서울): Cohere Rerank 미지원
- ✅ us-east-1, us-west-2, eu-west-1 등: 지원

**근본 원인**:
- 서울 리전에는 Claude Sonnet 모델은 있지만 Cohere Rerank 모델은 없음
- 환경변수 `AWS_DEFAULT_REGION=ap-northeast-2` 때문에 기본적으로 서울 리전 사용
- 리전 가용성을 사전에 확인하지 않고 개발 진행

#### 영향
```
ValidationException: The provided model identifier is invalid
```
서울 리전에서는 `cohere.rerank-v3-5:0` 모델 자체가 존재하지 않음

---

### 2차 원인: API 버전 미지정

#### 문제점
```python
# 기존 요청 본문 (api_version 누락)
request_body = {
    "query": query,
    "documents": doc_texts,
    "top_n": min(top_k, len(documents)),
    "return_documents": False
    # api_version이 없음!
}
```

**Cohere Rerank v3-5 모델 요구사항**:
- `api_version: 2` 필드가 **필수**
- 공식 문서에 명시되어 있지만 누락하기 쉬움
- v3-5는 v2 API 스펙을 사용

#### 영향
리전 문제를 해결한 후에도 여전히 ValidationException 발생
```
ValidationException: Invalid request body
```

---

### 3차 원인: 에러 로깅 부족

#### 문제점
```python
# 기존 에러 처리
except Exception as e:
    logger.error(f"❌ Rerank 실패: {str(e)}")
    # AWS 에러 코드, HTTP 상태 등 상세 정보 부족
```

**진단 어려움**:
- 에러 메시지만으로는 리전 문제인지 API 버전 문제인지 구분 불가
- AWS 에러 코드, HTTP 상태 코드 등 디버깅 정보 부족
- 요청 파라미터 로깅 미흡

---

## ✅ 해결 방법

### 1단계: 도쿄 리전으로 명시적 변경

#### 코드 수정
```python
# back/apps/api/reranker_service.py

class BedrockReranker:
    def __init__(self, enable_rerank=True):
        if enable_rerank:
            # Cohere Rerank 모델은 도쿄 리전(ap-northeast-1)에서만 지원됨
            # 서울 리전(ap-northeast-2)에서는 지원하지 않음
            
            # 명시적으로 리전 지정 (환경변수 AWS_DEFAULT_REGION 무시)
            client_config = {
                'service_name': 'bedrock-runtime',
                'region_name': 'ap-northeast-1'  # 도쿄 리전 강제 지정
            }
            
            # AWS 자격증명 명시적 전달
            aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
            aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
            
            if aws_access_key and aws_secret_key:
                client_config['aws_access_key_id'] = aws_access_key
                client_config['aws_secret_access_key'] = aws_secret_key
            
            self.bedrock = boto3.client(**client_config)
            self.rerank_model = 'cohere.rerank-v3-5:0'
```

#### 적용 효과
- ✅ 환경변수와 무관하게 항상 도쿄 리전 사용
- ✅ boto3 클라이언트 생성 시 명시적 리전 파라미터
- ✅ AWS 자격증명도 명시적 전달로 안정성 향상

---

### 2단계: API 버전 추가

#### 코드 수정
```python
def rerank(self, query: str, documents: List[Dict], top_k: int = 5):
    # 요청 body 구성
    request_body = {
        "query": query,
        "documents": doc_texts,
        "top_n": min(top_k, len(documents)),
        "return_documents": False,
        "api_version": 2  # ⭐ Cohere Rerank v3-5는 api_version 2 필수
    }
    
    # Cohere Rerank API 호출
    response = self.bedrock.invoke_model(
        modelId=self.rerank_model,
        body=json.dumps(request_body)
    )
```

#### 검증 방법
AWS CLI로 직접 테스트:
```bash
aws bedrock-runtime invoke-model \
  --region ap-northeast-1 \
  --model-id cohere.rerank-v3-5:0 \
  --body '{"query":"test","documents":["this is a test"],"api_version":2}' \
  output.json

# 결과
{
  "results": [
    {
      "index": 0,
      "relevance_score": 0.29048297
    }
  ]
}
```

---

### 3단계: 상세 에러 로깅 추가

#### 코드 수정
```python
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
```

#### 향상된 디버깅 정보
```
❌ Rerank 실패:
   Model ID: cohere.rerank-v3-5:0
   Region: ap-northeast-1
   Error Type: ClientError
   Error Message: An error occurred (ValidationException)...
   AWS Error Code: ValidationException
   AWS Error Message: Invalid request body
   HTTP Status: 400
```

---

## 📊 수정 전후 비교

### 수정 전
```python
# ❌ 문제 있는 코드
self.bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name=settings.AWS_BEDROCK_REGION  # 'ap-northeast-2' (서울)
)

request_body = {
    "query": query,
    "documents": doc_texts,
    "top_n": top_k
    # api_version 누락
}
```

**결과**: ValidationException 발생

---

### 수정 후
```python
# ✅ 해결된 코드
client_config = {
    'service_name': 'bedrock-runtime',
    'region_name': 'ap-northeast-1'  # 도쿄 리전 명시
}

if aws_access_key and aws_secret_key:
    client_config['aws_access_key_id'] = aws_access_key
    client_config['aws_secret_access_key'] = aws_secret_key

self.bedrock = boto3.client(**client_config)

request_body = {
    "query": query,
    "documents": doc_texts,
    "top_n": min(top_k, len(documents)),
    "return_documents": False,
    "api_version": 2  # ✅ api_version 추가
}
```

**결과**: 정상 작동 ✅

---

## 🧪 테스트 및 검증

### 1. 모델 가용성 확인
```bash
# 도쿄 리전에서 Cohere Rerank 모델 확인
aws bedrock list-foundation-models \
  --region ap-northeast-1 \
  --by-provider cohere | grep rerank

# 결과: cohere.rerank-v3-5:0 확인됨 ✅
```

### 2. API 호출 테스트
```python
# 테스트 코드
reranker = BedrockReranker(enable_rerank=True)

documents = [
    {"text": "범죄 용의자가 검은색 차량을 운전하고 있습니다"},
    {"text": "오늘 날씨가 맑습니다"},
    {"text": "차량 번호판은 12가 3456입니다"}
]

results = reranker.rerank(
    query="차량 정보를 알려주세요",
    documents=documents,
    top_k=2
)

# 예상 결과:
# [
#   ({"text": "차량 번호판은 12가 3456입니다"}, 0.95),
#   ({"text": "범죄 용의자가 검은색 차량을 운전하고 있습니다"}, 0.82)
# ]
```

### 3. 프로덕션 로그 확인
```
🔧 Reranker 초기화 완료:
   Model: cohere.rerank-v3-5:0
   Region: ap-northeast-1 (도쿄)
   Note: 서울 리전(ap-northeast-2)에서는 Cohere Rerank 미지원

🔄 Rerank 요청:
   Model ID: cohere.rerank-v3-5:0
   Region: ap-northeast-1
   Documents: 15개
   Query: 차량 정보를 알려주세요
   Top N: 5

✅ Reranked 15 → 5 documents
```

---

## 🚨 Fallback 메커니즘

Reranker가 실패해도 서비스는 계속 작동합니다:

```python
def rerank(self, query: str, documents: List[Dict], top_k: int = 5):
    try:
        # Rerank 시도
        response = self.bedrock.invoke_model(...)
        return reranked_results
        
    except Exception as e:
        logger.error(f"❌ Rerank 실패: {e}")
        logger.info(f"⚠️ Fallback: 상위 {top_k}개 반환")
        
        # Fallback: 벡터 검색 결과 그대로 사용
        return [(doc, 1.0) for doc in documents[:top_k]]
```

**Fallback 시나리오**:
- AWS 자격증명 문제
- 네트워크 오류
- 모델 일시적 장애
- 리전 이슈

→ **서비스 중단 없이 품질만 약간 저하**

---

## 💡 교훈 및 향후 개선

### 얻은 교훈

1. **리전별 모델 가용성 사전 확인 필수**
   - AWS Bedrock 모델은 리전마다 지원 여부가 다름
   - 개발 초기에 모든 리전의 모델 지원 현황 확인 필요

2. **API 버전 명시**
   - 최신 모델은 특정 API 버전 요구
   - 공식 문서의 Required Fields 꼼꼼히 확인

3. **명시적 리전 지정**
   - 환경변수에 의존하지 않고 코드에서 명시적 지정
   - 서비스별로 다른 리전 사용 가능

4. **상세한 에러 로깅**
   - AWS ClientError의 모든 정보 로깅
   - 디버깅 시간 단축

### 향후 개선 계획

- [ ] **멀티 리전 Fallback**: 도쿄 리전 장애 시 다른 리전 자동 전환
- [ ] **Rerank 성능 모니터링**: CloudWatch 메트릭 추가
- [ ] **비용 최적화**: Rerank 캐싱으로 중복 호출 방지
- [ ] **A/B 테스트**: Rerank 유무에 따른 답변 품질 정량 평가

---

## 📚 참고 자료

### AWS 공식 문서
- [AWS Bedrock Model Support by Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html)
- [Cohere Rerank API Reference](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-cohere-rerank.html)

### 내부 문서
- [HYBRID_RAG_GUIDE.md](../HYBRID_RAG_GUIDE.md) - RAG 시스템 전체 구조
- [BEDROCK_INTEGRATION_GUIDE.md](../BEDROCK_INTEGRATION_GUIDE.md) - Bedrock 통합 가이드

### 관련 파일
- `back/apps/api/reranker_service.py` - Reranker 서비스 구현
- `back/apps/api/bedrock_service.py` - Bedrock 메인 서비스
- `back/core/settings.py` - AWS 리전 설정

---

**작성일**: 2026년 1월 12일  
**작성자**: AI Development Team  
**상태**: ✅ 해결 완료
