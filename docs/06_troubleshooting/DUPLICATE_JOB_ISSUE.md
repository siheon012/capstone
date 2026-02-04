# 중복 Batch Job 생성 문제 해결

## 문제 정의

### 증상

- Frontend에서 비디오를 1번 업로드하면 **AWS Batch에 2개의 Job이 생성**되는 현상 발생
- 동일한 비디오에 대해 중복된 분석 작업이 실행되어 리소스 낭비 및 비용 증가

### 발생 시점

- 2025년 12월 29일
- Frontend → S3 Pre-signed URL 업로드 → SQS → Lambda → Batch 파이프라인 테스트 중 발견

### 영향

- GPU 인스턴스(g5.xlarge) 중복 실행으로 비용 2배 증가
- DB에 중복 Event 데이터 저장
- SQS 메시지 중복 처리

## 원인 분석

### 1차 원인: SQS 중복 메시지

**S3 Event Notification이 동일한 업로드에 대해 2개의 SQS 메시지를 전송**

#### 증거 로그 (Lambda CloudWatch):

```
RequestId: fd9e8910-84dc-5b89-86f6-e8dccc1b5867
- video_id: 84 (from message body) ✅
- Job created: 972123fb-b18d-42a3-a4d4-4e58ac7874ae

RequestId: 94eb0697-6cce-51c3-9384-675b24759a91
- video_id: 2025 (from S3 path parsing) ❌
- Duplicate detected and skipped
```

### 2차 원인: Lambda Job 이름 생성 방식

**기존 코드:**

```python
timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
video_filename = key.split('/')[-1].split('.')[0]
job_name = f"video-process-{timestamp}-{video_filename[:20]}"
```

**문제점:**

- Timestamp 포함으로 **매번 다른 Job 이름 생성**
- 같은 비디오라도 다른 Job으로 인식되어 중복 체크 불가능
- Job 이름만으로는 중복 판별 불가

### 3차 원인: S3 Path 구조 불일치

**Backend 업로드 경로:**

```
videos/2025/12/29/f762f997-48bb-4ef7-9412-7ede74c1a993_20250526_193726.mp4
```

**Lambda가 기대한 경로:**

```
videos/{video_id}/{filename}
```

**결과:**

- Lambda가 날짜 "2025"를 video_id로 잘못 추출
- 첫 번째 메시지: video_id=84 (message body에서 추출) ✅
- 두 번째 메시지: video_id=2025 (S3 path에서 잘못 추출) ❌

## 해결 방법

### 1단계: Lambda 중복 방지 로직 강화

#### 해결 전략

1. **Deterministic Job Name**: video_id 기반으로 항상 동일한 Job 이름 생성
2. **2단계 중복 체크**:
   - 1차: Job Name으로 빠른 체크 (API 호출 불필요)
   - 2차: S3 Key로 추가 확인 (5분 이내 Job)

#### 수정된 코드

**파일**: `lambda/sqs_to_batch.py`

```python
# ✅ Deterministic Job Name 생성
job_name = f"video-process-{video_id}"
logger.info(f"🚀 Submitting job: {job_name}")

# 🔄 강화된 중복 Job 방지
duplicate_found = False
try:
    active_statuses = ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING']
    all_active_jobs = []

    for status in active_statuses:
        response = batch_client.list_jobs(
            jobQueue=JOB_QUEUE,
            jobStatus=status,
            maxResults=100
        )
        all_active_jobs.extend(response.get('jobSummaryList', []))

    logger.info(f"📊 Total active jobs: {len(all_active_jobs)}")

    # 🎯 1차: job name으로 빠른 체크
    for job_summary in all_active_jobs:
        if job_summary.get('jobName') == job_name:
            logger.warning(
                f"⚠️ DUPLICATE JOB DETECTED by job name! "
                f"video_id: {video_id}, "
                f"job_name: {job_name}, "
                f"Existing Job ID: {job_summary['jobId']}"
            )
            duplicate_found = True
            successful_count += 1  # 성공으로 처리 (SQS 메시지 삭제)
            break

    # 🎯 2차: S3 key로 추가 확인 (job name이 다를 경우 대비)
    if not duplicate_found:
        current_time = int(datetime.now().timestamp() * 1000)
        for job_summary in all_active_jobs:
            job_id = job_summary['jobId']
            created_at = job_summary.get('createdAt', 0)
            time_diff_seconds = (current_time - created_at) / 1000

            # 5분 이내에 생성된 Job만 확인
            if time_diff_seconds < 300:
                try:
                    job_detail = batch_client.describe_jobs(jobs=[job_id])
                    if job_detail.get('jobs'):
                        job_tags = job_detail['jobs'][0].get('tags', {})
                        existing_key = job_tags.get('VideoKey', '')

                        if existing_key == key:
                            logger.warning(
                                f"⚠️ DUPLICATE JOB DETECTED by S3 key! "
                                f"S3 Key: {key}, "
                                f"Existing Job ID: {job_id}"
                            )
                            duplicate_found = True
                            successful_count += 1
                            break
                except Exception as detail_error:
                    logger.debug(f"Error checking job details: {detail_error}")

    if duplicate_found:
        logger.info("✋ Skipping job submission due to duplicate detection.")
        continue  # 다음 메시지로

except Exception as check_error:
    logger.warning(f"⚠️ Failed to check for duplicate jobs: {check_error}")
```

