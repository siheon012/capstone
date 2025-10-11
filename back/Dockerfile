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
    libpq-dev \
    curl \
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
RUN pip install --upgrade pip

# requirements.txt 복사 및 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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

# 프로덕션 환경변수
ENV DJANGO_SETTINGS_MODULE=core.settings
ENV DEBUG=False
ENV PYTHONPATH=/app

# 정적 파일 수집
RUN python manage.py collectstatic --noinput --clear

# 미디어 디렉터리 생성 및 권한 설정
RUN mkdir -p /app/media /app/staticfiles && \
    chown -R django:django /app/media /app/staticfiles

# 프로덕션 서버용 포트
EXPOSE 8000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# django 사용자로 실행
USER django

# Gunicorn으로 프로덕션 서버 실행
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "core.wsgi:application"]
