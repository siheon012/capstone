#!/bin/bash
set -e

echo "=================================="
echo "🚀 Django Application Starting..."
echo "=================================="

# 환경변수 출력 (디버깅용, 민감정보 제외)
echo "📋 Environment Configuration:"
echo "  - DB_HOST: ${DB_HOST}"
echo "  - DB_PORT: ${DB_PORT}"
echo "  - DB_NAME: ${DB_NAME}"
echo "  - DB_USER: ${DB_USER}"
echo "  - USE_S3: ${USE_S3}"
echo "  - AWS_STORAGE_BUCKET_NAME: ${AWS_STORAGE_BUCKET_NAME}"
echo ""

# ===========================================
# 1. 데이터베이스 연결 대기
# ===========================================
echo "⏳ Waiting for PostgreSQL database..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if python << END
import sys
import psycopg2
import os

try:
    conn = psycopg2.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=os.environ.get('DB_PORT', '5432'),
        dbname=os.environ.get('DB_NAME', 'capstone_db'),
        user=os.environ.get('DB_USER', 'capstone_user'),
        password=os.environ.get('DB_PASSWORD', ''),
        connect_timeout=5
    )
    conn.close()
    print("✅ Database connection successful!")
    sys.exit(0)
except psycopg2.OperationalError as e:
    print(f"❌ Database connection failed: {e}")
    sys.exit(1)
END
    then
        echo "✅ PostgreSQL is ready!"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "⏳ Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Failed to connect to database after $MAX_RETRIES attempts"
    exit 1
fi

# ===========================================
# 2. pgvector 확장 활성화
# ===========================================
echo ""
echo "🔧 Enabling pgvector extension..."

python << END
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

try:
    conn = psycopg2.connect(
        host=os.environ.get('DB_HOST'),
        port=os.environ.get('DB_PORT', '5432'),
        dbname=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASSWORD')
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    
    with conn.cursor() as cursor:
        # pgvector 확장 생성
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        print("✅ pgvector extension enabled")
        
        # 확인
        cursor.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
        result = cursor.fetchone()
        if result:
            print(f"✅ pgvector version: {result[1]}")
        else:
            print("⚠️  pgvector extension not found")
    
    conn.close()
except Exception as e:
    print(f"⚠️  Could not enable pgvector: {e}")
    print("   (This is OK if using standard PostgreSQL without pgvector)")
END

# ===========================================
# 3. Django Migrations 실행
# ===========================================
echo ""
echo "📦 Running Django migrations..."

# makemigrations (개발 환경에서만)
if [ "${DJANGO_ENV}" = "development" ]; then
    echo "🔧 Creating new migrations..."
    python manage.py makemigrations --noinput || {
        echo "⚠️  makemigrations failed, continuing..."
    }
fi

# migrate
echo "🔧 Applying migrations..."
python manage.py migrate --noinput || {
    echo "❌ Migration failed!"
    exit 1
}

echo "✅ Migrations completed successfully"

# ===========================================
# 4. Static Files 수집 (프로덕션 환경)
# ===========================================
if [ "${COLLECT_STATIC}" = "true" ]; then
    echo ""
    echo "📁 Collecting static files..."
    python manage.py collectstatic --noinput || {
        echo "⚠️  Static files collection failed, continuing..."
    }
    echo "✅ Static files collected"
fi

# ===========================================
# 5. Superuser 생성 (선택사항)
# ===========================================
if [ "${CREATE_SUPERUSER}" = "true" ]; then
    echo ""
    echo "👤 Creating superuser..."
    python manage.py shell << END
from django.contrib.auth import get_user_model

User = get_user_model()
username = '${DJANGO_SUPERUSER_USERNAME:-admin}'
email = '${DJANGO_SUPERUSER_EMAIL:-admin@example.com}'
password = '${DJANGO_SUPERUSER_PASSWORD:-admin}'

if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username, email, password)
    print(f"✅ Superuser '{username}' created")
else:
    print(f"ℹ️  Superuser '{username}' already exists")
END
fi

# ===========================================
# 6. S3 연결 확인 (선택사항)
# ===========================================
if [ "${USE_S3}" = "true" ]; then
    echo ""
    echo "☁️  Checking S3 connection..."
    python << END
import os
import boto3
from botocore.exceptions import ClientError

try:
    s3_client = boto3.client('s3')
    bucket_name = os.environ.get('AWS_STORAGE_BUCKET_NAME')
    
    if bucket_name:
        s3_client.head_bucket(Bucket=bucket_name)
        print(f"✅ S3 bucket '{bucket_name}' is accessible")
    else:
        print("⚠️  AWS_STORAGE_BUCKET_NAME not set")
except ClientError as e:
    print(f"⚠️  S3 connection error: {e}")
except Exception as e:
    print(f"⚠️  S3 check failed: {e}")
END
fi

# ===========================================
# 7. 최종 Health Check
# ===========================================
echo ""
echo "🏥 Running final health check..."
python << END
from django.db import connection

try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.execute("SELECT COUNT(*) FROM django_migrations")
        count = cursor.fetchone()[0]
        print(f"✅ Database health check passed")
        print(f"✅ Applied migrations: {count}")
except Exception as e:
    print(f"❌ Health check failed: {e}")
    exit(1)
END

# ===========================================
# 8. Django 서버 시작
# ===========================================
echo ""
echo "=================================="
echo "🎉 Starting Gunicorn server..."
echo "=================================="
echo "  - Workers: ${GUNICORN_WORKERS:-4}"
echo "  - Threads: ${GUNICORN_THREADS:-2}"
echo "  - Timeout: ${GUNICORN_TIMEOUT:-120}s"
echo "  - Bind: 0.0.0.0:${PORT:-8000}"
echo ""

# Gunicorn 실행
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers ${GUNICORN_WORKERS:-4} \
    --threads ${GUNICORN_THREADS:-2} \
    --timeout ${GUNICORN_TIMEOUT:-120} \
    --access-logfile - \
    --error-logfile - \
    --log-level ${LOG_LEVEL:-info} \
    --capture-output \
    --enable-stdio-inheritance