### 2단계: video_id 추출 로직 개선

**우선순위 정의:**

1. SQS 메시지 body의 `video.id` 필드 (최우선)
2. MessageAttributes의 `video_id`
3. S3 key 경로에서 추출 (단, 숫자인지 검증)
4. Fallback: 파일명에서 숫자 추출

**변경사항:**

```python
# 3. S3 key 경로에서 추출: videos/{video_id}/{filename}
if not video_id:
    try:
        key_parts = key.split('/')
        if len(key_parts) >= 2 and key_parts[0] == 'videos':
            extracted_id = key_parts[1]
            # ✅ 숫자인지 확인 추가
            if extracted_id.isdigit():
                video_id = extracted_id
                logger.info(f"Extracted video_id from S3 key path: {video_id}")
            else:
                logger.warning(f"S3 key path segment is not a number: {extracted_id}")
    except Exception as e:
        logger.debug(f"Could not extract video_id from S3 key path: {e}")
```

### 3단계: Frontend 에러 수정

**문제**: Event 데이터의 `gender_score`가 `null`일 때 `.toFixed()` 호출 시 에러 발생

**파일**: `front/components/event-timeline.tsx`

```tsx
// ❌ Before
<span>{event.gender} ({event.age}세, {event.gender_score.toFixed(1)}% 신뢰도)</span>

// ✅ After
<span>{event.gender} ({event.age}세, {event.gender_score ? event.gender_score.toFixed(1) : '0'}% 신뢰도)</span>
```

## 검증 및 테스트

### 테스트 시나리오

1. Frontend에서 비디오 업로드
2. Lambda 로그 확인
3. Batch Job 개수 확인

### 테스트 결과 (2025-12-29)

#### Lambda 로그:

```
[INFO] Received 1 messages from SQS
[INFO] Processing video: s3://capstone-dev-raw/videos/2025/12/29/f762f997-...
[INFO] Extracted video_id from message body: 84
[INFO] ✅ Final video_id: 84
[INFO] 🚀 Submitting job: video-process-84
[INFO] 📊 Total active jobs: 0
[INFO] ✅ Successfully submitted job: 972123fb-b18d-42a3-a4d4-4e58ac7874ae

# 두 번째 SQS 메시지 처리
[INFO] Received 1 messages from SQS
[INFO] 📊 Total active jobs: 1
[WARNING] ⚠️ DUPLICATE JOB DETECTED by job name!
          video_id: 84, job_name: video-process-84
          Existing Job ID: 972123fb-b18d-42a3-a4d4-4e58ac7874ae (status: SUBMITTED)
[INFO] ✋ Skipping job submission due to duplicate detection.
[INFO] Processing complete: 1 succeeded, 0 failed
```

#### Batch Jobs:

```bash
$ aws batch list-jobs --job-queue capstone-dev-memi-gpu-queue --job-status RUNNABLE

JobId: 972123fb-b18d-42a3-a4d4-4e58ac7874ae
JobName: video-process-84
Status: RUNNABLE
```

**결과**: ✅ **1개의 Job만 생성됨** (중복 방지 성공)

## 배포

### Lambda 배포

```powershell
cd E:\capstone\lambda
Compress-Archive -Path sqs_to_batch.py -DestinationPath deployment-package.zip
aws lambda update-function-code `
  --function-name capstone-dev-sqs-to-batch `
  --zip-file fileb://deployment-package.zip `
  --region ap-northeast-2
```

### 배포 확인

```json
{
  "FunctionName": "capstone-dev-sqs-to-batch",
  "LastModified": "2025-12-31T12:20:25.000+0000",
  "CodeSize": 4300,
  "CodeSha256": "w17gVOGVWKQGTy4cNhh98W2VyPajEVVt4cLDNipq4vk=",
  "LastUpdateStatus": "Successful"
}
```

## 추가 개선 사항

### SQS 중복 메시지 근본 원인 조사 필요

- S3 Event Notification 설정 재검토
- Content-Based Deduplication 활성화 고려
- SQS FIFO 큐로 전환 검토

### 모니터링 강화

- CloudWatch Alarm: 중복 Job 감지 시 알림
- Lambda 로그 메트릭: "DUPLICATE JOB DETECTED" 카운트

## 관련 파일

- `lambda/sqs_to_batch.py` - Lambda 함수 (중복 방지 로직)
- `front/components/event-timeline.tsx` - Frontend 에러 수정
- `terraform/batch-memi-gpu.tf` - Batch Job Definition
- `terraform/sqs.tf` - SQS 큐 설정

## 참고 자료

- [AWS Batch Best Practices - Job Idempotency](https://docs.aws.amazon.com/batch/latest/userguide/best-practices.html)
- [SQS Message Deduplication](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html)
- [S3 Event Notification Troubleshooting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-troubleshooting.html)

---

**작성일**: 2025-12-31  
**최종 업데이트**: 2025-12-31
