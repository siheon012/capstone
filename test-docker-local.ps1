# ============================================
# Docker Compose 로컬 테스트 스크립트
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🧪 Docker Compose 로컬 테스트 시작" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 현재 디렉토리 확인
$currentDir = Get-Location
Write-Host "📂 현재 디렉토리: $currentDir" -ForegroundColor Yellow
Write-Host ""

# .env 파일 확인
if (Test-Path ".env") {
    Write-Host "✅ .env 파일 존재" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env 파일이 없습니다. 기본값 사용" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# Step 1: 기존 컨테이너 정리
# ============================================
Write-Host "🧹 Step 1: 기존 컨테이너 정리..." -ForegroundColor Cyan

# 실행 중인 컨테이너 중지
Write-Host "  - 실행 중인 컨테이너 중지..."
docker-compose down

# 볼륨까지 삭제 (선택사항)
$cleanVolumes = Read-Host "  볼륨까지 삭제하시겠습니까? (y/N)"
if ($cleanVolumes -eq "y" -or $cleanVolumes -eq "Y") {
    Write-Host "  - 볼륨 삭제 중..." -ForegroundColor Yellow
    docker-compose down -v
    Write-Host "  ✅ 볼륨 삭제 완료" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  볼륨 유지 (기존 데이터 보존)" -ForegroundColor Blue
}

Write-Host ""

# ============================================
# Step 2: entrypoint.sh 권한 확인
# ============================================
Write-Host "🔧 Step 2: entrypoint.sh 권한 확인..." -ForegroundColor Cyan

$entrypointPath = "back\entrypoint.sh"
if (Test-Path $entrypointPath) {
    Write-Host "  ✅ entrypoint.sh 파일 존재" -ForegroundColor Green
    
    # Git Bash가 설치되어 있다면 실행 권한 부여
    if (Get-Command "git" -ErrorAction SilentlyContinue) {
        Write-Host "  - Git Bash로 실행 권한 부여 중..."
        git update-index --chmod=+x $entrypointPath
        Write-Host "  ✅ 실행 권한 부여 완료" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Git이 설치되어 있지 않습니다. Docker 빌드 시 자동으로 권한 부여됩니다." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ entrypoint.sh 파일이 없습니다!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================
# Step 3: Docker 이미지 빌드
# ============================================
Write-Host "🏗️  Step 3: Docker 이미지 빌드..." -ForegroundColor Cyan
Write-Host "  (이 작업은 몇 분 걸릴 수 있습니다)" -ForegroundColor Yellow
Write-Host ""

$buildStart = Get-Date
docker-compose build --no-cache
$buildEnd = Get-Date
$buildDuration = ($buildEnd - $buildStart).TotalSeconds

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "  ✅ 빌드 완료 (소요 시간: $([math]::Round($buildDuration, 2))초)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  ❌ 빌드 실패!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================
# Step 4: 컨테이너 시작
# ============================================
Write-Host "🚀 Step 4: 컨테이너 시작..." -ForegroundColor Cyan
Write-Host ""

# 백그라운드로 시작
docker-compose up -d

Write-Host ""
Write-Host "  ⏳ 컨테이너 초기화 대기 중 (30초)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host ""

# ============================================
# Step 5: 컨테이너 상태 확인
# ============================================
Write-Host "🔍 Step 5: 컨테이너 상태 확인..." -ForegroundColor Cyan
Write-Host ""

docker-compose ps

Write-Host ""

# ============================================
# Step 6: DB 연결 확인
# ============================================
Write-Host "🔍 Step 6: PostgreSQL 연결 확인..." -ForegroundColor Cyan

$dbCheck = docker-compose exec -T db psql -U capstone_user -d capstone_db -c "SELECT 1" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ PostgreSQL 연결 성공" -ForegroundColor Green
} else {
    Write-Host "  ❌ PostgreSQL 연결 실패" -ForegroundColor Red
    Write-Host "  $dbCheck" -ForegroundColor Red
}

Write-Host ""

# ============================================
# Step 7: pgvector 확장 확인
# ============================================
Write-Host "🔍 Step 7: pgvector 확장 확인..." -ForegroundColor Cyan

$pgvectorCheck = docker-compose exec -T db psql -U capstone_user -d capstone_db -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'" 2>&1

if ($LASTEXITCODE -eq 0 -and $pgvectorCheck -match "vector") {
    Write-Host "  ✅ pgvector 확장 활성화됨" -ForegroundColor Green
    Write-Host "  $pgvectorCheck" -ForegroundColor Gray
} else {
    Write-Host "  ⚠️  pgvector 확장이 활성화되지 않았습니다" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# Step 8: Django Migration 확인
# ============================================
Write-Host "🔍 Step 8: Django Migration 확인..." -ForegroundColor Cyan

$migrationCheck = docker-compose exec -T backend python manage.py showmigrations 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Migration 상태:" -ForegroundColor Green
    Write-Host "$migrationCheck" -ForegroundColor Gray
} else {
    Write-Host "  ⚠️  Migration 확인 실패" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# Step 9: Health Check 테스트
# ============================================
Write-Host "🏥 Step 9: Health Check 테스트..." -ForegroundColor Cyan
Write-Host ""

Write-Host "  📡 Backend Health Check (http://localhost:8001/api/health/)" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8001/api/health/" -Method Get -TimeoutSec 10
    
    Write-Host "  ✅ Health Check 성공!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  응답 내용:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Gray
    
} catch {
    Write-Host "  ❌ Health Check 실패!" -ForegroundColor Red
    Write-Host "  오류: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# ============================================
# Step 10: 로그 확인
# ============================================
Write-Host "📋 Step 10: 백엔드 로그 확인..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  최근 로그 (마지막 50줄):" -ForegroundColor Yellow
Write-Host ""

docker-compose logs --tail=50 backend

Write-Host ""

# ============================================
# 최종 결과
# ============================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ 테스트 완료!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📌 접속 정보:" -ForegroundColor Yellow
Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  - Backend API: http://localhost:8001/api/" -ForegroundColor White
Write-Host "  - Backend Health: http://localhost:8001/api/health/" -ForegroundColor White
Write-Host "  - PostgreSQL: localhost:5433" -ForegroundColor White
Write-Host ""
Write-Host "📋 유용한 명령어:" -ForegroundColor Yellow
Write-Host "  - 로그 실시간 보기: docker-compose logs -f" -ForegroundColor White
Write-Host "  - 백엔드 로그만: docker-compose logs -f backend" -ForegroundColor White
Write-Host "  - 컨테이너 중지: docker-compose down" -ForegroundColor White
Write-Host "  - 컨테이너 재시작: docker-compose restart" -ForegroundColor White
Write-Host ""

$keepRunning = Read-Host "로그를 실시간으로 보시겠습니까? (y/N)"
if ($keepRunning -eq "y" -or $keepRunning -eq "Y") {
    Write-Host ""
    Write-Host "🔄 실시간 로그 표시 중... (Ctrl+C로 종료)" -ForegroundColor Cyan
    docker-compose logs -f
}
