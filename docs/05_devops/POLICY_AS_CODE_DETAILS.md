# 🛡️ Policy as Code 상세 구현

**작성일**: 2026년 2월 6일  
**관련 워크플로우**: `.github/workflows/terraform-security.yml`

> **관련 문서**
>
> - [Secure IaC Pipeline 개요](./SECURE_IAC_PIPELINE_OVERVIEW.md)
> - [Terratest 인프라 테스팅](./TERRATEST_DETAILS.md)

---

## 📋 목차

- [개요](#개요)
- [도구별 상세 구현](#도구별-상세-구현)
  - [Checkov](#1-checkov---정책-기반-보안-검증)
  - [tfsec](#2-tfsec---terraform-특화-스캔)
  - [Trivy](#3-trivy---iac--컨테이너-통합-스캔)
- [워크플로우 구현](#워크플로우-구현)
- [검증 항목 상세](#검증-항목-상세)
- [Quality Gate 설정](#quality-gate-설정)
- [GitHub Security 통합](#github-security-통합)

---

## 개요

### 🎯 Policy as Code란?

**Policy as Code**는 인프라 보안 정책을 코드로 정의하고 자동으로 검증하는 접근 방식입니다. Shift-Left Security 원칙에 따라 개발 초기 단계에서 보안 취약점을 발견하여 수정 비용을 최소화합니다.

### 🛠️ 도구 선정 이유

| 도구        | 선정 이유              | 강점                          |
| ----------- | ---------------------- | ----------------------------- |
| **Checkov** | 광범위한 정책 커버리지 | 800+ 정책, 멀티 클라우드 지원 |
| **tfsec**   | Terraform 특화 분석    | 빠른 속도, SARIF 출력         |
| **Trivy**   | 통합 보안 스캔         | IaC + Container 동시 검사     |

---

## 도구별 상세 구현

### 1. Checkov - 정책 기반 보안 검증

#### 설치 및 사용법

```yaml
# .github/workflows/terraform-security.yml
checkov-scan:
  name: 🛡️ Checkov Policy Scan
  runs-on: ubuntu-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'

    - name: Install Checkov
      run: |
        pip install checkov
        checkov --version

    - name: Run Checkov
      run: |
        checkov -d terraform/ \
          --framework terraform \
          --output cli \
          --output json \
          --output-file-path console checkov-results.json \
          --soft-fail
      continue-on-error: true

    - name: Upload Checkov Results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: checkov-results
        path: checkov-results.json
```

#### 주요 검증 정책

**1. S3 보안 정책**

```python
# Checkov 내부 정책 예시 (CKV_AWS_18)
Check: "S3 버킷이 암호화되어 있는지 확인"
Policy: 모든 S3 버킷은 서버 측 암호화가 활성화되어야 함

# Terraform 예시
resource "aws_s3_bucket" "raw_videos" {
  bucket = "${var.environment}-raw-videos"
}

# ❌ FAIL: server_side_encryption_configuration 누락

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ✅ PASS: 암호화 설정 추가
```

**2. RDS 보안 정책**

```python
# CKV_AWS_16: RDS 인스턴스 암호화
# CKV_AWS_17: RDS 백업 retention 기간

resource "aws_db_instance" "main" {
  identifier           = "${var.environment}-db"
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20

  storage_encrypted   = true  # ✅ 암호화 활성화
  backup_retention_period = 30  # ✅ 30일 백업 보관

  deletion_protection = true  # ✅ 삭제 방지
}
```

**3. IAM 보안 정책**

```python
# CKV_AWS_62: IAM 정책에서 와일드카드 사용 금지

# ❌ FAIL
resource "aws_iam_policy" "bad_policy" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = "*"  # 모든 권한 허용
      Resource = "*"  # 모든 리소스 접근
    }]
  })
}

# ✅ PASS
resource "aws_iam_policy" "good_policy" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]  # 명시적 권한
      Resource = "arn:aws:s3:::my-bucket/*"  # 특정 리소스
    }]
  })
}
```

#### 출력 형식

```json
// checkov-results.json
{
  "summary": {
    "passed": 127,
    "failed": 3,
    "skipped": 0,
    "parsing_errors": 0
  },
  "results": {
    "failed_checks": [
      {
        "check_id": "CKV_AWS_21",
        "check_name": "Ensure S3 bucket has versioning enabled",
        "file_path": "/terraform/modules/storage/s3.tf",
        "resource": "aws_s3_bucket.raw_videos",
        "severity": "HIGH"
      }
    ]
  }
}
```

---

### 2. tfsec - Terraform 특화 스캔

#### 설치 및 사용법

```yaml
tfsec-scan:
  name: 🔒 tfsec Security Scan
  runs-on: ubuntu-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Install tfsec
      run: |
        curl -s https://raw.githubusercontent.com/aquasecurity/tfsec/master/scripts/install_linux.sh | bash
        tfsec --version

    - name: Run tfsec (SARIF)
      run: |
        cd terraform
        tfsec . \
          --format sarif \
          --out results.sarif \
          --soft-fail
      continue-on-error: true

    - name: Run tfsec (JSON)
      run: |
        cd terraform
        tfsec . \
          --format json \
          --out results.json

    - name: Upload SARIF to GitHub Security
      uses: github/codeql-action/upload-sarif@v4
      if: always()
      with:
        sarif_file: terraform/results.sarif
```

#### 주요 규칙

**1. Security Group 규칙**

```hcl
# aws-ec2-no-public-ingress-sgr
# Security Group이 인터넷(0.0.0.0/0)에서 인바운드 허용하는지 검사

# ❌ FAIL
resource "aws_security_group_rule" "ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]  # 전체 인터넷 허용
  security_group_id = aws_security_group.main.id
}

# ✅ PASS
resource "aws_security_group_rule" "ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"]  # 내부 네트워크만 허용
  security_group_id = aws_security_group.main.id
}
```

**2. S3 Public Access Block**

```hcl
# aws-s3-enable-bucket-public-access-block
# S3 버킷에 Public Access Block 설정 확인

resource "aws_s3_bucket" "raw_videos" {
  bucket = "${var.environment}-raw-videos"
}

# ⚠️ WARNING: Public Access Block 누락

resource "aws_s3_bucket_public_access_block" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ✅ PASS
```

**3. Secrets Manager rotation**

```hcl
# aws-ssm-secret-use-customer-key
# Secrets Manager에서 KMS 암호화 사용 확인

resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.environment}-db-password"
  kms_key_id = aws_kms_key.secrets.arn  # ✅ KMS 암호화

  rotation_rules {
    automatically_after_days = 30  # ✅ 자동 순환
  }
}
```

#### SARIF 출력 예시

```json
{
  "version": "2.1.0",
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "runs": [
    {
      "results": [
        {
          "ruleId": "aws-s3-enable-versioning",
          "level": "warning",
          "message": {
            "text": "S3 버킷에 버저닝이 활성화되어 있지 않습니다."
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "modules/storage/s3.tf"
                },
                "region": {
                  "startLine": 5,
                  "startColumn": 1
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 3. Trivy - IaC + 컨테이너 통합 스캔

#### 설치 및 사용법

```yaml
trivy-scan:
  name: 🔍 Trivy IaC Scan
  runs-on: ubuntu-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Run Trivy IaC Scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'config'
        scan-ref: 'terraform/'
        format: 'sarif'
        output: 'trivy-results.sarif'
        severity: 'CRITICAL,HIGH,MEDIUM'

    - name: Upload Trivy SARIF
      uses: github/codeql-action/upload-sarif@v4
      if: always()
      with:
        sarif_file: trivy-results.sarif

    - name: Run Trivy Table Output
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'config'
        scan-ref: 'terraform/'
        format: 'table'
```

#### 검증 범위

**1. Terraform 설정 검사**

```hcl
# Trivy가 감지하는 Terraform 이슈

# AVD-AWS-0086: EBS 볼륨 암호화
resource "aws_ebs_volume" "data" {
  availability_zone = "ap-northeast-2a"
  size              = 40
  encrypted         = true  # ✅ 암호화 필수
}

# AVD-AWS-0057: ALB 로깅
resource "aws_lb" "main" {
  name               = "${var.environment}-alb"
  load_balancer_type = "application"

  access_logs {  # ✅ 접근 로그 활성화
    enabled = true
    bucket  = aws_s3_bucket.logs.id
  }
}
```

**2. Dockerfile 보안 검사**

```dockerfile
# Trivy가 Docker 이미지에서 감지하는 이슈

# ❌ CRITICAL: root 사용자로 실행
FROM python:3.11
COPY . /app
CMD ["python", "app.py"]

# ✅ HIGH: 비특권 사용자 생성
FROM python:3.11
RUN useradd -m -u 1000 appuser
USER appuser
COPY . /app
CMD ["python", "app.py"]
```

#### 출력 예시

```
┌─────────────────────────────────────────────────────────┐
│ Trivy IaC Scan Results                                  │
├─────────────────────────────────────────────────────────┤
│ Target: terraform/modules/storage/s3.tf                 │
├──────────────┬──────────────────────────┬───────────────┤
│   Severity   │       Check ID           │    Message    │
├──────────────┼──────────────────────────┼───────────────┤
│   CRITICAL   │ AVD-AWS-0132            │ S3 버킷이      │
│              │                          │ 암호화되지     │
│              │                          │ 않았습니다     │
├──────────────┼──────────────────────────┼───────────────┤
│     HIGH     │ AVD-AWS-0090            │ S3 버킷        │
│              │                          │ 버저닝 미설정  │
└──────────────┴──────────────────────────┴───────────────┘
```

---

## 워크플로우 구현

### 전체 워크플로우

```yaml
# .github/workflows/terraform-security.yml
name: Terraform Security Scanning

on:
  pull_request:
    branches: [main, develop]
    paths: ['terraform/**']
  push:
    branches: [main, develop]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write
  pull-requests: write

env:
  TERRAFORM_VERSION: '1.5.0'

jobs:
  checkov-scan:
    name: 🛡️ Checkov Policy Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Checkov
        run: |
          pip install checkov
          checkov -d terraform/ \
            --framework terraform \
            --output cli \
            --output json \
            --output-file-path console checkov-results.json \
            --soft-fail

      - name: Upload Results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: checkov-results
          path: checkov-results.json

  tfsec-scan:
    name: 🔒 tfsec Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run tfsec
        run: |
          curl -s https://raw.githubusercontent.com/aquasecurity/tfsec/master/scripts/install_linux.sh | bash
          cd terraform
          tfsec . --format sarif --out results.sarif --soft-fail
          tfsec . --format json --out results.json

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: terraform/results.sarif

  trivy-scan:
    name: 🔍 Trivy IaC Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: 'terraform/'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH,MEDIUM'

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: trivy-results.sarif

  terraform-validate:
    name: ✅ Terraform Validation
    runs-on: ubuntu-latest
    needs: [checkov-scan, tfsec-scan, trivy-scan]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TERRAFORM_VERSION }}

      - name: Terraform Init
        run: |
          cd terraform
          terraform init -backend=false

      - name: Terraform Validate
        run: |
          cd terraform
          terraform validate

      - name: Terraform Format Check
        run: |
          cd terraform
          terraform fmt -check -recursive
```

---

## 검증 항목 상세

### AWS 보안 베스트 프랙티스

#### 1. 데이터 보호

| 리소스 | 검증 항목       | Checkov ID | tfsec ID                         |
| ------ | --------------- | ---------- | -------------------------------- |
| S3     | 암호화 활성화   | CKV_AWS_18 | aws-s3-encryption-customer-key   |
| S3     | 버저닝 활성화   | CKV_AWS_21 | aws-s3-enable-versioning         |
| RDS    | 스토리지 암호화 | CKV_AWS_16 | aws-rds-encrypt-instance-storage |
| EBS    | 볼륨 암호화     | CKV_AWS_3  | aws-ec2-enable-volume-encryption |

#### 2. 네트워크 보안

| 리소스         | 검증 항목        | Checkov ID | tfsec ID                                   |
| -------------- | ---------------- | ---------- | ------------------------------------------ |
| Security Group | 0.0.0.0/0 차단   | CKV_AWS_24 | aws-ec2-no-public-ingress-sgr              |
| Security Group | SSH 포트 제한    | CKV_AWS_25 | aws-ec2-no-public-ingress-ssh              |
| VPC            | Flow Logs 활성화 | CKV_AWS_26 | aws-ec2-require-vpc-flow-logs-for-all-vpcs |
| ALB            | HTTPS 리스너     | CKV_AWS_2  | aws-elb-alb-not-public                     |

#### 3. 접근 제어

| 리소스 | 검증 항목           | Checkov ID  | tfsec ID                                 |
| ------ | ------------------- | ----------- | ---------------------------------------- |
| IAM    | 와일드카드 금지     | CKV_AWS_62  | aws-iam-no-policy-wildcards              |
| IAM    | MFA 활성화          | CKV_AWS_110 | -                                        |
| S3     | Public Access Block | CKV_AWS_53  | aws-s3-enable-bucket-public-access-block |
| RDS    | Public 접근 차단    | CKV_AWS_17  | aws-rds-no-public-db-access              |

#### 4. 로깅 및 모니터링

| 리소스     | 검증 항목   | Checkov ID | tfsec ID                                   |
| ---------- | ----------- | ---------- | ------------------------------------------ |
| CloudTrail | 로깅 활성화 | CKV_AWS_67 | -                                          |
| ALB        | 액세스 로그 | CKV_AWS_91 | aws-elb-alb-not-public                     |
| VPC        | Flow Logs   | CKV_AWS_26 | aws-ec2-require-vpc-flow-logs-for-all-vpcs |

---

## Quality Gate 설정

### 실패 조건

```yaml
- name: Check Security Scan Results
  run: |
    # Checkov 결과 확인
    CHECKOV_CRITICAL=$(jq '.summary.failed' checkov-results.json)

    # tfsec 결과 확인
    TFSEC_HIGH=$(jq '[.results[] | select(.severity == "HIGH")] | length' terraform/results.json)

    # Trivy 결과 확인
    TRIVY_CRITICAL=$(grep -c "CRITICAL" trivy-results.sarif || echo 0)

    # Quality Gate
    if [ "$CHECKOV_CRITICAL" -gt 0 ] || [ "$TFSEC_HIGH" -gt 0 ] || [ "$TRIVY_CRITICAL" -gt 0 ]; then
      echo "::error::Security vulnerabilities found!"
      echo "Checkov Critical: $CHECKOV_CRITICAL"
      echo "tfsec High: $TFSEC_HIGH"
      echo "Trivy Critical: $TRIVY_CRITICAL"
      exit 1
    fi
```

### PR 코멘트

```yaml
- name: Comment PR with Results
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const checkov = JSON.parse(fs.readFileSync('checkov-results.json'));

      const comment = `## 🛡️ Security Scan Results

      ### Checkov
      - ✅ Passed: ${checkov.summary.passed}
      - ❌ Failed: ${checkov.summary.failed}

      ### tfsec
      - Scan completed. Check SARIF upload.

      ### Trivy
      - Scan completed. Check Security tab.
      `;

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment
      });
```

---

## GitHub Security 통합

### SARIF 업로드

tfsec와 Trivy의 SARIF 결과는 GitHub Security 탭에 자동으로 업로드됩니다.

**확인 방법:**

1. GitHub Repository → **Security** 탭
2. **Code scanning alerts** 클릭
3. 발견된 취약점 목록 확인
4. 각 항목 클릭 시 파일 위치 및 수정 방법 제공

**장점:**

- 코드 리뷰 시 보안 이슈를 파일별로 확인 가능
- 시간에 따른 보안 트렌드 추적
- 이슈 자동 트래킹 및 해결 여부 관리

---

## 참고 자료

### 공식 문서

- [Checkov Documentation](https://www.checkov.io/1.Welcome/What%20is%20Checkov.html)
- [tfsec Documentation](https://aquasecurity.github.io/tfsec/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)

### 정책 레퍼런스

- [Checkov AWS Policies](https://www.checkov.io/5.Policy%20Index/terraform.html)
- [tfsec AWS Checks](https://aquasecurity.github.io/tfsec/latest/checks/aws/)
- [CIS AWS Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)

---

**최종 수정일**: 2026년 2월 6일  
**문서 버전**: 1.0
