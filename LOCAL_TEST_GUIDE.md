# 로컬 Docker 테스트 가이드

## 🎯 목표

- entrypoint.sh가 제대로 작동하는지 확인
- DB 연결 자동 대기 테스트
- pgvector 자동 활성화 확인
- Django Migration 자동 실행 확인
- Health Check 엔드포인트 검증

## 📋 사전 준비

### 1. 필수 소프트웨어 확인

```powershell
# Docker 버전 확인
docker --version
# Docker Desktop 실행 중인지 확인

# Docker Compose 버전 확인
docker-compose --version
```

### 2. 환경변수 파일 복사

```powershell
# .env.local을 .env로 복사
Copy-Item .env.local .env
```

또는 직접 `.env` 파일 생성:

```env
BACKEND_PORT=8001
FRONTEND_PORT=3000
DB_PORT=5433
POSTGRES_DB=capstone_db
POSTGRES_USER=capstone_user
POSTGRES_PASSWORD=capstone_password
GUNICORN_WORKERS=2
GUNICORN_THREADS=2
USE_S3=false
DEBUG=False
```

## 🚀 테스트 실행

### 방법 A: 자동 테스트 스크립트 (추천)

```powershell
# 테스트 스크립트 실행
.\test-docker-local.ps1
```

**스크립트가 자동으로 수행하는 작업:**

1. ✅ 기존 컨테이너 정리
2. ✅ entrypoint.sh 권한 확인
3. ✅ Docker 이미지 빌드
4. ✅ 컨테이너 시작
5. ✅ DB 연결 확인
6. ✅ pgvector 확장 확인
7. ✅ Migration 상태 확인
8. ✅ Health Check 테스트
9. ✅ 로그 확인

### 방법 B: 수동 테스트

#### Step 1: 기존 컨테이너 정리

```powershell
docker-compose down -v
```

#### Step 2: 빌드 및 시작

```powershell
# 빌드 (캐시 없이)
docker-compose build --no-cache

# 백그라운드로 시작
docker-compose up -d

# 또는 로그 보면서 시작
docker-compose up
```

#### Step 3: 로그 확인

```powershell
# 모든 서비스 로그
docker-compose logs -f

# 백엔드만
docker-compose logs -f backend

# DB만
docker-compose logs -f db
```

#### Step 4: 컨테이너 상태 확인

```powershell
docker-compose ps
```

**예상 출력:**

```
NAME                COMMAND                  SERVICE             STATUS              PORTS
capstone-backend-1  "/app/entrypoint.sh"     backend             Up 30 seconds       0.0.0.0:8001->8000/tcp
capstone-db-1       "docker-entrypoint.s…"   db                  Up 35 seconds       0.0.0.0:5433->5432/tcp
capstone-frontend-1 "docker-entrypoint.s…"   frontend            Up 30 seconds       0.0.0.0:3000->3000/tcp
```

## ✅ 검증 체크리스트

### 1. 백엔드 로그 확인

```powershell
docker-compose logs backend | Select-String "✅"
```

**예상 로그 순서:**

```
✅ Database connection successful!
✅ PostgreSQL is ready!
✅ pgvector extension enabled
✅ pgvector version: 0.5.0
✅ Migrations completed successfully
✅ Database health check passed
✅ Applied migrations: XX
🎉 Starting Gunicorn server...
```

### 2. Health Check 테스트

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:8001/api/health/" | ConvertTo-Json
```

**예상 응답:**

```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T10:30:00.123Z",
  "checks": {
    "database": "connected",
    "pgvector": "enabled",
    "s3": "disabled"
  },
  "details": {}
}
```

### 3. PostgreSQL 접속

```powershell
# DB 컨테이너 접속
docker-compose exec db psql -U capstone_user -d capstone_db

# pgvector 확인
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

**예상 출력:**

```
 extname | extversion
---------+------------
 vector  | 0.5.0
```

### 4. Django Migration 확인

```powershell
docker-compose exec backend python manage.py showmigrations
```

**예상 출력:**

```
admin
 [X] 0001_initial
 [X] 0002_logentry_remove_auto_add
 ...
db
 [X] 0001_initial
 ...
```

### 5. 웹 브라우저 테스트

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001/api/
- **Health Check**: http://localhost:8001/api/health/
- **Admin**: http://localhost:8001/admin/

## 🐛 트러블슈팅

### 문제 1: "Database connection failed"

```powershell
# DB 컨테이너 상태 확인
docker-compose ps db

# DB 로그 확인
docker-compose logs db

# 해결: DB가 준비될 때까지 대기 (entrypoint.sh가 자동 처리)
```

### 문제 2: "pgvector extension not found"

```powershell
# pgvector 이미지 확인
docker-compose exec db psql -U postgres -c "SELECT version();"

# 해결: pgvector/pgvector:pg15 이미지 사용 확인
```

### 문제 3: "Migration failed"

```powershell
# 기존 migration 상태 확인
docker-compose exec backend python manage.py showmigrations

# 해결: 볼륨 삭제 후 재시작
docker-compose down -v
docker-compose up -d
```

### 문제 4: "Health check timeout"

```powershell
# 백엔드 로그 확인
docker-compose logs backend | Select-String "error|Error|ERROR"

# Gunicorn 프로세스 확인
docker-compose exec backend ps aux | grep gunicorn

# 해결: start_period 증가 (docker-compose.yml에서 이미 60s로 설정)
```

### 문제 5: "entrypoint.sh: permission denied"

```powershell
# Windows에서 Git Bash 사용
cd back
git update-index --chmod=+x entrypoint.sh

# 또는 Dockerfile에서 자동으로 chmod +x 실행됨
```

## 📊 성능 확인

### 리소스 사용량

```powershell
docker stats
```

### DB 연결 수

```powershell
docker-compose exec db psql -U capstone_user -d capstone_db -c "SELECT count(*) FROM pg_stat_activity;"
```

### 응답 시간 측정

```powershell
Measure-Command { Invoke-RestMethod -Uri "http://localhost:8001/api/health/" }
```

## 🧹 정리

### 컨테이너 중지

```powershell
docker-compose down
```

### 컨테이너 + 볼륨 삭제

```powershell
docker-compose down -v
```

### 이미지까지 삭제

```powershell
docker-compose down -v --rmi all
```

### Docker 시스템 정리

```powershell
docker system prune -a --volumes
```

## 📝 다음 단계

테스트가 성공하면:

1. ✅ **Step 2**: Docker 이미지 빌드 및 ECR 푸시
2. ✅ **Step 3**: Terraform 배포 실행
3. ✅ **Step 4**: 실제 AWS 환경에서 테스트

## 🎯 성공 기준

- [x] DB 연결 자동 대기 (30회 재시도)
- [x] pgvector 확장 자동 활성화
- [x] Django Migration 자동 실행
- [x] Health Check 200 응답
- [x] Gunicorn 서버 정상 시작
- [x] API 엔드포인트 접근 가능

모든 체크리스트가 통과하면 **Step 1 완료!** 🎉
