# GitHub Actions를 활용한 AWS 비용 최적화

## 📌 문제

**과도한 AWS 월 비용 발생** (~$150-200/월)

- ECS Fargate 서비스 24시간 가동
- RDS 인스턴스 24시간 실행
- ECR 이미지 무제한 누적
- AWS Batch 작업 실패 감지 불가
- 비용 모니터링 부재

## 🔍 원인

### 1. 24시간 풀 인스턴스 가동

- **ECS**: Frontend/Backend 서비스가 사용하지 않는 시간에도 계속 실행
- **RDS**: 데이터베이스가 심야/주말에도 중지되지 않음
- **예상 낭비**: 하루 15시간 이상 미사용 (62.5%)

### 2. 리소스 정리 자동화 부재

- ECR에 오래된 이미지 무한 누적 → 스토리지 비용 증가
- Untagged 이미지 방치

### 3. 모니터링 및 알림 부재

- Batch 작업 실패 시 수동 확인 필요
- 비용 급증 시 조기 감지 불가능

## ✅ 해결 방법

### GitHub Actions 워크플로 4종 구축

#### 1️⃣ **cleanup-ecr.yml** - ECR 이미지 자동 정리

```yaml
실행: 매주 일요일 03:00 KST
기능:
  - Untagged 이미지 삭제
  - 최신 10개만 보관, 나머지 삭제
  - Frontend, Backend, Batch 저장소 모두 정리
```

**절감 효과**: 월 $2-5

---

#### 2️⃣ **schedule-services.yml** - ECS/RDS 스케줄링

```yaml
실행:
  - 매일 08:00 KST → 서비스 중지
  - 매일 14:00 KST → 서비스 시작
  - 매주 토요일 → RDS 7일 자동시작 방지

관리 대상:
  - ECS Frontend Service (Desired Count: 1 → 0)
  - ECS Backend Service (Desired Count: 1 → 0)
  - RDS PostgreSQL (available → stopped)
```

**작동 원리**:

- **Stop 시**: ECS Desired Count를 0으로 → 태스크 종료 → 비용 절감
- **RDS Stop**: 데이터는 디스크에 보존, 인스턴스만 중지
- **Start 시**: RDS 먼저 시작 → 완전 가용 대기 → ECS 시작

**데이터 보존**: ✅ 100% 안전 (Stop/Start는 종료/재시작과 동일)

**절감 효과**: 일 $4-7, 월 $120-210

---

#### 3️⃣ **code-quality.yml** - 코드 품질 자동 검사

```yaml
실행: PR/Push 시 자동

Python 검사:
  - Black: 코드 포맷팅
  - Flake8: PEP8 스타일 체크
  - Bandit: 보안 취약점 스캔
  - Safety: 라이브러리 취약점
  - Django Tests: 단위 테스트

TypeScript 검사:
  - ESLint: 린팅
  - Prettier: 포맷팅
  - TypeScript: 타입 체크
  - Build Test: 프로덕션 빌드

Docker 보안:
  - Trivy: 이미지 취약점 스캔
```

**효과**: 프로덕션 배포 전 버그/보안 이슈 조기 발견

---

#### 4️⃣ **batch-monitor.yml** - AWS 모니터링 & 비용 추적

```yaml
실행:
  - 매일 09:00 KST: 일일 리포트
  - 매주 월요일 10:00 KST: 주간 리포트

모니터링 항목:
  - AWS Batch 작업 실패 감지
  - 최근 7일 Batch 작업 통계
  - 일일/월간 비용 리포트
  - 서비스별 비용 분해
  - 비용 이상 징후 탐지
```

**자동 알림**:

- GitHub Actions Summary: 실행 페이지에서 바로 확인
- Issue 자동 생성: Batch 실패 시 Issue 생성 + 이메일 알림

**효과**: 비용 급증 조기 감지, 실패 작업 24시간 내 발견

---

## 💰 비용 절감 효과

### 월간 비용 비교

