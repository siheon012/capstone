# Django Backend Dockerfile - Optimized Multi-stage Build

# ==========================================
# Base Stage: 실행에 '꼭' 필요한 런타임 환경만 설정 (가볍게!)
# ==========================================
FROM python:3.10-slim AS base

# 환경변수 설정
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# [최적화] 런타임 필수 패키지 설치
# - gcc, g++ 등 빌드 도구는 여기서 제거 (deps 스테이지로 이동)
# - libgl1 등 GUI 라이브러리 제거 (opencv-headless 사용 덕분)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    postgresql-client \
    ffmpeg \
    dos2unix \
    # psycopg2-binary 실행을 위한 최소 라이브러리
    libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 보안을 위한 사용자 생성
RUN groupadd --gid 1001 django && \
    useradd --uid 1001 --gid django --shell /bin/bash --create-home django

WORKDIR /app

# ==========================================
# Dependencies Stage: 빌드 도구 설치 및 의존성 컴파일
# ==========================================
FROM base AS deps

# [최적화] 패키지 설치를 위한 빌드 도구는 여기서만 설치하고 버림
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential

# pip 업그레이드
RUN pip install --upgrade pip setuptools wheel

# requirements.txt 복사 및 의존성 설치
COPY requirements.txt .
# --no-cache-dir 옵션은 base env에 이미 설정됨
RUN pip install -r requirements.txt

# ==========================================
# Development Stage: 개발 환경
# ==========================================
FROM base AS development

# 빌드된 의존성 가져오기
COPY --from=deps /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# 소스코드 복사
COPY --chown=django:django . .

# 개발용 환경변수
ENV DJANGO_SETTINGS_MODULE=core.settings
ENV DEBUG=True

EXPOSE 8000
USER django
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ==========================================
# Production Stage: 프로덕션 환경 (가장 가벼운 상태)
# ==========================================
FROM base AS production

# 빌드된 의존성만 쏙 가져오기 (gcc 같은 찌꺼기 없음)
COPY --from=deps /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# 소스코드 복사
COPY --chown=django:django . .

# entrypoint.sh CRLF→LF 변환 및 권한 설정
RUN dos2unix /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# 프로덕션 환경변수
ENV DJANGO_SETTINGS_MODULE=core.settings
ENV DEBUG=False
ENV PYTHONPATH=/app

# Gunicorn 설정
ENV GUNICORN_WORKERS=4 \
    GUNICORN_THREADS=2 \
    GUNICORN_TIMEOUT=120 \
    PORT=8000 \
    LOG_LEVEL=info

# Django 설정
ENV COLLECT_STATIC=true \
    CREATE_SUPERUSER=false \
    DJANGO_ENV=production \
    AWS_DEFAULT_REGION=ap-northeast-2

# 미디어/정적파일 디렉터리 설정
RUN mkdir -p /app/media /app/staticfiles && \
    chown -R django:django /app/media /app/staticfiles

EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

USER django
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]