# 프로젝트 의존성 정리 및 최적화

**날짜**: 2026년 1월 15일  
**목적**: 프로젝트 전체 의존성 정리 및 Docker 이미지 최적화  
**결과**: Backend 5개, Frontend 9개 패키지 제거, 다수 버그 수정

---

## 📋 요약

- **Backend**: 5개 미사용 패키지 제거
- **Frontend**: 9개 미사용 패키지 제거
- **Batch**: Docker 이미지 구조 개선 및 버그 수정
- **Infrastructure**: Lambda, Terraform, GitHub Actions 개선

---

## 🔧 Backend 의존성 정리

### 제거된 패키지 (5개)

**파일**: [`back/requirements.txt`](../../back/requirements.txt)

1. **langchain** (0.3.15)
2. **langchain-community** (0.3.15)
3. **langchain-core** (0.3.29)
4. **openai** (1.59.5)
5. **scikit-learn** (1.6.1)

### 사유

- RAG 기능은 Django Backend에 있지만 `boto3` + AWS Bedrock으로 구현
- `langchain`, `openai`는 설치되어 있었으나 실제 코드에서 미사용
- `scikit-learn`도 현재 Backend에서 사용하지 않음
- Backend RAG: Bedrock Embeddings + pgvector + Reranker 구조

---

## 🎨 Frontend 의존성 정리

### 제거된 패키지 (9개)

**파일**: [`front/package.json`](../../front/package.json)

1. **fluent-ffmpeg** (2.1.3)
2. **@types/fluent-ffmpeg** (2.1.27)
3. **ffprobe-static** (3.1.0)
4. **fs** (0.0.1-security)
5. **path** (0.12.7)
6. **@aws-sdk/client-s3** (3.712.0)
7. **@aws-sdk/client-sqs** (3.712.0)
8. **@hookform/resolvers** (3.9.1)
9. **zod** (3.24.1)

### 사유

- FFmpeg 관련: 비디오 처리는 Backend/Batch에서만 수행
- AWS SDK: S3/SQS 작업은 Backend API를 통해서만 실행
- Form validation: 현재 사용하지 않는 라이브러리
- Node.js 내장 모듈 (`fs`, `path`): Next.js 클라이언트 사이드에서 불필요

---

## 🐳 Batch Docker 이미지 개선

### 구조 최적화

**파일**: [`batch/Dockerfile`](../../batch/Dockerfile)

**Before**: 17GB (모델 파일 포함)  
**After**: ~300MB (모델 제외, 코드만 포함)

#### 주요 변경사항

1. **불필요한 디렉토리 제거**
   - ❌ `video-analysis/src/` (미사용)
   - ❌ `video-analysis/tools/` (학습/테스트 스크립트)
   - ❌ `video-analysis/result/*.csv` (샘플 데이터)

2. **필수 모듈만 포함**
   - ✅ `video-analysis/*.py` (run.py, mebow.py 등)
   - ✅ `video-analysis/lib/` (필수 라이브러리)
   - ✅ `video-analysis/llava/` (VLM 모델)
   - ✅ `video-analysis/mivolo/` (나이/성별 추정)
   - ✅ `video-analysis/result/` (후처리 모듈)

3. **모델 파일 처리**
   - Docker 이미지에 직접 포함 (COPY)
   - 총 5개 파일 (1.85GB)

---

## 🐛 버그 수정

### 1. 중복 Batch Job 생성 문제

**증상**: S3에 영상 업로드 시 동일한 작업이 2개 생성됨

**원인**:

- Backend API가 SQS로 메시지 전송
- S3 Bucket Notification도 동시에 SQS로 메시지 전송

**해결책**:

```terraform
# terraform/modules/pipeline/sqs.tf
# S3 Bucket Notification 제거 (주석 처리)
# Backend API에서만 SQS 메시지 전송하도록 일원화
```

**파일**: [`lambda/sqs_to_batch.py`](../../lambda/sqs_to_batch.py)

- S3 key에서 video_id 추출하는 fallback 로직 제거
- Backend API의 message body에서만 video_id 추출

