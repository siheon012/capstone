# 🏗️ 인프라 안정화: Terraform Backend 도입 (S3 + DynamoDB)

**작업 일자**: 2026년 1월 16일  
**담당자**: DeepSentinel Team  
**상태**: ✅ 완료

---

## 📋 목차

- [1. 배경 및 문제 정의](#1-배경-및-문제-정의)
- [2. 목표](#2-목표)
- [3. 기술적 구현](#3-기술적-구현)
- [4. 결과 및 기대 효과](#4-결과-및-기대-효과)
- [5. 향후 계획](#5-향후-계획)

---

## 1. 배경 및 문제 정의 (Why we did it)

### 기존 문제점

기존에는 Terraform의 상태 파일(`terraform.tfstate`)을 **로컬 환경**(개발자 개인 노트북)에서 관리하고 있었습니다. 이로 인해 다음과 같은 **치명적인 위험 요소**가 존재했습니다.

#### 🚨 주요 리스크

1. **데이터 유실 위험**
   - 노트북 고장이나 실수로 파일 삭제 시, 실제 AWS 인프라와 상태 정보의 연결이 끊김
   - 복구가 불가능한 상태(Orphaned Resources)가 될 위험
   - 인프라는 AWS에 존재하지만, Terraform으로 관리할 수 없는 상태 발생

2. **협업 불가능**
   - GitHub Actions와 같은 CI/CD 도구가 현재 인프라 상태를 알 수 없음
   - 다른 팀원이 인프라를 수정할 경우 상태 파일 동기화 불가
   - "내 컴퓨터에서만 동작하는" 인프라 관리

3. **동시성 문제 (Concurrency)**
   - 두 명 이상의 작업자(또는 프로세스)가 동시에 인프라를 수정할 경우
   - 상태 파일이 덮어씌워지거나 깨지는 충돌(Conflict) 발생 가능성
   - Race Condition으로 인한 인프라 손상 위험

### 실제 발생 가능한 시나리오

```
개발자 A: terraform apply (EC2 인스턴스 추가)
개발자 B: terraform apply (RDS 수정)
  ↓
결과: 마지막 작업자의 상태 파일만 남고, 한 명의 변경사항은 유실
```

---

## 2. 목표 (Objective)

### 🎯 "Single Source of Truth (단일 진실 공급원)" 확보

1. **중앙 집중식 상태 관리**
   - 인프라 상태를 안전한 원격 저장소(Remote State)에서 중앙 관리
   - 모든 팀원과 CI/CD 파이프라인이 동일한 상태 정보 참조

2. **동시성 제어**
   - 인프라 수정 시 잠금(Locking) 기능을 통해 동시 실행으로 인한 사고 방지
   - "Acquiring state lock" 메커니즘으로 안전한 배포 보장

3. **CI/CD 파이프라인 준비**
   - 향후 GitHub Actions 구축을 위한 필수 기반 마련
   - 자동화된 인프라 배포 및 검증 가능

4. **재해 복구 (Disaster Recovery)**
   - S3 버저닝을 통한 상태 파일 버전 관리
   - 실수로 삭제하거나 손상된 경우에도 이전 버전으로 복구 가능

---

## 3. 기술적 구현 (Implementation)

### A. 아키텍처 구성

```
┌─────────────────────────────────────────────────────────────────┐
│                     Terraform Backend Architecture               │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  개발자 / CI/CD  │
│  terraform init  │
│  terraform apply │
└────────┬─────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   AWS Remote Backend                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐      ┌──────────────────────────┐    │
│  │   S3 Bucket         │      │   DynamoDB Table         │    │
│  │   (State Storage)   │      │   (State Locking)        │    │
│  ├─────────────────────┤      ├──────────────────────────┤    │
│  │ Bucket Name:        │      │ Table Name:              │    │
│  │ capstone-dev-       │      │ terraform-state-lock     │    │
│  │ terraform-state-    │      │                          │    │
│  │ backup              │      │ Partition Key: LockID    │    │
│  │                     │      │ Billing: On-Demand       │    │
│  │ Key Path:           │      │                          │    │
│  │ backend_state/      │      │ Purpose:                 │    │
│  │ terraform.tfstate   │      │ - Prevent concurrent     │    │
│  │                     │      │   modifications          │    │
│  │ Features:           │      │ - Store lock metadata    │    │
│  │ ✓ Encryption (AES)  │      │ - Auto-release on error  │    │
│  │ ✓ Versioning        │      │                          │    │
│  │ ✓ Durability 99.9%  │      │                          │    │
│  └─────────────────────┘      └──────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 1. **State Storage (S3)**

- **역할**: `terraform.tfstate` 파일을 저장하는 내구성 높은 저장소
- **특징**:
  - 암호화(Encryption) 적용으로 보안 강화
  - 버저닝(Versioning) 활성화로 실수로 삭제 시 복구 가능
  - 99.999999999% (11 nines) 내구성 보장

#### 2. **State Locking (DynamoDB)**

- **역할**: `terraform plan/apply` 실행 시 `LockID`를 기록하여 다른 프로세스의 접근을 차단하는 자물쇠 역할
- **특징**:
  - 온디맨드(On-Demand) 요금제로 비용 최적화
  - 자동 잠금 해제(Auto-release) 기능
  - 동시성 충돌 원천 차단

---

### B. 적용 코드

#### `terraform/main.tf`

```hcl
terraform {
  backend "s3" {
    bucket         = "capstone-dev-terraform-state-backup"  # 상태 파일 저장소
    key            = "backend_state/terraform.tfstate"      # 저장 경로
    region         = "ap-northeast-2"
    encrypt        = true                                   # 보안을 위한 암호화 적용
    dynamodb_table = "terraform-state-lock"                 # 잠금 테이블 (LockID)
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

---

### C. 작업 절차

#### 1단계: DynamoDB 테이블 생성

```bash
# AWS CLI로 DynamoDB 테이블 생성
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2
```

**파티션 키**: `LockID` (String)  
**요금제**: On-Demand (사용한 만큼 지불)

#### 2단계: S3 버킷 생성 및 설정

```bash
# S3 버킷 생성 (이미 terraform으로 생성되어 있음)
# capstone-dev-terraform-state-backup

# 버저닝 활성화
aws s3api put-bucket-versioning \
  --bucket capstone-dev-terraform-state-backup \
  --versioning-configuration Status=Enabled

# 암호화 설정
aws s3api put-bucket-encryption \
  --bucket capstone-dev-terraform-state-backup \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

#### 3단계: Backend 설정 추가

`terraform/main.tf`에 backend 블록 추가 (위의 코드 참조)

#### 4단계: 마이그레이션 수행

```powershell
cd terraform

# Backend 초기화 및 상태 파일 마이그레이션
terraform init -migrate-state

# 출력 예시:
# Initializing the backend...
# Do you want to copy existing state to the new backend?
#   Pre-existing state was found while migrating the previous "local" backend to the
#   newly configured "s3" backend. No existing state was found in the newly
#   configured "s3" backend. Do you want to copy this state to the new "s3"
#   backend? Enter "yes" to copy and "no" to start with an empty state.
#
#   Enter a value: yes ✅
#
# Successfully configured the backend "s3"! Terraform will automatically
# use this backend unless the backend configuration changes.
```

#### 5단계: 검증

```powershell
# 상태 파일이 S3에 올라갔는지 확인
aws s3 ls s3://capstone-dev-terraform-state-backup/backend_state/

# 출력 예시:
# 2026-01-16 14:23:45      12345 terraform.tfstate

# DynamoDB 테이블 확인
aws dynamodb describe-table --table-name terraform-state-lock
```

#### 6단계: 보안 처리

`.gitignore`에 상태 파일 패턴 추가:

```gitignore
# Terraform 상태 파일 (민감 정보 포함)
*.tfstate
*.tfstate.*
*.tfstate.backup
.terraform/
.terraform.lock.hcl
terraform.tfvars  # 민감한 변수값
```

---

### D. 동작 원리 (How it works)

#### Locking 메커니즘

```
개발자 A: terraform apply
  ↓
1️⃣ DynamoDB에 LockID 생성
   └─ LockID: "capstone-dev-terraform-state-backup/backend_state/terraform.tfstate-md5"
   └─ Info: "개발자 A의 세션 정보"
   └─ Timestamp: 2026-01-16T14:30:00Z
  ↓
2️⃣ S3에서 상태 파일 다운로드
  ↓
3️⃣ 인프라 변경 작업 수행
  ↓
4️⃣ S3에 상태 파일 업로드
  ↓
5️⃣ DynamoDB에서 LockID 삭제 (잠금 해제)

---

개발자 B: terraform apply (동시 실행 시도)
  ↓
❌ DynamoDB에 LockID가 이미 존재
  ↓
Error: Error acquiring the state lock
Lock Info:
  ID:        capstone-dev-terraform-state-backup/backend_state/terraform.tfstate-md5
  Path:      capstone-dev-terraform-state-backup/backend_state/terraform.tfstate
  Operation: OperationTypeApply
  Who:       개발자 A@DESKTOP-ABC123
  Version:   1.6.0
  Created:   2026-01-16 14:30:00.123456789 +0000 UTC
  Info:

Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
flag, but this is not recommended.
```

---

## 4. 결과 및 기대 효과 (Results & Benefits)

### ✅ 달성된 목표

#### 1. **안정성 확보 (Stability)**

- ✅ 로컬 환경에 의존하지 않게 되어, 컴퓨터가 변경되거나 고장 나도 언제든 `terraform init`으로 인프라 제어권을 복구할 수 있음
- ✅ S3의 11 nines 내구성으로 상태 파일 영구 보존
- ✅ 버저닝을 통한 롤백 가능

```powershell
# 새로운 환경에서 복구하는 방법
git clone <repository>
cd terraform
terraform init  # ← S3에서 자동으로 상태 파일 다운로드
terraform plan  # ← 현재 인프라 상태 확인 가능
```

#### 2. **동시성 제어 (Concurrency Control)**

- ✅ "Acquiring state lock" 메커니즘이 작동하여, 중복 배포나 상태 덮어쓰기 사고를 원천 차단
- ✅ 여러 명의 개발자가 협업 시 충돌 방지
- ✅ CI/CD 파이프라인과 수동 작업 간 충돌 방지

#### 3. **CI/CD 준비 완료 (Automation Ready)**

- ✅ GitHub Actions와 같은 외부 시스템이 S3에 접근하여 인프라를 자동으로 검사하고 배포할 수 있는 환경 완성
- ✅ OIDC 인증을 통한 안전한 CI/CD 구성 가능
- ✅ Pull Request 시 `terraform plan` 자동 실행 준비 완료

#### 4. **협업 개선 (Collaboration)**

- ✅ 모든 팀원이 동일한 상태 정보를 기반으로 작업
- ✅ 상태 파일 공유를 위한 수동 작업 불필요
- ✅ 투명한 인프라 변경 이력 관리

#### 5. **비용 최적화**

- ✅ DynamoDB On-Demand 모드로 사용하지 않을 때 비용 $0
- ✅ S3 Standard-IA 전환 정책 적용 가능 (30일 후)
- ✅ 예상 월 비용: $0.01 미만 (상태 파일 1개 기준)

---

### 📊 마이그레이션 전/후 비교

| 항목                 | 마이그레이션 전 (Local)       | 마이그레이션 후 (S3 + DynamoDB) |
| -------------------- | ----------------------------- | ------------------------------- |
| **상태 파일 위치**   | 개발자 노트북                 | S3 (중앙 저장소)                |
| **데이터 유실 위험** | ⚠️ 높음 (로컬 파일 삭제/손상) | ✅ 낮음 (11 nines 내구성)       |
| **버전 관리**        | ❌ 없음                       | ✅ S3 버저닝                    |
| **동시성 제어**      | ❌ 없음 (충돌 가능)           | ✅ DynamoDB Locking             |
| **협업 가능 여부**   | ❌ 불가 (상태 공유 어려움)    | ✅ 가능 (중앙 저장소)           |
| **CI/CD 통합**       | ❌ 불가                       | ✅ 가능 (GitHub Actions)        |
| **재해 복구**        | ❌ 어려움                     | ✅ 이전 버전 복구 가능          |
| **보안**             | ⚠️ 로컬 파일 노출 위험        | ✅ 암호화 + IAM 권한 관리       |
| **비용**             | $0                            | ~$0.01/월 (거의 무료)           |
| **운영 부담**        | ⚠️ 높음 (수동 백업 필요)      | ✅ 낮음 (자동 백업)             |

---

### 🔒 보안 개선 사항

1. **암호화**
   - S3 서버 사이드 암호화 (AES-256)
   - 전송 중 암호화 (TLS/HTTPS)

2. **접근 제어**
   - IAM 정책 기반 접근 제어
   - S3 버킷 퍼블릭 액세스 차단
   - DynamoDB 테이블 IAM 권한 제한

3. **감사 추적**
   - CloudTrail 로그로 모든 API 호출 기록
   - S3 버전 이력으로 변경 추적 가능

---

## 5. 향후 계획 (Next Steps)

### A. CI/CD 파이프라인 구축

```yaml
# .github/workflows/terraform.yml (예정)
name: Terraform CI/CD

on:
  pull_request:
    paths:
      - 'terraform/**'
  push:
    branches:
      - main
    paths:
      - 'terraform/**'

jobs:
  terraform-plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT_ID:role/GitHubActions-Terraform
          aws-region: ap-northeast-2

      - name: Terraform Init
        run: |
          cd terraform
          terraform init

      - name: Terraform Plan
        run: |
          cd terraform
          terraform plan -out=tfplan

      - name: Comment PR
        uses: actions/github-script@v6
        with:
          script: |
            # terraform plan 결과를 PR 코멘트로 추가
```

### B. 상태 파일 관리 자동화

- [ ] S3 Lifecycle Policy 설정 (오래된 버전 자동 삭제)
- [ ] CloudWatch Alarm 설정 (상태 파일 변경 알림)
- [ ] 정기 백업 스크립트 작성

### C. 다중 환경 지원

```hcl
# 환경별 백엔드 분리
# terraform/backend-dev.hcl
bucket = "capstone-dev-terraform-state-backup"
key    = "dev/terraform.tfstate"

# terraform/backend-prod.hcl
bucket = "capstone-prod-terraform-state-backup"
key    = "prod/terraform.tfstate"

# 사용법:
# terraform init -backend-config=backend-dev.hcl
```

### D. 모니터링 강화

- [ ] Terraform Cloud 도입 검토 (무료 티어)
- [ ] Drift Detection 자동화
- [ ] Cost 모니터링 대시보드 구축

---

## 6. 트러블슈팅 (Troubleshooting)

### 문제 1: Lock이 걸려서 terraform apply를 실행할 수 없음

**증상**:

```
Error: Error acquiring the state lock
```

**해결 방법**:

```powershell
# 1. 다른 작업이 진행 중인지 확인
# 2. 비정상 종료로 인한 Lock인 경우 수동 해제
terraform force-unlock <LOCK_ID>

# 예시:
# terraform force-unlock capstone-dev-terraform-state-backup/backend_state/terraform.tfstate-md5
```

### 문제 2: S3에서 상태 파일을 찾을 수 없음

**증상**:

```
Error loading state: NoSuchKey: The specified key does not exist
```

**해결 방법**:

```powershell
# 1. S3 버킷과 키 경로 확인
aws s3 ls s3://capstone-dev-terraform-state-backup/backend_state/

# 2. Backend 설정 확인
cat terraform/main.tf | grep -A 5 "backend"

# 3. 초기 상태인 경우 새로 생성
terraform init
terraform apply
```

### 문제 3: 버전 충돌

**증상**:

```
Error: state snapshot was created by Terraform v1.7.0, which is newer than current v1.6.0
```

**해결 방법**:

```powershell
# Terraform 버전 업데이트
choco upgrade terraform

# 또는
terraform version  # 현재 버전 확인
# Terraform 공식 사이트에서 최신 버전 다운로드
```

---

## 7. 참고 자료 (References)

### 공식 문서

- [Terraform Backend Configuration](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [AWS S3 Bucket Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [DynamoDB for Terraform State Locking](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/getting-started.html)

### 관련 문서

- `docs/AWS_BATCH_SQS_GUIDE.md`: AWS 인프라 배포 가이드
- `docs/SQS_BATCH_DEPLOYMENT.md`: SQS + Batch 배포 절차
- `terraform/README.md`: Terraform 프로젝트 구조

---

## 8. 체크리스트 (Checklist)

### 완료된 작업

- [x] DynamoDB 테이블 생성 (`terraform-state-lock`)
- [x] S3 버킷 버저닝 활성화
- [x] S3 버킷 암호화 설정
- [x] `main.tf`에 backend 블록 추가
- [x] `terraform init -migrate-state` 실행
- [x] 로컬 상태 파일 → S3 마이그레이션 완료
- [x] `.gitignore`에 상태 파일 패턴 추가
- [x] 마이그레이션 검증 (S3, DynamoDB 확인)

### 향후 작업

- [ ] GitHub Actions OIDC 설정
- [ ] Terraform Plan PR 코멘트 자동화
- [ ] CloudWatch Alarm 설정
- [ ] S3 Lifecycle Policy 설정 (90일 후 Glacier 전환)
- [ ] 다중 환경 백엔드 분리 (dev/staging/prod)

---

## 9. 결론 (Conclusion)

Terraform Backend를 S3 + DynamoDB로 마이그레이션함으로써, **인프라 관리의 안정성과 협업 효율성이 크게 향상**되었습니다.

특히 다음과 같은 **핵심 가치**를 달성했습니다:

1. **단일 진실 공급원 (Single Source of Truth)**: 모든 팀원과 자동화 도구가 동일한 상태를 참조
2. **재해 복구 능력**: 로컬 환경 손실 시에도 즉시 복구 가능
3. **자동화 준비 완료**: CI/CD 파이프라인 구축을 위한 필수 인프라 확보

이제 **GitHub Actions를 통한 자동화된 인프라 배포**를 구현할 준비가 완료되었습니다. 🚀

---

**작성자**: DeepSentinel Team  
**마지막 업데이트**: 2026년 1월 16일  
**문서 버전**: 1.0
