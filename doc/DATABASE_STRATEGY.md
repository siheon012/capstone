# 데이터베이스 배포 전략 가이드

## 🎯 단계별 접근법

### Phase 1: 개발 단계 (현재)

```bash
# 로컬 Docker Compose 사용
docker-compose up -d db
```

- **비용**: 무료
- **장점**: 빠른 개발, 완전한 제어
- **현재 설정**: `pgvector/pgvector:pg15` 완벽 지원

### Phase 2: 스테이징/테스트

```bash
# Supabase 무료 티어 사용
```

- **비용**: 무료 (500MB까지)
- **장점**: pgvector 기본 지원, 관리형
- **설정**: 간단한 연결 문자열 변경

### Phase 3: 프로덕션 (비용에 따라 선택)

#### 옵션 A: 저비용 (월 $0-5)

```yaml
# Railway PostgreSQL
DATABASE_URL: postgresql://user:pass@railway-host:5432/db
```

#### 옵션 B: 중간 비용 (월 $13-20)

```terraform
# AWS RDS t3.micro
resource "aws_db_instance" "postgres" {
  instance_class = "db.t3.micro"
}
```

#### 옵션 C: 고성능 (월 $50+)

```terraform
# AWS RDS with enhanced monitoring
resource "aws_db_instance" "postgres" {
  instance_class = "db.t3.small"
  multi_az      = true
}
```

## 🔧 현재 아키텍처의 유연성

### Docker Compose (현재)

```yaml
db:
  image: pgvector/pgvector:pg15
  environment:
    POSTGRES_DB: capstone_db
    POSTGRES_USER: capstone_user
    POSTGRES_PASSWORD: capstone_password
```

### 클라우드 DB 전환 (환경변수만 변경)

```yaml
backend:
  environment:
    - DATABASE_URL=postgresql://user:pass@cloud-host:5432/db
    # 또는
    - DB_HOST=your-cloud-db-host
    - DB_PORT=5432
    - DB_NAME=capstone_db
```

## 💰 비용 비교

### 로컬/자체 호스팅

- **월 비용**: $0
- **관리 시간**: 높음
- **안정성**: 직접 관리

### Supabase

- **무료 티어**: 500MB, 2개 프로젝트
- **Pro 티어**: $25/월 (8GB, 백업, 지원)
- **pgvector**: ✅ 기본 지원

### Railway

- **Starter**: $5/월 (1GB)
- **Developer**: $20/월 (8GB)
- **pgvector**: ⚠️ 수동 설치 필요

### AWS RDS

- **t3.micro**: ~$13/월 (1vCPU, 1GB RAM)
- **t3.small**: ~$26/월 (2vCPU, 2GB RAM)
- **pgvector**: ⚠️ 수동 설치 또는 Aurora 필요

## 🎯 권장 시나리오

### 즉시 시작 (MVP)

```bash
# 현재 Docker Compose 그대로 사용
docker-compose up -d
```

### 클라우드 이전 준비

```bash
# 환경변수로 유연하게 설정
cp .env.example .env
# DATABASE_URL 또는 DB_HOST 설정
```

### 프로덕션 배포

```bash
# Supabase 또는 Railway 사용
# pgvector 지원 확인 후 선택
```

## 🔄 마이그레이션 경로

1. **개발**: 로컬 Docker PostgreSQL
2. **테스트**: Supabase 무료 티어
3. **스테이징**: Railway $5/월
4. **프로덕션**: AWS RDS 또는 Supabase Pro

각 단계에서 `DATABASE_URL` 환경변수만 변경하면 됩니다!
