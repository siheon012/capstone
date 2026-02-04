# GPU Worker (Deprecated)

**⚠️ DEPRECATED**: This approach has been replaced by AWS Batch + video-analysis pipeline for better cost efficiency and scalability.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Why This Approach Was Deprecated](#why-this-approach-was-deprecated)
- [Migration to AWS Batch](#migration-to-aws-batch)
- [Cost Comparison](#cost-comparison)

---

## Overview

The GPU Worker was an initial implementation of a video processing system using a **persistent EC2 GPU instance** with **SQS Long Polling**. The worker continuously polls SQS for video upload messages and processes them using GPU inference.

### Key Characteristics

- **Deployment**: EC2 g5.xlarge (NVIDIA A10G) running 24/7
- **Polling Method**: SQS Long Polling (20 seconds wait time)
- **Django Integration**: Tightly coupled with Django backend (requires `django.setup()`)
- **Visibility Management**: Complex visibility timeout extension logic
- **Error Handling**: Sophisticated retry mechanism with exponential backoff
- **Lifecycle**: Always running, waiting for messages

---

## Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   EC2 GPU Instance (24/7)                   │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │         GPU Worker Process                  │           │
│  │  (video_processor.py)                       │           │
│  │                                             │           │
│  │  while True:                                │           │
│  │    messages = sqs.receive_messages(         │           │
│  │      wait_time_seconds=20  # Long Polling  │           │
│  │    )                                        │           │
│  │                                             │           │
│  │    for msg in messages:                    │           │
│  │      ├─ Register message (visibility mgr)  │           │
│  │      ├─ Download video from S3             │           │
│  │      ├─ Run GPU inference (mock)           │           │
│  │      ├─ Save results to DB                 │           │
│  │      ├─ Delete SQS message                 │           │
│  │      └─ Update Django Video model          │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │   Visibility Timeout Manager                │           │
│  │   (Background Thread)                       │           │
│  │                                             │           │
│  │   - Monitors active messages               │           │
│  │   - Extends timeout every 4 minutes        │           │
│  │   - Prevents message reappearance          │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │   Error Handler & Retry Manager             │           │
│  │                                             │           │
│  │   - Classifies errors (temporary/permanent) │           │
│  │   - Exponential backoff retry              │           │
│  │   - Error statistics tracking              │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                        SQS Queue                            │
│   (capstone-dev-video-upload)                               │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Django)                         │
│   - Publishes SQS message on upload complete                │
│   - Provides Video model access                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. video_processor.py

**Main Worker Process**

- **GPUVideoWorker Class**: Main worker loop with graceful shutdown
- **Long Polling**: Receives messages with 20-second wait time
- **Message Processing**:
  - Parse SQS message body
  - Register with visibility manager
  - Download video from S3
  - Execute GPU inference (mock implementation)
  - Save results and update DB
  - Delete message on success
- **Statistics Tracking**: Success/error counts, processing time

**Key Issues**:

```python
# Requires Django setup in GPU worker
sys.path.insert(0, str(DJANGO_ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

# Tight coupling with backend models
from apps.api.services.sqs_service import sqs_service
from apps.db.models import Video
```

### 2. visibility_manager.py

**SQS Visibility Timeout Manager**

- **Background Thread**: Monitors active messages continuously
- **Auto-Extension**: Extends visibility every 4 minutes (240s interval)
- **Message Registration**: Tracks processing start time, estimated duration
- **Graceful Cleanup**: Unregisters messages on completion/failure

**Why Needed**:

- Default SQS visibility timeout: 5 minutes
- Video processing can take 10-60 minutes
- Without extension, messages reappear and get processed twice

**Complexity Example**:

```python
def _monitor_visibility_timeouts(self):
    """Background thread that extends visibility"""
    while not self._stop_event.is_set():
        now = datetime.now(timezone.utc)
        for receipt_handle, info in self.active_messages.items():
            elapsed = (now - info['last_extended']).total_seconds()
            if elapsed >= self.extension_interval:
                # Extend visibility by another 5 minutes
                self.sqs_service.change_message_visibility(
                    receipt_handle, 300
                )
```

### 3. error_handler.py

**Sophisticated Error Handling**

- **Error Classification**:
  - `TEMPORARY`: Retry with backoff (ConnectionError, TimeoutError)
  - `PERMANENT`: Delete message (PermissionError, FileNotFoundError)
  - `SYSTEM`: Shutdown worker (MemoryError, OSError)
- **Retry Strategy**:
  - Exponential backoff: 2s → 4s → 8s
  - Max retries: 3 attempts
  - Configurable retry logic per error type

- **Error Tracking**: Statistics per error type, function, timestamp

### 4. start_worker.sh

**Startup Script**

- Environment variable loading
- Python virtual environment activation
- GPU availability check (`nvidia-smi`)
- Log file rotation
- Graceful shutdown signal handling

---

## Why This Approach Was Deprecated

### Critical Issues

#### 1. **High Fixed Costs**

```
EC2 g5.xlarge (GPU instance):
- On-Demand: $1.006/hour
- Monthly: $1.006 × 24 × 30 = $723.43/month

Even with 0 videos to process, you pay $723/month for idle GPU.
```

#### 2. **Poor Resource Utilization**

- GPU sits idle 90%+ of the time waiting for messages
- Long polling consumes CPU even when queue is empty
- No automatic scaling - always 1 instance running

#### 3. **Complex State Management**

```python
# Need to manage:
- Visibility timeout extensions (background thread)
- Message deduplication tracking
- Retry state for each message
- Graceful shutdown coordination
- Error state recovery
```

#### 4. **Tight Coupling with Backend**

- Worker requires full Django environment (`django.setup()`)
- Direct dependency on backend models and services
- Backend code changes can break worker
- Difficult to version independently

#### 5. **Manual Infrastructure Management**

- Need to provision EC2 instance
- Configure GPU drivers, CUDA, Docker
- Monitor instance health
- Handle instance failures manually
- Manage security groups, IAM roles

#### 6. **Limited Scalability**

- Single instance = single concurrent job
- To process multiple videos simultaneously:
  - Need multiple EC2 instances
  - Complex queue partitioning
  - Manual load balancing

#### 7. **Incomplete AI Pipeline**

The mock implementation didn't include actual AI models:

```python
def _run_gpu_inference(self, video_path: str) -> Dict[str, Any]:
    """Mock Implementation - no real AI processing"""
    mock_result = {
        'detected_objects': random.randint(5, 50),
        'confidence_score': round(random.uniform(0.7, 0.95), 3),
    }
    time.sleep(random.uniform(5, 10))  # Fake processing
    return mock_result
```

To make this work, we'd need to:

- Install YOLO, MiVOLO, MEBOW, LLaVA
- Manage model weights (10GB+)
- Handle CUDA memory management
- Implement actual inference logic

---

## Migration to AWS Batch

We replaced this with **AWS Batch + video-analysis pipeline**. Here's why:

### 1. **Cost Efficiency (97% Cost Reduction)**

| Approach                  | Cost per Video | Monthly Cost (10 videos) | Monthly Cost (100 videos) |
| ------------------------- | -------------- | ------------------------ | ------------------------- |
| **GPU Worker (EC2 24/7)** | $723 ÷ videos  | $723                     | $723                      |
| **AWS Batch (On-Demand)** | $1-3           | $10-30                   | $100-300                  |

**Savings**: $693/month for 10 videos, $423/month for 100 videos

```
AWS Batch Pricing:
- Spin up g5.xlarge only when job submitted
- Processing time: ~10-15 minutes per video
- Cost: $1.006/hour × (15min/60min) = $0.25 per video
- Instance auto-terminates after job completes
```

### 2. **Automatic Scaling (0 to 4 Instances)**

```
AWS Batch Compute Environment:
- Min vCPUs: 0 (zero instances when idle)
- Max vCPUs: 16 (4× g5.xlarge instances)
- Scaling: Automatic based on queue depth

Job Queue:
- Priority: 10 (high)
- Auto-submits jobs when SQS messages arrive (via Lambda)
- Parallel processing: Up to 4 videos simultaneously
```

### 3. **No Infrastructure Management**

| Task                    | GPU Worker        | AWS Batch               |
| ----------------------- | ----------------- | ----------------------- |
| GPU Driver Installation | Manual            | Handled by AWS          |
| Instance Provisioning   | Manual            | Automatic               |
| Health Monitoring       | Custom scripts    | CloudWatch built-in     |
| Failure Recovery        | Manual restart    | Auto-retry with backoff |
| Security Patching       | Manual            | AWS managed             |
| Scaling Logic           | Write custom code | Configure min/max vCPUs |

### 4. **Decoupled Architecture**

```
Old (Tight Coupling):
Backend Django → SQS → GPU Worker (requires Django)
                          ↓
                   Direct DB access

New (Loose Coupling):
Backend Django → SQS → Lambda → AWS Batch
                                    ↓
                              video-analysis
                              (standalone Python)
                                    ↓
                              PostgreSQL API
```

**Benefits**:

- Backend changes don't affect video analysis
- Can version video-analysis independently
- Easy to test video-analysis locally
- No Django dependency in analysis code

### 5. **Fast Cold Start (3 Minutes)**

```
Custom AMI Optimization:
- Pre-installed AI models (YOLO, MiVOLO, MEBOW, LLaVA)
- Pre-warmed Docker image (CUDA, PyTorch)
- Pre-cached Python dependencies

Cold Start Time:
- Without AMI: 20+ minutes (model downloads, pip installs)
- With AMI: ~3 minutes (instance launch + container start)
```

### 6. **Complete AI Pipeline**

The video-analysis pipeline includes actual production models:

```python
# Real AI Models (not mocks)
┌─────────────────────────────────────────┐
│ YOLO v8x (Person + Face Detection)      │
│ - Model: yolov8x_person_face.pt         │
│ - Output: Bounding boxes, confidence    │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ MiVOLO (Age & Gender Estimation)        │
│ - Model: model_imdb_cross_person.pth    │
│ - Output: Age (number), gender, score   │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ MEBOW (Body Orientation)                │
│ - Model: HRNet segmentation model       │
│ - Output: 0°, 90°, 180°, 270°           │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ LLaVA FastVit (Action Recognition)      │
│ - Model: llava-fastvithd_0.5b_stage2    │
│ - Output: sitting, walking, theft, etc. │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Bedrock Claude (Scene Analysis)         │
│ - Model: claude-3-haiku                 │
│ - Output: Natural language description  │
└─────────────────────────────────────────┘
```

### 7. **Built-in Reliability Features**

| Feature           | GPU Worker                   | AWS Batch                    |
| ----------------- | ---------------------------- | ---------------------------- |
| Job Retry         | Custom error_handler.py      | Built-in (max 3 attempts)    |
| Timeout Handling  | Custom visibility_manager.py | Job timeout config (2 hours) |
| Dead Letter Queue | Manual SQS config            | Automatic DLQ routing        |
| Job Monitoring    | Custom logging               | CloudWatch Logs + Metrics    |
| Progress Tracking | Update DB manually           | CloudWatch Events + API      |

### 8. **Simplified Codebase**

**GPU Worker Complexity**:

- `video_processor.py`: 734 lines (message handling, visibility, retry)
- `visibility_manager.py`: 197 lines (background thread, timeout logic)
- `error_handler.py`: 301 lines (error classification, backoff)
- **Total**: 1,232 lines of infrastructure code

**AWS Batch Simplicity**:

- `batch/run_analysis.py`: ~200 lines (just video processing)
- `lambda/sqs_to_batch.py`: ~100 lines (job submission)
- **Total**: 300 lines (75% reduction)

**Why?** AWS Batch handles all the complexity:

- Visibility timeouts → Not needed (Batch manages job state)
- Error retry → Built-in retry policy
- Background threads → Not needed (Batch scheduler)

---

## Cost Comparison

### Scenario 1: Low Volume (10 videos/month)

| Item          | GPU Worker     | AWS Batch          | Savings             |
| ------------- | -------------- | ------------------ | ------------------- |
| Compute       | $723/month     | $2.50 (10 × $0.25) | **$720.50**         |
| Storage       | $5/month (EBS) | $0 (ephemeral)     | $5                  |
| Data Transfer | $1/month       | $1/month           | $0                  |
| **Total**     | **$729/month** | **$3.50/month**    | **$725.50 (99.5%)** |

### Scenario 2: Medium Volume (100 videos/month)

| Item                       | GPU Worker       | AWS Batch         | Savings            |
| -------------------------- | ---------------- | ----------------- | ------------------ |
| Compute                    | $723/month       | $25 (100 × $0.25) | **$698**           |
| Scaling (need 2 instances) | +$723 = $1,446   | $25 (auto-scales) | **$1,421**         |
| **Total**                  | **$1,446/month** | **$25/month**     | **$1,421 (98.3%)** |

### Scenario 3: High Volume (1,000 videos/month)

| Item                        | GPU Worker       | AWS Batch            | Savings            |
| --------------------------- | ---------------- | -------------------- | ------------------ |
| Compute (need 10 instances) | $7,230/month     | $250 (1,000 × $0.25) | **$6,980**         |
| Management Overhead         | High             | None                 | -                  |
| **Total**                   | **$7,230/month** | **$250/month**       | **$6,980 (96.5%)** |

---

## Conclusion

The GPU Worker approach was a valid initial design but had fundamental limitations:

❌ **High fixed costs** ($723/month even with 0 videos)  
❌ **Poor scalability** (manual instance management)  
❌ **Complex state management** (visibility, retry, error handling)  
❌ **Tight coupling** (Django dependency)  
❌ **Incomplete AI pipeline** (mock implementation)

The **AWS Batch + video-analysis pipeline** solves all these issues:

✅ **97-99% cost reduction** (pay-per-video)  
✅ **Automatic scaling** (0-4 instances)  
✅ **Zero infrastructure management** (AWS managed)  
✅ **Decoupled architecture** (Lambda orchestration)  
✅ **Production AI models** (YOLO + MiVOLO + MEBOW + LLaVA + Claude)  
✅ **Built-in reliability** (retries, DLQ, monitoring)  
✅ **75% less code** (AWS handles complexity)

**This is why we migrated to AWS Batch.**

---

## References

- [AWS Batch Documentation](https://docs.aws.amazon.com/batch/)
- [video-analysis Pipeline](../video-analysis/README.md)
- [Lambda SQS-to-Batch Trigger](../lambda/README.md)
- [Batch Deployment Guide](../docs/07_optimization/OLD_VER_SQS_BATCH_DEPLOYMENT.md)
- [Cost Optimization Analysis](../docs/04_cost_optimization/COST_REDUCTION_JAN_2026.md)

---

**Last Updated**: 2026-01-16  
**Status**: Deprecated (Replaced by AWS Batch)
