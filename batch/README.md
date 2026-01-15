# Batch - AWS Batch GPU Video Analysis Worker

AWS Batch-based GPU video analysis worker for unmanned store CCTV footage processing.

## 📋 Table of Contents

- [Overview](#overview)
- [Pipeline Architecture](#pipeline-architecture)
- [AWS Batch Configuration](#aws-batch-configuration)
- [AI Models](#ai-models)
- [Processing Workflow](#processing-workflow)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Cost Optimization](#cost-optimization)

---

## Overview

On-demand GPU-based video analysis worker powered by AWS Batch. Automatically provisions GPU instances when jobs are submitted, processes CCTV videos using multiple AI models, and terminates instances after completion.

### Key Highlights

- ✅ **On-Demand GPU** - Auto-scaling from 0 to 4 instances based on workload
- ✅ **Cost-Efficient** - $1-3 per video vs $720/month for 24/7 GPU server
- ✅ **Fast Startup** - Custom AMI reduces cold start from 20min → 3min
- ✅ **Multi-AI Pipeline** - YOLO + MiVOLO + MEBOW + LLaVA integration
- ✅ **Automatic Scaling** - Serverless architecture with zero maintenance

### Tech Stack

- **Compute**: AWS Batch (EC2 Managed)
- **GPU Instance**: g5.xlarge (NVIDIA A10G, 4 vCPU, 16GB RAM, 24GB VRAM)
- **Container**: Docker + NVIDIA CUDA 11.8
- **Deep Learning**: PyTorch 2.1.0
- **Database**: PostgreSQL 16 + pgvector (via Backend)
- **Storage**: S3 (input videos + results)

---

## Pipeline Architecture

### 1. End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Video Upload & Trigger                          │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
         Frontend Upload → Backend API (confirm upload)
                              ↓
                    SQS Message Published
                    (video_id, s3_bucket, s3_key)
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        Lambda Trigger                                │
│  Function: sqs-to-batch                                              │
│  - Polls SQS queue (long polling)                                    │
│  - Checks for duplicate jobs (prevents re-processing)                │
│  - Submits Batch job with video metadata                             │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                     AWS Batch Job Queue                              │
│  Queue: capstone-dev-video-analysis-gpu-queue                        │
│  Priority: 10 (high)                                                 │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                  Compute Environment Auto-Scale                      │
│  - Detects pending job in queue                                      │
│  - Provisions g5.xlarge GPU instance (if none available)             │
│  - Launches ECS task with Docker container                           │
│  - Startup time: ~3 minutes (thanks to Custom AMI)                   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    Docker Container Execution                        │
│  Entry: run_analysis.py                                              │
│  1. Download video from S3                                           │
│  2. Load AI models from AMI volumes (/opt/ml → /workspace)           │
│  3. Execute video-analysis pipeline (run.py)                         │
│     - Person detection (YOLO)                                        │
│     - Age/gender estimation (MiVOLO)                                 │
│     - Behavior analysis (MEBOW)                                      │
│     - Event description (LLaVA VLM)                                  │
│  4. Save results to PostgreSQL + pgvector                            │
│  5. Update analysis_progress (0% → 100%)                             │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                     Job Completion & Cleanup                         │
│  - Container exits (success/failure)                                 │
│  - SQS message deleted (Lambda)                                      │
│  - GPU instance terminates after idle timeout (~10 min)              │
│  - Frontend polls analysis_progress → shows results                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Component Interaction

| Component            | Role               | Trigger                      | Output                         |
| -------------------- | ------------------ | ---------------------------- | ------------------------------ |
| **SQS Queue**        | Message buffer     | Backend API (upload confirm) | Job metadata                   |
| **Lambda**           | Job submission     | SQS message                  | Batch job ARN                  |
| **Batch Compute**    | GPU provisioning   | Job in queue                 | ECS task                       |
| **Docker Container** | AI processing      | Batch job start              | PostgreSQL records             |
| **Custom AMI**       | Fast model loading | EC2 launch                   | Pre-loaded models in `/opt/ml` |

---

## AWS Batch Configuration

### Compute Environment

**Defined in:** `terraform/modules/pipeline/batch-video-analysis-gpu.tf`

```hcl
resource "aws_batch_compute_environment" "video_analysis_gpu" {
  type         = "MANAGED"
  service_role = var.batch_service_role_arn
  state        = "ENABLED"

  compute_resources {
    type      = "EC2"
    min_vcpus = 0      # Zero cost when idle
    max_vcpus = 16     # Max 4 instances (4 vCPU × 4 = 16)

    instance_type = ["g5.xlarge"]
    subnets       = var.private_subnet_ids

    # Custom AMI with pre-loaded models
    ec2_configuration {
      image_type        = "ECS_AL2_NVIDIA"
      image_id_override = "ami-061fb5baa7da36413"
    }
  }
}
```

**Key Features:**

- **Auto-scaling**: Starts at 0 vCPUs, scales up to 16 vCPUs (4 instances max)
- **GPU Type**: NVIDIA A10G (24GB VRAM) - optimized for inference
- **Network**: Private subnets for security
- **IAM**: Managed service role with S3/RDS/Secrets Manager access

### Job Definition

```hcl
resource "aws_batch_job_definition" "video_analysis_processor" {
  name = "capstone-dev-video-analysis-processor"
  type = "container"

  platform_capabilities = ["EC2"]

  container_properties = {
    image = "ECR_URL@sha256:digest"

    resourceRequirements = [
      { type = "VCPU", value = "4" },
      { type = "MEMORY", value = "15360" },  # 15GB
      { type = "GPU", value = "1" }
    ]

    # Volume mounts from AMI
    mountPoints = [
      { sourceVolume = "models", containerPath = "/workspace/models" },
      { sourceVolume = "checkpoints", containerPath = "/workspace/checkpoints" },
      { sourceVolume = "experiments", containerPath = "/workspace/experiments" }
    ]

    environment = [
      { name = "DETECTOR_WEIGHTS", value = "/workspace/models/yolov8x_person_face.pt" },
      { name = "MIVOLO_CHECKPOINT", value = "/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar" },
      { name = "MEBOW_CFG", value = "/workspace/experiments/coco/segm-4_lr1e-3.yaml" },
      { name = "VLM_PATH", value = "/workspace/checkpoints/llava-fastvithd_0.5b_stage2" }
    ]
  }

  timeout {
    attempt_duration_seconds = 3600  # 60 min
  }

  retry_strategy {
    attempts = 2
  }
}
```

**Resource Limits:**

- **CPU**: 4 vCPUs (full g5.xlarge allocation)
- **Memory**: 15GB (leaves 1GB for system overhead)
- **GPU**: 1x NVIDIA A10G
- **Timeout**: 60 minutes per job
- **Retry**: Max 2 attempts on failure

### Job Queue

```hcl
resource "aws_batch_job_queue" "video_analysis_gpu" {
  name     = "capstone-dev-video-analysis-gpu-queue"
  state    = "ENABLED"
  priority = 10  # High priority

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.video_analysis_gpu.arn
  }
}
```

**Queue Behavior:**

- **Priority**: 10 (higher number = higher priority)
- **FIFO**: First-in-first-out processing
- **Concurrency**: Limited by max_vcpus (4 concurrent jobs max)

---

## AI Models

### Model Architecture Overview

```
Video Input (MP4/AVI)
        ↓
┌───────────────────────────────────────┐
│   1. Person Detection (YOLO)         │
│   Model: yolov8x_person_face.pt      │
│   Output: Bounding boxes, confidence  │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│   2. Age/Gender (MiVOLO)              │
│   Model: model_imdb_cross_person.pth  │
│   Output: Age (years), Gender (M/F)   │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│   3. Behavior Analysis (MEBOW)        │
│   Config: segm-4_lr1e-3.yaml         │
│   Output: Actions (walk, pick, sit)   │
└───────────────────────────────────────┘
        ↓
┌───────────────────────────────────────┐
│   4. Scene Description (LLaVA)        │
│   Model: llava-fastvithd_0.5b        │
│   Output: Natural language events     │
└───────────────────────────────────────┘
        ↓
PostgreSQL + pgvector (Embeddings)
```

### Model Specifications

| Model       | Purpose                 | Size   | Location                                                       | Hardware Requirement |
| ----------- | ----------------------- | ------ | -------------------------------------------------------------- | -------------------- |
| **YOLOv8x** | Person & face detection | ~130MB | `/workspace/models/yolov8x_person_face.pt`                     | GPU                  |
| **MiVOLO**  | Age & gender estimation | ~250MB | `/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar` | GPU                  |
| **MEBOW**   | Behavior classification | Config | `/workspace/experiments/coco/segm-4_lr1e-3.yaml`               | GPU                  |
| **LLaVA**   | Vision-language model   | ~1.2GB | `/workspace/checkpoints/llava-fastvithd_0.5b_stage2`           | GPU                  |

**Total Model Size**: ~1.85GB (pre-loaded in Custom AMI)

### Detectable Events

Behavior types extracted from video:

- `walking` - Person walking through frame
- `standing` - Person standing still
- `sitting` - Person sitting/occupying space
- `picking` - Person picking up items
- `theft` - Suspicious item removal
- `collapse` - Person falling/collapsed
- `violent` - Aggressive behavior
- `anomaly` - Unusual patterns

---

## Processing Workflow

### Entry Point: `run_analysis.py`

**Main orchestration script** that coordinates S3 download, AI processing, and cleanup.

```python
class VideoAnalysisProcessor:
    def __init__(self):
        # Load environment variables
        self.s3_bucket = os.environ['S3_BUCKET']
        self.s3_key = os.environ['S3_KEY']
        self.video_id = os.environ['VIDEO_ID']

        # PostgreSQL connection
        self.postgres_host = os.environ['POSTGRES_HOST']
        self.postgres_db = os.environ['POSTGRES_DB']

        # AI model paths
        self.detector_weights = '/workspace/models/yolov8x_person_face.pt'
        self.mivolo_checkpoint = '/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar'
        self.vlm_path = '/workspace/checkpoints/llava-fastvithd_0.5b_stage2'

    def run(self):
        # 1. Download video from S3
        video_path = self.download_video_from_s3()

        # 2. Execute video-analysis pipeline
        self.run_video_analysis(video_path, self.video_id)

        # 3. Cleanup temporary files
        os.remove(video_path)
```

### Execution Flow

**Step 1: S3 Download**

```python
def download_video_from_s3(bucket: str, key: str) -> Path:
    local_path = Path(f"/workspace/videos/{video_id}_{filename}")
    s3_client.download_file(bucket, key, str(local_path))
    return local_path
```

**Step 2: AI Pipeline Execution**

```python
def run_video_analysis(video_path: Path, video_id: int):
    # Calls video-analysis/run.py subprocess
    cmd = [
        'python3', '/workspace/video-analysis/run.py',
        '--video-id', str(video_id),
        '--input', str(video_path),
        '--detector-weights', detector_weights,
        '--checkpoint', mivolo_checkpoint,
        '--mebow-cfg', mebow_cfg,
        '--vlm-path', vlm_path,
        '--device', 'cuda:0',
        '--with-persons'
    ]

    subprocess.run(cmd, check=True)
```

**Step 3: video-analysis/run.py**

Integrated AI pipeline (from `memi/run.py`):

1. **Frame Extraction**: Sample frames at 1 FPS
2. **YOLO Detection**: Detect persons in each frame
3. **MiVOLO Analysis**: Estimate age/gender for each person
4. **MEBOW Behavior**: Classify behavior patterns
5. **LLaVA Description**: Generate natural language event descriptions
6. **PostgreSQL Storage**: Save events with vector embeddings
7. **Progress Updates**: Update `analysis_progress` field (0-100%)

### Database Integration

**Progress Tracking:**

```sql
UPDATE videos
SET analysis_progress = {progress}  -- 0, 25, 50, 75, 100
WHERE id = {video_id};
```

**Event Storage:**

```sql
INSERT INTO events (video_id, timestamp, event_type, description, embedding)
VALUES (
    {video_id},
    {timestamp},
    'picking',
    'Young male picking item from shelf',
    '{vector}'  -- pgvector embedding
);
```

---

## Deployment

### Docker Image Build

**Dockerfile Overview:**

- **Base Image**: `nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04`
- **Python**: 3.10
- **PyTorch**: 2.1.0 (CUDA 11.8)
- **Dependencies**: video-analysis requirements + boto3 + psycopg2

**Note**: Docker image is lightweight (~300MB) since AI models (1.85GB) are stored in Custom AMI and mounted as volumes.

### Build & Push to ECR

```powershell
# scripts/build-and-push-batch.ps1
$REGION = "ap-northeast-2"
$ACCOUNT_ID = "123456789012"
$ECR_REPO = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/capstone-dev-batch-processor"

# Build Docker image
docker build -f batch/Dockerfile -t capstone-batch-processor:latest .

# ECR login
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

# Tag with digest for production stability
docker tag capstone-batch-processor:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# Get image digest
aws ecr describe-images --repository-name capstone-dev-batch-processor --region $REGION
```

### Terraform Deployment

```bash
cd terraform/
terraform init
terraform plan
terraform apply

# Outputs:
# - batch_job_queue_arn
# - batch_job_definition_arn
# - batch_compute_environment_arn
```

### Job Submission (Manual Test)

```bash
aws batch submit-job \
  --job-name "test-video-analysis" \
  --job-queue "capstone-dev-video-analysis-gpu-queue" \
  --job-definition "capstone-dev-video-analysis-processor" \
  --container-overrides '{
    "environment": [
      {"name": "VIDEO_ID", "value": "123"},
      {"name": "S3_BUCKET", "value": "capstone-dev-raw-videos"},
      {"name": "S3_KEY", "value": "videos/123/original.mp4"}
    ]
  }'
```

---

## Monitoring

### CloudWatch Logs

**Log Group**: `/aws/batch/capstone-video-analysis-processor`

**Log Stream**: `video-analysis/{job-id}`

**Key Metrics:**

```
📥 Downloading s3://bucket/key to /workspace/videos/123.mp4
✅ Download complete: 150.5 MB
🚀 Starting Video Analysis AI Pipeline
[YOLO] Processing frame 1/300 (0.3%)
[MiVOLO] Age: 25, Gender: M
[MEBOW] Behavior: picking
[LLaVA] Young male picking item from shelf at 00:05
💾 Saved 42 events to PostgreSQL
✅ Video Analysis Completed (progress: 100%)
```

### Job Status Tracking

**AWS Batch Console:**

- Job State: `SUBMITTED` → `PENDING` → `RUNNABLE` → `STARTING` → `RUNNING` → `SUCCEEDED`/`FAILED`
- Duration: Typical 3-10 minutes per video
- Retry Count: Max 2 attempts

**Backend API Polling:**

```python
GET /api/videos/{id}/analysis/progress/
{
  "progress": 75,
  "status": "processing",
  "is_completed": false
}
```

### Error Handling

**Common Failures:**

| Error                         | Cause                   | Solution                                 |
| ----------------------------- | ----------------------- | ---------------------------------------- |
| `S3 download failed`          | Invalid S3 key          | Check video upload completion            |
| `CUDA out of memory`          | Video too long          | Increase GPU memory or reduce batch size |
| `PostgreSQL connection error` | RDS unavailable         | Check security group rules               |
| `Model not found`             | AMI volume mount failed | Verify AMI and launch template           |

**Retry Strategy:**

- Attempt 1: Automatic retry after 5 minutes
- Attempt 2: Final retry with extended timeout
- Max Attempts: 2 (then mark as `failed`)

---

## Cost Optimization

### Pricing Breakdown

**g5.xlarge Instance:**

- **On-Demand**: $1.006/hour (ap-northeast-2)
- **Average Job Duration**: 5-10 minutes
- **Cost Per Video**: $0.08 - $0.17

**Monthly Cost Estimation:**

| Videos/Day | Monthly Cost | vs 24/7 GPU ($720) | Savings  |
| ---------- | ------------ | ------------------ | -------- |
| 10         | $25-50       | 93% cheaper        | $670-695 |
| 50         | $120-250     | 65% cheaper        | $470-600 |
| 100        | $240-500     | 31% cheaper        | $220-480 |

**Additional Costs:**

- **ECR Storage**: ~$0.10/month (300MB image)
- **CloudWatch Logs**: ~$0.50/month (7-day retention)
- **Data Transfer**: Negligible (private subnets)

### Optimization Strategies

1. **Custom AMI**: Pre-loaded models reduce startup time from 20min → 3min

   - Saves ~$0.28 per job ($1.006/hour × 17 minutes)
   - ROI: Break-even after ~10 videos

2. **Auto-Scaling**: min_vcpus=0 ensures zero cost when idle

   - No running instances when no jobs in queue

3. **Spot Instances** (Optional):

   - 70% discount vs on-demand
   - Risk: Interruption during processing
   - Recommended only for non-critical workloads

4. **Job Queue Priority**: High-priority queue ensures fast processing
   - Reduces idle time between jobs

---

## Troubleshooting

### Job Stuck in RUNNABLE State

**Cause**: No available instances in compute environment

**Solution**:

```bash
# Check compute environment state
aws batch describe-compute-environments \
  --compute-environments capstone-dev-video-analysis-gpu-compute

# Verify max_vcpus allows new instances
# Check subnet availability zones have g5.xlarge capacity
```

### Container Fails to Start

**Cause**: Docker image pull error or AMI mount failure

**Solution**:

```bash
# Verify ECR image exists
aws ecr describe-images \
  --repository-name capstone-dev-batch-processor

# Check launch template AMI ID
aws ec2 describe-launch-templates \
  --launch-template-ids lt-xxxxx

# Verify volume mounts in job definition
aws batch describe-job-definitions \
  --job-definitions capstone-dev-video-analysis-processor
```

### GPU Not Detected

**Cause**: Missing GPU drivers or incorrect device mapping

**Solution**:

```dockerfile
# Verify Docker container has GPU access
linuxParameters = {
  devices = [
    { hostPath = "/dev/nvidia0", containerPath = "/dev/nvidia0" },
    { hostPath = "/dev/nvidiactl", containerPath = "/dev/nvidiactl" }
  ]
}

# Check ECS agent GPU support
echo ECS_ENABLE_GPU_SUPPORT=true >> /etc/ecs/ecs.config
```

### Analysis Progress Not Updating

**Cause**: PostgreSQL connection error

**Solution**:

```python
# Check security group allows Batch → RDS
# Verify DB credentials in Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id capstone-dev-db-password

# Test connection from container
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB
```

---

## Related Documentation

- [Backend README](../back/README.md) - Django API that triggers Batch jobs
- [Frontend README](../front/README.md) - Progress polling UI
- [Lambda README](../lambda/README.md) - SQS to Batch trigger function
- [Terraform README](../terraform/README.md) - Infrastructure provisioning details

---

## License

This project is part of the DeepSentinel unmanned store monitoring system.
