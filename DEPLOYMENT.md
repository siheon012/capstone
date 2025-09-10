# Capstone Project 환경별 실행 가이드

## 🚀 실행 방법

### 1. 로컬 개발 환경 (LocalStack 사용)
```bash
docker compose --env-file .env.local up -d --build
```

### 2. AWS 개발 환경 (실제 AWS 서비스)
```bash
docker compose --env-file .env.dev up -d --build
```

### 3. AWS 운영 환경 (실제 AWS 서비스)
```bash
docker compose --env-file .env.prod up -d --build
```

## 🔧 환경 설정

### 로컬 환경 (.env.local)
- LocalStack을 사용한 AWS 서비스 시뮬레이션
- PostgreSQL 로컬 인스턴스
- 개발용 SECRET_KEY 사용
- Debug 모드 활성화

### 개발 환경 (.env.dev)
- 실제 AWS 서비스 (S3, SQS, RDS 등)
- AWS App Runner 또는 ECS 배포 대상
- 개발용 도메인 (api-dev.capstone.com)
- Debug 모드 비활성화

### 운영 환경 (.env.prod)
- 실제 AWS 프로덕션 서비스
- ECS 클러스터 배포 대상
- 운영 도메인 (api.capstone.com)
- 보안 강화 설정 (HTTPS, HSTS 등)

## 📁 주요 구성요소

### Backend (Django)
- JWT 인증 방식
- S3 Pre-signed URL을 통한 파일 업로드
- SQS를 통한 비동기 영상 분석 작업 큐
- PostgreSQL 데이터베이스
- Text2SQL 모델 통합
- LLaMA 언어모델 통합

### Frontend (Next.js)
- 무상태화 기반 UI/UX
- S3 직접 업로드 인터페이스
- 실시간 분석 진행률 표시
- 텍스트 기반 영상 정보 조회

### 인프라
- **로컬**: LocalStack (AWS 서비스 시뮬레이션)
- **개발**: AWS App Runner (가벼운 배포)
- **운영**: AWS ECS (확장 가능한 컨테이너 서비스)
- **이미지 관리**: ECR (Elastic Container Registry)
- **CI/CD**: GitHub Actions

## 🔐 보안

### JWT 토큰 관리
- AWS Secrets Manager를 통한 SECRET_KEY 관리
- 환경별 토큰 만료 시간 설정
- Pre-signed URL을 통한 안전한 파일 업로드

### 환경변수 관리
- 환경별 `.env` 파일 분리
- 민감한 정보는 AWS Secrets Manager 연동
- 로컬 개발용 더미 값 제공

## 🔄 CI/CD 파이프라인

1. **코드 푸시** → GitHub
2. **GitHub Actions** → 빌드 & 테스트
3. **Docker 이미지 빌드** → ECR 푸시
4. **배포**
   - 개발: App Runner 자동 배포
   - 운영: ECS 클러스터 배포

## 📊 모니터링

- AWS CloudWatch를 통한 로그 및 메트릭 수집
- Sentry를 통한 에러 트래킹 (개발/운영 환경)
- 영상 분석 진행률 실시간 모니터링
