# AWS Batch + SQS 비디오 처리 파이프라인

## 🏗️ 아키텍처

```
사용자 비디오 업로드 (Django)
         ↓
    S3 버킷 저장
         ↓
  S3 ObjectCreated Event
         ↓
    SQS Main Queue
         ↓
   Lambda 트리거 (자동)
         ↓
   AWS Batch Job 제출
         ↓
  Batch Job Container (Fargate)
    - SQS 메시지 폴링
    - FastAPI 분석 서비스 호출
         ↓
    FastAPI 분석 처리
    - S3에서 비디오 다운로드
    - AI 분석 수행
    - 결과를 PostgreSQL + pgvector에 저장 ⭐
         ↓
  Batch Job: SQS 메시지 삭제
         ↓
 (실패 시) DLQ로 이동
```

## 📦 구성 요소

### 1. **SQS Queues** (`terraform/sqs.tf`)

- **Main Queue**: 비디오 처리 요청 큐
  - Visibility Timeout: 15분
  - Message Retention: 4일
  - Long Polling: 20초
- **DLQ (Dead Letter Queue)**: 실패한 메시지 저장
  - Max Receive Count: 3
  - Retention: 14일

### 2. **AWS Batch** (`terraform/batch.tf`)

- **Compute Environment**: Fargate 기반
  - Max vCPUs: 16
  - Private Subnets
- **Job Queue**: 우선순위 기반 작업 큐
- **Job Definition**:
  - 2 vCPU, 4GB Memory
  - Retry: 3회
  - Timeout: 30분

### 3. **Batch Processor** (`batch/`)

- **Docker Container**: Python 3.11 기반
- **주요 기능**:
  - SQS 메시지 폴링
  - S3 이벤트 파싱
  - FastAPI 분석 서비스 호출
  - 결과 S3 저장
  - 메시지 삭제/재시도

## 🚀 배포 가이드

### 1단계: Terraform으로 인프라 프로비저닝

```bash
cd e:\capstone\terraform

# 계획 확인
terraform plan -out=tfplan

# 인프라 배포
terraform apply tfplan
```

**생성되는 리소스**:

- SQS Main Queue + DLQ
- S3 Event Notification
- AWS Batch Compute Environment
- Batch Job Queue
- Batch Job Definition
- ECR Repository (batch-processor)
- IAM Roles & Policies
- Security Groups
- CloudWatch Log Groups
- CloudWatch Alarms

### 2단계: Batch Processor Docker 이미지 빌드

```bash
cd e:\capstone\batch

# Docker 이미지 빌드
docker build -t capstone-batch-processor:latest .

# 로컬 테스트 (선택사항)
docker run --rm \
  -e SQS_QUEUE_URL="https://sqs.ap-northeast-2.amazonaws.com/123456789012/capstone-dev-video-processing" \
  -e S3_BUCKET_RAW="capstone-dev-raw" \
  -e FASTAPI_ENDPOINT="http://your-alb:8087" \
  -e AWS_DEFAULT_REGION="ap-northeast-2" \
  -e ENVIRONMENT="dev" \
  capstone-batch-processor:latest
```

### 3단계: ECR에 이미지 푸시

```bash
# Terraform output에서 ECR URL 가져오기
$ECR_URL = terraform output -raw batch_processor_ecr_url

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin $ECR_URL

# 이미지 태깅
docker tag capstone-batch-processor:latest ${ECR_URL}:latest

# ECR에 푸시
docker push ${ECR_URL}:latest
```

### 4단계: Batch Job Definition 업데이트

```bash
# Job Definition이 최신 이미지를 사용하도록 업데이트
terraform apply -auto-approve
```

## 🔄 동작 흐름

### 1. 비디오 업로드 시

```python
# Django (back/apps/db/views.py)
def upload_video(request):
    # 1. 파일을 S3에 업로드
    s3_client.upload_fileobj(
        video_file,
        bucket='capstone-dev-raw',
        key=f'videos/{video_id}.mp4'
    )
    # 2. S3가 자동으로 SQS에 이벤트 전송 (S3 Event Notification)
    # 3. Django는 DB에 Video 레코드만 생성
```

### 2. SQS 메시지 구조

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "eventName": "ObjectCreated:Put",
      "eventTime": "2025-10-27T12:34:56.000Z",
      "s3": {
        "bucket": {
          "name": "capstone-dev-raw"
        },
        "object": {
          "key": "videos/abc123.mp4",
          "size": 1048576
        }
      }
    }
  ]
}
```

### 3. AWS Batch 자동 실행

- SQS에 메시지가 들어오면 **수동으로 Batch Job 제출 필요**
- 또는 **Lambda 트리거**로 자동화

### 4. Batch Job 처리

```python
# batch/process_video.py
1. SQS에서 메시지 수신
2. S3 이벤트 파싱 (bucket, key 추출)
3. FastAPI 호출:
   POST /analyze
   {
     "s3_bucket": "capstone-dev-raw",
     "s3_key": "videos/abc123.mp4"
   }
