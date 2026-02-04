# 하이브리드 RAG 시스템 가이드

## 🎯 개요

이 프로젝트는 **하이브리드 RAG (Retrieval-Augmented Generation)** 시스템을 사용합니다:

1. **Text2SQL**: 정확한 조건 검색 (Bedrock Claude)
2. **pgvector**: 의미 기반 유사도 검색 (임베딩)
3. **결과 병합**: 중복 제거 및 순서 정렬
4. **RAG 응답**: 자연어로 정리 (Bedrock Claude)

## 🔄 아키텍처

### 전체 플로우

```
사용자 프롬프트 입력
    ↓
┌─────────────────────┐
│  하이브리드 검색     │
├─────────────────────┤
│ 1. Text2SQL 검색   │ ← Bedrock Claude
│    (정확한 조건)     │   "10분~15분 사이 도난"
│                     │   → SQL: WHERE timestamp BETWEEN 600 AND 900
│                     │   → 결과: 3개 이벤트
│                     │
│ 2. pgvector 검색   │ ← Bedrock Titan Embedding
│    (의미 유사도)     │   "도난" → embedding → 유사도 검색
│                     │   → 결과: 30개 이벤트 (과거 유사 사례)
│                     │
│ 3. 결과 병합        │
│    (중복 제거)       │   → 총 32개 이벤트 (중복 1개 제거)
│                     │
│ 4. Reranking ⭐    │ ← Bedrock Cohere Rerank
│    (정밀 순위 매김)  │   쿼리와의 실제 관련성 평가
│                     │   → Top 5개만 선별 (관련도 순)
└─────────────────────┘
    ↓
Bedrock Claude RAG
(고품질 컨텍스트 전달)
    ↓
자연어 응답 생성
```

## 📊 검색 방식 비교

| 검색 방식                 | 장점                                                     | 단점                             | 사용 시나리오                                     |
| ------------------------- | -------------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Text2SQL**              | 정확한 조건 검색<br>빠른 속도<br>디버깅 용이             | 유연성 부족<br>의미 이해 불가    | "10분~15분 사이"<br>"도난 이벤트"<br>"남성, 30대" |
| **pgvector**              | 의미 기반 검색<br>유사 사례 발견<br>유연함               | 약간 느림<br>정확도 낮을 수 있음 | "수상한 행동"<br>"긴급 상황"<br>"이상한 움직임"   |
| **Reranker** ⭐           | **정확도 대폭 향상**<br>할루시네이션 감소<br>비용 효율적 | 추가 API 호출<br>리전 제약       | 모든 벡터 검색 결과에 적용                        |
| **하이브리드 + Reranker** | **최고 정확도**<br>풍부한 컨텍스트<br>신뢰성 높음        | 복잡함<br>설정 필요<br>약간 느림 | **프로덕션 권장**                                 |

## 🛠️ 구현 세부사항

### 0. Bedrock 모델 구성

이 시스템은 3개의 Bedrock 모델을 조합하여 사용합니다:

| 모델                   | Model ID                                  | 리전                      | 용도                    | 비용                              |
| ---------------------- | ----------------------------------------- | ------------------------- | ----------------------- | --------------------------------- |
| **Claude 3 Sonnet**    | `anthropic.claude-3-sonnet-20240229-v1:0` | ap-northeast-2 (서울)     | Text2SQL, RAG 응답 생성 | $0.003/1K input, $0.015/1K output |
| **Titan Embeddings**   | `amazon.titan-embed-text-v1`              | ap-northeast-2 (서울)     | 벡터 임베딩 생성        | $0.0001/1K tokens                 |
| **Cohere Rerank v3-5** | `cohere.rerank-v3-5:0`                    | **ap-northeast-1 (도쿄)** | 검색 결과 재정렬        | $0.001/1K chars                   |

> ⚠️ **중요**: Cohere Rerank는 **도쿄 리전(ap-northeast-1)에서만 사용 가능**합니다. 서울 리전에는 없습니다!

