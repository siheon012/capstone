FROM nvidia/cuda:11.3.1-cudnn8-runtime-ubuntu20.04

WORKDIR /app

RUN sed -i 's|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg libsm6 libxext6 libgl1-mesa-glx git curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip3 install --upgrade pip
COPY requirements.txt .
RUN pip3 install -r requirements.txt

COPY . .

ENV POSTGRES_HOST=${POSTGRES_HOST:-localhost}
ENV POSTGRES_PORT=${POSTGRES_PORT:-5432}
ENV POSTGRES_DB=${POSTGRES_DB:-video-analysis}
ENV POSTGRES_USER=${POSTGRES_USER:-admin}
ENV POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_password}

RUN mkdir -p /app/videos /app/result

CMD ["python3", "run.py", "--video-id", "1", "--output", "result", "--detector-weights", "models/yolov8x_person_face.pt", "--checkpoint", "models/model_imdb_cross_person_4.22_99.46.pth.tar", "--mebow-cfg", "experiments/coco/segm-4_lr1e-3.yaml", "--vlm-path", "checkpoints/llava-fastvithd_0.5b_stage2", "--with-persons", "--draw"]