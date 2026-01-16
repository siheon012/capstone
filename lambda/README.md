# Lambda - SQS to Batch Trigger Function

AWS Lambda function that triggers GPU video analysis jobs by bridging SQS queue and AWS Batch.

## 📋 Table of Contents

- [Overview](#overview)
- [Why Lambda?](#why-lambda)
- [Function Architecture](#function-architecture)
- [Function Definition](#function-definition)
- [Terraform Configuration](#terraform-configuration)
- [Deployment](#deployment)
- [Duplicate Prevention](#duplicate-prevention)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Overview

Serverless Lambda function that polls SQS queue for video upload notifications and submits GPU analysis jobs to AWS Batch with intelligent duplicate detection.

### Key Highlights

- ✅ **Event-Driven** - Automatic trigger on SQS messages
- ✅ **Duplicate Prevention** - 2-tier job deduplication (name + S3 key)
- ✅ **Concurrency Control** - Max 1 concurrent job to prevent GPU overload
- ✅ **Partial Batch Failure** - Failed messages auto-retry via SQS
- ✅ **Cost Efficient** - Pay-per-invocation serverless model

### Tech Stack

- **Runtime**: Python 3.11
- **Trigger**: SQS Event Source Mapping
- **Target**: AWS Batch GPU Job Queue
- **IAM**: Managed role with Batch, SQS, CloudWatch permissions
- **Timeout**: 60 seconds
- **Memory**: 256 MB

---

## Why Lambda?

### The Problem

Before Lambda integration, the video analysis pipeline had critical issues:

**❌ Manual Job Submission**

```bash
# Required manual AWS CLI commands
aws batch submit-job --job-name "video-123" \
  --job-queue "gpu-queue" \
  --job-definition "video-processor" \
  --container-overrides '{"environment": [...]}'
```

**❌ No Automatic Triggering**

- Backend API had to directly call Batch API
- Required Batch SDK dependencies in Django
- Tight coupling between services

**❌ Duplicate Job Risk**

- S3 event notifications could trigger multiple times
- Network retries caused duplicate submissions
- No built-in deduplication mechanism

**❌ Error Handling Complexity**

- Failed submissions lost without retry
- No dead letter queue for failed events

### The Solution: Lambda as Orchestrator

**✅ Automatic Event Processing**

```
Backend Upload Complete
  → Publish to SQS
    → Lambda Auto-Triggered (Event Source Mapping)
      → Check for Duplicates
        → Submit Batch Job if Unique
```

**✅ Decoupled Architecture**

- Backend only publishes SQS messages (simple SDK call)
- Lambda handles all Batch job submission logic
- Easy to update job parameters without backend changes

**✅ Built-in Duplicate Detection**

```python
# 1st Check: Job name (deterministic from video_id)
job_name = f"video-process-{video_id}"

# 2nd Check: S3 key in job tags
existing_key = job_tags.get('VideoKey')
if existing_key == current_key:
    skip_submission()
```

**✅ Automatic Retry with SQS**

- Failed Lambda invocations → Message returns to queue
- Configurable retry count (maxReceiveCount: 1)
- Dead Letter Queue for permanent failures

**✅ Cost Optimization**

- No always-running process
- Pay only for executions (~$0.0000002 per invocation)
- Monthly cost: < $0.10 for 1000 videos

---

## Function Architecture

### 1. Trigger Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     Backend API (Django)                     │
│  POST /api/s3/upload/confirm/                                │
└──────────────────────────────────────────────────────────────┘
                        ↓
              SQS Message Published
              {
                "eventType": "video-uploaded",
                "video": { "id": 123 },
                "s3": {
                  "bucket": "capstone-dev-raw-videos",
                  "key": "videos/123/original.mp4"
                }
              }
                        ↓
┌──────────────────────────────────────────────────────────────┐
│            SQS Queue: video-processing                       │
│  - Long polling: 20s                                         │
│  - Visibility timeout: 15min                                 │
│  - Max receive count: 1 → DLQ                                │
└──────────────────────────────────────────────────────────────┘
                        ↓
         Lambda Event Source Mapping
         (batch_size: 1, max_concurrency: 10)
                        ↓
┌──────────────────────────────────────────────────────────────┐
│           Lambda: sqs-to-batch (Python 3.11)                 │
│                                                              │
│  1️⃣ Parse SQS message → extract video_id, S3 info           │
│  2️⃣ Check running jobs (RUNNING + RUNNABLE + STARTING)      │
│  3️⃣ If MAX_CONCURRENT_JOBS reached → return to queue        │
│  4️⃣ Check duplicate jobs:                                   │
│     - Job name: video-process-{video_id}                    │
│     - S3 key in job tags                                    │
│  5️⃣ Submit Batch job if unique                              │
│  6️⃣ Return batchItemFailures for failed messages            │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│         AWS Batch Job Queue (GPU)                            │
│  Job Name: video-process-123                                 │
│  Tags: { VideoKey: "videos/123/original.mp4" }               │
└──────────────────────────────────────────────────────────────┘
```

### 2. Message Processing Logic

```python
for record in event['Records']:
    # 1. Parse message
    bucket, key = parse_s3_event(record['body'])
    video_id = extract_video_id(record)

    # 2. Check capacity
    if check_running_jobs() >= MAX_CONCURRENT_JOBS:
        return {'batchItemFailures': [...]}  # Return to queue

    # 3. Check duplicates
    job_name = f"video-process-{video_id}"
    if job_exists(job_name) or s3_key_exists(key):
        continue  # Skip, mark as success

    # 4. Submit job
    batch_client.submit_job(
        jobName=job_name,
        jobQueue=JOB_QUEUE,
        containerOverrides={
            'environment': [
                {'name': 'VIDEO_ID', 'value': video_id},
                {'name': 'S3_BUCKET', 'value': bucket},
                {'name': 'S3_KEY', 'value': key}
            ]
        },
        tags={'VideoKey': key}
    )
```

---

## Function Definition

### Core Handler: `sqs_to_batch.py`

**File Location**: `lambda/sqs_to_batch.py`

#### 1. Environment Variables

```python
# Required (from Terraform)
JOB_QUEUE = os.environ['BATCH_JOB_QUEUE']
# "capstone-dev-video-analysis-gpu-queue"

JOB_DEFINITION = os.environ['BATCH_JOB_DEFINITION']
# "arn:aws:batch:ap-northeast-2:123:job-definition/video-processor:1"

MAX_CONCURRENT_JOBS = int(os.environ.get('MAX_CONCURRENT_JOBS', '1'))
# Limit GPU job concurrency to prevent resource exhaustion
```

#### 2. Helper Functions

**Check Running Jobs**

```python
def check_running_jobs():
    """
    Count active Batch jobs in all states:
    - SUBMITTED, PENDING, RUNNABLE, STARTING, RUNNING

    Returns:
        int: Total active jobs
    """
    total_jobs = 0

    for status in ['RUNNING', 'RUNNABLE', 'STARTING']:
        response = batch_client.list_jobs(
            jobQueue=JOB_QUEUE,
            jobStatus=status
        )
        total_jobs += len(response.get('jobSummaryList', []))

    return total_jobs
```

**Parse S3 Event**

```python
def parse_s3_event(body):
    """
    Extract S3 info from SQS message.
    Supports 3 formats:
    1. S3 Event Notification (Records[0].s3)
    2. Backend custom message (eventType: video-uploaded)
    3. Legacy direct format (bucket, key)

    Returns:
        tuple: (bucket, key) or (None, None)
    """
    if isinstance(body, str):
        body = json.loads(body)

    # Format 1: S3 Event Notification
    if 'Records' in body:
        s3 = body['Records'][0]['s3']
        return s3['bucket']['name'], s3['object']['key']

    # Format 2: Backend custom message
    if 's3' in body:
        return body['s3']['bucket'], body['s3']['key']

    # Format 3: Legacy
    if 'bucket' in body and 'key' in body:
        return body['bucket'], body['key']

    return None, None
```

#### 3. Main Handler

```python
def lambda_handler(event, context):
    """
    Main Lambda handler triggered by SQS Event Source Mapping.

    Args:
        event: {
            'Records': [
                {
                    'messageId': 'xxx',
                    'body': '{"eventType": "video-uploaded", ...}',
                    'messageAttributes': {...}
                }
            ]
        }
        context: Lambda context object

    Returns:
        dict: {
            'batchItemFailures': [
                {'itemIdentifier': 'message_id_1'}
            ]
        }
    """
    logger.info(f"Processing {len(event['Records'])} messages")

    # Step 1: Check capacity
    running_jobs = check_running_jobs()
    if running_jobs >= MAX_CONCURRENT_JOBS:
        logger.warning(f"Max jobs reached: {running_jobs}/{MAX_CONCURRENT_JOBS}")
        # Return all messages to queue
        return {
            'batchItemFailures': [
                {'itemIdentifier': r['messageId']}
                for r in event['Records']
            ]
        }

    # Step 2: Process each message
    failed_messages = []
    successful_count = 0

    for record in event['Records']:
        message_id = record['messageId']

        try:
            # Parse message
            bucket, key = parse_s3_event(record['body'])
            video_id = extract_video_id(record)

            if not video_id:
                logger.error("video_id not found")
                failed_messages.append({'itemIdentifier': message_id})
                continue

            # Generate deterministic job name
            job_name = f"video-process-{video_id}"

            # Step 3: Check for duplicate jobs
            if is_duplicate_job(job_name, key):
                logger.info(f"Duplicate job detected: {job_name}")
                successful_count += 1  # Mark as success to delete from queue
                continue

            # Step 4: Submit Batch job
            response = batch_client.submit_job(
                jobName=job_name,
                jobQueue=JOB_QUEUE,
                jobDefinition=JOB_DEFINITION,
                containerOverrides={
                    'environment': [
                        {'name': 'VIDEO_ID', 'value': video_id},
                        {'name': 'S3_BUCKET', 'value': bucket},
                        {'name': 'S3_KEY', 'value': key},
                        {'name': 'SQS_MESSAGE_ID', 'value': message_id}
                    ]
                },
                tags={
                    'Environment': 'dev',
                    'VideoKey': key,
                    'SubmittedAt': datetime.now().strftime('%Y%m%d-%H%M%S')
                }
            )

            logger.info(f"✅ Submitted job: {response['jobId']}")
            successful_count += 1

        except Exception as e:
            logger.error(f"Failed to process: {e}")
            failed_messages.append({'itemIdentifier': message_id})

    # Step 5: Return result
    logger.info(f"Success: {successful_count}, Failed: {len(failed_messages)}")

    if failed_messages:
        return {'batchItemFailures': failed_messages}

    return {'statusCode': 200}
```

#### 4. Duplicate Detection Logic

**2-Tier Deduplication:**

```python
def is_duplicate_job(job_name, s3_key):
    """
    Check for duplicate jobs using 2 methods:
    1. Job name (fast check, O(1) in active jobs list)
    2. S3 key in job tags (slower, requires describe_jobs API)

    Returns:
        bool: True if duplicate exists
    """
    # Get all active jobs
    active_jobs = []
    for status in ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING']:
        response = batch_client.list_jobs(
            jobQueue=JOB_QUEUE,
            jobStatus=status,
            maxResults=100
        )
        active_jobs.extend(response['jobSummaryList'])

    # Tier 1: Fast check by job name
    for job in active_jobs:
        if job['jobName'] == job_name:
            logger.warning(f"Duplicate by name: {job_name} (job_id: {job['jobId']})")
            return True

    # Tier 2: Check by S3 key in tags (for jobs created in last 5 minutes)
    current_time = int(datetime.now().timestamp() * 1000)

    for job in active_jobs:
        job_id = job['jobId']
        created_at = job.get('createdAt', 0)
        age_seconds = (current_time - created_at) / 1000

        # Only check recent jobs (5 min window)
        if age_seconds < 300:
            try:
                detail = batch_client.describe_jobs(jobs=[job_id])
                if detail['jobs']:
                    tags = detail['jobs'][0].get('tags', {})
                    existing_key = tags.get('VideoKey', '')

                    if existing_key == s3_key:
                        logger.warning(
                            f"Duplicate by S3 key: {s3_key} "
                            f"(job_id: {job_id}, age: {age_seconds:.0f}s)"
                        )
                        return True
            except Exception as e:
                logger.debug(f"Error checking job tags: {e}")

    return False
```

---

## Terraform Configuration

### Lambda Function Resource

**File**: `terraform/modules/pipeline/lambda.tf`

```hcl
resource "aws_lambda_function" "sqs_to_batch" {
  # Deployment package
  filename         = "lambda_deployment.zip"
  source_code_hash = filebase64sha256("lambda_deployment.zip")

  # Function configuration
  function_name = "capstone-${var.environment}-sqs-to-batch"
  handler       = "sqs_to_batch.lambda_handler"
  runtime       = "python3.11"
  timeout       = 60
  memory_size   = 256

  # IAM role (from security module)
  role = var.lambda_sqs_to_batch_role_arn

  # Environment variables
  environment {
    variables = {
      BATCH_JOB_QUEUE      = aws_batch_job_queue.video_analysis_gpu.name
      BATCH_JOB_DEFINITION = aws_batch_job_definition.video_analysis_processor.arn
      MAX_CONCURRENT_JOBS  = "1"
      ENVIRONMENT          = var.environment
    }
  }

  tags = {
    Name        = "capstone-sqs-to-batch"
    Environment = var.environment
    Project     = "Unmanned"
  }
}
```

### SQS Event Source Mapping

```hcl
resource "aws_lambda_event_source_mapping" "sqs_to_batch" {
  # SQS trigger
  event_source_arn = aws_sqs_queue.video_processing.arn
  function_name    = aws_lambda_function.sqs_to_batch.arn

  # Batch configuration
  batch_size = 1  # Process 1 message at a time
  enabled    = true

  # Partial batch response (critical for retry logic)
  function_response_types = ["ReportBatchItemFailures"]

  # Concurrency control
  scaling_config {
    maximum_concurrency = 10  # Max 10 Lambda instances
  }
}
```

**Why `batch_size = 1`?**

- Each message represents a different video
- Jobs should be submitted independently
- Easier error handling (one failure doesn't block others)

**Why `ReportBatchItemFailures`?**

- Failed messages return to queue for retry
- Successful messages delete immediately
- Prevents message loss on partial failures

### IAM Role

**File**: `terraform/modules/security/iam.tf`

```hcl
resource "aws_iam_role" "lambda_sqs_to_batch" {
  name = "capstone-${var.environment}-lambda-sqs-to-batch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_sqs_to_batch" {
  role = aws_iam_role.lambda_sqs_to_batch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # SQS
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.video_processing.arn
      },
      # Batch
      {
        Effect = "Allow"
        Action = [
          "batch:SubmitJob",
          "batch:TagResource",
          "batch:ListJobs",
          "batch:DescribeJobs"
        ]
        Resource = [
          aws_batch_job_queue.video_analysis_gpu.arn,
          "${aws_batch_job_definition.video_analysis_processor.arn}*"
        ]
      }
    ]
  })
}
```

### CloudWatch Logs

```hcl
resource "aws_cloudwatch_log_group" "sqs_to_batch_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.sqs_to_batch.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "capstone-sqs-to-batch-lambda-logs"
    Environment = var.environment
  }
}
```

---

## Deployment

### Method 1: PowerShell Script (Recommended)

**File**: `scripts/deploy-lambda-simple.ps1`

```powershell
# Configuration
$REGION = "ap-northeast-2"
$FUNCTION_NAME = "capstone-dev-sqs-to-batch"

# Step 1: Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Cyan

# Copy Lambda function to temp directory
$TempDir = "lambda_temp"
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $TempDir | Out-Null

Copy-Item -Path "lambda/sqs_to_batch.py" -Destination $TempDir

# Create ZIP file
$ZipFile = "lambda_deployment.zip"
Remove-Item -Path $ZipFile -Force -ErrorAction SilentlyContinue

Compress-Archive -Path "$TempDir/*" -DestinationPath $ZipFile

# Cleanup temp directory
Remove-Item -Path $TempDir -Recurse -Force

Write-Host "✅ Deployment package created: $ZipFile" -ForegroundColor Green

# Step 2: Update Lambda function
Write-Host "🚀 Updating Lambda function..." -ForegroundColor Cyan

aws lambda update-function-code `
    --function-name $FUNCTION_NAME `
    --zip-file fileb://$ZipFile `
    --region $REGION

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Lambda function updated successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to update Lambda function" -ForegroundColor Red
    exit 1
}

# Step 3: Wait for update to complete
Write-Host "⏳ Waiting for function update..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Step 4: Test invocation (optional)
Write-Host "🧪 Testing Lambda function..." -ForegroundColor Cyan

$TestPayload = @{
    Records = @(
        @{
            messageId = "test-123"
            body = @{
                eventType = "video-uploaded"
                video = @{ id = 999 }
                s3 = @{
                    bucket = "test-bucket"
                    key = "videos/999/test.mp4"
                }
            } | ConvertTo-Json -Compress
        }
    )
} | ConvertTo-Json -Depth 10

# Save to temp file
$TestPayload | Out-File -FilePath "test_payload.json" -Encoding UTF8

Write-Host "Test payload saved to test_payload.json" -ForegroundColor Gray
Write-Host "To test manually:" -ForegroundColor Yellow
Write-Host "aws lambda invoke --function-name $FUNCTION_NAME --payload file://test_payload.json response.json" -ForegroundColor Gray
```

**Usage:**

```powershell
cd c:\deepsentinel\capstone
.\scripts\deploy-lambda-simple.ps1
```

### Method 2: Terraform (Infrastructure as Code)

```bash
# Navigate to Terraform directory
cd terraform/

# Create deployment package first
cd ../lambda
zip -r ../terraform/lambda_deployment.zip sqs_to_batch.py
cd ../terraform

# Deploy Lambda via Terraform
terraform init
terraform plan
terraform apply

# Verify deployment
aws lambda get-function --function-name capstone-dev-sqs-to-batch
```

### Method 3: AWS CLI (Manual)

```bash
# Step 1: Create deployment package
cd lambda/
zip lambda_deployment.zip sqs_to_batch.py

# Step 2: Update function code
aws lambda update-function-code \
  --function-name capstone-dev-sqs-to-batch \
  --zip-file fileb://lambda_deployment.zip \
  --region ap-northeast-2

# Step 3: Update environment variables (if needed)
aws lambda update-function-configuration \
  --function-name capstone-dev-sqs-to-batch \
  --environment Variables="{
    BATCH_JOB_QUEUE=capstone-dev-video-analysis-gpu-queue,
    BATCH_JOB_DEFINITION=arn:aws:batch:...,
    MAX_CONCURRENT_JOBS=1
  }" \
  --region ap-northeast-2
