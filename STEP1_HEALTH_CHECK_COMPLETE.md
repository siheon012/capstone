# Django Health Check & Entrypoint 구현 완료

## ✅ 완료된 작업

### 1. **강화된 Health Check 엔드포인트** (`back/apps/api/views.py`)

#### 기능:

- ✅ **데이터베이스 연결 확인** - PostgreSQL 연결 상태 체크
- ✅ **pgvector 확장 확인** - 벡터 DB 사용 가능 여부 확인
- ✅ **S3 연결 확인** - AWS S3 버킷 접근 가능 여부 확인 (선택사항)
- ✅ **타임스탬프 포함** - 헬스체크 실행 시각 기록
- ✅ **상세 오류 정보** - 문제 발생 시 구체적인 에러 메시지

#### 응답 예시:

```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T10:30:00.000Z",
  "checks": {
    "database": "connected",
    "pgvector": "enabled",
    "s3": "connected"
  },
  "details": {}
}
```

#### ALB Target Group 설정:

- **Path**: `/api/health/`
- **Success Code**: `200`
- **Failure Code**: `503`

### 2. **Entrypoint 스크립트** (`back/entrypoint.sh`)

#### 실행 순서:

```
1️⃣ 데이터베이스 연결 대기 (최대 30회 재시도, 2초 간격)
   └─ PostgreSQL 연결 확인
   └─ 실패 시 프로세스 종료

2️⃣ pgvector 확장 활성화
   └─ CREATE EXTENSION IF NOT EXISTS vector;
   └─ 버전 확인
   └─ 실패 시 경고만 출력 (계속 진행)

3️⃣ Django Migrations 실행
   └─ makemigrations (개발 환경에서만)
   └─ migrate --noinput
   └─ 실패 시 프로세스 종료

4️⃣ Static Files 수집 (프로덕션 환경)
   └─ collectstatic --noinput
   └─ COLLECT_STATIC=true 환경변수 필요

5️⃣ Superuser 생성 (선택사항)
   └─ CREATE_SUPERUSER=true 환경변수 필요
   └─ 이미 존재하면 건너뛰기

6️⃣ S3 연결 확인 (선택사항)
   └─ USE_S3=true 환경변수 필요
   └─ 버킷 접근 가능 여부 확인

7️⃣ 최종 Health Check
   └─ 데이터베이스 연결 확인
   └─ Migration 개수 출력

8️⃣ Gunicorn 서버 시작
   └─ Workers: 4개 (기본값)
   └─ Threads: 2개 (기본값)
   └─ Timeout: 120초
   └─ Bind: 0.0.0.0:8000
```

#### 환경변수 설정:

##### 필수:

```bash
DB_HOST=<RDS endpoint>
DB_PORT=5432
DB_NAME=capstone_db
DB_USER=capstone_user
DB_PASSWORD=<secret>
```

##### 선택사항:

```bash
# Gunicorn 설정
GUNICORN_WORKERS=4
GUNICORN_THREADS=2
GUNICORN_TIMEOUT=120
PORT=8000
LOG_LEVEL=info

# AWS 설정
USE_S3=true
AWS_STORAGE_BUCKET_NAME=capstone-video-storage
AWS_DEFAULT_REGION=ap-northeast-2

# Django 설정
COLLECT_STATIC=true
CREATE_SUPERUSER=false
DJANGO_ENV=production
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@example.com
DJANGO_SUPERUSER_PASSWORD=<secret>
```

### 3. **Dockerfile 업데이트** (`back/Dockerfile`)

#### 변경사항:

- ✅ `entrypoint.sh` 복사 및 실행 권한 부여
- ✅ `ENTRYPOINT ["/app/entrypoint.sh"]` 사용
- ✅ Health check start period 60초로 증가 (Migration 시간 고려)
- ✅ 환경변수 기본값 설정
- ✅ Gunicorn 설정 환경변수화

#### 이전 vs 현재:

| 항목         | 이전                     | 현재                |
| ------------ | ------------------------ | ------------------- |
| Migration    | ❌ 빌드 시 실행 (불가능) | ✅ 런타임 자동 실행 |
| DB 연결 대기 | ❌ 없음                  | ✅ 30회 재시도      |
| pgvector     | ❌ 수동 설정 필요        | ✅ 자동 활성화      |
| Static Files | ⚠️ 빌드 시               | ✅ 런타임 선택 가능 |
| Health Check | ⚠️ 기본만                | ✅ 상세 체크        |
| 서버 시작    | ⚠️ CMD로 직접            | ✅ Entrypoint 사용  |

## 🧪 로컬 테스트

### 1. entrypoint.sh 권한 확인

```bash
cd back
chmod +x entrypoint.sh
```

### 2. Docker Compose로 테스트

```bash
# docker-compose.yml 사용
docker-compose up --build
```

### 3. Health Check 확인

```bash
# 컨테이너 시작 후
curl http://localhost:8000/api/health/

# 예상 응답
{
  "status": "healthy",
  "timestamp": "2025-10-27T...",
  "checks": {
    "database": "connected",
    "pgvector": "enabled",
    "s3": "disabled"
  }
}
```

### 4. 로그 확인

```bash
docker-compose logs -f backend

# 예상 로그 순서:
# ✅ Waiting for PostgreSQL database...
# ✅ PostgreSQL is ready!
# ✅ pgvector extension enabled
# ✅ Running Django migrations...
# ✅ Migrations completed successfully
# ✅ Database health check passed
# 🎉 Starting Gunicorn server...
```

## 🚀 ECS Fargate 배포 시

### Task Definition에서 자동으로:

1. **DB 연결 대기** - RDS 준비될 때까지 대기
2. **pgvector 활성화** - 자동으로 확장 설치
3. **Migration 실행** - 새 테이블 자동 생성
4. **Health Check 통과** - ALB에서 트래픽 수신 시작

### 실패 시:

- DB 연결 실패 → 컨테이너 종료 → ECS가 자동 재시작
- Migration 실패 → 컨테이너 종료 → 로그 확인 필요
- Health Check 실패 → ALB가 트래픽 차단 → 다른 인스턴스 사용

## 📋 다음 단계

- [ ] **로컬 테스트** - Docker Compose로 전체 플로우 검증
- [ ] **ECR 이미지 푸시** - 빌드된 이미지 AWS로 업로드
- [ ] **ECS Task Definition 업데이트** - 새 이미지 버전 사용
- [ ] **Terraform 배포** - 전체 인프라 생성

## 🔍 트러블슈팅

### 문제 1: DB 연결 실패

```bash
# 원인: 잘못된 환경변수
# 해결: ECS Task Definition에서 환경변수 확인

# 원인: Security Group 차단
# 해결: RDS SG에서 ECS Tasks SG 허용 확인
```

### 문제 2: Migration 실패

```bash
# 원인: 이미 존재하는 테이블
# 해결: python manage.py migrate --fake-initial

# 원인: pgvector 확장 없음
# 해결: RDS에서 pgvector 지원 확인 (PostgreSQL 15+ 필요)
```

### 문제 3: Health Check 타임아웃

```bash
# 원인: Migration이 오래 걸림
# 해결: HEALTHCHECK --start-period=60s 설정 (이미 완료)

# 원인: Gunicorn 시작 느림
# 해결: GUNICORN_WORKERS 줄이기 (4 → 2)
```

## ✅ 체크리스트

- [x] Health Check 엔드포인트 강화
- [x] entrypoint.sh 스크립트 작성
- [x] Dockerfile 업데이트
- [x] 환경변수 문서화
- [ ] 로컬 Docker 테스트
- [ ] ECR 푸시 준비
- [ ] ECS 배포 준비