### 1. Text2SQL 검색

```python
# Bedrock Claude가 SQL 생성
프롬프트: "10분에서 15분 사이에 도난 사건이 있었나요?"
    ↓
SQL: SELECT timestamp FROM db_event
     WHERE timestamp BETWEEN 600 AND 900
     AND event_type = 'theft'
     AND video_id = 1
    ↓
PostgreSQL 실행 → 정확한 결과
```

### 2. pgvector 유사도 검색

```python
# Bedrock Titan이 임베딩 생성
프롬프트: "도난 사건"
    ↓
Embedding: [0.123, -0.456, 0.789, ...] (1536차원)
    ↓
pgvector 코사인 유사도 검색:
SELECT *,
       embedding <=> '[0.123, -0.456, ...]' as distance
FROM db_event
WHERE embedding IS NOT NULL
ORDER BY distance
LIMIT 5
    ↓
의미적으로 유사한 이벤트 반환
```

### 3. 결과 병합

```python
# 중복 제거 및 정렬
Text2SQL 결과: [Event(id=1), Event(id=2), Event(id=3)]
pgvector 결과: [Event(id=2), Event(id=4), Event(id=5), ..., Event(id=32)]
    ↓
병합 (중복 제거): [Event(1), Event(2), Event(3), Event(4), ..., Event(32)]
    ↓
총 32개 이벤트 (벡터 검색 상위 30개 + Text2SQL 결과)
```

### 4. Reranking (핵심 단계) ⭐

```python
# Bedrock Cohere Rerank v3-5 모델 사용
# 쿼리와 각 문서의 실제 관련성을 정밀 평가

입력:
- Query: "10분에서 15분 사이 도난 사건"
- Documents: 32개 이벤트의 searchable_text

Cohere Rerank API 호출:
{
  "query": "10분에서 15분 사이 도난 사건",
  "documents": [
    "Event: theft | Time: 750s | Action: 물건을 가방에 넣음",
    "Event: suspicious | Time: 780s | Action: 주변을 두리번거림",
    ... (32개)
  ],
  "top_n": 5,
  "api_version": 2
}
    ↓
Rerank 결과 (관련도 점수 포함):
[
  (Event(id=2), relevance_score=0.987),  # 매우 관련 높음
  (Event(id=1), relevance_score=0.945),
  (Event(id=15), relevance_score=0.823),
  (Event(id=8), relevance_score=0.701),
  (Event(id=22), relevance_score=0.654)
]
    ↓
Top 5개만 Claude RAG에 전달 (고품질 컨텍스트)
```

**Reranker의 핵심 가치:**

| 지표              | 벡터 검색만    | 벡터 검색 + Reranker |
| ----------------- | -------------- | -------------------- |
| **정확도**        | 70-80%         | **90-95%** ✅        |
| **할루시네이션**  | 높음           | **낮음** ✅          |
| **응답 품질**     | 보통           | **우수** ✅          |
| **LLM 토큰 사용** | 32개 문서 전체 | **5개만** (비용 ↓)   |

### 5. RAG 응답 생성

