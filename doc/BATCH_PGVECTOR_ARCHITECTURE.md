# 🎯 수정된 아키텍처: FastAPI가 PostgreSQL + pgvector에 직접 저장

## ✅ 올바른 데이터 플로우

```
사용자 비디오 업로드 (Django)
         ↓
    S3 버킷 저장 (raw-videos)
         ↓
  S3 ObjectCreated Event
         ↓
    SQS Main Queue (자동)
         ↓
    Lambda 트리거 (자동)
         ↓
  AWS Batch Job 제출 (자동)
         ↓
  Batch Container 실행 (Fargate)
    - SQS 메시지 수신
    - FastAPI 분석 API 호출
         ↓
    FastAPI 비디오 분석 서비스
    - S3에서 비디오 다운로드
    - AI 분석 (Object Detection, Tracking)
    - 분석 결과를 PostgreSQL + pgvector에 저장 ⭐
    - Event, DepthData, DisplayData 등 DB 저장
         ↓
  Batch Job: SQS 메시지 삭제
         ↓
    처리 완료
```

## 📊 데이터 저장 위치

### ✅ PostgreSQL + pgvector에 저장되는 데이터:

1. **Video 메타데이터** (`apps.db.models.Video`)

   - video_id, title, duration, width, height, fps, file_size, etc.

2. **Event 데이터** (`apps.db.models.Event`)

   - 객체 감지 결과 (bounding box, class, confidence)
   - 타임스탬프별 이벤트

3. **DepthData** (`apps.db.models.DepthData`)

   - 깊이 맵 데이터

4. **DisplayData** (`apps.db.models.DisplayData`)

   - 시각화 데이터

5. **VideoAnalysis** (`apps.db.models.VideoAnalysis`)

   - 분석 진행 상태 (progress, status)

6. **벡터 임베딩** (pgvector)
   - 비디오 프레임/객체의 벡터 표현
   - 유사도 검색용

### ❌ S3에는 저장되지 않는 것:

- ~~분석 결과 JSON~~ (이전 잘못된 구현)
- Batch Job은 S3 results 버킷에 아무것도 쓰지 않음

### ✅ S3에 저장되는 것:

- **원본 비디오 파일** (`capstone-dev-raw/videos/`)
- Django가 업로드 시 저장

## 🔧 주요 변경사항

### 1. `batch/process_video.py`

**Before (잘못된 구현)**:

```python
# FastAPI 호출
result = self.call_fastapi_analysis(s3_event)

# ❌ Batch Job이 S3 results 버킷에 저장
self.save_result_to_s3(result, s3_event['key'])
```

**After (올바른 구현)**:

```python
# FastAPI 호출
# FastAPI가 내부적으로 PostgreSQL + pgvector에 저장
result = self.call_fastapi_analysis(s3_event)

# ✅ Batch Job은 저장하지 않음
# FastAPI가 이미 DB에 저장했으므로 SQS 메시지만 삭제
self.delete_message(message)
```

### 2. `terraform/batch.tf`

**환경 변수 제거**:

```hcl
# ❌ 제거됨
# S3_BUCKET_RESULTS

# ✅ 남아있는 환경 변수
environment = [
  { name = "SQS_QUEUE_URL", value = "..." },
  { name = "S3_BUCKET_RAW", value = "..." },
  { name = "FASTAPI_ENDPOINT", value = "http://alb:8087" },
  { name = "DB_SECRET_ARN", value = "..." }
]
```

**IAM 권한 축소**:

```hcl
# Before
Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
Resource = [
  "arn:aws:s3:::capstone-dev-raw/*",
  "arn:aws:s3:::capstone-dev-results/*"  # ❌ 불필요
]

# After
Action = ["s3:GetObject", "s3:ListBucket"]  # PutObject 제거
Resource = [
  "arn:aws:s3:::capstone-dev-raw/*"  # raw 버킷만
]
```

## 🎯 FastAPI의 역할

FastAPI 분석 서비스는 다음을 담당합니다:

```python
# FastAPI 내부 로직 (가상 예제)
@app.post("/analyze")
async def analyze_video(request: AnalysisRequest):
    # 1. S3에서 비디오 다운로드
    video_data = s3_client.get_object(
        Bucket=request.s3_bucket,
        Key=request.s3_key
    )

    # 2. AI 분석 수행
    analysis_result = ai_model.analyze(video_data)

    # 3. PostgreSQL + pgvector에 저장
    video = Video.objects.get(video_id=video_id)

    for event in analysis_result.events:
        Event.objects.create(
            video=video,
            frame_number=event.frame,
            bbox=event.bbox,
            class_name=event.class_name,
            confidence=event.confidence
        )

    # 4. 벡터 임베딩 저장 (pgvector)
    for frame_embedding in analysis_result.embeddings:
        # pgvector extension 사용
        db.execute("""
            INSERT INTO frame_embeddings (video_id, frame_number, embedding)
            VALUES (%s, %s, %s::vector)
        """, (video_id, frame_number, embedding))

    # 5. 분석 완료 상태 업데이트
    VideoAnalysis.objects.filter(video=video).update(
        status='completed',
        progress=100
    )

    return {"status": "success", "video_id": video_id}
```