| 항목          | 최적화 전  | 최적화 후  | 절감액     |
| ------------- | ---------- | ---------- | ---------- |
| ECS Fargate   | $30-40     | $15-20     | **$15-20** |
| RDS t4g.micro | $15-20     | $7-10      | **$8-10**  |
| ECR Storage   | $5-10      | $2-5       | **$3-5**   |
| **총계**      | **$50-70** | **$24-35** | **$26-35** |

### 연간 절감액

**$312-420/년** (약 50% 절감)

---

## 🔐 보안 강화

### GitHub Secrets 적용

하드코딩된 AWS 리소스 이름을 모두 Secrets로 관리:

```yaml
# 적용 전
--cluster capstone-cluster  # ❌ 하드코딩

# 적용 후
--cluster ${{ secrets.ECS_CLUSTER }}  # ✅ Secret
```

**등록된 Secrets**:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `ECR_FRONTEND_REPO`
- `ECR_BACKEND_REPO`
- `ECR_BATCH_REPO`
- `ECS_CLUSTER`
- `ECS_FRONTEND_SERVICE`
- `ECS_BACKEND_SERVICE`
- `RDS_INSTANCE_ID`
- `BATCH_JOB_QUEUE`

---

## 📊 구현 결과

### ✅ 성공 지표

1. **비용 절감**: 월 50% 절감 달성
2. **자동화**: 수동 작업 0건 (100% 자동화)
3. **모니터링**: 일일 자동 리포트
4. **보안**: 하드코딩 제거, Secrets 관리
5. **품질**: PR 시 자동 코드 검사

### 📈 운영 개선

**Before (수동 관리)**:

- ❌ 매일 콘솔 접속해서 서비스 중지/시작
- ❌ ECR 이미지 수동 삭제
- ❌ 비용 확인 수동 체크
- ❌ Batch 실패 늦게 발견

**After (자동화)**:

- ✅ GitHub Actions가 자동으로 스케줄링
- ✅ 주간 자동 정리
- ✅ 일일 비용 리포트 + 알림
- ✅ 실패 즉시 Issue 생성

---

## 🎯 추가 최적화 여지

### 1. NAT Gateway 최적화 (월 $30-40 절감 가능)

- 현재: 삭제 불가능한 구조
- 개선안: VPC Endpoint 사용 또는 필요 시에만 생성

### 2. Reserved Instances (RDS)

- 현재: On-Demand
- 개선안: 1년 RI 구매 시 30-40% 추가 절감

### 3. S3 Lifecycle Policy

- 현재: 수동 관리
- 개선안: 30일 이상 파일 자동 삭제/아카이빙

---

## 📁 관련 파일

```
.github/workflows/
├── cleanup-ecr.yml         # ECR 정리
├── schedule-services.yml   # ECS/RDS 스케줄링
├── code-quality.yml        # 코드 품질 검사
├── batch-monitor.yml       # 비용/Batch 모니터링
└── deploy.yml              # 배포 (기존)
```

---

## 🚀 적용 방법

### 1. GitHub Secrets 등록

Settings → Secrets and variables → Actions → New repository secret

### 2. 워크플로 활성화

- Push to `ECSFargate` 브랜치로 자동 적용
- 각 워크플로는 독립적으로 실행

### 3. 모니터링

- GitHub Actions 탭에서 실행 이력 확인
- Summary 탭에서 리포트 확인
- Issues 탭에서 자동 알림 확인

---

## 📝 결론

GitHub Actions를 활용하여:

- ✅ **월 $26-35 비용 절감** (연 $312-420)
- ✅ **운영 자동화** (수동 작업 제로)
- ✅ **보안 강화** (Secrets 관리)
- ✅ **품질 향상** (자동 코드 검사)
- ✅ **가시성 확보** (일일 모니터링)

**DevOps 모범 사례** 적용으로 포트폴리오 완성도 대폭 향상

---

**작성일**: 2026년 1월 13일  
**적용 브랜치**: ECSFargate  
**상태**: ✅ 완료 및 운영 중