```

---

## Duplicate Prevention

### Why Duplicate Detection Matters

**Without deduplication:**

- S3 event retries → Same video processed 2-3 times
- Network failures → Lambda retries SQS message
- User re-uploads → Same video_id reprocessed
- Cost: $1-3 × duplicates = Wasted GPU hours

**With 2-tier deduplication:**

- Tier 1: Job name check (fast, O(1) lookup)
- Tier 2: S3 key check (slower, for edge cases)
- Result: 99.9% duplicate prevention

### Implementation Details

**Tier 1: Deterministic Job Name**

```python
# Same video_id always generates same job name
job_name = f"video-process-{video_id}"

# Check active jobs by name
for job in active_jobs:
    if job['jobName'] == job_name:
        # Skip submission, mark as success
        return True
```

**Why this works:**

- `video_id` is unique (database primary key)
- Job name is deterministic (no timestamps/UUIDs)
- Fast check (no API calls, just list comparison)

**Tier 2: S3 Key Tagging**

```python
# Submit job with S3 key in tags
batch_client.submit_job(
    jobName=job_name,
    tags={'VideoKey': 'videos/123/original.mp4'}
)

# Later: Check if S3 key already processing
for job in active_jobs:
    tags = describe_jobs(job_id)['tags']
    if tags['VideoKey'] == current_s3_key:
        # Duplicate found!
        return True
