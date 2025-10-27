#!/bin/bash
# 데이터베이스 연결 및 pgvector 설정 테스트 스크립트

set -e

echo "🔍 PostgreSQL + pgvector 설정 테스트 시작..."

# 환경변수 설정
DB_NAME=${POSTGRES_DB:-capstone_db}
DB_USER=${POSTGRES_USER:-capstone_user}
DB_PASSWORD=${POSTGRES_PASSWORD:-capstone_password}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5433}

echo "📊 데이터베이스 연결 정보:"
echo "  - Host: $DB_HOST:$DB_PORT"
echo "  - Database: $DB_NAME"
echo "  - User: $DB_USER"

# PostgreSQL 연결 테스트
echo "🔌 PostgreSQL 연결 테스트..."
export PGPASSWORD=$DB_PASSWORD
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" || {
    echo "❌ PostgreSQL 연결 실패!"
    exit 1
}

# pgvector 확장 확인
echo "🧮 pgvector 확장 확인..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT * FROM pg_extension WHERE extname = 'vector';" || {
    echo "❌ pgvector 확장이 설치되지 않음!"
    exit 1
}

# 벡터 테스트
echo "🎯 벡터 연산 테스트..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    SELECT 
        '[1,2,3]'::vector <-> '[1,2,4]'::vector AS l2_distance,
        '[1,2,3]'::vector <=> '[1,2,4]'::vector AS cosine_distance,
        '[1,2,3]'::vector <#> '[1,2,4]'::vector AS inner_product;
" || {
    echo "❌ 벡터 연산 테스트 실패!"
    exit 1
}

# 테이블 존재 확인
echo "📋 예시 테이블 확인..."
TABLE_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT COUNT(*) 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'example_%';
")

echo "  - 예시 테이블 개수: $TABLE_COUNT"

# 인덱스 확인
echo "📈 벡터 인덱스 확인..."
INDEX_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE indexname LIKE '%embedding%';
")

echo "  - 벡터 인덱스 개수: $INDEX_COUNT"

# 벡터 함수 테스트
echo "⚡ 사용자 정의 함수 테스트..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT cosine_similarity('[1,0,0]'::vector, '[0,1,0]'::vector);" || {
    echo "❌ 사용자 정의 함수 테스트 실패!"
    exit 1
}

# 최종 테스트 함수 실행
echo "🎉 최종 검증..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT test_vector_search();"

echo ""
echo "✅ PostgreSQL + pgvector 설정이 성공적으로 완료되었습니다!"
echo ""
echo "🚀 이제 다음 명령으로 전체 시스템을 시작할 수 있습니다:"
echo "   docker-compose up -d"
echo ""
echo "📝 Django 마이그레이션을 실행하려면:"
echo "   docker-compose exec backend python manage.py makemigrations"
echo "   docker-compose exec backend python manage.py migrate"