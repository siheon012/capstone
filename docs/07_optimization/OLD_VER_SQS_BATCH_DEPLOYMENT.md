# 🚀 SQS + Lambda + AWS Batch 배포 가이드

## 📋 전체 아키텍처

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
    - FastAPI 분석 호출
         ↓
  FastAPI 분석 처리
    - S3에서 비디오 다운로드
    - AI 분석 수행
    - PostgreSQL + pgvector에 저장 ⭐
         ↓
  Batch Job: SQS 메시지 삭제
         ↓
    처리 완료

  (실패 시) → DLQ → CloudWatch Alarm
```

## 🛠️ 1단계: Lambda 배포 패키지 생성

### Windows PowerShell

```powershell
cd e:\capstone\terraform
.\build_lambda.ps1
```

**생성 결과**: `lambda_deployment.zip` (약 1~2KB)

### Linux/Mac

```bash
cd e:\capstone\terraform
chmod +x build_lambda.sh
./build_lambda.sh
```

## 🏗️ 2단계: Terraform 인프라 배포

```powershell
cd e:\capstone\terraform

# 계획 확인
terraform plan -out=tfplan

# 배포 실행
terraform apply tfplan
```

**프로비저닝되는 리소스**:

- ✅ SQS Main Queue (`capstone-dev-video-processing`)
- ✅ SQS DLQ (`capstone-dev-video-processing-dlq`)
- ✅ S3 Event Notification (raw-videos → SQS)
- ✅ Lambda Function (`capstone-dev-sqs-to-batch`)
- ✅ Lambda Event Source Mapping (SQS → Lambda)
- ✅ AWS Batch Compute Environment (Fargate)
- ✅ AWS Batch Job Queue
- ✅ AWS Batch Job Definition
- ✅ ECR Repository (`capstone-dev-batch-processor`)
- ✅ IAM Roles & Policies
- ✅ Security Groups
- ✅ CloudWatch Log Groups
- ✅ CloudWatch Alarms

**예상 시간**: 약 5~10분

## 🐳 3단계: Batch Processor Docker 이미지 빌드

```powershell
cd e:\capstone\batch

# Docker 이미지 빌드
docker build -t capstone-batch-processor:latest .

# 빌드 확인
docker images capstone-batch-processor
```

**이미지 크기**: 약 200~300MB

## 📤 4단계: ECR에 이미지 푸시

```powershell
cd e:\capstone\terraform

# Terraform output에서 ECR URL 가져오기
terraform output batch_processor_ecr_url
# 출력 예: 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com

# 이미지 태깅
docker tag capstone-batch-processor:latest 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:latest

# ECR에 푸시
docker push 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:latest

# v1.0.0 태그도 푸시 (버전 관리)
docker tag capstone-batch-processor:latest 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:v1.0.0
docker push 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:v1.0.0
```

## ✅ 5단계: 배포 검증

### 1. SQS 큐 확인

```powershell
# Main Queue 확인
aws sqs get-queue-url --queue-name capstone-dev-video-processing

# Queue 속성 확인
aws sqs get-queue-attributes `
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing `
  --attribute-names All
```

### 2. Lambda 함수 확인

```powershell
# Lambda 함수 정보
aws lambda get-function --function-name capstone-dev-sqs-to-batch

# Event Source Mapping 확인 (SQS 트리거)
aws lambda list-event-source-mappings --function-name capstone-dev-sqs-to-batch
```

**예상 출력**:

```json
{
  "EventSourceArn": "arn:aws:sqs:ap-northeast-2:...:capstone-dev-video-processing",
  "State": "Enabled",
  "BatchSize": 1
}
```

### 3. Batch 인프라 확인

```powershell
# Compute Environment 상태
aws batch describe-compute-environments --compute-environments capstone-dev-video-processing

# Job Queue 상태
aws batch describe-job-queues --job-queues capstone-dev-video-processing-queue

# Job Definition 확인
aws batch describe-job-definitions --job-definition-name capstone-dev-video-processor
```

### 4. ECR 이미지 확인

```powershell
aws ecr describe-images --repository-name capstone-dev-batch-processor
```

**예상 출력**:

```json
{
  "imageDetails": [
    {
      "imageDigest": "sha256:...",
      "imageTags": ["latest", "v1.0.0"],
      "imagePushedAt": "2025-10-27T..."
    }
  ]
}
```

## 🧪 6단계: 엔드투엔드 테스트

### 테스트 1: 수동 SQS 메시지 전송

```python
# test_sqs_message.py
import boto3
import json

sqs = boto3.client('sqs', region_name='ap-northeast-2')

