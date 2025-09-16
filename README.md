# 환경 설정 가이드

## 개요
이 프로젝트는 환경별로 분리된 설정을 사용합니다. 보안상의 이유로 실제 환경변수 파일(`.env.*`)은 Git에서 추적하지 않으며, 대신 템플릿 파일을 제공합니다.

## Quick Start

### 1. 환경변수 파일 생성

각 환경에 맞는 템플릿을 복사하여 실제 환경변수 파일을 생성하세요:

```bash
# 로컬 개발 환경
cp .env.local.template .env.local

# AWS 개발 환경
cp .env.dev.template .env.dev

# AWS 운영 환경  
cp .env.prod.template .env.prod
```

### 2. 환경변수 값 설정

생성된 `.env.*` 파일을 열어서 실제 값들로 교체하세요:

#### `.env.local` (로컬 개발)
```bash
# 로컬 개발용이므로 간단한 값 사용
POSTGRES_PASSWORD=your_local_password_here
SECRET_KEY=your-local-secret-key-for-development-only
```

#### `.env.dev` (AWS 개발)
```bash
# AWS 개발 환경 실제 값들로 교체
AWS_ACCOUNT_ID=123456789012
NEXT_PUBLIC_API_URL=https://api-dev.yourdomain.com
POSTGRES_PASSWORD=실제_개발_DB_비밀번호
SECRET_KEY=실제_개발_SECRET_KEY
```

#### `.env.prod` (AWS 운영)
```bash
# AWS 운영 환경 실제 값들로 교체 (⚠️ 매우 중요!)
AWS_ACCOUNT_ID=098765432109
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
POSTGRES_PASSWORD=실제_운영_DB_비밀번호
SECRET_KEY=실제_운영_SECRET_KEY
```

## 실행 방법

```bash
# 로컬 개발 환경
docker compose --env-file .env.local up -d --build

# AWS 개발 환경
docker compose --env-file .env.dev up -d --build

# AWS 운영 환경
docker compose --env-file .env.prod up -d --build
```

## 보안 권장사항

### 로컬 개발 환경
- 간단한 비밀번호 사용 가능
- 개발용 SECRET_KEY 사용
- LocalStack 사용으로 실제 AWS 비용 없음

### AWS 개발/운영 환경
- **반드시 AWS Secrets Manager 사용**
- 강력한 비밀번호 및 SECRET_KEY 사용
- 환경변수 파일을 절대 Git에 커밋하지 말 것
- 정기적인 키 로테이션 실시

## 주의사항

### 절대 하지 말 것
- `.env.local`, `.env.dev`, `.env.prod` 파일을 Git에 커밋
- 운영 환경 비밀번호를 평문으로 저장
- 개발용 키를 운영에서 사용

### 권장사항
- 각 환경마다 다른 SECRET_KEY 사용
- AWS Secrets Manager로 민감한 정보 관리
- 정기적인 보안 감사 실시
- 접근 권한 최소화 원칙 적용

## 문제 해결

### 환경변수가 인식되지 않는 경우
1. `.env.*` 파일이 올바른 위치에 있는지 확인
2. 파일명이 정확한지 확인 (`.env.local`, `.env.dev`, `.env.prod`)
3. `--env-file` 옵션이 올바르게 사용되었는지 확인

### Docker 빌드 오류
1. 모든 필수 환경변수가 설정되었는지 확인
2. `docker compose down && docker compose --env-file .env.local up -d --build`로 재시작

## 지원

문제가 발생하면 다음을 확인하세요:
1. [DEPLOYMENT.md](./DEPLOYMENT.md) - 상세한 배포 가이드
2. GitHub Issues - 알려진 문제들