4. FastAPI가 분석 후 PostgreSQL + pgvector에 저장
5. SQS 메시지 삭제 (성공)
6. (실패 시) 재시도 → 3번 실패 시 DLQ로 이동
```

## ✅ Lambda 트리거 구현 완료

**해결됨**: Lambda가 SQS → Batch를 자동 연결

```python
# lambda/trigger_batch.py
import boto3

batch_client = boto3.client('batch')

def lambda_handler(event, context):
    for record in event['Records']:
        # SQS 메시지당 Batch Job 제출
        batch_client.submit_job(
            jobName=f'video-process-{timestamp}',
            jobQueue='capstone-dev-video-processing-queue',
            jobDefinition='capstone-dev-video-processor'
        )
```

**해결책 2: EventBridge Scheduler**

- 1분마다 Batch Job 제출 (SQS에 메시지가 있을 때)

**해결책 3: ECS Service + SQS Polling**

- 장기 실행 컨테이너가 계속 SQS 폴링

## 📊 모니터링

### CloudWatch Logs

```bash
# Batch Job 로그 확인
aws logs tail /aws/batch/capstone-video-processor --follow
```

### SQS 모니터링

```bash
# 큐 상태 확인
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing \
  --attribute-names All
```

### CloudWatch Alarms

1. **DLQ Messages Alarm**: DLQ에 메시지가 1개 이상 쌓이면 알림
2. **Queue Depth Alarm**: Main Queue에 100개 이상 메시지 쌓이면 알림

## 🧪 테스트

### 1. 로컬 SQS 메시지 전송 (테스트)

```python
import boto3
import json

sqs = boto3.client('sqs', region_name='ap-northeast-2')

message = {
    "Records": [{
        "eventName": "ObjectCreated:Put",
        "s3": {
            "bucket": {"name": "capstone-dev-raw"},
            "object": {"key": "videos/test123.mp4", "size": 1048576}
        }
    }]
}

sqs.send_message(
    QueueUrl='https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing',
    MessageBody=json.dumps(message)
)
```

### 2. Batch Job 수동 실행

```bash
aws batch submit-job \
  --job-name video-process-test-$(date +%s) \
  --job-queue capstone-dev-video-processing-queue \
  --job-definition capstone-dev-video-processor
```

### 3. Job 상태 확인

```bash
# Job 목록
aws batch list-jobs --job-queue capstone-dev-video-processing-queue

# 특정 Job 상태
aws batch describe-jobs --jobs <job-id>
```

## 🔧 문제 해결

### Job이 시작되지 않음

1. ECR 이미지 확인: `aws ecr describe-images --repository-name capstone-dev-batch-processor`
2. IAM 권한 확인: Task Role이 SQS, S3 접근 가능한지 확인
3. Security Group: Private subnet에서 인터넷 접근 가능한지 확인 (NAT Gateway)

### FastAPI 호출 실패

1. FastAPI 엔드포인트 확인: ALB DNS 올바른지 확인
2. Security Group: Batch → ALB 통신 허용되는지 확인
3. FastAPI 로그 확인: CloudWatch Logs에서 에러 확인

### 메시지가 DLQ로 계속 이동

1. Batch Job 로그 확인: `/aws/batch/capstone-video-processor`
2. Visibility Timeout 증가: 처리 시간이 15분 넘으면 증가 필요
3. Retry 전략 조정: `terraform/batch.tf`에서 재시도 횟수 조정

## 📈 성능 최적화

### 동시 처리량 증가

```hcl
# terraform/batch.tf
compute_resources {
  max_vcpus = 32  # 16 → 32로 증가
}
```

### Job 리소스 조정

```hcl
resourceRequirements = [
  { type = "VCPU", value = "4" },    # 2 → 4
  { type = "MEMORY", value = "8192" } # 4GB → 8GB
]
```

### SQS Batch 처리

```python
# batch/process_video.py
# MaxNumberOfMessages=10 (최대 10개 동시 처리)
response = sqs_client.receive_message(
    MaxNumberOfMessages=10  # 1 → 10
)
```

## 💰 비용 최적화

- **Spot Instances**: Fargate Spot으로 최대 70% 절감
- **Job 타임아웃**: 불필요하게 긴 타임아웃 방지
- **SQS Long Polling**: API 호출 횟수 감소
- **CloudWatch Logs Retention**: 7일로 제한

## 🔐 보안

- ✅ Private Subnet에서 실행
- ✅ IAM Task Role로 최소 권한 부여
- ✅ Secrets Manager에서 DB 자격증명 가져오기
- ✅ ECR 이미지 스캔 활성화
- ✅ SQS Queue Policy로 S3만 접근 허용

## 📚 참고 자료

- [AWS Batch 공식 문서](https://docs.aws.amazon.com/batch/)
- [SQS Long Polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html)
- [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html)
