# Backend - Django REST API Server

Backend API server for unmanned store CCTV video analysis service.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [AWS Integration](#aws-integration)
- [Database](#database)
- [Environment Setup](#environment-setup)
- [Deployment](#deployment)
- [Development Guide](#development-guide)

---

## Overview

Django REST Framework-based backend server that handles unmanned store CCTV video upload, AI analysis triggering, and natural language query processing.

### Key Highlights

- ✅ **Admin-Only Service** - Single store monitoring system ready to use without login
- ✅ **AWS Native** - Fully integrated with S3, SQS, Lambda, Batch, Bedrock
- ✅ **pgvector RAG Search** - PostgreSQL vector DB-based semantic search
- ✅ **Multi-AI Models** - Bedrock Claude, Titan Embeddings, Reranker integration
- ✅ **ECS Fargate Deployment** - Container-based zero-downtime operations

### Tech Stack

- **Framework**: Django 5.2 + Django REST Framework 3.16
- **Database**: PostgreSQL 16 (pgvector extension)
- **Cloud**: AWS (S3, SQS, Lambda, Batch, Bedrock, RDS, ECS)
- **Container**: Docker + Gunicorn
- **Language**: Python 3.10+

---

## Key Features

### 1. Video Upload & Management

```
User Upload → S3 Presigned URL → Direct Upload → SQS Message → Lambda Trigger → Batch Analysis Start
```

- **S3 Presigned URL** based secure upload
- **JWT Token** based upload validation
- **Automatic Metadata Extraction** (resolution, FPS, duration, etc.)
- **Automatic Thumbnail Generation**

### 2. AI Video Analysis Pipeline Trigger

- **SQS Message Publishing**: Automatic queue message on upload completion
- **Lambda → Batch Trigger**: Duplicate execution prevention mechanism
- **Real-time Progress Tracking**: `analysis_progress` (0-100%)
- **Job Monitoring**: AWS Batch Job ID integration

### 3. Natural Language Query Processing (RAG)

**Hybrid Search System**:

1. **Vector Search**: Semantic search using Titan Embeddings
2. **Reranker**: Accuracy improvement with Bedrock Rerank model
3. **Event Windowing**: Context expansion based on time windows
4. **Claude Response Generation**: Natural language formatting of search results

**Example Queries**:

```
"Any theft incidents between 3 and 5 minutes?"
"Find scenes where young males pick up items"
"Was there anyone who collapsed?"
```

### 4. VLM Chat (Vision Language Model)

- **Frame Analysis**: Scene description at specific timestamps
- **Behavior Pattern Analysis**: Location-based (left/center/right) behavior statistics
- **Timeline Extraction**: Event organization by time range

### 5. Video Summary Generation

- **AI Summarization**: Claude-based full video summary
- **Async Processing**: Background generation with status updates
- **Caching**: Once generated, summaries are reused

### 6. Event Management

Detectable Event Types:

- `theft` - Theft
- `collapse` - Person collapsed
- `sitting` - Occupancy
- `violent` - Violence
- `picking` - Item picking
- `walking`, `standing` - General behavior
- `anomaly` - Abnormal behavior

### 7. S3 Storage Tiering

- **Automatic Archiving**: Move old videos to Glacier
- **Cost Optimization**: Automatic tier management based on access frequency
- **Restore Function**: Restore from Glacier when needed

---

## Architecture

### Service Layer Structure

```
apps/
├── api/                      # Business Logic API
│   ├── views/               # API Endpoints
│   │   ├── prompt.py        # RAG Query Processing
│   │   ├── vlm.py           # VLM Chat
│   │   ├── summary.py       # Video Summarization
│   │   ├── s3.py            # S3 Upload Management
│   │   └── health.py        # Health Check
│   │
│   └── services/            # Service Layer (3-Tier)
│       ├── ai/              # AI Services
│       │   ├── bedrock_service.py         # Text2SQL, RAG
│       │   ├── bedrock_reranker.py        # Search Reranking
│       │   ├── vlm_service.py             # VLM Processing
│       │   ├── hybrid_search_service.py   # Hybrid Search
│       │   ├── search_service.py          # Vector Search
│       │   ├── event_windowing_service.py # Context Expansion
│       │   └── tier_manager.py            # S3 Tiering
│       │
│       ├── business/        # Business Logic
│       │   ├── video_service.py           # Video Management
│       │   └── event_service.py           # Event Management
│       │
│       └── infrastructure/  # Infrastructure Services
│           ├── s3_service.py              # S3 Upload/Download
│           ├── sqs_service.py             # SQS Message Publishing
│           └── auth_service.py            # JWT Token Validation
│
└── db/                       # Database CRUD
    ├── models/              # Django ORM Models
    │   ├── video.py         # Video Model
    │   ├── event.py         # Event Model
    │   ├── prompt.py        # PromptSession, PromptInteraction
    │   └── analysis.py      # VideoAnalysis, DepthData, etc.
    │
    ├── views/               # DRF ViewSet
    │   ├── video.py         # VideoViewSet
    │   ├── event.py         # EventViewSet
    │   ├── prompt.py        # PromptSessionViewSet
    │   └── analysis.py      # VideoAnalysisViewSet, TierManagementViewSet
    │
    ├── serializers/         # DRF Serializer
    └── signals.py           # Event/Video Signal Processing (Auto Embedding Generation)
```

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Video Upload Request                                         │
│    POST /api/s3/upload/request/                                 │
│    → s3_service.generate_presigned_upload_url()                 │
│    → Return JWT Token + Presigned URL                           │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Frontend → S3 Direct Upload                                  │
│    PUT https://s3.amazonaws.com/capstone-dev-videos/...         │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Upload Confirmation                                          │
│    POST /api/s3/upload/confirm/                                 │
│    → Create Video Record (DB)                                   │
│    → sqs_service.send_video_processing_message()                │
│    → Publish SQS Message                                        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Lambda Auto Trigger (SQS → Lambda → Batch)                   │
│    - Execute lambda/sqs_to_batch.py                             │
│    - Submit AWS Batch Job (with duplicate prevention)           │
│    - Update Video.job_id                                        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Batch Analysis Progress (batch/run_analysis.py)              │
│    - Run YOLO, MiVOLO, MEBOW, LLaVA                             │
│    - Insert Event Records (DB)                                  │
│    - Update analysis_progress (0 → 100%)                        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Django Signal Auto Execution (On Analysis Complete)          │
│    - apps/db/signals.py: post_save(Video)                       │
│    - Call bedrock_service.generate_embedding()                  │
│    - Batch Generate Event.embedding (pgvector)                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. User Query (RAG)                                             │
│    POST /api/prompt/                                            │
│    → hybrid_search_service.search()                             │
│    → bedrock_reranker.rerank()                                  │
│    → bedrock_service.generate_rag_response()                    │
│    → Return Natural Language Response                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Health Check

| Method | Endpoint       | Description                                         |
| ------ | -------------- | --------------------------------------------------- |
| `GET`  | `/api/health/` | Server status check (ALB target group health check) |

### Video Management

| Method   | Endpoint                             | Description                             |
| -------- | ------------------------------------ | --------------------------------------- |
| `POST`   | `/api/s3/upload/request/`            | Request S3 Presigned URL                |
| `POST`   | `/api/s3/upload/confirm/`            | Confirm upload completion + SQS trigger |
| `POST`   | `/api/s3/upload/thumbnail/`          | Upload thumbnail                        |
| `GET`    | `/api/s3/video/{video_id}/download/` | Get video download URL (Presigned)      |
| `DELETE` | `/api/s3/video/{video_id}/delete/`   | Delete video (S3 + DB)                  |
| `GET`    | `/api/db/videos/`                    | List videos                             |
| `GET`    | `/api/db/videos/{id}/`               | Get video details                       |
| `PATCH`  | `/api/db/videos/{id}/`               | Update video metadata                   |

### RAG Query Processing

| Method | Endpoint                            | Description                                 |
| ------ | ----------------------------------- | ------------------------------------------- |
| `POST` | `/api/prompt/`                      | Process natural language query (Hybrid RAG) |
| `GET`  | `/api/prompt/history/`              | List prompt sessions                        |
| `GET`  | `/api/prompt/history/{session_id}/` | Get session details                         |

### VLM Chat

| Method | Endpoint         | Description                   |
| ------ | ---------------- | ----------------------------- |
| `POST` | `/api/vlm-chat/` | VLM-based video analysis chat |

### Video Summary

| Method | Endpoint                                 | Description                     |
| ------ | ---------------------------------------- | ------------------------------- |
| `POST` | `/api/videos/{video_id}/summary/`        | Request summary generation      |
| `GET`  | `/api/videos/{video_id}/summary/status/` | Check summary generation status |

### Event Management

| Method | Endpoint                                                | Description                 |
| ------ | ------------------------------------------------------- | --------------------------- |
| `GET`  | `/api/db/events/`                                       | List events                 |
| `GET`  | `/api/db/events/{id}/`                                  | Get event details           |
| `GET`  | `/api/db/events/?video_id={id}`                         | Filter events by video      |
| `GET`  | `/api/db/events/?event_type=theft`                      | Filter events by type       |
| `GET`  | `/api/db/events/?timestamp__gte=180&timestamp__lte=300` | Filter events by time range |

### Analysis Results (VideoAnalysis)

| Method | Endpoint                                | Description                             |
| ------ | --------------------------------------- | --------------------------------------- |
| `GET`  | `/api/db/video-analysis/`               | List analysis results                   |
| `GET`  | `/api/db/video-analysis/?video_id={id}` | Get analysis results for specific video |

### S3 Tier Management

| Method | Endpoint                                      | Description          |
| ------ | --------------------------------------------- | -------------------- |
| `POST` | `/api/db/tier-management/archive-old-videos/` | Archive old videos   |
| `POST` | `/api/db/tier-management/restore-video/`      | Restore from Glacier |
| `GET`  | `/api/db/tier-management/tier-statistics/`    | Get tier statistics  |

---

## AWS Integration

### AWS Bedrock (AI Models)

#### 1. Titan Embeddings V2 (Embedding Generation)

```python
# Model: amazon.titan-embed-text-v2:0
# Dimensions: 1024D
# Purpose: Vector embedding for Event search
```

**Used In**:

- `apps/db/signals.py`: Auto-generate embeddings when saving Events
- `apps/api/services/ai/bedrock_service.py`: `generate_embedding()`

#### 2. Claude 3.5 Sonnet V2 (LLM with Vision)

```python
# Model: anthropic.claude-3-5-sonnet-20241022-v2:0
# Purpose: Text2SQL, RAG response generation, VLM chat, Summary
# Capabilities: Text + Vision (multimodal)
```

**Use Cases**:

- **Text2SQL**: Natural language → PostgreSQL query conversion
- **RAG Response**: Search results → Natural language formatting
- **VLM Chat**: Video frame analysis and conversation (vision-enabled)
- **Summary**: Full video summarization with visual understanding

#### 3. Cohere Rerank (Reranking)

```python
# Model: cohere.rerank-v3-5:0
# Region: ap-northeast-1 (Tokyo)
# Purpose: Vector search result reranking
```

**How it Works**:

1. Vector Search retrieves Top 30
2. Reranker compresses to Top 5
3. Significantly improves accuracy

**Used In**:

- `apps/api/services/ai/bedrock_reranker.py`
- `apps/api/services/ai/hybrid_search_service.py`

### AWS S3 (Storage)

| Bucket                    | Purpose                | Lifecycle Policy                        |
| ------------------------- | ---------------------- | --------------------------------------- |
| `capstone-dev-videos`     | Original video storage | IA after 30 days, Glacier after 90 days |
| `capstone-dev-thumbnails` | Thumbnail images       | Permanent storage                       |
| `capstone-dev-highlights` | Highlight frames       | Delete after 60 days                    |

### AWS SQS (Message Queue)

```
Queue: capstone-dev-video-processing
Region: ap-northeast-2
```

**Message Format**:

```json
{
  "eventType": "video-uploaded",
  "timestamp": "2026-01-15T12:34:56Z",
  "s3": {
    "bucket": "capstone-dev-videos",
    "key": "videos/2026/01/15/uuid_video.mp4"
  },
  "video": {
    "video_id": "123",
    "filename": "store_cctv_20260115.mp4"
  }
}
```

**Processing Flow**:

1. Django → Publish SQS Message
2. Lambda Auto Trigger (SQS Event)
3. Lambda → Submit Batch Job
4. Batch Analysis Complete → DB Update

### AWS Lambda

**Function**: `lambda/sqs_to_batch.py`

**Trigger**: SQS Message Reception

**Key Features**:

- Duplicate job submission prevention (RUNNING/RUNNABLE check)
- Dynamic Batch Job Definition generation
- Environment variable injection (DB info, S3 paths, etc.)

### AWS Batch

**Job Queue**: `capstone-dev-video-analysis-queue`

**Compute Environment**: GPU Instances (g5.xlarge, A10G)

**Container**: AI analysis container based on `batch/Dockerfile`

---

## Database

### PostgreSQL + pgvector

**Version**: PostgreSQL 16 + pgvector 0.7.0

**Extensions**:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- Text search
```

### Main Tables

#### 1. `db_video` - Video Metadata

```sql
CREATE TABLE db_video (
    video_id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    filename VARCHAR(255),
    original_filename VARCHAR(255),

    -- S3 Information
    s3_bucket VARCHAR(63) DEFAULT 'capstone-dev-videos',
    s3_key VARCHAR(1024),
    s3_thumbnail_key VARCHAR(500),

    -- Analysis Status
    analysis_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    analysis_progress INTEGER DEFAULT 0,            -- 0-100
    job_id VARCHAR(100),                            -- AWS Batch Job ID

    -- AI Summary
    summary TEXT,
    summary_status VARCHAR(20) DEFAULT 'pending',

    -- Metadata
    file_size BIGINT,
    duration FLOAT,
    fps FLOAT,
    width INTEGER,
    height INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. `db_event` - Event Detection Results

```sql
CREATE TABLE db_event (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES db_video(video_id) ON DELETE CASCADE,

    -- Event Information
    event_type VARCHAR(50),    -- theft, collapse, sitting, walking, etc.
    timestamp FLOAT,           -- In seconds (e.g., 185.5)
    frame_number INTEGER,

    -- Location Information
    bbox_x INTEGER,
    bbox_y INTEGER,
    bbox_width INTEGER,
    bbox_height INTEGER,

    -- Demographics
    age_group VARCHAR(20),     -- young, middle, old
    gender VARCHAR(10),        -- male, female
    emotion VARCHAR(20),       -- happy, neutral, sad

    -- Behavior Analysis
    action VARCHAR(100),
    confidence FLOAT,

    -- S3 Thumbnail
    s3_thumbnail_bucket VARCHAR(63) DEFAULT 'capstone-dev-highlights',
    s3_thumbnail_key VARCHAR(500),

    -- RAG Search Vector Embedding
    embedding vector(1024),
    searchable_text TEXT,
    keywords TEXT[],

    -- Additional Attributes
    attributes JSONB
);

-- Index Creation
CREATE INDEX idx_event_video ON db_event(video_id);
CREATE INDEX idx_event_type ON db_event(event_type);
CREATE INDEX idx_event_timestamp ON db_event(timestamp);
CREATE INDEX idx_event_embedding ON db_event USING ivfflat (embedding vector_cosine_ops);
```

#### 3. `db_promptsession` - RAG Session Management

```sql
CREATE TABLE db_promptsession (
    session_id VARCHAR(100) PRIMARY KEY,
    session_name VARCHAR(255),
    video_id INTEGER REFERENCES db_video(video_id),
    user_id VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. `db_promptinteraction` - RAG Conversation History

```sql
CREATE TABLE db_promptinteraction (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES db_promptsession(session_id),
    user_prompt TEXT,
    ai_response TEXT,
    search_method VARCHAR(50),  -- hybrid, vector, text2sql
    sql_query TEXT,
    result_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Django Signal Auto Processing

**Location**: `apps/db/signals.py`

```python
@receiver(pre_save, sender=Event)
def generate_event_embedding(sender, instance, **kwargs):
    """Auto-generate embedding before saving Event"""
    if not instance.embedding and instance.searchable_text:
        bedrock = get_bedrock_service()
        instance.embedding = bedrock.generate_embedding(instance.searchable_text)
```

---

## Environment Setup

### Environment Variables (.env)

```bash
# Django Configuration
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=api.yourdomain.com,localhost

# PostgreSQL (RDS)
POSTGRES_HOST=your-rds-endpoint.ap-northeast-2.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=cctv_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=your-password

# AWS Authentication (ECS Fargate uses IAM Role, local uses explicit credentials)
AWS_ACCESS_KEY_ID=AKIA...           # For local development
AWS_SECRET_ACCESS_KEY=...           # For local development
AWS_DEFAULT_REGION=ap-northeast-2

# AWS S3
S3_BUCKET_VIDEOS=capstone-dev-videos
S3_BUCKET_THUMBNAILS=capstone-dev-thumbnails
S3_BUCKET_HIGHLIGHTS=capstone-dev-highlights

# AWS SQS
AWS_SQS_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/123456789/capstone-dev-video-processing
AWS_SQS_REGION=ap-northeast-2

# AWS Bedrock
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_EMBED_MODEL_ID=amazon.titan-embed-text-v2:0
AWS_BEDROCK_RERANKER_REGION=ap-northeast-1
AWS_BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0

# CORS (Production Domain)
PRODUCTION_DOMAIN=yourdomain.com

# Logging
LOG_LEVEL=INFO
```

### Docker Compose (Local Development)

```bash
cd back/
docker-compose up -d
```

### Migrations

```bash
# Create migration files
python manage.py makemigrations

# Apply to database
python manage.py migrate

# Install pgvector extension (one-time setup)
python manage.py shell
>>> from django.db import connection
>>> connection.cursor().execute("CREATE EXTENSION IF NOT EXISTS vector;")
```

---

## Deployment

### ECS Fargate Deployment

**Automated Deployment with Terraform**:

```powershell
cd terraform/
terraform apply
```

**Deployed Resources**:

- **Task Definition**: Django + Gunicorn Container
- **ECS Service**: Auto Scaling (min 1, max 4)
- **ALB Target Group**: Health check path `/api/health/`
- **IAM Role**: S3, SQS, Bedrock permissions

### Environment Variable Injection

**Terraform** → **ECS Task Definition**:

```hcl
environment = [
  { name = "POSTGRES_HOST", value = module.storage.db_host },
  { name = "S3_BUCKET_VIDEOS", value = module.storage.s3_raw_videos_bucket },
  { name = "AWS_BEDROCK_REGION", value = "ap-northeast-2" },
  ...
]

secrets = [
  { name = "POSTGRES_PASSWORD", valueFrom = module.storage.db_password_secret_arn },
  { name = "SECRET_KEY", valueFrom = module.storage.django_secret_arn }
]
```

### CI/CD (GitHub Actions)

**.github/workflows/deploy-backend.yml**:

```yaml
- Build Docker Image
- Push to ECR
- Update ECS Service (Rolling Update)
- Health Check
```

**Monitoring**: Track deployment status via GitHub Actions workflows

---

## Development Guide

### Project Structure

```
back/
├── apps/
│   ├── api/              # Business Logic API
│   │   ├── services/     # Service Layer (AI, Business, Infrastructure)
│   │   ├── views/        # API Views
│   │   └── helpers.py    # Helper Functions
│   │
│   └── db/               # Database Layer
│       ├── models/       # ORM Models
│       ├── views/        # DRF ViewSet
│       ├── serializers/  # DRF Serializer
│       └── signals.py    # Django Signals
│
├── core/
│   ├── settings.py       # Django Configuration
│   ├── urls.py           # Root URL Routing
│   ├── middleware.py     # Custom Middleware
│   └── health.py         # Health Check Logic
│
├── Dockerfile            # ECS Fargate Deployment
├── docker-compose.yml    # Local Development
├── requirements.txt      # Python Dependencies
├── manage.py
└── entrypoint.sh         # Container Start Script
```

### Local Development Setup

```bash
# 1. Python Virtual Environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 2. Install Dependencies
pip install -r requirements.txt

# 3. Create .env File
cp .env.example .env
# Edit environment variables

# 4. Run Migrations
python manage.py migrate

# 5. Start Development Server
python manage.py runserver 0.0.0.0:8001
```

### API Testing

```bash
# Health Check
curl http://localhost:8001/api/health/

# List Videos
curl http://localhost:8001/api/db/videos/

# Query with Prompt
curl -X POST http://localhost:8001/api/prompt/ \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Any theft incidents between 3 and 5 minutes?",
    "video_id": 1
  }'
```

### Service Layer Pattern

**3-Tier Architecture**:

```python
# AI Services (apps/api/services/ai/)
from apps.api.services import get_bedrock_service, get_hybrid_search_service

bedrock = get_bedrock_service()
embedding = bedrock.generate_embedding("text")

# Business Services (apps/api/services/business/)
from apps.api.services import get_video_service

video_service = get_video_service()
video = video_service.create_video(...)

# Infrastructure Services (apps/api/services/infrastructure/)
from apps.api.services import s3_service, sqs_service

presigned_url = s3_service.generate_presigned_upload_url(...)
sqs_service.send_video_processing_message(...)
```

### Adding New Event Types

1. **Update Model**: `apps/db/models/event.py`

```python
event_type = models.CharField(max_length=50, choices=[
    ...
    ('new_event', 'New Event Type'),  # Add new type
])
```

2. **Run Migrations**:

```bash
python manage.py makemigrations
python manage.py migrate
```

3. **Update Batch Analysis**: Add new event detection logic in `batch/run_analysis.py`

### pgvector Search Queries

```python
from apps.db.models import Event
from pgvector.django import CosineDistance

# Generate embedding
query_embedding = bedrock_service.generate_embedding("theft incident")

# Vector search (Top 10)
results = Event.objects.annotate(
    distance=CosineDistance('embedding', query_embedding)
).filter(
    distance__lt=0.5  # Similarity threshold
).order_by('distance')[:10]
```

### Debugging Tips

```python
# Enable logging (settings.py)
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'apps.api': {'level': 'DEBUG'},
        'apps.db': {'level': 'DEBUG'},
    }
}

# Log output
import logging
logger = logging.getLogger(__name__)
logger.debug(f"Debug message: {variable}")
```

---

## References

- [Django REST Framework Documentation](https://www.django-rest-framework.org/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [ECS Fargate Guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [Project Terraform Guide](../terraform/README.md)
- [Batch Analysis Guide](../batch/README.md)
- [Lambda Function Guide](../lambda/README.md)

---

**Last Updated**: January 15, 2026  
**Development Team**: DeepSentinel @ Seoul National University of Science and Technology
