# Windows용 데이터베이스 테스트 스크립트
# PowerShell에서 실행: .\test-db-setup.ps1

Write-Host "🔍 PostgreSQL + pgvector 설정 테스트 시작..." -ForegroundColor Cyan

# 환경변수 설정
$DB_NAME = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "capstone_db" }
$DB_USER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "capstone_user" }
$DB_PASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "capstone_password" }
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5433" }

Write-Host "📊 데이터베이스 연결 정보:" -ForegroundColor Yellow
Write-Host "  - Host: $DB_HOST`:$DB_PORT"
Write-Host "  - Database: $DB_NAME"
Write-Host "  - User: $DB_USER"

# Docker Compose로 DB 시작 확인
Write-Host "🐳 Docker 컨테이너 상태 확인..." -ForegroundColor Cyan
$dbContainer = docker-compose ps db
if ($dbContainer -like "*Up*") {
    Write-Host "✅ PostgreSQL 컨테이너가 실행 중입니다." -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL 컨테이너가 실행되지 않고 있습니다." -ForegroundColor Red
    Write-Host "다음 명령으로 시작하세요: docker-compose up -d db" -ForegroundColor Yellow
    exit 1
}

# PostgreSQL 연결 테스트 (Docker 컨테이너 내부에서 실행)
Write-Host "🔌 PostgreSQL 연결 테스트..." -ForegroundColor Cyan
$testConnection = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT version();" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL 연결 성공!" -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL 연결 실패!" -ForegroundColor Red
    exit 1
}

# pgvector 확장 확인
Write-Host "🧮 pgvector 확장 확인..." -ForegroundColor Cyan
$vectorCheck = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT * FROM pg_extension WHERE extname = 'vector';" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ pgvector 확장이 설치되어 있습니다!" -ForegroundColor Green
} else {
    Write-Host "❌ pgvector 확장이 설치되지 않음!" -ForegroundColor Red
    exit 1
}

# 벡터 연산 테스트
Write-Host "🎯 벡터 연산 테스트..." -ForegroundColor Cyan
$vectorTest = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS l2_distance, '[1,2,3]'::vector <=> '[1,2,4]'::vector AS cosine_distance;" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 벡터 연산 테스트 성공!" -ForegroundColor Green
} else {
    Write-Host "❌ 벡터 연산 테스트 실패!" -ForegroundColor Red
    exit 1
}

# 테이블 및 인덱스 확인
Write-Host "📋 예시 테이블 및 인덱스 확인..." -ForegroundColor Cyan
$tableCount = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'example_%';" 2>$null
$indexCount = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE '%embedding%';" 2>$null

Write-Host "  - 예시 테이블 개수: $($tableCount.Trim())"
Write-Host "  - 벡터 인덱스 개수: $($indexCount.Trim())"

# 최종 테스트 함수 실행
Write-Host "🎉 최종 검증..." -ForegroundColor Cyan
$finalTest = docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT test_vector_search();" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 모든 테스트 통과!" -ForegroundColor Green
} else {
    Write-Host "❌ 최종 테스트 실패!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎊 PostgreSQL + pgvector 설정이 성공적으로 완료되었습니다!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 이제 다음 명령으로 전체 시스템을 시작할 수 있습니다:" -ForegroundColor Cyan
Write-Host "   docker-compose up -d" -ForegroundColor White
Write-Host ""
Write-Host "📝 Django 마이그레이션을 실행하려면:" -ForegroundColor Cyan
Write-Host "   docker-compose exec backend python manage.py makemigrations" -ForegroundColor White
Write-Host "   docker-compose exec backend python manage.py migrate" -ForegroundColor White