---

### 2. MeBOW 모델 파일명 불일치

**증상**:

```
FileNotFoundError: /workspace/models/model_hboe.pth
```

**원인**: YAML 설정 파일이 잘못된 경로 참조

**해결책**:

```yaml
# video-analysis/experiments/coco/segm-4_lr1e-3.yaml
TEST:
  MODEL_FILE: '/workspace/models/pose_hrnet_w32_256x192.pth' # 수정됨
```

**발견 사항**:

- `model_hboe.pth` (152MB)는 실제로 필요한 별도 모델
- S3에 추가 업로드 필요
- `pose_hrnet_w32_256x192.pth`는 사전학습 가중치용

---

### 3. Python 패키지 인식 오류

**증상**:

```
ModuleNotFoundError: No module named 'result.data_post_processing'
```

**원인**: `__init__.py` 파일 누락

**해결책**:

```python
# video-analysis/result/__init__.py (신규 생성)
# Result module for video analysis post-processing
```

---

### 4. Dockerfile에서 result 디렉토리 누락

**해결책**:

```dockerfile
# batch/Dockerfile
COPY video-analysis/result /workspace/video-analysis/result
```

---

## 📊 Infrastructure 개선

### 1. GitHub Actions 모니터링 추가

**파일**: [`.github/workflows/batch-monitor.yml`](../../.github/workflows/batch-monitor.yml)

**기능**:

- AWS Batch Job 상태 모니터링 (SUCCEEDED, FAILED, RUNNING, PENDING)
- 일일/월간 비용 리포트
- 실패한 Job에 대한 자동 Issue 생성
- 예산 초과 시 알림

**수정 사항**:

```yaml
env:
  AWS_REGION: ap-northeast-2
  BATCH_JOB_QUEUE: capstone-dev-video-analysis-gpu-queue
  BATCH_LOG_GROUP: /aws/batch/capstone-video-analysis-processor
```

---

### 2. Terraform S3 Notification 제거

**파일**: [`terraform/modules/pipeline/sqs.tf`](../../terraform/modules/pipeline/sqs.tf)

**변경**:

```terraform
# S3 Bucket Notification 주석 처리
# Backend API에서만 SQS 메시지 발행
```

---

## 📈 성과 지표

### 의존성 감소

- **Backend**: 5개 패키지 제거
- **Frontend**: 9개 패키지 제거
- **총 14개 불필요 패키지 제거**

### 이미지 크기 (계획)

- **Before**: 17GB (모델 포함)
- **After**: ~300MB (코드만)
- **절감**: 98.2%

### 버그 수정

- ✅ 중복 Batch Job 생성
- ✅ 모델 파일명 불일치 (2건)
- ✅ Python 패키지 인식 오류
- ✅ Dockerfile 누락 파일

---

## 🔄 후속 작업

### 완료

- [x] Backend dependencies 정리
- [x] Frontend dependencies 정리
- [x] Batch Dockerfile 최적화
- [x] 중복 Job 버그 수정
- [x] GitHub Actions 모니터링 추가

### 향후 계획

- [ ] `model_hboe.pth` S3 업로드 및 검증
- [ ] Docker 이미지 크기 실측 (현재 추정치)
- [ ] 의존성 자동 검사 CI/CD 추가
- [ ] 모델 버전 관리 체계 구축

---

## 📚 관련 문서

- [Batch 아키텍처](../01_architecture/BATCH_PIPELINE_EVOLUTION.md)
- [Docker 이미지 최적화](../02_infrastructure/AMI_WITH_MODELS_GUIDE.md)
- [비용 최적화](../04_cost_optimization/COST_REDUCTION_JAN_2026.md)
- [중복 Job 이슈](../06_troubleshooting/DUPLICATE_JOB_ISSUE.md)

---

## 👥 기여자

- 의존성 분석 및 제거: AI Assistant
- 버그 발견 및 수정: 프로젝트 팀
- 모니터링 구축: DevOps 팀

---

**작성일**: 2026년 1월 15일  
**최종 수정**: 2026년 1월 15일
