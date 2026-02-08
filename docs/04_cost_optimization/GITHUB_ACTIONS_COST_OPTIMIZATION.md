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

### GitHub Actions 워크플로 6종 구축

#### 1️⃣ **infracost.yml** - Terraform 비용 사전 예측 ⭐ NEW

```yaml
실행: Terraform 관련 PR 생성 시 자동
기능:
  - 인프라 변경 전/후 비용 비교
  - PR에 자동으로 비용 차이 코멘트
  - 비용 증가 시 사전 경고
  - Infracost API 활용
```

**FinOps 핵심 기능**:

- 💰 인프라 변경 시 **비용 영향 사전 분석**
- 📊 월간 예상 비용 자동 계산
- ⚠️ 예상치 못한 비용 증가 방지
- 🔍 리소스별 비용 분해 (ECS, RDS, NAT Gateway 등)

**작동 원리**:

```
1. PR에서 Terraform 변경 감지
2. 현재 main 브랜치 비용 계산 (baseline)
3. PR 변경사항 적용 시 비용 계산 (diff)
4. 비용 차이를 PR 댓글로 자동 게시

예시 출력:
┌─────────────────────────────────────────┐
│ Monthly cost change for capstone/main   │
├─────────────────────────────────────────┤
│ +$45.60 (+32%)                          │
│                                         │
│ Name             Baseline   Diff        │
│ ├─ ECS Fargate   $30       +$15        │
│ ├─ RDS t4g.micro $15       +$0         │
│ └─ NAT Gateway   $32       +$30.60     │
└─────────────────────────────────────────┘
```

**필수 설정**:

