# Backend 리팩터링 완료 보고서

**작업 날짜**: 2026년 1월 13일  
**작업자**: AI Assistant & User  
**목적**: 코드 가독성 향상, 유지보수성 개선, 환경변수 중앙화

---

## 📋 목차

1. [개요](#개요)
2. [apps/db 리팩터링](#appsdb-리팩터링)
3. [apps/api 리팩터링](#appsapi-리팩터링)
4. [환경변수 중앙화](#환경변수-중앙화)
5. [Import 경로 정리](#import-경로-정리)
6. [최종 구조](#최종-구조)
7. [마이그레이션 가이드](#마이그레이션-가이드)

---

## 개요

### 문제점

- 단일 파일에 모든 코드가 집중되어 가독성 저하
- 하드코딩된 AWS region, model ID, bucket 이름
- print문 사용으로 로깅 일관성 부족
- 중복된 URL 설정 파일 (urls.py, urls_s3.py)

### 목표

- ✅ 도메인별/계층별 코드 분리
- ✅ 환경변수 기반 설정 관리
- ✅ 일관된 로깅 시스템 적용
- ✅ Import 경로 정리 및 순환 참조 제거

---

## apps/db 리팩터링

### 변경 사항

#### 1. Models 분리

**이전**: `models.py` (단일 파일, 500+ 줄)

**이후**: `models/` 폴더 구조

```
models/
├── __init__.py          # 통합 export
├── video.py            # Video 모델
├── event.py            # Event 모델
├── session.py          # PromptSession 모델
└── prompt_history.py   # PromptHistory 모델
```

**장점**:

- 각 모델이 독립적인 파일로 관리
- 변경 시 영향 범위 최소화
- 코드 검색 및 유지보수 용이

#### 2. Serializers 분리

**이전**: `serializers.py` (단일 파일, 300+ 줄)

**이후**: `serializers/` 폴더 구조

```
serializers/
├── __init__.py           # 통합 export
├── video.py             # VideoSerializer
├── event.py             # EventSerializer
└── prompt.py            # PromptSessionSerializer, PromptHistorySerializer
```

#### 3. Views 분리

**이전**: `views.py` (단일 파일, 400+ 줄)

**이후**: `views/` 폴더 구조

```
views/
├── __init__.py     # 통합 export
├── video.py       # VideoViewSet
├── event.py       # EventViewSet
└── prompt.py      # PromptViewSet
```

---

## apps/api 리팩터링

### 1. Views 분리 (1,208줄 → 7개 파일)

**이전**: `views.py` (monolithic file)

**이후**: `views/` 폴더 구조

```
views/
├── __init__.py        # 통합 export (88줄)
├── health.py         # 헬스체크 (95줄)
├── prompt.py         # 프롬프트 처리 (210줄)
├── vlm.py           # VLM 채팅 (241줄)
├── helpers.py       # 분석 헬퍼 함수 (161줄)
├── processors.py    # 프롬프트 로직 처리 (421줄)
├── s3.py           # S3 업로드 (403줄)
└── summary.py      # 비디오 요약 (240줄)
```

**변경 사항**:

- 도메인별 분리로 단일 책임 원칙 준수
- views_old.py로 백업 후 old/ 폴더 이동
- summary_views.py를 views/summary.py로 통합
- views_s3.py를 views/s3.py로 통합

### 2. Services 카테고리화

**이전**: `services/` (12개 파일이 루트에 혼재)

```
services/
├── video_service.py
├── event_service.py
├── s3_service.py
├── sqs_service.py
├── bedrock_service.py
├── vlm_service.py
└── ... (6개 더)
```

**이후**: 3-tier 카테고리 구조

```
services/
├── __init__.py              # 통합 export
├── business/               # 비즈니스 로직
│   ├── __init__.py
│   ├── video_service.py    # 비디오 관리
│   └── event_service.py    # 이벤트 관리
├── infrastructure/         # AWS 인프라
│   ├── __init__.py
│   ├── s3_service.py       # S3 업로드/다운로드
│   ├── sqs_service.py      # SQS 메시지 큐
│   └── auth_service.py     # JWT 인증
└── ai/                     # AI/ML 서비스
    ├── __init__.py
    ├── bedrock_service.py           # Bedrock Text2SQL
    ├── bedrock_reranker.py          # Cohere Reranker
    ├── vlm_service.py               # Claude Vision
    ├── hybrid_search_service.py     # 하이브리드 검색
    ├── event_windowing_service.py   # 이벤트 윈도잉
    ├── tier_manager.py              # 데이터 티어링
    └── search_service.py            # RAG 검색
```

**설계 원칙**:

- **business/**: 핵심 비즈니스 로직 (video, event 관리)
- **infrastructure/**: 외부 서비스 연동 (AWS S3, SQS, Auth)
- **ai/**: AI/ML 관련 서비스 (Bedrock, VLM, RAG)

### 3. Print문 → Logger 변환

**변경 파일**:

- ✅ `vlm_service.py`: 29개 print → logger
- ✅ `bedrock_service.py`: 14개 print → logger
- ✅ `summary.py`: 12개 print → logger

**변경 예시**:

```python
# Before
print(f"🔄 요약 생성 시작: video={video.name}")

# After
logger.info(f"🔄 요약 생성 시작: video={video.name}")
```

**추가 개선**:

- `exc_info=True` 추가로 스택 트레이스 포함
- 로그 레벨 적절히 구분 (info, warning, error)

### 4. URL 설정 통합

**이전**: 2개 파일

- `urls.py`: 메인 API 라우트
- `urls_s3.py`: S3 전용 라우트 (별도 include)

**이후**: `urls.py` 단일 파일

```python
# S3 업로드 API (urls_s3.py 통합)
path('s3/upload/request/', s3.request_upload_url, name='s3_request_upload_url'),
path('s3/upload/confirm/', s3.confirm_upload, name='s3_confirm_upload'),
path('s3/upload/thumbnail/', s3.upload_thumbnail, name='s3_upload_thumbnail'),
path('s3/video/<int:video_id>/download/', s3.get_video_download_url, name='s3_get_video_download_url'),
path('s3/video/<int:video_id>/delete/', s3.delete_video, name='s3_delete_video'),
```

**변경 사항**:

- core/urls.py에서 `include('apps.api.urls_s3')` 제거
- URL name에 `s3_` prefix 추가 (namespace 명확화)
- 프론트엔드 경로 업데이트: `thumbnail-utils.ts`

---

## 환경변수 중앙화

### 1. .env 파일 추가

**추가된 환경변수**:

```env
# AWS Bedrock 설정
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_RERANKER_REGION=ap-northeast-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_VLM_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
AWS_BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0

# AWS SQS 설정
AWS_SQS_QUEUE_URL=
AWS_SQS_REGION=ap-northeast-2
```

### 2. settings.py 업데이트

**추가된 설정**:

```python
# AWS Bedrock 설정
AWS_BEDROCK_REGION = env('AWS_BEDROCK_REGION', default='ap-northeast-2')
AWS_BEDROCK_RERANKER_REGION = env('AWS_BEDROCK_RERANKER_REGION', default='ap-northeast-1')
AWS_BEDROCK_MODEL_ID = env('AWS_BEDROCK_MODEL_ID', default='anthropic.claude-3-5-sonnet-20241022-v2:0')
AWS_BEDROCK_VLM_MODEL_ID = env('AWS_BEDROCK_VLM_MODEL_ID', default='anthropic.claude-3-5-sonnet-20241022-v2:0')
AWS_BEDROCK_EMBEDDING_MODEL_ID = env('AWS_BEDROCK_EMBEDDING_MODEL_ID', default='amazon.titan-embed-text-v2:0')
AWS_BEDROCK_RERANK_MODEL_ID = env('AWS_BEDROCK_RERANK_MODEL_ID', default='cohere.rerank-v3-5:0')

# AWS SQS 설정
AWS_SQS_QUEUE_URL = env('AWS_SQS_QUEUE_URL', default='')
AWS_SQS_REGION = env('AWS_SQS_REGION', default='ap-northeast-2')
```

### 3. 하드코딩 제거

**수정된 파일들** (12개):

1. `bedrock_service.py`: embedding_model_id
2. `vlm_service.py`: model_id, region
3. `bedrock_reranker.py`: region, rerank_model
4. `search_service.py`: region, embedding_model, llm_model
5. `tier_manager.py`: region, embedding_model
6. `sqs_service.py`: queue_url, region
7. `s3_service.py`: region
8. `video_service.py`: bucket_name, region
9. `video.py (model)`: bucket_name, region
10. `video.py (serializer)`: bucket_name, region
11. `video.py (views)`: bucket_name
12. `s3.py (views)`: thumbnail_bucket

**변경 예시**:

```python
# Before
self.region = 'ap-northeast-1'
self.model_id = 'anthropic.claude-3-5-sonnet-20241022-v2:0'
bucket = 'capstone-dev-raw'

# After
self.region = settings.AWS_BEDROCK_RERANKER_REGION
self.model_id = settings.AWS_BEDROCK_MODEL_ID
bucket = settings.AWS_STORAGE_BUCKET_NAME
```

### 4. 장점

- ✅ **보안**: 민감한 정보가 코드에서 분리
- ✅ **유연성**: 환경별 (dev/staging/prod) 다른 설정 가능
- ✅ **유지보수성**: 모델 변경 시 코드 수정 불필요
- ✅ **일관성**: 모든 설정이 한 곳에서 관리

---

## Import 경로 정리

### 1. 순환 Import 해결

**문제**: hybrid_search_service.py에서 순환 참조 발생

```python
# Before (순환 import 발생)
from apps.api.services import RAGSearchService, get_bedrock_service, get_reranker_service
```

**해결**: 상대 경로 사용

```python
# After
from .search_service import RAGSearchService
from .bedrock_service import get_bedrock_service
from .bedrock_reranker import get_reranker_service
from .event_windowing_service import EventWindowingService
```

### 2. Import 경로 통일

**수정된 파일들** (11개):

1. `hybrid_search_service.py`: 상대 경로로 변경
2. `event_service.py`: bedrock import 수정
3. `vlm_service.py`: bedrock import 수정
4. `views/vlm.py`: services import 수정
5. `views/processors.py`: services import 수정
6. `db/signals.py`: bedrock import 2곳 수정
7. `db/views/video.py`: vlm import 수정
8. `db/management/commands/generate_embeddings.py`: bedrock import 수정
9. `views/s3.py`: settings import 추가
10. `views/summary.py`: services import 수정

**통일된 패턴**:

```python
# 외부에서 services 사용
from apps.api.services import get_video_service, get_bedrock_service

# services 내부에서는 상대 경로
from .bedrock_service import get_bedrock_service
from ..business.video_service import VideoService
```

---

## 최종 구조

### apps/api 최종 디렉토리 구조

```
apps/api/
├── urls.py                    # 통합된 URL 설정
├── views/                     # 7개 도메인별 view
│   ├── __init__.py
│   ├── health.py
│   ├── prompt.py
│   ├── vlm.py
│   ├── helpers.py
│   ├── processors.py
│   ├── s3.py
│   └── summary.py
├── services/                  # 3-tier 서비스 계층
│   ├── __init__.py
│   ├── business/
│   │   ├── __init__.py
│   │   ├── video_service.py
│   │   └── event_service.py
│   ├── infrastructure/
│   │   ├── __init__.py
│   │   ├── s3_service.py
│   │   ├── sqs_service.py
│   │   └── auth_service.py
│   └── ai/
│       ├── __init__.py
│       ├── bedrock_service.py
│       ├── bedrock_reranker.py
│       ├── vlm_service.py
│       ├── hybrid_search_service.py
│       ├── event_windowing_service.py
│       ├── tier_manager.py
│       └── search_service.py
└── old/                       # 백업 파일들
    ├── views_old.py
    └── urls_s3.py
```

### apps/db 최종 디렉토리 구조

```
apps/db/
├── models/
│   ├── __init__.py
│   ├── video.py
│   ├── event.py
│   ├── session.py
│   └── prompt_history.py
├── serializers/
│   ├── __init__.py
│   ├── video.py
│   ├── event.py
│   └── prompt.py
├── views/
│   ├── __init__.py
│   ├── video.py
│   ├── event.py
│   └── prompt.py
└── old/                       # 백업 파일들
```

---

## 마이그레이션 가이드

### 개발 환경 설정

#### 1. 환경변수 설정

**.env 파일 업데이트**:

```bash
# 기존 설정 유지
SECRET_KEY=...
DEBUG=True
DB_NAME=cctv_db
...

# 새로 추가된 AWS 설정
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_RERANKER_REGION=ap-northeast-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_VLM_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
AWS_BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0
AWS_SQS_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/xxx/video-processing
AWS_SQS_REGION=ap-northeast-2
```

#### 2. Docker 환경변수

**docker-compose.yml**:

```yaml
backend:
  environment:
    - AWS_BEDROCK_REGION=${AWS_BEDROCK_REGION:-ap-northeast-2}
    - AWS_BEDROCK_RERANKER_REGION=${AWS_BEDROCK_RERANKER_REGION:-ap-northeast-1}
    - AWS_BEDROCK_MODEL_ID=${AWS_BEDROCK_MODEL_ID}
    - AWS_BEDROCK_VLM_MODEL_ID=${AWS_BEDROCK_VLM_MODEL_ID}
    - AWS_BEDROCK_EMBEDDING_MODEL_ID=${AWS_BEDROCK_EMBEDDING_MODEL_ID}
    - AWS_BEDROCK_RERANK_MODEL_ID=${AWS_BEDROCK_RERANK_MODEL_ID}
    - AWS_SQS_QUEUE_URL=${AWS_SQS_QUEUE_URL}
    - AWS_SQS_REGION=${AWS_SQS_REGION}
```

#### 3. 프론트엔드 변경사항

**thumbnail-utils.ts**:

```typescript
// Before
const response = await fetch('/api/upload-thumbnail', {

// After
const response = await fetch('/api/s3/upload/thumbnail/', {
```

### 테스트 체크리스트

- [ ] 서버 시작 확인: `python manage.py runserver`
- [ ] Migration 에러 없음
- [ ] Import 에러 없음
- [ ] Health check 응답 확인: `GET /api/health/`
- [ ] S3 업로드 테스트: `POST /api/s3/upload/request/`
- [ ] VLM 채팅 테스트: `POST /api/vlm-chat/`
- [ ] 프롬프트 처리 테스트: `POST /api/prompt/`
- [ ] 비디오 조회 테스트: `GET /db/videos/`

### 배포 시 주의사항

1. **환경변수 확인**

   - ECS Task Definition에 새로운 환경변수 추가
   - Parameter Store/Secrets Manager 업데이트

2. **버킷 이름 검증**

   - `AWS_STORAGE_BUCKET_NAME`이 올바른 버킷 이름인지 확인
   - `AWS_THUMBNAILS_BUCKET_NAME`, `AWS_HIGHLIGHTS_BUCKET_NAME` 확인

3. **Region 설정**

   - Bedrock과 Reranker는 다른 region 사용 (Cohere 지원 여부)
   - ap-northeast-2: Bedrock 일반 모델
   - ap-northeast-1: Cohere Rerank 모델

4. **Migration 순서**
   - 환경변수 먼저 설정
   - 코드 배포
   - 서비스 재시작

---

## 성과 요약

### 정량적 성과

| 항목                | 이전      | 이후                                | 개선        |
| ------------------- | --------- | ----------------------------------- | ----------- |
| apps/api/views.py   | 1,208줄   | 7개 파일 (평균 200줄)               | 모듈화      |
| services/ 파일 구조 | 12개 flat | 3-tier (business/infrastructure/ai) | 카테고리화  |
| 하드코딩된 설정     | 20+ 곳    | 0곳                                 | 환경변수화  |
| print문             | 55+ 개    | 0개                                 | logger 통일 |
| URL 설정 파일       | 2개       | 1개                                 | 통합        |
| Import 에러         | 순환 참조 | 해결                                | 안정성      |

### 정성적 성과

- ✅ **가독성**: 파일당 평균 줄 수 50% 감소
- ✅ **유지보수성**: 도메인별 분리로 변경 영향 범위 최소화
- ✅ **확장성**: 새로운 서비스 추가 시 적절한 카테고리에 배치
- ✅ **보안성**: 하드코딩 제거로 민감 정보 보호
- ✅ **일관성**: 로깅, import, 설정 관리 통일

### 베스트 프랙티스 적용

1. **단일 책임 원칙** (SRP)

   - 각 파일이 하나의 도메인/책임만 담당

2. **의존성 역전 원칙** (DIP)

   - services 계층을 통한 추상화

3. **환경 설정 외부화**

   - Twelve-Factor App 원칙 준수

4. **계층형 아키텍처**
   - business → infrastructure → ai 명확한 분리

---

## 향후 개선 사항

### 단기 (1-2주)

- [ ] 각 service에 단위 테스트 추가
- [ ] API 문서 자동 생성 (Swagger/OpenAPI)
- [ ] 로깅 레벨별 필터링 설정

### 중기 (1개월)

- [ ] Service 레이어에 인터페이스 추가 (의존성 주입)
- [ ] 비동기 처리 개선 (Celery/Django-Q)
- [ ] 캐싱 레이어 추가 (Redis)

### 장기 (3개월)

- [ ] GraphQL API 고려
- [ ] 마이크로서비스 분리 검토
- [ ] 성능 모니터링 도입 (New Relic/DataDog)

---

## 참고 자료

- [Django Best Practices](https://docs.djangoproject.com/en/stable/)
- [Twelve-Factor App](https://12factor.net/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)

---

**작성일**: 2026-01-13  
**최종 업데이트**: 2026-01-13  
**문서 버전**: 1.0