## 🔄 Batch Job의 역할 (단순화됨)

Batch Job은 이제 **오케스트레이터** 역할만 합니다:

```python
# batch/process_video.py
def process_message(message):
    # 1. S3 이벤트 파싱
    s3_event = parse_s3_event(message)

    # 2. FastAPI 호출 (FastAPI가 DB 저장 처리)
    response = requests.post(
        f"{FASTAPI_ENDPOINT}/analyze",
        json={
            "s3_bucket": s3_event['bucket'],
            "s3_key": s3_event['key']
        }
    )

    # 3. 성공하면 SQS 메시지 삭제
    if response.status_code == 200:
        delete_message(message)
```

## 🧪 검증 방법

### 1. 비디오 업로드 후 PostgreSQL 확인

```sql
-- 비디오 메타데이터 확인
SELECT video_id, title, duration, status
FROM apps_db_video
WHERE video_id = 'test-001';

-- Event 데이터 확인
SELECT frame_number, class_name, confidence, bbox
FROM apps_db_event
WHERE video_id = 'test-001'
ORDER BY frame_number
LIMIT 10;

-- 벡터 임베딩 확인 (pgvector)
SELECT video_id, frame_number, embedding <-> '[0.1, 0.2, ...]'::vector AS distance
FROM frame_embeddings
WHERE video_id = 'test-001'
ORDER BY distance
LIMIT 5;

-- VideoAnalysis 상태 확인
SELECT status, progress, created_at, updated_at
FROM apps_db_videoanalysis
WHERE video_id = 'test-001';
```

### 2. S3 results 버킷 확인 (비어있어야 함)

```powershell
# ❌ 이제 여기에는 아무것도 없어야 함
aws s3 ls s3://capstone-dev-results/analysis_results/
# 출력: (empty)
```

### 3. Batch Job 로그 확인

```powershell
aws logs tail /aws/batch/capstone-video-processor --follow
```

**예상 로그**:

```
[INFO] Calling FastAPI: http://alb:8087/analyze
[INFO] ✅ FastAPI response: {"status": "success", "video_id": "test-001"}
[INFO] 📊 Analysis results saved to PostgreSQL + pgvector by FastAPI
[INFO] Message deleted successfully
[INFO] ✅ Video analysis completed successfully
```

## 💡 장점 (올바른 아키텍처)

1. **단일 책임 원칙**:

   - FastAPI: 분석 + DB 저장
   - Batch Job: 오케스트레이션만

2. **데이터 일관성**:

   - FastAPI가 트랜잭션 내에서 모든 데이터 저장
   - 부분 실패 방지

3. **검색 성능**:

   - pgvector로 벡터 유사도 검색
   - PostgreSQL 인덱스 활용

4. **비용 절감**:

   - S3 results 버킷 불필요
   - S3 PUT 요청 비용 감소

5. **유지보수 용이**:
   - DB 스키마 변경 시 FastAPI만 수정
   - Batch Job은 변경 불필요

## 🚀 배포 순서

1. **Terraform Plan**:

```powershell
cd e:\capstone\terraform
terraform plan -out=tfplan
```

2. **Terraform Apply**:

```powershell
terraform apply tfplan
```

3. **Batch Docker 이미지 빌드**:

```powershell
cd e:\capstone\batch
docker build -t capstone-batch-processor:latest .
```

4. **ECR 푸시**:

```powershell
aws ecr get-login-password --region ap-northeast-2 | docker login ...
docker push <ecr-url>:latest
```

5. **테스트**:

```powershell
# 비디오 업로드
curl -X POST http://alb:8000/db/videos/upload/ -F "video=@test.mp4"

# PostgreSQL 확인
psql -h <rds-endpoint> -U capstone -d capstone -c "SELECT COUNT(*) FROM apps_db_event WHERE video_id='test-001';"
```

## 📚 관련 문서

- `AWS_BATCH_SQS_GUIDE.md` - 전체 아키텍처 가이드
- `SQS_BATCH_DEPLOYMENT.md` - 배포 가이드
- `HYBRID_RAG_GUIDE.md` - pgvector 검색 가이드
