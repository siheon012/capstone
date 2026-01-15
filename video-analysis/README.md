# Video Analysis Pipeline

AI 기반 실시간 영상 분석 파이프라인 - 사람 감지, 나이/성별 추정, 행동 인식, 장면 분석을 수행합니다.

## 📋 목차

- [개요](#개요)
- [핵심 기능](#핵심-기능)
- [파이프라인 아키텍처](#파이프라인-아키텍처)
- [AI 모델](#ai-모델)
- [설치 및 실행](#설치-및-실행)
- [데이터 흐름](#데이터-흐름)
- [라이선스](#라이선스)

---

## 개요

이 프로젝트는 **AWS Batch GPU 환경**에서 실행되는 영상 분석 시스템으로, 다음과 같은 작업을 수행합니다:

1. **사람 감지** (YOLO)
2. **나이/성별 추정** (MiVOLO)
3. **신체 방향 예측** (MEBOW)
4. **행동 인식** (LLaVA)
5. **장면 분석** (AWS Bedrock Claude)
6. **하이라이트 추출** (도난, 폭행, 쓰러짐 등)

분석 결과는 **PostgreSQL + pgvector**에 저장되며, 하이라이트 프레임은 **AWS S3**에 업로드됩니다.

---

## 핵심 기능

### 1. 실시간 영상 분석

- **30fps → 1.5fps 샘플링** (20프레임마다 1프레임 처리)
- GPU 가속 (NVIDIA CUDA 11.8)
- 프레임당 처리 시간: ~2-3초

### 2. 다중 AI 모델 통합

```
YOLO (사람 감지)
  ↓
MiVOLO (나이/성별)
  ↓
MEBOW (신체 방향)
  ↓
LLaVA (행동 인식)
  ↓
Bedrock Claude (장면 분석)
```

### 3. 하이라이트 자동 추출

다음 이벤트를 자동으로 감지하고 프레임을 S3에 저장:

- `collapse` (쓰러짐)
- `falling` (낙상)
- `theft` (도난)
- `violent` (폭행)
- `grabbing` (물건 잡기)
- `anomaly` (이상 행동)

### 4. 데이터베이스 통합

- **PostgreSQL**: 이벤트 메타데이터 저장
- **pgvector**: 벡터 임베딩 (RAG 검색)
- **실시간 진행률 업데이트**: `analysis_progress` (0-100%)

---

## 파이프라인 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Batch Job 시작                        │
│         (batch/run_analysis.py → run.py 호출)               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  1. S3에서 비디오 다운로드                                    │
│     - bucket: capstone-dev-videos                           │
│     - key: videos/{video_name}                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. AI 모델 초기화                                            │
│     ├─ YOLO Detector (person + face detection)             │
│     ├─ MiVOLO (age/gender estimation)                       │
│     ├─ MEBOW (body orientation)                             │
│     └─ LLaVA FastVit (action recognition)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 프레임별 분석 (30fps → 1.5fps)                           │
│     ┌───────────────────────────────────────────────┐       │
│     │ Frame #0, 20, 40, 60... (FRAME_SKIP=20)       │       │
│     │   ↓                                           │       │
│     │ YOLO: 사람 감지 (bbox)                         │       │
│     │   ↓                                           │       │
│     │ MiVOLO: 나이/성별 (age, gender, score)         │       │
│     │   ↓                                           │       │
│     │ MEBOW: 방향 (0°, 90°, 180°, 270°)             │       │
│     │   ↓                                           │       │
│     │ LLaVA: 행동 인식 (sitting, walking, etc.)     │       │
│     │   ↓                                           │       │
│     │ Bedrock: 장면 분석 (scene description)        │       │
│     └───────────────────────────────────────────────┘       │
│                                                             │
│  → results_final.csv 저장 (timestamp, obj_id, bbox, etc.)   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 데이터 후처리                                             │
│     - data_Post_Processing.py                               │
│     - 노이즈 제거, 데이터 정규화                              │
│     → processed_results.csv 생성                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5. 하이라이트 추출                                           │
│     - collapse, falling, theft, violent 감지                │
│     - 프레임을 S3에 업로드                                    │
│       s3://capstone-dev-highlights/highlights/{video_name}/  │
│     → {timestamp: s3_key} 매핑 생성                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  6. PostgreSQL 저장                                          │
│     - db_event 테이블에 이벤트 삽입                          │
│       • video_id, timestamp, event_type                     │
│       • bbox (x, y, width, height)                          │
│       • age_group, gender, action                           │
│       • s3_thumbnail_key (하이라이트만)                      │
│     - db_video 테이블 업데이트                               │
│       • analysis_status = 'completed'                       │
│       • analysis_progress = 100                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  7. Django Signal → Embedding 생성                           │
│     - back/apps/db/signals.py                               │
│     - AWS Bedrock Titan Embeddings V2                       │
│     - pgvector에 벡터 저장 (RAG 검색용)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## AI 모델

### 1. YOLO (Person & Face Detection)

- **모델**: YOLOv8x
- **가중치**: `models/yolov8x_person_face.pt`
- **목적**: 사람 및 얼굴 바운딩 박스 검출

### 2. MiVOLO (Age & Gender Estimation)

- **논문**: [MiVOLO: Multi-input Transformer for Age and Gender Estimation](https://arxiv.org/abs/2307.04616)
- **가중치**: `models/model_imdb_cross_person_4.22_99.46.pth.tar`
- **출력**: 나이 (숫자), 성별 (male/female), 신뢰도 점수
- **라이선스**: Copyright 2023 Irina Tolstykh, Maxim Kuprashevich

### 3. MEBOW (Body Orientation Estimation)

- **기반**: Microsoft HRNet (Human Pose Estimation)
- **가중치**: `experiments/coco/segm-4_lr1e-3.yaml` 참조
- **출력**: 신체 방향 (0°, 90°, 180°, 270°)
- **라이선스**: MIT License (lib/ 폴더)

### 4. LLaVA FastVit (Action Recognition)

- **논문**: [Visual Instruction Tuning](https://arxiv.org/abs/2304.08485)
- **모델**: LLaVA-FastVit 0.5B
- **체크포인트**: `checkpoints/llava-fastvithd_0.5b_stage2`
- **출력**: 행동 (sitting, walking, standing, falling, grabbing, paying)
- **라이선스**: Apache License 2.0 (Copyright 2023 Haotian Liu)

### 5. AWS Bedrock Claude (Scene Analysis)

- **모델**: `anthropic.claude-3-haiku-20240307-v1:0`
- **목적**: 전체 장면 설명 (프레임 10개당 1회 호출)
- **출력**: 자연어 설명 (예: "A person is walking in a shopping mall near a payment counter")

---

## 설치 및 실행

### 환경 요구사항

- **Python**: 3.10+
- **CUDA**: 11.8
- **GPU**: NVIDIA (A10G 권장, AWS Batch g5.xlarge)
- **메모리**: 16GB+ RAM, 24GB+ VRAM

### 설치

```bash
# 1. Python 가상환경 생성
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate    # Windows

# 2. 의존성 설치
pip install --upgrade pip
pip install Cython numpy
pip install torch==2.1.0 torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt

# 3. 외부 라이브러리 설치 (필수)
# MiVOLO
git clone https://github.com/WildChlamydia/MiVOLO.git mivolo/

# LLaVA
git clone https://github.com/haotian-liu/LLaVA.git llava/

# HRNet (MEBOW)
git clone https://github.com/leoxiaobin/deep-high-resolution-net.pytorch.git lib/

# 4. 모델 가중치 다운로드 (별도 제공)
# - models/yolov8x_person_face.pt
# - models/model_imdb_cross_person_4.22_99.46.pth.tar
# - checkpoints/llava-fastvithd_0.5b_stage2/
# - experiments/coco/segm-4_lr1e-3.yaml
```

### 실행 (로컬 테스트)

```bash
python run.py \
  --video-id 123 \
  --input /path/to/video.mp4 \
  --output ./output \
  --detector-weights ./models/yolov8x_person_face.pt \
  --checkpoint ./models/model_imdb_cross_person_4.22_99.46.pth.tar \
  --mebow-cfg ./experiments/coco/segm-4_lr1e-3.yaml \
  --vlm-path ./checkpoints/llava-fastvithd_0.5b_stage2 \
  --with-persons \
  --device cuda
```

### AWS Batch 실행

```powershell
# PowerShell 스크립트 사용
.\scripts\trigger-batch-job.ps1 `
  -FileName "sample_video.mp4" `
  -BackendUrl "https://api.deepsentinel.cloud"
```

---

## 데이터 흐름

### 입력

- **비디오**: S3 (`s3://capstone-dev-videos/videos/{video_name}`)
- **환경변수**: `.env.prod` 참조
  - `POSTGRES_HOST`, `POSTGRES_PASSWORD`
  - `S3_BUCKET_VIDEOS`, `S3_BUCKET_HIGHLIGHTS`
  - `AWS_BEDROCK_REGION`

### 출력

#### 1. CSV 파일 (중간 결과)

- `results_final.csv`: 원본 분석 결과
- `processed_results.csv`: 후처리된 데이터 (DB 저장용)

#### 2. PostgreSQL 테이블

```sql
-- db_event: 이벤트 데이터
CREATE TABLE db_event (
    event_id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES db_video(video_id),
    event_type VARCHAR(50),        -- 'sitting', 'walking', 'falling', etc.
    timestamp DECIMAL(10, 3),      -- 초 단위 (예: 15.3)
    frame_number INTEGER,          -- 원본 프레임 번호 (30fps 기준)
    bbox_x INTEGER,                -- 바운딩 박스 좌측 상단 X
    bbox_y INTEGER,                -- 바운딩 박스 좌측 상단 Y
    bbox_width INTEGER,            -- 바운딩 박스 너비
    bbox_height INTEGER,           -- 바운딩 박스 높이
    age_group VARCHAR(20),         -- 'young', 'middle', 'old'
    gender VARCHAR(10),            -- 'male', 'female'
    action VARCHAR(50),            -- 행동 (LLaVA 출력)
    confidence DECIMAL(5, 4),      -- 신뢰도 점수
    s3_thumbnail_bucket VARCHAR(255),  -- 하이라이트 버킷
    s3_thumbnail_key VARCHAR(500),     -- 하이라이트 S3 키
    attributes JSONB,              -- 추가 속성 (orientation, scene_analysis, etc.)
    embedding vector(1024)         -- Bedrock Titan V2 벡터 (Django signal에서 생성)
);

-- db_video: 비디오 메타데이터
CREATE TABLE db_video (
    video_id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    analysis_status VARCHAR(20),   -- 'pending', 'processing', 'completed', 'failed'
    analysis_progress INTEGER,     -- 0-100
    updated_at TIMESTAMP
);
```

#### 3. S3 하이라이트

```
s3://capstone-dev-highlights/
  highlights/
    {video_name}/
      15.3s_falling.jpg      # timestamp_action.jpg
      42.1s_collapse.jpg
      67.5s_theft.jpg
```

---

## 라이선스

이 프로젝트는 다음 오픈소스 라이브러리를 사용합니다:

### 1. LLaVA (Apache License 2.0)

```
Copyright 2023 Haotian Liu
Licensed under the Apache License, Version 2.0
https://github.com/haotian-liu/LLaVA
```

### 2. MiVOLO

```
Copyright 2023 Irina Tolstykh, Maxim Kuprashevich
https://github.com/WildChlamydia/MiVOLO
```

### 3. HRNet (MIT License)

```
Copyright (c) Microsoft
Licensed under the MIT License
Written by Bin Xiao (Bin.Xiao@microsoft.com)
https://github.com/leoxiaobin/deep-high-resolution-net.pytorch
```

### 4. YOLOv8 (AGPL-3.0)

```
Ultralytics YOLO
https://github.com/ultralytics/ultralytics
```

### 본 프로젝트 코드

```
메인 파이프라인 코드 (run.py, mebow.py):
- 서울과학기술대학교 Capstone Design 프로젝트
- DeepSentinel - AI 영상 분석 시스템
```

---

## 참고 자료

- [MiVOLO 논문](https://arxiv.org/abs/2307.04616)
- [LLaVA 논문](https://arxiv.org/abs/2304.08485)
- [HRNet 논문](https://arxiv.org/abs/1902.09212)
- [AWS Batch 배포 가이드](../doc/SQS_BATCH_DEPLOYMENT.md)
- [Bedrock 통합 가이드](../doc/BEDROCK_INTEGRATION_GUIDE.md)

---

## 문제 해결

### GPU 메모리 부족

```bash
# CUDA 캐시 정리
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
```

### 모델 로딩 실패

```bash
# 가중치 파일 경로 확인
ls -lh models/
ls -lh checkpoints/llava-fastvithd_0.5b_stage2/
```

### DB 연결 오류

```bash
# 환경변수 확인
echo $POSTGRES_HOST
echo $POSTGRES_PASSWORD

# RDS 보안그룹 확인 (5432 포트 오픈)
```

---

**마지막 업데이트**: 2026년 1월 9일  
**개발팀**: DeepSentinel @ 서울과학기술대학교