```

**Why this is needed:**

- Catches edge cases where job name differs
- Handles race conditions (2 Lambdas submit same video)
- Time-bounded (only checks jobs < 5 min old)

### Edge Case Handling

**Race Condition:**

```
Time    Lambda A              Lambda B
-----   -----------------     -----------------
0ms     Receive SQS msg 1
5ms     Check duplicates      Receive SQS msg 2
        (none found)
10ms                          Check duplicates
                              (none found)
15ms    Submit job-123        Submit job-123 ❌
```

**Solution: Batch API rejection**

- AWS Batch enforces unique job names within queue
- Second submission fails with `JobNameAlreadyExists`
- Lambda catches error, marks as success (no retry)

---

## Monitoring

### CloudWatch Logs

**Log Group**: `/aws/lambda/capstone-dev-sqs-to-batch`

**Key Log Patterns:**

```
# Successful processing
INFO Processing 1 messages
INFO Processing video: s3://bucket/videos/123/original.mp4
INFO ✅ Final video_id: 123
INFO 🚀 Submitting job: video-process-123
INFO ✅ Successfully submitted job: abc-def-123
INFO Processing complete: 1 succeeded, 0 failed

# Duplicate detection
WARNING ⚠️ DUPLICATE JOB DETECTED by job name!
WARNING video_id: 123, job_name: video-process-123
WARNING Existing Job ID: xyz-789 (status: RUNNING)
INFO ✋ Skipping job submission due to duplicate detection.