```python
# Bedrock Claude가 자연어로 정리
검색된 이벤트들:
- 12분 30초: 도난 (남성, 35세)
- 14분 15초: 도난 (여성, 28세)
- 13분 00초: 유사 이상행동 (남성, 40세)
    ↓ (Claude, Titan - 서울 리전)
USE_BEDROCK=true
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v1

# Reranker 설정 (Cohere - 도쿄 리전) ⭐
AWS_BEDROCK_RERANKER_REGION=ap-northeast-1  # ← 도쿄 필수!
AWS_BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0

# 하이브리드 RAG 설정
USE_HYBRID_SEARCH=true  # ← 하이브리드 검색 활성화
USE_RERANKER=true  # ← Reranker 활성화 (정확도 향상)
VECTOR_SEARCH_SIMILARITY_THRESHOLD=0.3  # 유사도 임계값 (0~1, 작을수록 엄격)
HYBRID_SEARCH_LIMIT=30  # 벡터 검색 최대 결과 수 (Reranker가 압축)
RERANKER_TOP_K=5  # Reranker가 선별할 최종 문서 개수

# AWS 자격 증명
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

### Reranker 설정 상세

#### 왜 도쿄 리전을 사용하나요?

**Cohere Rerank 모델 지원 리전:**

- ✅ **ap-northeast-1 (도쿄)**: Cohere Rerank v3-5 지원
- ❌ **ap-northeast-2 (서울)**: Cohere Rerank 미지원
- ✅ us-east-1, us-west-2, eu-west-1 등

**설정 전략:**+ Reranker (프로덕션 권장) ✅✅
USE_BEDROCK=true
USE_HYBRID_SEARCH=true
USE_RERANKER=true

# → Text2SQL + pgvector + Cohere Rerank

```

### Reranker 활성화 체크리스트

- [ ] AWS Bedrock에서 Cohere Rerank 모델 액세스 활성화 (도쿄 리전)
- [ ] 환경 변수 `AWS_BEDROCK_RERANKER_REGION=ap-northeast-1` 설정
- [ ] 환경 변수 `AWS_BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0` 설정
- [ ] 환경 변수 `USE_RERANKER=true` 설정
- [ ] IAM 권한에 `bedrock:InvokeModel` for Cohere Rerank 추가
- [ ] 테스트 쿼리로 Reranker 작동 확인
  "query": "사용자 질문",
  "documents": ["문서1", "문서2", ...],  # 최대 30개 권장
  "top_n": 5,  # 최종 반환 개수
  "api_version": 2  # ← 필수! v3-5는 API v2 사용
}
```

> ⚠️ **주의**: `api_version: 2` 필드를 빠뜨리면 ValidationException 발생\_BEDROCK_REGION=ap-northeast-2
> AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
> AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v1

# 하이브리드 RAG 설정

USE_HYBRID_SEARCH=true # ← 하이브리드 검색 활성화
VECTOR_SEARCH_SIMILARITY_THRESHOLD=0.3 # 유사도 임계값 (0~1, 작을수록 엄격)
HYBRID_SEARCH_LIMIT=5 # 벡터 검색 최대 결과 수

# AWS 자격 증명

AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

````

### 모드 선택

```python
# 1. 하이브리드 RAG (추천) ✅
USE_BEDROCK=true
USE_HYBRID_SEARCH=true
# → Text2SQL + pgvector 모두 사용

# 2. Text2SQL만
USE_BEDROCK=true
USE_HYBRID_SEARCH=false
# → 정확한 조건 검색만

# 3. FastAPI 폴백 (레거시)
USE_BEDROCK=false
# → 기존 FastAPI Text2SQL 사용
````

## 📈 성능 최적화

### 임베딩 생성 전략

```python
# Event 저장 시 자동으로 임베딩 생성
event = Event.objects.create(
    video=video,
    timestamp=750,
    event_type='theft',
    action_detected='물건을 가방에 넣음',
    location='매장 중앙'
)

# searchable_text 생성
event.generate_searchable_text()
# → "Event: theft | Time: 750s | Action: 물건을 가방에 넣음"

# 임베딩 생성 (비동기 또는 배치)
from apps.db.search_service import RAGSearchService
rag_service = RAGSearchService()
embedding = rag_service.create_embedding(event.searchable_text)
event.embedding = embedding
event.save()
```

### 인덱스 최적화

```sql
-- pgvector 인덱스
CREATE INDEX idx_event_embedding ON db_event
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 복합 인덱스
CREATE INDEX idx_event_video_timestamp ON db_event (video_id, timestamp);
CREATE INDEX idx_event_type ON db_event (event_type);
```

## 🎯 사용 예시

### 예시 1: 정확한 시간 조건

**입력:**

```
"10분에서 15분 사이에 도난 사건이 있었나요?"
```