- GitHub Secret: `INFRACOST_API_KEY` (https://www.infracost.io 가입 후 발급)
- Infracost 무료 티어: 월 1만 요청 무료

**절감 효과**: 사전 예방으로 비용 폭탄 방지 (무형 가치)

**실제 사용 예시**:

![Infracost 사용 예시](../assets/github_actions/infracost%20usage.png)

---

#### 2️⃣ **terraform.yml** - Terraform CI + AI 분석 ⭐ NEW

```yaml
실행: Terraform PR 생성 시
기능:
  - Terraform fmt, init, plan 자동 실행
  - Plan 결과를 Bedrock Claude로 분석
  - 한국어로 변경사항 요약 및 리스크 평가
  - GitHub Issue 자동 생성
```

**AI 기반 코드 리뷰**:

- 🤖 Bedrock Claude Haiku가 Terraform Plan 분석
- 📝 한국어로 명확한 변경사항 설명
- ⚠️ 리소스 삭제(destroy) 강력 경고
- 💡 구체적인 해결 방법 제시

**비용 최적화 기여**:

- Plan 실패 시 즉시 원인 파악 → 시간 절약
- 불필요한 리소스 변경 사전 감지
- Infrastructure as Code 품질 향상

---

#### 3️⃣ **cleanup-ecr.yml** - ECR 이미지 자동 정리

```yaml
실행: 매주 일요일 03:00 KST
기능:
  - Untagged 이미지 삭제
  - 최신 10개만 보관, 나머지 삭제
  - Frontend, Backend, Batch 저장소 모두 정리
```

**절감 효과**: 월 $2-5

---

#### 4️⃣ **schedule-services.yml** - ECS/RDS 스케줄링 ⭐ 개선

```yaml
실행:
  - 매일 23:45 KST → 서비스 중지 (STOP)
  - 매일 18:15 KST → 서비스 시작 (START)
  - 매주 토요일 10:00 KST → RDS 7일 자동시작 방지 (CYCLE)

관리 대상:
  - ECS Frontend Service (Desired Count: 1 → 0)
  - ECS Backend Service (Desired Count: 1 → 0)
  - RDS PostgreSQL (available → stopped)
```

**개선된 기능** ⭐:

- ✅ **Cron 식별 정확도 개선**: UTC 시간대 혼동 완전 해결
- ✅ **RDS 7일 강제 시작 방지**: AWS가 7일 이상 중지 시 자동으로 켜는 것 방지
- ✅ **수동 제어 지원**: `workflow_dispatch`로 즉시 시작/중지 가능
- ✅ **상태 확인 기능**: 현재 서비스 상태 조회

**CYCLE 작동 원리**:

```bash
# 매주 토요일 실행 (최대 70% 절감)

---

#### 5S가 "최근에 사용함"으로 인식 → 7일 카운터 리셋
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

#### 6️⃣ **batch-monitor.yml** - AWS 모니터링 & 비용 추적 ⭐ 강화

```yaml
실행:
  - 매일 09:00 KST: 일일 리포트
  - 매주 월요일 10:00 KST: 주간 리포트

모니터링 항목:
  - AWS Batch 작업 실패 감지
  - 최근 7일 Batch 작업 통계
  - **일일/월간 비용 리포트** ⭐
  - **서비스별 비용 분해** ⭐
  - **비용 임계값 초과 감지** ⭐
```

\*\*강화된 Fin ⭐:

- **GitHub Actions Summary**: 실행 페이지에서 바로 확인

  ```markdown
  📊 AWS Monitoring Report
  | Metric | Value |
  |--------|-------|
  | ✅ Batch Success | 15 |
  | ❌ Batch Failed | 2 |
  | 💰 Daily Cost | $4.23 |
  | 💳 Monthly Cost | $44.50 |
  ```

- **Issue 자동 생성**:
  - Batch 실패 시: `🚨 Batch Job Failed: 2 jobs` (aws, batch, alert 라벨)
  - 비용 초과 시: `🚨 Budget Exceeded Alert` (aws, cost, critical 라벨)
  - 이메일 알림 자동 전송

**Cost Explorer 리전** ⭐:

```yaml
aws-region: us-east-1 # Cost Explorer는 us-east-1에서만 작동
```

> ⚠️ 주의: 다른 리전에서는 Cost Explorer API가 작동하지 않음

- AWS Cost Explorer API 활용
- 일일 비용: 최근 7일 트렌드
- 월간 비용: 서비스별 분해 (ECS, RDS, S3, Batch 등)

````

2. **비용 임계값 알림**
```yaml
조건:
  - 일일 비용 > $5.00
  - 월간 비용 > $100.00

액션:
  - GitHub Issue 자동 생성
  - 'cost', 'critical' 라벨 자동 태그
  - 이메일 알림 (GitHub 설정 기준)
````

3.  **서비스별 비용 분해**
    ```
    📊 Monthly Cost Breakdown:
    - ECS Fargate:    $18.50 (42%)
    - RDS:            $12.30 (28%)
    - NAT Gateway:    $8.20  (19%)
    - AWS Batch:      $3.40  (8%)
    - Others:         $1.60  (3%)
    Total:            $44.00
    ```
          | 최적화 전  | 최적화 후  | 절감액       |
    | ------------------- | ---------- | ---------- | ------------ |
    | ECS Fargate | $30-40 | $12-18 | **$18-22** ⭐ |
    | RDS t4g.micro | $15-20 | $5-8 | **$10-12** ⭐ |
    | ECR Storage | $5-10 | $2-3 | **$3-7** |
    | NAT Gateway | $32 | $32 | $0 (불가피) |
    | AWS Batch | $10-15 | $8-12 | **$2-3** |
    | **총계 (NAT 포함)** | **$92-117** | **$59-73** | **$33-44** ⭐ |
    | **총계 (NAT 제외)** | **$60-85** | **$27-41** | **$33-44** ⭐ |

### 절감율

- **NAT Gateway 포함**: 약 **35-38% 절감**
- **NAT Gateway 제외**: 약 **50-55% 절감** ✅

### 연간 절감액

**$396-528/년** (NAT Gateway 포함)  
**월 평균 $38 절감 → 연 $456 절감** ⭐

### 비용 추적 정확도 개선

**기존 (수동 확인)**:

- 월 1-2회 AWS Console 접속
- 비용 급증 감지: 1-2주 지연
- 서비스별 분해: 수동 계산

**현재 (자동화)**:

- 매일 자동 리포트
- 비용 초과 즉시 알림 (Issue 자동 생성)
- 서비스별 비용 자동 분해
- 7일 트렌드 분석 Issue 생성 + 이메일 알림

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
- `ECR_Infracost 활용 확대 ⭐ NEW

**현재 상태**: PR에서만 비용 예측  
**개선 가능**:

- Scheduled 실행으로 주간 비용 리포트
- Slack/Discord 연동으로 실시간 알림
- 비용 임계값 자동 설정

### 2. FinOps 대시보드 구축 ⭐ NEW

**목표**: 모든 비용 데이터를 한눈에  
**구현 방법**:

```
GitHub Actions → Cost Data 수집
              ↓
         S3 저장
              ↓
    CloudWatch Dashboard 또는
    Grafana로 시각화
```

### 3. FRONTEND_REPO`

- `ECR\_
  - VPC Endpoint 사용 (S3, ECR, CloudWatch)
  - 필요 시에만 생성하는 Terraform 모듈화
  - Public Subnet에서 작업 실행 (보안 검토 필요)

### 4S_CLUSTER`

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
- **주의**: 프로젝트 종료 시기 고려 필요

### 5. S3 Lifecycle Policy ⭐ 개선 필요

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
- 개선안:Terraform으로 일부 관리
- 개선안:
  - 30일 이상 파일 자동 Glacier 이동
  - 90일 이상 파일 자동 삭제
  - CloudWatch 메트릭으로 스토리지 추적

### 6. Spot Instances for Batch ⭐ NEW

**현재**: On-Demand GPU 인스턴스 (g5.xlarge)  
**개선안**: Spot Instances 사용 시 70% 절감  
**리스크**: 작업 중단 가능성 (Checkpointing으로 완화)

---infracost.yml # ⭐ Terraform 비용 예측
├── terraform.yml # ⭐ Terraform CI + AI 분석
├── cleanup-ecr.yml # ECR 정리
├── schedule-services.yml # ⭐ ECS/RDS 스케줄링 (개선)
├── code-quality.yml # 코드 품질 검사
├── batch-monitor.yml # ⭐ 비용/Batch 모니터링 (강화)
└── deploy.yml # 배포 (기존)

````

**⭐ 표시는 최신 개선 사항**
| 레벨 | 설명 | 상태 |
|------|------|------| ⭐ 업데이트

Settings → Secrets and variables → Actions → New repository secret

**필수 Secrets**:
```yaml
# AWS 인증
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION

# ECR
EC**GitHub Actions 탭**: 실행 이력 확인
- **Summary 탭**: 일일/주간 리포트 확인 ⭐
- **Issues 탭**: 자동 알림 확인 (Batch 실패, 비용 초과)
- **PR 댓글**: Infracost 비용 예측 확인 ⭐

### 4. Infracost 설정 ⭐ NEW

```bash
# 1. Infracost 가입
https://www.infracost.io → Sign up (GitHub 연동)

# 2. API Key 발급
Dashboard → Settings → API Keys → Generate

# 3. GitHub Secrets에 등록
INFRACOST_API_KEY = <발급받은 키>

# 4. PR 생성 시 자동으로 비용 예측 댓글 달림
````

**Infracost 사용 화면**:

![Infracost 사용 예시](../assets/github_actions/infracost%20usage.png)

# ECS

ECS_CLUSTER
ECS_FRONTEND_SERVICE
ECS_BACKEND_SERVICE

# RDS

RDS_INSTANCE_ID

# Batch

BATCH_JOB_QUEUE

# Infracost ⭐ NEW

INFRACOST_API_KEY # https://www.infracost.io 가입 후 발급

```
| Level 2 | 자동 리포트 | ✅ |
| Level 3 | 실시간 알림 + 자동화 | ✅ **현재** |
| Level 4 | 예측 + AI 기반 최적화 | 🔄 진행 중 (Infracost) |
| Level 5 | 완전 자율화 | ⏳ 향후 계획 |

### Level 4 도달을 위한 다음 단계

1. ✅ Infr33-44 비용 절감** (연 $396-528) ⭐
- ✅ **운영 자동화** (수동 작업 제로)
- ✅ **보안 강화** (Secrets 관리)
- ✅ **품질 향상** (자동 코드 검사)
- ✅ **가시성 확보** (일일 모니터링 + 실시간 알림) ⭐
- ✅ **FinOps 성숙도 Level 3 달성** ⭐
- ✅ **비용 예측 및 사전 예방** (Infracost) ⭐
- ✅ **AI 기반 인프라 분석** (Bedrock Claude) ⭐

**DevOps + FinOps 모범 사례** 적용으로 포트폴리오 완성도 대폭 향상

### 핵심 성과 지표

| 지표 | 개선 전 | 개선 후 | 개선율 |
|------|---------|---------|--------|
| **월간 비용** | $92-117 | $59-73 | **-35%** |
| **비용 가시성** | 월 1-2회 확인 | 매일 자동 | **30배** |
| **알림 속도** | 1-2주 지연 | 즉시 (< 1시간) | **336배** |
| **수동 작업** | 일 2-3회 | 0회 | **100%** |
| **인프라 변경 리스크** | 사후 발견 | 사전 예방 | **무형** |

---

**작성일**: 2026년 1월 13일
**최종 업데이트**: 2026년 1월 22일 ⭐
**적용 브랜치**: ECSFargate, develop, main
**상태**: ✅ 완료 및 운영 중
**FinOps 성숙도**: Level 3 (Optimized) ✅
```

.github/workflows/
├── cleanup-ecr.yml # ECR 정리
├── schedule-services.yml # ECS/RDS 스케줄링
├── code-quality.yml # 코드 품질 검사
├── batch-monitor.yml # 비용/Batch 모니터링
└── deploy.yml # 배포 (기존)

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
**상태**: ✅ 완료 및 운영 중
```