message = {
    "Records": [{
        "eventVersion": "2.1",
        "eventSource": "aws:s3",
        "eventName": "ObjectCreated:Put",
        "eventTime": "2025-10-27T12:00:00.000Z",
        "s3": {
            "bucket": {
                "name": "capstone-dev-raw"
            },
            "object": {
                "key": "videos/test123.mp4",
                "size": 1048576
            }
        }
    }]
}

response = sqs.send_message(
    QueueUrl='https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing',
    MessageBody=json.dumps(message)
)

print(f"Message sent: {response['MessageId']}")
```

**실행**:

```powershell
python test_sqs_message.py
```

### 테스트 2: Lambda 로그 확인

```powershell
# Lambda 로그 실시간 확인
aws logs tail /aws/lambda/capstone-dev-sqs-to-batch --follow
```

**예상 로그**:

```
2025-10-27T12:00:01.234 [INFO] Received event: {...}
2025-10-27T12:00:01.456 [INFO] Processing message: abc123...
2025-10-27T12:00:01.678 [INFO] Submitting Batch job: video-process-20251027-120001-abc123
2025-10-27T12:00:02.123 [INFO] ✅ Batch job submitted: job-id-xyz
```

### 테스트 3: Batch Job 상태 확인

```powershell
# 최근 Job 목록
aws batch list-jobs --job-queue capstone-dev-video-processing-queue --job-status RUNNING

# 특정 Job 상세 정보
aws batch describe-jobs --jobs <job-id>
```

**Job 상태**:

- `SUBMITTED`: Job이 큐에 제출됨
- `PENDING`: 리소스 할당 대기 중
- `RUNNABLE`: 실행 준비 완료
- `STARTING`: 컨테이너 시작 중
- `RUNNING`: 실행 중
- `SUCCEEDED`: 성공
- `FAILED`: 실패

### 테스트 4: Batch Job 로그 확인

```powershell
# Batch Job 로그 실시간 확인
aws logs tail /aws/batch/capstone-video-processor --follow
```

**예상 로그**:

```
==========================================
AWS Batch Video Processor Starting...
==========================================
Environment: dev
SQS Queue URL: https://sqs...
==========================================
[INFO] Polling SQS for messages...
[INFO] Received message: abc123...
[INFO] S3 Event: bucket=capstone-dev-raw, key=videos/test123.mp4
[INFO] Calling FastAPI: http://your-alb:8087/analyze
[INFO] FastAPI response: {"status": "success", ...}
[INFO] Saving result to s3://capstone-dev-results/...
[INFO] Message deleted successfully
==========================================
Message processing completed successfully
==========================================
```

### 테스트 5: 실제 비디오 업로드 테스트

1. **Django로 비디오 업로드**:

```bash
curl -X POST http://your-alb:8000/db/videos/upload/ \
  -F "video=@test_video.mp4" \
  -F "video_id=test-001" \
  -F "title=Test Video"
```

2. **S3 이벤트 확인** (약 1~2초 후):

```powershell
# SQS 메시지 확인
aws sqs get-queue-attributes `
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing `
  --attribute-names ApproximateNumberOfMessages
```

3. **Lambda 자동 트리거 확인** (약 1~5초 후):

```powershell
aws logs tail /aws/lambda/capstone-dev-sqs-to-batch --since 1m
```

4. **Batch Job 실행 확인** (약 30초~1분 후):

```powershell
aws batch list-jobs --job-queue capstone-dev-video-processing-queue --job-status RUNNING
```

5. **처리 완료 확인** (비디오 크기에 따라 5~30분):

```powershell
# PostgreSQL DB 확인 (FastAPI가 저장)
aws rds describe-db-instances --db-instance-identifier capstone-postgres --query 'DBInstances[0].Endpoint.Address'

# DB 접속하여 결과 확인
psql -h <rds-endpoint> -U capstone -d capstone -c "SELECT COUNT(*) FROM apps_db_event WHERE video_id='test-001';"
```

## 📊 7단계: 모니터링

### CloudWatch 대시보드

```powershell
# SQS 메트릭
aws cloudwatch get-metric-statistics `
  --namespace AWS/SQS `
  --metric-name ApproximateNumberOfMessagesVisible `
  --dimensions Name=QueueName,Value=capstone-dev-video-processing `
  --start-time 2025-10-27T00:00:00Z `
  --end-time 2025-10-27T23:59:59Z `
  --period 300 `
  --statistics Average

# Lambda 메트릭
aws cloudwatch get-metric-statistics `
  --namespace AWS/Lambda `
  --metric-name Invocations `
  --dimensions Name=FunctionName,Value=capstone-dev-sqs-to-batch `
  --start-time 2025-10-27T00:00:00Z `
  --end-time 2025-10-27T23:59:59Z `
  --period 300 `
  --statistics Sum