**검색 과정:**

- Text2SQL: `timestamp BETWEEN 600 AND 900 AND event_type='theft'` → 2개
- pgvector: "도난" 유사 이벤트 → 3개 (다른 시간대 포함)
- 병합: 총 5개 이벤트

**응답:**

```
네, 10분에서 15분 사이에 2건의 도난 사건이 감지되었습니다.

1. 12분 30초: 남성(35세)이 매장 중앙 진열대에서 물품을 가방에 넣는
   행동이 포착되었습니다. 신뢰도 95.3%

2. 14분 15초: 여성(28세)이 화장품 코너에서 제품을 주머니에 넣는
   행동이 감지되었습니다. 신뢰도 89.7%

추가로, 13분 00초에 유사한 이상행동이 감지되었습니다.
```

### 예시 2: 의미 기반 쿼리

**입력:**

```
"수상한 행동을 한 사람이 있나요?"
```

**검색 과정:**

- Text2SQL: 정확한 매칭 어려움 → event_type 기반 검색
- pgvector: "수상한 행동" 임베딩 → 유사한 이상행동 이벤트들
- 병합: pgvector 결과가 더 유용

**응답:**

```
네, 여러 이상행동이 감지되었습니다.

가장 의심스러운 행동들은:
1. 08분 45초: 남성이 계속 주변을 두리번거리며 진열대 사이를 배회
2. 12분 30초: 도난 행동 (물품을 가방에 넣음)
3. 15분 20초: 갑작스럽게 뛰어나가는 행동
```

## 🔍 디버깅

### 로그 확인

```python
# 검색 과정 로그
🚀 하이브리드 RAG 검색 사용 (Text2SQL + pgvector)
🔍 Text2SQL 검색 시작
📝 생성된 SQL: SELECT timestamp FROM db_event WHERE ...
✅ Text2SQL 결과: 2개
🧠 pgvector 유사도 검색 시작
✅ pgvector 결과: 3개 (중복 제외)
📊 총 5개 이벤트 발견 (중복 제거 후)
```

### SQL 쿼리 확인

```python
# Django shell
from apps.api.hybrid_search_service import get_hybrid_search_service
from apps.db.models import Video
**하이브리드 검색 + Reranker** 1회당:

| 단계 | 모델 | 사용량 | 비용 |
|------|------|--------|------|
| Text2SQL | Claude Sonnet | ~500 tokens | $0.0015 |
| 임베딩 생성 | Titan Embeddings | ~50 tokens | $0.0001 |
| **Reranking** | **Cohere Rerank v3-5** | **~5000 chars** | **$0.005** |
| RAG 응답 | Claude Sonnet | ~1000 tokens | $0.003 |
| **총 비용** | - | - | **~$0.010/검색** |

**비교:**
- Te� Reranker 디버깅 및 트러블슈팅

### 일반적인 에러

#### 1. ValidationException: Invalid model identifier

```

❌ Rerank 실패: An error occurred (ValidationException) when calling the InvokeModel operation:
The provided model identifier is invalid

````

**원인:**
- 서울 리전(ap-northeast-2)에서 Cohere Rerank 호출 시도
- Cohere는 도쿄(ap-northeast-1)에서만 사용 가능

**해결:**
```bash
# .env 파일 수정
AWS_BEDROCK_RERANKER_REGION=ap-northeast-1  # ← 도쿄로 변경
````

#### 2. ValidationException: api_version required

```
❌ Rerank 실패: ValidationException - api_version field is required
```

**원인:**

- Cohere Rerank v3-5는 `api_version: 2` 필드가 필수

**해결:**

```python
# bedrock_reranker.py에서 확인
body = {
    "query": query,
    "documents": doc_texts,
    "top_n": top_k,
    "api_version": 2  # ← 이 필드 확인
}
```

#### 3. AccessDeniedException

```
❌ Rerank 실패: AccessDeniedException - User is not authorized
```

**원인:**

- IAM 권한에 Cohere Rerank 모델 접근 권한 없음
- AWS Bedrock에서 모델 액세스 미활성화

**해결:**

```bash
# 1. AWS Console → Bedrock → Model Access
# 2. Cohere Rerank v3-5 체크 및 활성화
# 3. IAM 정책 확인
```

### Reranker 작동 확인

```python
# Django shell에서 테스트
from apps.api.services.ai.bedrock_reranker import BedrockReranker

