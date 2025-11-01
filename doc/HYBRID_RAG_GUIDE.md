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
│                     │   → 결과: 5개 이벤트 (과거 유사 사례)
│                     │
│ 3. 결과 병합        │
│    (중복 제거)       │   → 총 7개 이벤트 (중복 1개 제거)
└─────────────────────┘
    ↓
Bedrock Claude RAG
    ↓
자연어 응답 생성
```

## 📊 검색 방식 비교

| 검색 방식      | 장점                                           | 단점                             | 사용 시나리오                                     |
| -------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| **Text2SQL**   | 정확한 조건 검색<br>빠른 속도<br>디버깅 용이   | 유연성 부족<br>의미 이해 불가    | "10분~15분 사이"<br>"도난 이벤트"<br>"남성, 30대" |
| **pgvector**   | 의미 기반 검색<br>유사 사례 발견<br>유연함     | 약간 느림<br>정확도 낮을 수 있음 | "수상한 행동"<br>"긴급 상황"<br>"이상한 움직임"   |
| **하이브리드** | 둘 다의 장점<br>높은 정확도<br>풍부한 컨텍스트 | 복잡함<br>설정 필요              | 대부분의 쿼리                                     |

## 🛠️ 구현 세부사항

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
pgvector 결과: [Event(id=2), Event(id=4), Event(id=5)]
    ↓
병합 (중복 제거): [Event(id=1), Event(id=2), Event(id=3), Event(id=4), Event(id=5)]
    ↓
timestamp 순 정렬: [1, 2, 3, 4, 5]
```

### 4. RAG 응답 생성

```python
# Bedrock Claude가 자연어로 정리
검색된 이벤트들:
- 12분 30초: 도난 (남성, 35세)
- 14분 15초: 도난 (여성, 28세)
- 13분 00초: 유사 이상행동 (남성, 40세)
    ↓
Claude RAG:
"네, 10분에서 15분 사이에 2건의 도난 사건이 감지되었습니다.
첫 번째는 12분 30초에 남성(35세)이 매장 중앙에서..."
```

## 🔧 설정

### 환경 변수

```bash
# .env 파일
# Bedrock 기본 설정
USE_BEDROCK=true
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v1

# 하이브리드 RAG 설정
USE_HYBRID_SEARCH=true  # ← 하이브리드 검색 활성화
VECTOR_SEARCH_SIMILARITY_THRESHOLD=0.3  # 유사도 임계값 (0~1, 작을수록 엄격)
HYBRID_SEARCH_LIMIT=5  # 벡터 검색 최대 결과 수

# AWS 자격 증명
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

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
```

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

video = Video.objects.first()
service = get_hybrid_search_service()

events, response = service.hybrid_search(
    prompt="도난 사건",
    video=video
)

print(f"발견된 이벤트: {len(events)}개")
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
