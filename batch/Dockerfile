# AWS Batch GPU Video Processor with memi
# Build from project root: docker build -f batch/Dockerfile -t capstone-batch-processor:latest .

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-dev \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1-mesa-glx \
    git \
    wget \
    curl \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Set Python path
ENV PYTHONPATH=/workspace/memi:/workspace:${PYTHONPATH}

# Copy memi requirements and install
COPY memi/requirements.txt /workspace/memi_requirements.txt

# Install Python dependencies in one layer to reduce image size
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir Cython numpy && \
    pip3 install --no-cache-dir \
        torch==2.1.0 torchvision==0.16.0 \
        --index-url https://download.pytorch.org/whl/cu118 && \
    pip3 install --no-cache-dir --no-build-isolation \
        "git+https://github.com/philferriere/cocoapi.git#subdirectory=PythonAPI" && \
    grep -v "philferriere/cocoapi\|^-e git+\|^-f https://\|^torch==\|^torchvision==" /workspace/memi_requirements.txt > /workspace/requirements_filtered.txt && \
    pip3 install --no-cache-dir -r /workspace/requirements_filtered.txt && \
    pip3 install --no-cache-dir boto3 psycopg2-binary requests && \
    rm -rf /root/.cache/pip /workspace/memi_requirements.txt /workspace/requirements_filtered.txt

# Copy all necessary files in fewer layers
COPY memi/*.py /workspace/memi/
COPY memi/lib /workspace/memi/lib
COPY memi/llava /workspace/memi/llava
COPY memi/mivolo /workspace/memi/mivolo
COPY memi/src /workspace/memi/src
COPY memi/tools /workspace/memi/tools
COPY memi/models /workspace/models
COPY memi/experiments /workspace/experiments
COPY memi/checkpoints /workspace/checkpoints
COPY batch/entrypoint.sh /workspace/entrypoint.sh
COPY batch/run_memi_analysis.py /workspace/run_memi_analysis.py
COPY batch/process_video_memi.py /workspace/process_video_memi.py

# Create necessary directories and set permissions
RUN mkdir -p /workspace/output /workspace/videos /workspace/results /tmp && \
    chmod +x /workspace/entrypoint.sh

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