# Batch 메트릭
aws cloudwatch get-metric-statistics `
  --namespace AWS/Batch `
  --metric-name RunningJobs `
  --dimensions Name=JobQueue,Value=capstone-dev-video-processing-queue `
  --start-time 2025-10-27T00:00:00Z `
  --end-time 2025-10-27T23:59:59Z `
  --period 300 `
  --statistics Average
```

### CloudWatch Alarms

**이미 구성된 알람**:

1. **DLQ Messages Alarm**: DLQ에 메시지 1개 이상
2. **Queue Depth Alarm**: Main Queue에 메시지 100개 이상

```powershell
# Alarm 상태 확인
aws cloudwatch describe-alarms --alarm-names capstone-dev-dlq-messages capstone-dev-queue-depth
```

## 🔧 8단계: 문제 해결

### 문제 1: Lambda가 트리거되지 않음

**진단**:

```powershell
# Event Source Mapping 상태 확인
aws lambda list-event-source-mappings --function-name capstone-dev-sqs-to-batch
```

**해결**:

- State가 "Disabled"면 활성화:

```powershell
aws lambda update-event-source-mapping --uuid <mapping-uuid> --enabled
```

### 문제 2: Batch Job이 시작되지 않음

**진단**:

```powershell
# Compute Environment 상태
aws batch describe-compute-environments --compute-environments capstone-dev-video-processing | ConvertFrom-Json | Select-Object -ExpandProperty computeEnvironments | Select-Object status, statusReason
```

**해결**:

- Status가 "INVALID"면 리소스 할당 문제 → VPC, Subnet, Security Group 확인
- ECR 이미지가 없으면 3단계 재실행

### 문제 3: Batch Job이 FAILED 상태

**진단**:

```powershell
# Job 로그 확인
aws logs tail /aws/batch/capstone-video-processor --since 1h
```

**일반적인 원인**:

1. FastAPI 엔드포인트 접근 불가 → Security Group 확인
2. SQS 메시지 포맷 오류 → S3 Event 구조 확인
3. 타임아웃 (30분) → Job Definition timeout 증가

### 문제 4: 메시지가 DLQ로 계속 이동

**진단**:

```powershell
# DLQ 메시지 확인
aws sqs receive-message `
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../capstone-dev-video-processing-dlq `
  --max-number-of-messages 1
```

**해결**:

- 메시지 내용 확인 후 원인 파악
- Retry 정책 조정: `terraform/batch.tf`에서 `attempts = 3` → `5`로 증가

## 🎯 성공 기준

✅ S3 업로드 → SQS 메시지 전송 (1~2초 이내)  
✅ Lambda 자동 트리거 → Batch Job 제출 (5초 이내)  
✅ Batch Job 시작 (30초~1분 이내)  
✅ FastAPI 분석 호출 성공  
✅ FastAPI가 PostgreSQL + pgvector에 결과 저장  
✅ SQS 메시지 삭제  
✅ DLQ에 메시지 없음 ## 📈 다음 단계

1. **프로덕션 배포**: `environment = "prod"`로 변경
2. **스케일링 조정**: Batch Compute Environment `max_vcpus` 증가
3. **SNS 알림**: DLQ Alarm에 SNS 토픽 연결
4. **Dashboard 구성**: CloudWatch Dashboard로 시각화
5. **비용 최적화**: Fargate Spot으로 전환 검토

## 🛡️ 보안 체크리스트

- [x] Private Subnet에서 Batch 실행
- [x] IAM Least Privilege (최소 권한 부여)
- [x] Secrets Manager로 DB 자격증명 관리
- [x] ECR 이미지 스캔 활성화
- [x] CloudWatch Logs 암호화
- [x] SQS Queue Policy로 S3만 접근 허용
- [x] VPC Endpoint 사용 (S3, SQS, ECR) - 비용 절감

## 💰 예상 비용 (월간)

- **SQS**: $0.40 (100만 요청 기준)
- **Lambda**: $0.20 (10만 호출 기준)
- **AWS Batch (Fargate)**: $30~$100 (사용량에 따라)
- **ECR**: $0.10 (1GB 저장)
- **CloudWatch Logs**: $5~$10 (1GB 수집)

**총 예상 비용**: **$35~$110/월**

## 📚 참고 문서

- [AWS Batch 개발자 가이드](https://docs.aws.amazon.com/batch/)
- [Lambda + SQS 통합](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
- [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
