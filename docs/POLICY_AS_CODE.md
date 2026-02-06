# Policy as Code - 보안 및 거버넌스 자동화

이 문서는 프로젝트에 통합된 **Policy as Code** 도구들과 사용 방법을 설명합니다.

## 📋 개요

### Policy as Code란?

인프라 코드(IaC)에 대한 **보안, 규정 준수, 베스트 프랙티스**를 자동으로 검증하는 접근 방식입니다. 코드 배포 전에 잠재적 보안 문제를 차단하여 사고를 예방합니다.

### 프로젝트 적용 현황

```
┌─────────────────────────────────────────────────────────┐
│           기존 검증 프로세스                              │
├─────────────────────────────────────────────────────────┤
│ ✅ Infracost      → 비용 영향 분석                       │
│ ✅ Bedrock AI     → Terraform Plan 논리 검토             │
│ ✅ Bandit         → Python 코드 보안 스캔                │
│ ✅ Trivy          → Docker 이미지 취약점 스캔            │
└─────────────────────────────────────────────────────────┘
                         ⬇️  추가
┌─────────────────────────────────────────────────────────┐
│           새로운 Policy as Code 계층                     │
├─────────────────────────────────────────────────────────┤
│ 🆕 Checkov        → 포괄적 IaC 보안 & 규정 준수          │
│ 🆕 tfsec          → Terraform 특화 보안 검사             │
│ 🆕 Terraform Fmt  → 코드 스타일 & 문법 검증             │
└─────────────────────────────────────────────────────────┘
```

## 🛡️ 도구 소개

### 1. Checkov

**종합 보안 & 규정 준수 스캐너**

- **지원 범위**: Terraform, CloudFormation, Kubernetes, Dockerfile, Secrets
- **체크 항목**: 1,000+ 내장 정책
- **특징**:
  - CIS Benchmarks 준수 검증
  - GDPR, HIPAA, PCI-DSS 규정 준수
  - Custom policy 지원

**검사하는 내용:**

- ✅ S3 버킷 암호화 활성화
- ✅ Public access 차단 확인
- ✅ IAM 정책 최소 권한 원칙
- ✅ 보안 그룹 과도한 오픈 포트
- ✅ 로깅 및 모니터링 설정
- ✅ 데이터 백업 및 복구 설정

### 2. tfsec

**Terraform 전문 보안 스캐너**

- **지원 범위**: Terraform 전용
- **체크 항목**: 500+ AWS/Azure/GCP 보안 규칙
- **특징**:
  - 빠른 스캔 속도
  - 명확한 수정 가이드
  - 심각도 분류 (CRITICAL, HIGH, MEDIUM, LOW)

**검사하는 내용:**

- ✅ 전송 중/저장 중 암호화
- ✅ 네트워크 노출 위험
- ✅ 리소스 태깅 규칙
- ✅ AWS 서비스별 보안 설정

### 3. Terraform Validate

**문법 & 구성 검증**

- ✅ HCL 문법 오류
- ✅ 리소스 참조 오류
- ✅ 변수 의존성 검증
- ✅ 모듈 구성 확인

## 🚀 사용 방법

### GitHub Actions 자동 실행

PR 생성 또는 코드 푸시 시 자동으로 실행됩니다.

#### 1. 독립 보안 워크플로우 (권장)

```yaml
# .github/workflows/terraform-security.yml
# Terraform 또는 Packer 파일 변경 시 자동 실행
```

**트리거 조건:**

- `terraform/**` 또는 `packer/**` 파일 변경
- Pull Request 생성
- `workflow_dispatch` (수동 실행)

#### 2. 기존 Terraform CI 통합

```yaml
# .github/workflows/terraform.yml
# Terraform Plan 전에 보안 검사 실행
```

**실행 순서:**

1. 🛡️ Checkov 보안 스캔
2. 🔒 tfsec 보안 스캔
3. 📝 Terraform Format & Init
4. 📊 Terraform Plan
5. 🤖 Bedrock AI 분석