reranker = BedrockReranker()

# 샘플 문서 재정렬
documents = [
    {"text": "도난 사건이 발생했습니다"},
    {"text": "날씨가 좋습니다"},
    {"text": "물건을 훔치는 행동"},
]

results = reranker.rerank(
    query="도난 사건",
    documents=documents,
    top_k=2
)

for doc, score in results:
    print(f"Score: {score:.3f} - {doc['text']}")

# 예상 출력:
# Score: 0.987 - 도난 사건이 발생했습니다
# Score: 0.845 - 물건을 훔치는 행동
```

### Fallback 메커니즘

Reranker 실패 시 자동으로 원본 순서로 폴백됩니다:

```python
# bedrock_reranker.py
except Exception as e:
    logger.error(f"❌ Rerank 실패: {str(e)}")
    logger.warning(f"⚠️ Fallback: 원본 순서로 상위 {top_k}개 반환")
    # 서비스는 계속 작동 (Reranker 없이)
    return [(doc, 1.0) for doc in documents[:top_k]]
```

## 🚀 다음 단계

1. **임베딩 자동 생성**: 이벤트 생성 시 자동으로 임베딩
2. **캐싱**: 자주 검색되는 쿼리 결과 캐싱
3. **배치 임베딩**: 기존 데이터 일괄 임베딩 생성
4. **성능 모니터링**: 검색 속도 및 정확도 추적
5. **Reranker 최적화**:
   - 문서 개수 동적 조정 (속도 vs 정확도)
   - 관련도 점수 임계값 설정
   - Claude 기반 Fallback Reranker 구현

## 📚 참고 자료

- [pgvector 문서](https://github.com/pgvector/pgvector)
- [AWS Bedrock Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/embeddings.html)
- [Cohere Rerank 가이드](https://docs.cohere.com/docs/rerank-guide)
- [하이브리드 검색 패턴](https://www.pinecone.io/learn/hybrid-search-intro/)
- [Bedrock Reranker 이슈 해결](../issue/BEDROCK_RERANKER_ISSUE.md
  | **사용자 만족도** | - | 중간 → 높음 |
  | **재검색 감소** | - | 비용 절감 효과 |

**월 1000건 검색 시:**

- 기본: $4.50
- Reranker 포함: $10.00
- **증가분: $5.50/월** ← 높은 정확도와 신뢰성 확보
  for event in events:
  print(f"- {event.timestamp}초: {event.event_type}")

```

## 💰 비용 예상

### Bedrock 사용량

하이브리드 검색 1회당:

- Claude Text2SQL: ~500 토큰 ($0.0015)
- Titan Embedding: ~50 토큰 ($0.0001)
- Claude RAG: ~1000 토큰 ($0.003)
- **총 비용: ~$0.005/검색**

기존 Text2SQL만 사용 시: ~$0.0045/검색

**추가 비용: +10%** (pgvector로 더 좋은 결과)

## 🚀 다음 단계

1. **임베딩 자동 생성**: 이벤트 생성 시 자동으로 임베딩
2. **캐싱**: 자주 검색되는 쿼리 결과 캐싱
3. **배치 임베딩**: 기존 데이터 일괄 임베딩 생성
4. **성능 모니터링**: 검색 속도 및 정확도 추적

## 📚 참고 자료

- [pgvector 문서](https://github.com/pgvector/pgvector)
- [AWS Bedrock Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/embeddings.html)
- [하이브리드 검색 패턴](https://www.pinecone.io/learn/hybrid-search-intro/)
```
