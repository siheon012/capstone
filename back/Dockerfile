# Django Backend Dockerfile - Optimized Multi-stage Build

# ==========================================
# Base Stage: 공통 환경 설정
# ==========================================
FROM python:3.10-slim AS base

# 환경변수 설정
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 시스템 패키지 업데이트 및 필수 도구 설치
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    postgresql-client \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 보안을 위한 사용자 생성
RUN groupadd --gid 1001 django && \
    useradd --uid 1001 --gid django --shell /bin/bash --create-home django

WORKDIR /app

# ==========================================
# Dependencies Stage: 의존성 설치
# ==========================================
FROM base AS deps

# pip 업그레이드
RUN pip install --upgrade pip setuptools wheel

# Build dependencies for compilation
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    postgresql-client \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 복사 및 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# pgvector 확장 설치 확인
RUN python -c "import pgvector; print('pgvector installed successfully')"

# AWS SDK 설치 확인
RUN python -c "import boto3; print('boto3 installed successfully')"

# ==========================================
# Development Stage: 개발 환경
# ==========================================
FROM base AS development

# 의존성 복사
COPY --from=deps /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# 소스코드 복사
COPY --chown=django:django . .

# 개발용 환경변수
ENV DJANGO_SETTINGS_MODULE=core.settings
ENV DEBUG=True

# 개발 서버용 포트
EXPOSE 8000

# django 사용자로 실행
USER django

# 개발 서버 실행
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ==========================================
# Production Stage: 프로덕션 환경
# ==========================================
FROM base AS production

# 의존성 복사
COPY --from=deps /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# 소스코드 복사
COPY --chown=django:django . .

# entrypoint.sh 실행 권한 부여
RUN chmod +x /app/entrypoint.sh

# 프로덕션 환경변수
ENV DJANGO_SETTINGS_MODULE=core.settings
ENV DEBUG=False
ENV PYTHONPATH=/app

# Gunicorn 설정 (entrypoint.sh에서 사용)
ENV GUNICORN_WORKERS=4
ENV GUNICORN_THREADS=2
ENV GUNICORN_TIMEOUT=120
ENV PORT=8000
ENV LOG_LEVEL=info

# AWS 환경변수 (런타임에 ECS에서 주입될 예정)
ENV AWS_DEFAULT_REGION=ap-northeast-2
ENV AWS_STORAGE_BUCKET_NAME=""
ENV USE_S3=false

# Database 환경변수 (런타임에 ECS에서 주입될 예정)
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=capstone_db
ENV DB_USER=capstone_user
ENV DB_PASSWORD=""

# Django 설정
ENV COLLECT_STATIC=true
ENV CREATE_SUPERUSER=false
ENV DJANGO_ENV=production

# 미디어 디렉터리 생성 및 권한 설정
RUN mkdir -p /app/media /app/staticfiles && \
    chown -R django:django /app/media /app/staticfiles

# 프로덕션 서버용 포트
EXPOSE 8000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# django 사용자로 실행
USER django

# Entrypoint 스크립트 사용
ENTRYPOINT ["/app/entrypoint.sh"]
