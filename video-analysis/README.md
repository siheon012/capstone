# Video Analysis Pipeline

AI-powered video analysis system for unmanned store CCTV footage processing - person detection, age/gender estimation, body orientation, action recognition, and scene understanding.

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Pipeline Workflow](#pipeline-workflow)
- [AI Models](#ai-models)
- [Installation](#installation)
- [Usage](#usage)
- [Data Processing](#data-processing)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

This project is a comprehensive video analysis pipeline designed for **AWS Batch GPU environments**. It processes CCTV footage from unmanned stores to detect events, track individuals, and generate searchable metadata.

### Key Capabilities

1. **Person Detection** - YOLO-based real-time detection
2. **Age & Gender Estimation** - MiVOLO deep learning model
3. **Body Orientation** - MEBOW (HRNet-based pose estimation)
4. **Action Recognition** - LLaVA Vision Language Model
5. **Scene Analysis** - AWS Bedrock Claude integration (optional)
6. **Highlight Extraction** - Auto-save critical events to S3
7. **Vector Search** - PostgreSQL + pgvector for RAG queries

### Processing Stats

- **Frame Sampling**: 30fps → 1.5fps (processes 1 frame per 20 frames)
- **Processing Speed**: ~2-3 seconds per frame on NVIDIA A10G
- **Scalability**: AWS Batch auto-scaling (0-4 GPU instances)
- **Cost**: $1-3 per video (on-demand GPU usage)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Batch Job Trigger                      │
│         (Lambda → Batch → Docker Container Launch)              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  1. Video Download from S3                                      │
│     - Bucket: capstone-dev-videos                               │
│     - Key: videos/{video_id}/{filename}                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. AI Model Initialization (Cached in Custom AMI)              │
│     ├─ YOLO v8x (Person + Face Detection)                       │
│     ├─ MiVOLO (Age/Gender Estimation)                           │
│     ├─ MEBOW (Body Orientation - HRNet)                         │
│     ├─ LLaVA FastVit 0.5B (Action Recognition)                  │
│     └─ AWS Bedrock Claude (Scene Analysis - Optional)           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. Frame-by-Frame Analysis (1.5fps Sampling)                   │
│     ┌────────────────────────────────────────────────┐          │
│     │ For each frame (every 20th frame):            │          │
│     │   ↓                                            │          │
│     │ YOLO → Detect persons (bbox, confidence)      │          │
│     │   ↓                                            │          │
│     │ MiVOLO → Age, gender, score                   │          │
│     │   ↓                                            │          │
│     │ MEBOW → Body orientation (0°/90°/180°/270°)   │          │
│     │   ↓                                            │          │
│     │ LLaVA → Action (sitting/walking/falling/etc.) │          │
│     │   ↓                                            │          │
│     │ Bedrock Claude → Scene description (every 10) │          │
│     └────────────────────────────────────────────────┘          │
│                                                                 │
│  → Save to results_final.csv (raw results)                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. Data Post-Processing                                        │
│     - data_post_processing.py                                   │
│     - Calculate IoU between persons                             │
│     - Determine location & area of interest                     │
│     - Frame → Timestamp conversion                              │
│     → Save to processed_results.csv                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. Highlight Frame Extraction                                  │
│     - Detect critical events: collapse, theft, violent, etc.    │
│     - Extract frame images                                      │
│     - Upload to S3: s3://highlights/{video_id}/{timestamp}.jpg  │
│     → Generate {timestamp: s3_key} mapping                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. Database Insertion (PostgreSQL + pgvector)                  │
│     - Insert events into db_event table                         │
│       • video_id, timestamp, event_type, action                 │
│       • bbox (x, y, width, height)                              │
│       • age_group, gender, confidence                           │
│       • s3_thumbnail_key (for highlights)                       │
│       • attributes (JSON: orientation, scene, location)         │
│     - Update db_video table                                     │
│       • analysis_status = 'completed'                           │
│       • analysis_progress = 100                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. Vector Embedding Generation (Django Signal)                 │
│     - Triggered by db_event insertion                           │
│     - AWS Bedrock Titan Embeddings V2                           │
│     - Store in pgvector column (1024 dimensions)                │
│     → Enable semantic search via RAG                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Workflow

### Entry Point: batch/run_analysis.py

AWS Batch executes this script as the main job entry point.

**Responsibilities**:

1. Parse environment variables (S3 bucket, video ID, DB credentials)
2. Download video from S3
3. Execute `video-analysis/run.py` as subprocess
4. Monitor progress and handle errors

**Key Code Flow**:

```python
# batch/run_analysis.py
processor = VideoAnalysisProcessor()
video_path = processor.download_video_from_s3(bucket, key)

# Execute video-analysis pipeline
cmd = [
    'python3', 'run.py',
    '--video-id', str(video_id),
    '--input', str(video_path),
    '--output', str(output_dir),
    '--detector-weights', '/workspace/models/yolov8x_person_face.pt',
    '--checkpoint', '/workspace/models/model_imdb_cross_person.pth',
    '--mebow-cfg', '/workspace/experiments/coco/segm-4_lr1e-3.yaml',
    '--vlm-path', '/workspace/checkpoints/llava-fastvithd_0.5b_stage2',
    '--device', 'cuda:0',
    '--with-persons'
]

subprocess.run(cmd, env={...})  # Pass PostgreSQL credentials
```

### Core Pipeline: video-analysis/run.py

The main processing script that orchestrates all AI models.

#### 1. Model Initialization

```python
# YOLO Detector
predictor = Predictor(args, verbose=True)

# MiVOLO (Age & Gender)
predictor.initialize_mivolo(args.checkpoint, args.device)

# MEBOW (Body Orientation)
mebow_model = setup_mebow_model(args.mebow_cfg, device=args.device)

# LLaVA (Action Recognition)
tokenizer, vlm_model, image_processor, _ = load_pretrained_model(
    args.vlm_path, None, "llava", device=args.device
)
```

#### 2. Video Processing Loop

```python
FRAME_SKIP = 20  # 30fps → 1.5fps sampling
for results, frame, orig_frame in predictor.recognize_video(
    args.input, frame_skip=FRAME_SKIP
):
    # For each detected person
    for i, box in enumerate(results.yolo_results.boxes):
        # Extract person crop
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cropped = crop_with_padding(orig_frame, x1, y1, w, h)

        # MiVOLO prediction
        mivolo_results = predictor.mivolo.predict(orig_frame, results)
        # → age, gender, gender_score

        # MEBOW prediction
        orientation = predict_orientation(mebow_model, cropped, device)
        # → 0°, 90°, 180°, 270°

        # LLaVA action recognition
        pil_img = Image.fromarray(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB))
        action = infer_action(pil_img, vlm_model, tokenizer, image_processor, device)
        # → sitting, walking, falling, grabbing, paying, standing

        # Scene analysis (every 10 frames)
        if frame_idx % 10 == 0:
            scene = infer_scene_action(pil_img, vlm_model, ...)

        # Save to CSV
        results_final.csv.append({
            'frame': frame_idx,
            'timestamp': frame_idx * FRAME_SKIP / fps,
            'obj_id': i,
            'age': age, 'gender': gender,
            'x': x1, 'y': y1, 'w': w, 'h': h,
            'orientation': orientation,
            'action': action,
            'scene_analysis': scene
        })

        # Highlight detection
        if action in ['collapse', 'falling', 'theft', 'violent', 'grabbing']:
            save_highlight_to_s3(orig_frame, video_id, timestamp, action)

    # Update progress (every 5 frames)
    if processed_count % 5 == 0:
        update_progress(video_id, processed_count, total_frames)
```

#### 3. Post-Processing

```python
# result/data_post_processing.py
from result.data_post_processing import process_csv

process_csv('results_final.csv', 'processed_results.csv')
# → Add location, area_of_interest fields
# → Calculate IoU between persons
# → Normalize timestamps
```

#### 4. Highlight Extraction

```python
highlight_s3_keys = extract_highlight_frames(
    video_path=args.input,
    csv_file='processed_results.csv',
    video_id=args.video_id,
    video_name=video_name
)
# → Returns: {timestamp: 's3://bucket/highlights/video_id/15.3s_falling.jpg'}
```

#### 5. Database Storage

```python
send_to_database(
    csv_file='processed_results.csv',
    video_id=args.video_id,
    highlight_s3_keys=highlight_s3_keys
)
# → Insert events into PostgreSQL
# → Update video status to 'completed'
# → Trigger Django signal for embedding generation
```

---

## AI Models

### 1. YOLO v8x (Person & Face Detection)

- **Model**: YOLOv8x (Ultralytics)
- **Weights**: `models/yolov8x_person_face.pt`
- **Input**: RGB frame (any resolution)
- **Output**: Bounding boxes `[x1, y1, x2, y2]`, confidence scores
- **Classes**: Person (class 0), Face (class 1)
- **License**: AGPL-3.0

**Usage**:

```python
predictor = Predictor(args, verbose=True)
for results, frame, orig_frame in predictor.recognize_video(video_path):
    boxes = results.yolo_results.boxes  # Tensor of bboxes
```

### 2. MiVOLO (Age & Gender Estimation)

- **Paper**: [MiVOLO: Multi-input Transformer for Age and Gender Estimation](https://arxiv.org/abs/2307.04616)
- **Weights**: `models/model_imdb_cross_person_4.22_99.46.pth.tar`
- **Input**: Full frame + person bbox
- **Output**:
  - Age (numeric): 5-100 years
  - Gender: "male" / "female"
  - Gender score: 0.0-1.0 confidence
- **Authors**: Irina Tolstykh, Maxim Kuprashevich (2023)

**Age Group Mapping**:

```python
if age < 20:
    age_group = 'young'
elif age < 60:
    age_group = 'middle'
else:
    age_group = 'old'
```

**Usage**:

```python
predictor.initialize_mivolo(checkpoint_path, device)
mivolo_results = predictor.mivolo.predict(frame, yolo_results)
# → [{'obj_id': 0, 'age': 28, 'gender': 'male', 'gender_score': 0.92}, ...]
```

### 3. MEBOW (Body Orientation Estimation)

- **Base Model**: Microsoft HRNet (High-Resolution Net)
- **Config**: `experiments/coco/segm-4_lr1e-3.yaml`
- **Input**: Cropped person image (192×256)
- **Output**: Orientation angle (0°, 5°, 10°, ..., 355°)
- **Quantization**: Outputs are multiples of 5 (argmax × 5)
- **License**: MIT License

**Orientation Mapping**:

- **0°-60° / 300°-360°**: Facing forward (front)
- **60°-150°**: Facing left
- **150°-240°**: Facing backward (back)
- **240°-300°**: Facing right

**Usage**:

```python
from mebow import setup_mebow_model, predict_orientation

mebow_model = setup_mebow_model(cfg_path, device='cuda')
orientation = predict_orientation(mebow_model, cropped_image, device)
# → Returns: 0, 5, 10, ..., 355 (degrees)
```

### 4. LLaVA FastVit (Action Recognition)

- **Paper**: [Visual Instruction Tuning](https://arxiv.org/abs/2304.08485)
- **Model**: LLaVA-FastVit 0.5B (Lightweight VLM)
- **Checkpoint**: `checkpoints/llava-fastvithd_0.5b_stage2`
- **Input**: Cropped person image (PIL format)
- **Output**: Single action word
- **License**: Apache License 2.0 (Copyright 2023 Haotian Liu)

**Supported Actions**:

- `sitting` - Person is seated
- `falling` - Person is losing balance or falling
- `grabbing` - Person is reaching for or holding an item
- `paying` - Person is at payment counter
- `standing` - Person is stationary
- `walking` - Person is in motion
- `none` - No clear action detected

**Prompt Engineering**:

```python
prompt = (
    "What is the person doing? Choose the most appropriate action from these options: "
    "sitting (if the person is seated or appears to be sitting), "
    "falling (if the person is losing balance or falling), "
    "grabbing (if the person is reaching for or holding something), "
    "paying (if the person is at a counter or making a payment), "
    "standing (if the person is simply standing), "
    "walking (if the person is moving or walking), "
    "none (if none of the above actions match)."
)
```

**Usage**:

```python
from llava.model.builder import load_pretrained_model

tokenizer, model, image_processor, _ = load_pretrained_model(
    vlm_path, None, "llava", device='cuda'
)

action = infer_action(pil_image, model, tokenizer, image_processor, device)
# → Returns: "sitting" / "walking" / "falling" / etc.
```

### 5. AWS Bedrock Claude (Scene Analysis - Optional)

- **Model**: `anthropic.claude-3-haiku-20240307-v1:0`
- **Purpose**: Generate natural language scene descriptions
- **Frequency**: Called every 10 frames (to reduce cost)
- **Input**: Cropped person image (base64 encoded)
- **Output**: Short scene description (1-2 sentences)

**Example Output**:

```
"A person is walking near a payment counter in a convenience store."
```

**Note**: This feature is optional and can be disabled to reduce AWS costs.

---

## Installation

### Prerequisites

- **Python**: 3.10 or higher
- **CUDA**: 11.8 (for GPU acceleration)
- **GPU**: NVIDIA GPU with 16GB+ VRAM (A10G recommended)
- **RAM**: 16GB+ system memory
- **Storage**: 50GB+ for models and dependencies

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd video-analysis
```

### Step 2: Create Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate    # Windows
```

### Step 3: Install PyTorch with CUDA

```bash
pip install --upgrade pip
pip install Cython numpy

# PyTorch 2.1.0 + CUDA 11.8
pip install torch==2.1.0 torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cu118
```

### Step 4: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 5: Install External Libraries

#### MiVOLO

```bash
git clone https://github.com/WildChlamydia/MiVOLO.git mivolo/
```

#### LLaVA

```bash
git clone https://github.com/haotian-liu/LLaVA.git llava/
```

#### HRNet (MEBOW)

```bash
git clone https://github.com/leoxiaobin/deep-high-resolution-net.pytorch.git lib/
```

### Step 6: Download Model Weights

Model weights are stored separately. Download and place them in the following structure:

```
video-analysis/
├── models/
│   ├── yolov8x_person_face.pt                    # YOLO weights
│   └── model_imdb_cross_person_4.22_99.46.pth.tar # MiVOLO weights
├── checkpoints/
│   └── llava-fastvithd_0.5b_stage2/               # LLaVA checkpoint directory
│       ├── config.json
│       ├── pytorch_model.bin
│       └── ...
└── experiments/
    └── coco/
        └── segm-4_lr1e-3.yaml                     # MEBOW config
```

**Model Download Links**: (Contact maintainers for access)

---

## Usage

### Local Testing

```bash
python run.py \
  --video-id 123 \
  --input /path/to/video.mp4 \
  --output ./output \
  --detector-weights ./models/yolov8x_person_face.pt \
  --checkpoint ./models/model_imdb_cross_person_4.22_99.46.pth.tar \
  --mebow-cfg ./experiments/coco/segm-4_lr1e-3.yaml \
  --vlm-path ./checkpoints/llava-fastvithd_0.5b_stage2 \
  --device cuda:0 \
  --with-persons
```

**Flags**:

- `--video-id`: Required. Video ID from database
- `--input`: Required. Path to input video file
- `--output`: Required. Output directory for results
- `--with-persons`: Enable person detection
- `--draw`: Optional. Generate annotated video output (slower)
- `--device`: GPU device (default: `cuda:0`)

### AWS Batch Execution

AWS Batch automatically triggers this pipeline via `batch/run_analysis.py`.

**Trigger via PowerShell Script**:

```powershell
.\scripts\trigger-batch-job.ps1 `
  -FileName "sample_video.mp4" `
  -BackendUrl "https://api.deepsentinel.cloud"
```

**Environment Variables** (set in Batch job definition):

- `POSTGRES_HOST`: PostgreSQL RDS endpoint
- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database username
- `POSTGRES_PASSWORD`: Database password (from Secrets Manager)
- `S3_BUCKET_VIDEOS`: S3 bucket for input videos
- `S3_BUCKET_HIGHLIGHTS`: S3 bucket for highlight frames
- `AWS_DEFAULT_REGION`: AWS region (default: `ap-northeast-2`)

---

## Data Processing

### Frame Sampling Strategy

**Why 1.5fps?**

- Original videos: 30fps (1800 frames/minute)
- Processing every frame: Too slow (60× slower than real-time)
- Skip rate: Process 1 frame per 20 frames
- Effective rate: 30fps ÷ 20 = **1.5fps**
- Coverage: 90 frames/minute (sufficient for event detection)

```python
FRAME_SKIP = 20  # Process every 20th frame

# Timestamp calculation
actual_frame_number = frame_idx * FRAME_SKIP
timestamp = actual_frame_number / original_fps
```

### CSV Output Format

#### results_final.csv (Raw Results)

| Column           | Type  | Description                          |
| ---------------- | ----- | ------------------------------------ |
| `frame`          | int   | Sampled frame index (0, 1, 2, ...)   |
| `timestamp`      | float | Time in seconds (frame × 20 / 30)    |
| `obj_id`         | int   | Unique person ID in frame            |
| `age`            | float | Estimated age (5-100)                |
| `gender`         | str   | "male" / "female"                    |
| `gender_score`   | float | Gender confidence (0.0-1.0)          |
| `x`, `y`         | int   | Bounding box top-left corner         |
| `w`, `h`         | int   | Bounding box width and height        |
| `orientation`    | int   | Body angle (0°-360°, multiples of 5) |
| `action`         | str   | Action label (sitting/walking/etc.)  |
| `scene_analysis` | str   | Scene description text               |

#### processed_results.csv (Post-Processed)

Additional columns added by `data_post_processing.py`:

| Column             | Type | Description                                 |
| ------------------ | ---- | ------------------------------------------- |
| `location`         | int  | Person location (1=left, 2=center, 3=right) |
| `area_of_interest` | int  | Facing direction zone                       |

**Location Determination Logic**:

```python
target_box = [654, 14, 1446, 754]  # Payment counter area

if person_in_target_ratio >= 0.8 and facing_forward:
    location = 2  # At counter
elif person_x <= 1280:
    location = 1  # Left side
else:
    location = 3  # Right side
```

### Highlight Events

Critical events are automatically detected and saved to S3:

| Event      | Description                  | Trigger Condition   |
| ---------- | ---------------------------- | ------------------- |
| `collapse` | Person collapsed on ground   | Action = "collapse" |
| `falling`  | Person falling down          | Action = "falling"  |
| `theft`    | Suspicious grabbing behavior | Action = "theft"    |
| `violent`  | Violent movement detected    | Action = "violent"  |
| `grabbing` | Person grabbing items        | Action = "grabbing" |
| `anomaly`  | Abnormal behavior            | Action = "anomaly"  |

**S3 Storage**:

```
s3://capstone-dev-highlights/
  highlights/{video_id}/
    15.3s_falling.jpg
    42.1s_collapse.jpg
    67.5s_theft.jpg
```

---

## Database Schema

### db_event Table

```sql
CREATE TABLE db_event (
    event_id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES db_video(video_id) NOT NULL,
    event_type VARCHAR(50) NOT NULL,        -- 'sitting', 'walking', etc.
    timestamp DECIMAL(10, 3) NOT NULL,      -- Seconds (e.g., 15.333)
    duration DECIMAL(8, 3),                 -- Event duration (0.667s for 1 frame)
    frame_number INTEGER,                   -- Original frame number (30fps basis)

    -- Bounding box
    bbox_x INTEGER,
    bbox_y INTEGER,
    bbox_width INTEGER,
    bbox_height INTEGER,

    -- Person attributes
    age_group VARCHAR(20),                  -- 'young', 'middle', 'old'
    gender VARCHAR(10),                     -- 'male', 'female'
    emotion VARCHAR(50),                    -- Reserved (not used)
    action VARCHAR(50),                     -- Action label
    interaction_target VARCHAR(100),        -- Reserved (not used)
    confidence DECIMAL(5, 4),               -- Gender confidence score

    -- Additional metadata
    attributes JSONB,                       -- {obj_id, age, scene_analysis, location, etc.}
    keywords TEXT[],                        -- Searchable keywords array
    data_tier VARCHAR(10) DEFAULT 'hot',    -- 'hot' / 'warm' / 'cold'
    searchable_text TEXT,                   -- Full-text search field
    search_count INTEGER DEFAULT 0,         -- Usage tracking

    -- S3 references
    s3_thumbnail_bucket VARCHAR(255),       -- Thumbnail bucket name
    s3_thumbnail_key VARCHAR(500),          -- S3 key (NULL if not highlight)

    -- Vector embedding (populated by Django signal)
    embedding vector(1024),                 -- Bedrock Titan Embeddings V2

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_event_video_timestamp ON db_event(video_id, timestamp);
CREATE INDEX idx_event_type ON db_event(event_type);
CREATE INDEX idx_event_embedding ON db_event USING ivfflat (embedding vector_cosine_ops);
```

### db_video Table

```sql
CREATE TABLE db_video (
    video_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    s3_bucket VARCHAR(255),
    s3_key VARCHAR(500),

    -- Analysis status tracking
    analysis_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    analysis_progress INTEGER DEFAULT 0,            -- 0-100

    -- Metadata
    duration DECIMAL(10, 3),                        -- Video duration (seconds)
    fps DECIMAL(6, 2),                              -- Frames per second
    resolution VARCHAR(20),                         -- e.g., "1920x1080"

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Data Flow

```
run.py (Line 400-500)
  ↓
send_to_database()
  ↓
INSERT INTO db_event (...) VALUES (...)
  ↓
Django Signal (back/apps/db/signals.py)
  ↓
post_save → generate_embedding()
  ↓
AWS Bedrock Titan Embeddings V2
  ↓
UPDATE db_event SET embedding = %s WHERE event_id = %s
```

---

## Environment Variables

### Required

| Variable            | Description             | Example                                 |
| ------------------- | ----------------------- | --------------------------------------- |
| `POSTGRES_HOST`     | PostgreSQL RDS endpoint | `capstone-dev-db.xxx.rds.amazonaws.com` |
| `POSTGRES_PORT`     | Database port           | `5432`                                  |
| `POSTGRES_DB`       | Database name           | `capstone_dev`                          |
| `POSTGRES_USER`     | Database username       | `postgres`                              |
| `POSTGRES_PASSWORD` | Database password       | `***` (from Secrets Manager)            |

### Optional

| Variable               | Description              | Default                   |
| ---------------------- | ------------------------ | ------------------------- |
| `S3_BUCKET_HIGHLIGHTS` | S3 bucket for highlights | `capstone-dev-highlights` |
| `AWS_DEFAULT_REGION`   | AWS region               | `ap-northeast-2`          |
| `DEVICE`               | GPU device               | `cuda:0`                  |

### Setting Environment Variables

**For AWS Batch** (set in Terraform job definition):

```hcl
environment = [
  {name = "POSTGRES_HOST", value = aws_db_instance.main.endpoint},
  {name = "POSTGRES_DB", value = "capstone_dev"},
  # ... other vars
]
```

**For Local Testing** (use `.env` file):

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=capstone_dev
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password
```

---

## Troubleshooting

### GPU Memory Issues

**Symptom**: `RuntimeError: CUDA out of memory`

**Solution**:

```bash
# Clear CUDA cache
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Reduce batch size (if applicable)
# Use smaller model variants (e.g., LLaVA 0.5B instead of 7B)
```

### Model Loading Failures

**Symptom**: `FileNotFoundError: models/yolov8x_person_face.pt`

**Solution**:

```bash
# Verify model weights exist
ls -lh models/
ls -lh checkpoints/llava-fastvithd_0.5b_stage2/

# Check AWS Batch Custom AMI has models pre-installed
# Models should be in /opt/ml/ and mounted to /workspace/
```

### Database Connection Errors

**Symptom**: `psycopg2.OperationalError: could not connect to server`

**Solution**:

```bash
# Check environment variables
echo $POSTGRES_HOST
echo $POSTGRES_PASSWORD

# Verify RDS security group allows inbound on port 5432
# From: AWS Batch compute environment security group

# Test connection manually
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB
```

### Video ID Not Found Error

**Symptom**: `Video ID 123 not found in AWS RDS database`

**Root Cause**: Video record was not created in database before Batch job started.

**Solution**:

```powershell
# Always use trigger-batch-job.ps1 script (creates Video record first)
.\scripts\trigger-batch-job.ps1 `
  -FileName "video.mp4" `
  -BackendUrl "https://api.deepsentinel.cloud"

# Do NOT manually submit Batch jobs without creating Video record
```

### Progress Not Updating

**Symptom**: Frontend shows 0% progress during analysis

**Solution**:

```python
# Check update_progress() is being called (run.py line 800+)
if processed_count % 5 == 0:
    update_progress(video_id, processed_count, total_frames)

# Verify db_video record exists
SELECT video_id, analysis_progress, analysis_status
FROM db_video WHERE video_id = 123;
```

---

## Performance Optimization

### Custom AMI Benefits

**Without Custom AMI** (Cold Start: ~20 minutes):

- Download PyTorch (~2GB)
- Download YOLO weights (~300MB)
- Download MiVOLO weights (~500MB)
- Download LLaVA checkpoint (~2GB)
- Install all Python packages

**With Custom AMI** (Cold Start: ~3 minutes):

- Models pre-installed in `/opt/ml/`
- Docker image pre-pulled
- Python dependencies pre-installed
- Only instance launch time

### Processing Speed

| Metric                 | Value                     |
| ---------------------- | ------------------------- |
| Frame processing       | 2-3 seconds/frame         |
| Effective video rate   | ~40-50 frames/minute      |
| 1-minute video (30fps) | ~6-8 minutes processing   |
| 5-minute video         | ~30-40 minutes processing |
| GPU utilization        | 80-95%                    |

### Cost Optimization

```
AWS Batch (g5.xlarge):
- On-Demand: $1.006/hour
- Processing time: ~10-15 minutes/video (avg)
- Cost per video: $0.25-0.40

vs.

24/7 EC2 (same instance):
- Monthly: $723/month
- Even with 0 videos to process
```

**Recommendation**: Use AWS Batch for cost efficiency.

---

## License

This project uses multiple open-source AI models:

### LLaVA (Apache License 2.0)

```
Copyright 2023 Haotian Liu
Licensed under the Apache License, Version 2.0
https://github.com/haotian-liu/LLaVA
```

### MiVOLO

```
Copyright 2023 Irina Tolstykh, Maxim Kuprashevich
https://github.com/WildChlamydia/MiVOLO
```

### HRNet (MIT License)

```
Copyright (c) Microsoft
Licensed under the MIT License
Written by Bin Xiao (Bin.Xiao@microsoft.com)
https://github.com/leoxiaobin/deep-high-resolution-net.pytorch
```

### YOLOv8 (AGPL-3.0)

```
Ultralytics YOLO
https://github.com/ultralytics/ultralytics
```

### Main Pipeline Code

```
Seoul National University of Science and Technology
Capstone Design Project - DeepSentinel
AI-powered Video Analysis System for Unmanned Stores
```

---

## References

- [MiVOLO Paper](https://arxiv.org/abs/2307.04616) - Multi-input Transformer for Age and Gender Estimation
- [LLaVA Paper](https://arxiv.org/abs/2304.08485) - Visual Instruction Tuning
- [HRNet Paper](https://arxiv.org/abs/1902.09212) - Deep High-Resolution Representation Learning
- [AWS Batch Documentation](https://docs.aws.amazon.com/batch/)
- [pgvector Extension](https://github.com/pgvector/pgvector) - Vector similarity search for PostgreSQL

---

## Contributing

This is a capstone project. For questions or collaboration:

- **Project Team**: DeepSentinel @ Seoul National University of Science and Technology
- **Contact**: (Contact information)

---

**Last Updated**: 2026-01-16  
**Version**: 2.0.0  
**Status**: Production Ready