### 로컬 실행

#### Checkov 로컬 실행

```bash
# 설치
pip install checkov

# Terraform 전체 스캔
checkov -d terraform/

# 특정 모듈만 스캔
checkov -d terraform/modules/storage/

# 심각도 필터링 (CRITICAL, HIGH만)
checkov -d terraform/ --check CRITICAL,HIGH

# 결과를 JSON으로 저장
checkov -d terraform/ --output json --output-file checkov-results.json

# 특정 체크 스킵
checkov -d terraform/ --skip-check CKV_AWS_18,CKV_AWS_35
```

#### tfsec 로컬 실행

```bash
# 설치 (Windows)
choco install tfsec

# 또는 (Linux/Mac)
brew install tfsec

# Terraform 스캔
cd terraform
tfsec .

# 심각도 필터링
tfsec . --minimum-severity HIGH

# JSON 결과
tfsec . --format json > tfsec-results.json

# 특정 체크 제외
tfsec . --exclude aws-s3-enable-bucket-logging
```

#### Terraform Validate

```bash
cd terraform
terraform init -backend=false
terraform validate
terraform fmt -check -recursive
```

## 📊 결과 해석

### GitHub PR 댓글 예시

```markdown
## 🛡️ Checkov Security Scan Results

### 📊 Summary

| Status     |   Count | Percentage |
| ---------- | ------: | ---------: |
| ✅ Passed  |     145 |      85.3% |
| ❌ Failed  |      20 |      11.8% |
| ⏭️ Skipped |       5 |       2.9% |
| **Total**  | **170** |   **100%** |

### ⚠️ Failed Checks by Severity

| Severity    | Count |
| ----------- | ----: |
| 🔴 CRITICAL |     2 |
| 🟠 HIGH     |     8 |
| 🟡 MEDIUM   |     7 |
| 🟢 LOW      |     3 |

### 🔝 Top Security Issues

#### 1. 🔴 S3 bucket does not have encryption enabled

- **File**: `terraform/modules/storage/s3.tf:25`
- **Severity**: CRITICAL
- **Guideline**: Enable server-side encryption for S3 buckets
```

### Security Tab 확인

GitHub Repository → **Security** → **Code scanning** → 결과 확인

- **Bandit**: Python 코드 보안 이슈
- **Trivy**: Docker 이미지 취약점
- **tfsec**: Terraform 보안 이슈

## ⚙️ 설정 커스터마이징

### Checkov 설정 (.checkov.yml)

```yaml
# 프로젝트 루트의 .checkov.yml
skip-check:
  - CKV_AWS_18 # S3 access logging (개발 환경)
  - CKV_AWS_35 # VPC flow logs (개발 환경)

compact: true
framework:
  - terraform
  - secrets
```

### tfsec 설정 (.tfsec.yml)

```yaml
# 프로젝트 루트의 .tfsec.yml
minimum_severity: MEDIUM

exclude:
  - aws-s3-enable-bucket-logging
  - aws-ec2-require-vpc-flow-logs-for-all-vpcs

exclude_paths:
  - terraform/.terraform/**
  - terraform/old_version/**
```

### 코드 내 예외 처리

특정 리소스만 체크 스킵:

```hcl
# Checkov 예외
resource "aws_s3_bucket" "public_website" {
  #checkov:skip=CKV_AWS_20:Public website bucket requires public access
  bucket = "my-public-website"
}

# tfsec 예외
resource "aws_security_group" "debug" {
  #tfsec:ignore:aws-vpc-no-public-ingress-sgr
  # 개발 환경에서만 사용하는 임시 보안 그룹
  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

## 🔧 CI/CD 통합

### 필수 조건 없음!

이미 구현되어 있습니다. 다음만 확인하세요:

1. ✅ `.github/workflows/terraform-security.yml` 존재
2. ✅ `.checkov.yml` 설정 검토
3. ✅ `.tfsec.yml` 설정 검토
4. ✅ GitHub Actions 활성화

### 워크플로우 활성화

현재는 비활성화 상태 (`on: []`)입니다. 활성화하려면:

```yaml
# .github/workflows/terraform-security.yml
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'terraform/**'
      - 'packer/**'
  push:
    branches: [main, develop]