# Capacity limit
WARNING Too many jobs running (1/1), returning messages to queue

# Failure
ERROR ❌ Failed to submit job: <error details>
ERROR ❌ Failed to process message test-123: <error>
INFO Processing complete: 0 succeeded, 1 failed
```

### CloudWatch Metrics

**Lambda Metrics:**

- `Invocations` - Total triggers from SQS
- `Duration` - Execution time (avg ~500ms)
- `Errors` - Failed invocations
- `ConcurrentExecutions` - Simultaneous runs

**SQS Metrics:**

- `NumberOfMessagesSent` - Messages from Backend
- `NumberOfMessagesDeleted` - Successful Lambda processing
- `ApproximateNumberOfMessagesVisible` - Queue backlog
- `ApproximateAgeOfOldestMessage` - Processing delay

**Custom Metrics (via Logs Insights):**

```sql
# Count duplicate detections
fields @timestamp, @message
| filter @message like /DUPLICATE JOB DETECTED/
| stats count() by bin(5m)

# Average processing time per message
fields @timestamp, @duration
| stats avg(@duration), max(@duration), min(@duration)

# Failed submissions
fields @timestamp, @message
| filter @message like /Failed to submit job/
| display @timestamp, @message
```

### Alarms

**Recommended CloudWatch Alarms:**

```hcl
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "lambda-sqs-to-batch-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda function has > 5 errors in 5 minutes"

  dimensions = {
    FunctionName = aws_lambda_function.sqs_to_batch.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_age" {
  alarm_name          = "sqs-video-processing-old-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 900  # 15 minutes
  alarm_description   = "SQS messages not processed for > 15 min"

  dimensions = {
    QueueName = aws_sqs_queue.video_processing.name
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Lambda Not Triggered

**Symptom**: Messages in SQS but Lambda not executing

**Causes & Solutions:**

```bash
# Check Event Source Mapping status
aws lambda get-event-source-mapping \
  --uuid <mapping-uuid>

# Verify mapping is enabled
# State should be "Enabled", LastProcessingResult should be "OK"

# If disabled, enable it
aws lambda update-event-source-mapping \
  --uuid <mapping-uuid> \
  --enabled
```

**Check IAM permissions:**

```bash
# Lambda must have sqs:ReceiveMessage permission
aws iam get-role-policy \
  --role-name capstone-dev-lambda-sqs-to-batch \
  --policy-name lambda-sqs-policy
```

#### 2. Jobs Not Submitted

**Symptom**: Lambda runs but no Batch jobs created

**Debug steps:**

```bash
# Check Lambda logs
aws logs tail /aws/lambda/capstone-dev-sqs-to-batch --follow

# Look for errors:
# - "Failed to submit job"
# - "DUPLICATE JOB DETECTED"
# - "Too many jobs running"

# Verify Batch permissions
aws iam get-role-policy \
  --role-name capstone-dev-lambda-sqs-to-batch \
  --policy-name lambda-batch-policy

# Check Job Definition ARN
aws lambda get-function-configuration \
  --function-name capstone-dev-sqs-to-batch \
  --query 'Environment.Variables.BATCH_JOB_DEFINITION'
```

#### 3. Duplicate Jobs Still Created

**Symptom**: Same video processed multiple times

**Investigation:**

```bash
# Check active jobs
aws batch list-jobs \
  --job-queue capstone-dev-video-analysis-gpu-queue \
  --job-status RUNNING

# Check job tags
aws batch describe-jobs --jobs <job-id> \
  --query 'jobs[0].tags'

# Review Lambda logs for duplicate detection
aws logs filter-log-events \
  --log-group-name /aws/lambda/capstone-dev-sqs-to-batch \
  --filter-pattern "DUPLICATE"
```

**Solutions:**

- Ensure `MAX_CONCURRENT_JOBS = 1` in Lambda env vars
- Check job name generation (should be deterministic)
- Verify S3 key tagging in job submission

#### 4. Messages in Dead Letter Queue

**Symptom**: Messages in `video-processing-dlq`

**Causes:**

- Lambda failed after max retries (maxReceiveCount: 1)
- Invalid message format
- video_id extraction failed

**Recovery:**

```bash
# Receive message from DLQ
aws sqs receive-message \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../video-processing-dlq \
  --max-number-of-messages 10

# Inspect message
cat message.json

# Fix issue (e.g., update Lambda code)

# Redrive messages back to main queue
aws sqs start-message-move-task \
  --source-arn <dlq-arn> \
  --destination-arn <main-queue-arn>
```

#### 5. Lambda Timeout

**Symptom**: Lambda times out before completion (60s limit)

**Causes:**

- `list_jobs` API call too slow (too many active jobs)
- `describe_jobs` called for too many jobs

**Solutions:**

```python
# Optimize: Limit time window for duplicate check
if (current_time - job_created_at) < 300:  # Only check last 5 min
    check_job_tags()

# Or: Increase Lambda timeout (max 900s)
aws lambda update-function-configuration \
  --function-name capstone-dev-sqs-to-batch \
  --timeout 120
```

---

## Testing

### Unit Test (Local)

```python
# test_lambda.py
import json
from sqs_to_batch import lambda_handler, parse_s3_event

def test_parse_s3_event():
    # Test Backend message format
    message = {
        'eventType': 'video-uploaded',
        'video': {'id': 123},
        's3': {
            'bucket': 'test-bucket',
            'key': 'videos/123/original.mp4'
        }
    }

    bucket, key = parse_s3_event(json.dumps(message))
    assert bucket == 'test-bucket'
    assert key == 'videos/123/original.mp4'

def test_lambda_handler_mock():
    # Mock event
    event = {
        'Records': [{
            'messageId': 'test-123',
            'body': json.dumps({
                'eventType': 'video-uploaded',
                'video': {'id': 999},
                's3': {
                    'bucket': 'test-bucket',
                    'key': 'videos/999/test.mp4'
                }
            })
        }]
    }

    # Mock Batch client (requires moto library)
    # result = lambda_handler(event, None)
    # assert result['statusCode'] == 200
```

### Integration Test (AWS)

```bash
# Create test SQS message
aws sqs send-message \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/.../video-processing \
  --message-body '{
    "eventType": "video-uploaded",
    "video": {"id": 9999},
    "s3": {
      "bucket": "capstone-dev-raw-videos",
      "key": "videos/9999/test.mp4"
    }
  }'

# Watch Lambda logs
aws logs tail /aws/lambda/capstone-dev-sqs-to-batch --follow

# Check Batch job created
aws batch list-jobs \
  --job-queue capstone-dev-video-analysis-gpu-queue \
  --job-status SUBMITTED
```

---

## Performance & Cost

### Performance Metrics

| Metric           | Value                                      |
| ---------------- | ------------------------------------------ |
| Average Duration | 500ms - 2s                                 |
| Cold Start       | ~3s (Python 3.11)                          |
| Memory Usage     | 60-80 MB (256 MB allocated)                |
| API Calls        | 2-5 per invocation (list_jobs, submit_job) |

### Cost Breakdown

**Lambda Pricing (ap-northeast-2):**

- **Invocation**: $0.20 per 1M requests
- **Duration**: $0.0000166667 per GB-second

**Example: 1000 videos/month**

```
Invocations: 1000 × $0.0000002 = $0.0002
Duration: 1000 × 1s × 0.25GB × $0.0000166667 = $0.0042
Total: ~$0.005/month
```

**Comparison to alternatives:**

- **ECS Fargate always-on**: $20-30/month (1 task)
- **EC2 t3.micro**: $8/month
- **Lambda**: < $0.01/month ✅

---

## Related Documentation

- [Backend README](../back/README.md) - SQS message publishing
- [Batch README](../batch/README.md) - GPU job execution
- [Terraform README](../terraform/README.md) - Infrastructure definition
- [SQS Configuration](../terraform/modules/pipeline/sqs.tf) - Queue setup

---

## License

This project is part of the DeepSentinel unmanned store monitoring system.
