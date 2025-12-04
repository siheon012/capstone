#영상 분석 api

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3-dev \
    ffmpeg libsm6 libxext6 libgl1-mesa-glx git wget curl \
    build-essential ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy memi requirements and install
COPY memi/requirements.txt .

# Install Cython first (required for cocoapi)
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install Cython numpy

# Install PyTorch with CUDA
RUN pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Install cocoapi with Cython available
RUN PIP_NO_BUILD_ISOLATION=false pip3 install "git+https://github.com/philferriere/cocoapi.git#subdirectory=PythonAPI"

# Install memi requirements (excluding cocoapi which is already installed)
RUN grep -v "philferriere/cocoapi" requirements.txt > requirements_filtered.txt && \
    pip3 install -r requirements_filtered.txt

# Install additional dependencies
RUN pip3 install boto3 psycopg2-binary requests awscli

# Copy batch scripts
COPY batch/entrypoint.sh /workspace/entrypoint.sh
COPY batch/run_memi_analysis.py /workspace/run_memi_analysis.py

# Copy memi directory (core AI code)
COPY memi /workspace/memi

# Copy models, experiments, checkpoints
COPY memi/models /workspace/models
COPY memi/experiments /workspace/experiments
COPY memi/checkpoints /workspace/checkpoints

# Create necessary directories
RUN mkdir -p /workspace/output /workspace/videos /workspace/results /tmp

# Environment variables (will be overridden by Batch Job Definition)
ENV DETECTOR_WEIGHTS=/workspace/models/yolov8x_person_face.pt
ENV MIVOLO_CHECKPOINT=/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar
ENV MEBOW_CFG=/workspace/experiments/coco/segm-4_lr1e-3.yaml
ENV VLM_PATH=/workspace/checkpoints/llava-fastvithd_0.5b_stage2
ENV CUDA_VISIBLE_DEVICES=0

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 -c "import sys; sys.exit(0)"

# Entrypoint will download video from S3 and run memi
ENTRYPOINT ["/workspace/entrypoint.sh"]