```

## 📈 보안 개선 프로세스

### 1. 이슈 발견

PR 생성 → Checkov/tfsec 실행 → 보안 이슈 발견

### 2. 검토 및 조치

**Option A: 수정**

```bash
# 이슈 확인
checkov -d terraform/modules/storage/ --check CKV_AWS_19

# 코드 수정
# terraform/modules/storage/s3.tf 에서 encryption 추가

# 재검증
checkov -d terraform/modules/storage/
```

**Option B: 예외 처리 (정당한 사유가 있을 때)**

```yaml
# .checkov.yml에 추가
skip-check:
  - CKV_AWS_19 # 사유: 개발 환경에서는 불필요
```

또는 코드에 주석:

```hcl
resource "aws_s3_bucket" "temp" {
  #checkov:skip=CKV_AWS_19:Temporary bucket for testing
  bucket = "test-bucket"
}
```

### 3. 승인 및 병합

✅ 모든 보안 체크 통과 → PR 승인 → Merge

## 🎯 실전 예제

### 시나리오 1: S3 버킷 암호화 누락

**Checkov 경고:**

```
Check: CKV_AWS_19: "Ensure all data stored in the S3 bucket is encrypted"
File: /terraform/modules/storage/s3.tf:10-15
Guide: https://docs.bridgecrew.io/docs/s3_14-data-encrypted-at-rest
```

**수정:**

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "new_bucket" {
  bucket = aws_s3_bucket.new_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

### 시나리오 2: 보안 그룹 과도한 오픈

**tfsec 경고:**

```
Problem: Security group allows ingress from 0.0.0.0/0 to port 22
Severity: CRITICAL
Resource: aws_security_group.backend
```

**수정:**

```hcl
# 변경 전
ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # ❌ 위험!
}

# 변경 후
ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]  # ✅ VPC 내부만
}
```

## 📚 참고 자료

### 공식 문서

- [Checkov Documentation](https://www.checkov.io/1.Welcome/What%20is%20Checkov.html)
- [tfsec Documentation](https://aquasecurity.github.io/tfsec/)
- [Terraform Security Best Practices](https://www.terraform.io/docs/cloud/guides/recommended-practices/index.html)

### 내장 정책 리스트

- [Checkov AWS Policies](https://www.checkov.io/5.Policy%20Index/terraform.html)
- [tfsec AWS Checks](https://aquasecurity.github.io/tfsec/latest/checks/aws/)

### CIS Benchmarks

- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)

## 🐛 트러블슈팅

### Checkov 너무 많은 False Positive

```yaml
# .checkov.yml에서 조정
skip-check:
  - CKV_AWS_XXX # 해당 체크 스킵

# 또는 심각도 필터링
check:
  - CRITICAL
  - HIGH
```

### tfsec 외부 모듈 스캔 오류

```yaml
# .tfsec.yml
exclude_paths:
  - **/.terraform/**
  - **/modules/external/**
```

### CI/CD 시간 너무 오래 걸림

```yaml
# terraform-security.yml
# Checkov compact mode
checkov -d terraform/ --compact --quiet

# tfsec 병렬 실행 비활성화
tfsec . --concise-output
```

## 💡 Best Practices

1. **점진적 적용**: 처음부터 모든 체크를 강제하지 말고 CRITICAL/HIGH부터 시작
2. **예외 문서화**: skip한 체크는 반드시 주석으로 사유 명시
3. **정기 리뷰**: 월 1회 skip된 체크들을 재검토
4. **교육**: 팀원들에게 자주 발생하는 보안 이슈 공유
5. **자동화**: 로컬 pre-commit hook에 Checkov 추가

## 📝 라이선스

이 설정은 프로젝트 루트의 라이선스를 따릅니다.
