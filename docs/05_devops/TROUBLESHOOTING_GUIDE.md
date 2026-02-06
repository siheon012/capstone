# 🔧 트러블슈팅 가이드

**작성일**: 2026년 2월 6일  
**프로젝트**: Secure IaC Pipeline

> **관련 문서**
>
> - [Secure IaC Pipeline 개요](./SECURE_IAC_PIPELINE_OVERVIEW.md)
> - [Policy as Code 상세](./POLICY_AS_CODE_DETAILS.md)
> - [Terratest 상세](./TERRATEST_DETAILS.md)

---

## 📋 목차

- [Packer 이슈](#packer-이슈)
- [Terraform 이슈](#terraform-이슈)
- [Terratest 이슈](#terratest-이슈)
- [GitHub Actions 이슈](#github-actions-이슈)
- [향후 개선 계획](#향후-개선-계획)

---

## Packer 이슈

### 🐛 Issue 1: SSH Timeout

#### 증상

```
==> amazon-ebs.gpu_ami: Waiting for SSH to become available...
==> amazon-ebs.gpu_ami: Timeout waiting for SSH.
Build 'amazon-ebs.gpu_ami' errored after 5 minutes 12 seconds: Timeout waiting for SSH.
```

#### 발생 환경

- OS: Windows 11
- Packer 버전: 1.15.0
- 설정: `ssh_agent_auth = true` 사용

#### 원인 분석

Windows 환경에서 `ssh_agent_auth` 옵션이 제대로 동작하지 않음. Packer는 임시 키페어를 생성하여 EC2 인스턴스에 접속하는데, `ssh_agent_auth`와 `ssh_keypair_name`을 동시에 사용할 경우 충돌 발생.

**근본 원인:**

```hcl
# 문제가 되는 설정
source "amazon-ebs" "gpu_ami" {
  ssh_keypair_name = "capstone-dev-key"  # 기존 키페어 지정
  ssh_agent_auth   = true                # SSH Agent 사용 시도
}
```

Windows에서 SSH Agent가 제대로 구성되지 않은 상태에서 위 설정을 사용하면, Packer가 키를 찾지 못해 타임아웃 발생.

#### 해결 방법

**Option 1: ssh 관련 설정 완전 제거 (권장)**

```hcl
# packer/aws-gpu-ami.pkr.hcl
source "amazon-ebs" "gpu_ami" {
  ami_name      = "capstone-gpu-batch-processor-${local.timestamp}"
  instance_type = "g5.xlarge"
  region        = "ap-northeast-2"

  # ssh_keypair_name, ssh_agent_auth 제거
  # Packer가 임시 키페어 자동 생성

  source_ami_filter {
    filters = {
      name = "amzn2-ami-ecs-gpu-hvm-*"
    }
    owners      = ["amazon"]
    most_recent = true
  }
}
```

**Option 2: SSH 키 직접 지정**

```hcl
source "amazon-ebs" "gpu_ami" {
  ssh_keypair_name = "capstone-dev-key"
  ssh_private_key_file = "C:/Users/YourName/.ssh/capstone-dev-key.pem"
  # ssh_agent_auth 제거
}
```

#### 검증

```bash
# 빌드 실행
cd packer
packer build aws-gpu-ami.pkr.hcl

# 예상 출력
==> amazon-ebs.gpu_ami: Creating temporary keypair: packer_675a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c
==> amazon-ebs.gpu_ami: Waiting for SSH to become available...
==> amazon-ebs.gpu_ami: Connected to SSH!
```

**결과**: 빌드 성공률 0% → 100%

---

### 🐛 Issue 2: ECR Authentication Failed

#### 증상

```
Step 3/5 : RUN docker pull 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:latest
Error response from daemon: pull access denied for 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor, repository does not exist or may require 'docker login'
```

#### 발생 시점

Packer 빌드 중 Docker 이미지를 ECR에서 다운로드하는 provisioner 단계

#### 원인 분석

Packer가 생성한 EC2 인스턴스의 IAM Instance Profile에 ECR 접근 권한이 없음.

**권한 확인:**

```bash
# EC2 인스턴스에서 실행
aws ecr get-login-password --region ap-northeast-2
# 출력: An error occurred (AccessDeniedException) when calling the GetAuthorizationToken operation
```

#### 해결 방법

**Step 1: IAM Role에 ECR 권한 추가**

```hcl
# terraform/modules/iam/main.tf
resource "aws_iam_role" "batch_instance_role" {
  name = "${var.environment}-batch-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

# ECR 읽기 권한 추가
resource "aws_iam_role_policy_attachment" "batch_instance_ecr_read" {
  role       = aws_iam_role.batch_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Instance Profile 생성
resource "aws_iam_instance_profile" "batch_instance_profile" {
  name = "${var.environment}-batch-instance-profile"
  role = aws_iam_role.batch_instance_role.name
}
```

**Step 2: Packer에서 Instance Profile 사용**

```hcl
# packer/aws-gpu-ami.pkr.hcl
source "amazon-ebs" "gpu_ami" {
  ami_name      = "capstone-gpu-batch-processor-${local.timestamp}"
  instance_type = "g5.xlarge"
  region        = "ap-northeast-2"

  # IAM Instance Profile 지정
  iam_instance_profile = "capstone-dev-batch-instance-profile"

  source_ami_filter {
    # ...
  }
}
```

**Step 3: Terraform 배포 후 Packer 빌드**

```bash
# 1. Terraform으로 IAM 리소스 생성
cd terraform
terraform apply -target=module.iam

# 2. Packer 빌드
cd ../packer
packer build aws-gpu-ami.pkr.hcl
```

#### 검증

```bash
# Packer 빌드 로그 확인
==> amazon-ebs.gpu_ami: Provisioning with shell script: /tmp/packer-shell123456789
    amazon-ebs.gpu_ami: Login Succeeded
    amazon-ebs.gpu_ami: latest: Pulling from capstone-dev-batch-processor
    amazon-ebs.gpu_ami: Status: Downloaded newer image for 287709190208...
```

**결과**: Docker 이미지 pull 성공, AMI 빌드 완료 (ami-074d96b4a13784644)

---

## Terraform 이슈

### 🐛 Issue 3: tfsec Multiple Format Error

#### 증상

```
Error: you must specify a base output filename with --out if you want to use multiple formats
Error: Process completed with exit code 1.
```

#### 발생 위치

`.github/workflows/terraform-security.yml` - tfsec 스캔 단계

#### 원인 분석

**문제가 된 코드:**

```yaml
# GitHub Actions: tfsec-action 사용
- name: tfsec
  uses: aquasecurity/tfsec-action@v1.0.0
  with:
    format: sarif,json # ❌ 여러 포맷 동시 지정 불가
    sarif_file: results.sarif
```

`tfsec-action`은 여러 출력 포맷(`sarif`, `json`)을 동시에 지원하지 않음. GitHub Action wrapper의 제약사항.

#### 해결 방법

**Option 1: tfsec CLI 직접 사용 (채택)**

```yaml
- name: Install tfsec
  run: |
    curl -s https://raw.githubusercontent.com/aquasecurity/tfsec/master/scripts/install_linux.sh | bash

- name: Run tfsec (SARIF)
  run: |
    cd terraform
    tfsec . --format sarif --out results.sarif

- name: Run tfsec (JSON)
  run: |
    cd terraform
    tfsec . --format json --out results.json

- name: Upload SARIF to GitHub Security
  uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: terraform/results.sarif
```

**Option 2: 별도 Job으로 분리**

```yaml
jobs:
  tfsec-sarif:
    steps:
      - run: tfsec . --format sarif --out results.sarif

  tfsec-json:
    steps:
      - run: tfsec . --format json --out results.json
```

#### 검증

```bash
# 로컬 테스트
cd terraform
tfsec . --format sarif --out results.sarif
tfsec . --format json --out results.json

# 파일 생성 확인
ls -lh results.*
# 출력:
# -rw-r--r-- 1 user user 15K results.sarif
# -rw-r--r-- 1 user user 12K results.json
```

**결과**: SARIF 파일이 GitHub Security 탭에 정상 업로드

---

## Terratest 이슈

### 🐛 Issue 4: Variable Mismatch

#### 증상

```
Error: Value for undeclared variable

  on ../../terraform/modules/network/main.tf line 1:
   1: variable "availability_zones" {

The root module does not declare a variable named "availability_zones" but a
value was provided for it.

Error: No value for required variable

  on ../../terraform/modules/network/variables.tf line 10:
  10: variable "region" {

The root module input variable "region" is not set, and has no default value.
```

#### 발생 시점

Terratest 실행 시 (`go test -v -run TestNetworkModulePlan`)

#### 원인 분석

**테스트 코드의 변수:**

```go
// test/infra/network_test.go (잘못된 버전)
Vars: map[string]interface{}{
    "environment":       "test",
    "vpc_cidr":          "10.99.0.0/16",
    "availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"}, // ❌ 존재하지 않는 변수
}
```

**실제 모듈 variables.tf:**

```hcl
# terraform/modules/network/variables.tf
variable "environment" {
  type = string
}

variable "region" {  # ✅ 필수 변수
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# availability_zones 변수는 없음!
```

#### 해결 방법

**Step 1: 모듈의 실제 변수 확인**

```bash
# variables.tf 확인
cat terraform/modules/network/variables.tf | grep "^variable"
# 출력:
# variable "environment" {
# variable "region" {
# variable "vpc_cidr" {
# variable "domain_name" {
```

**Step 2: 테스트 코드 수정**

```go
// test/infra/network_test.go (수정 후)
func TestNetworkModulePlan(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../../terraform/modules/network",
        Vars: map[string]interface{}{
            "environment": "test",
            "region":      "ap-northeast-2",  // ✅ 필수 변수 추가
            "vpc_cidr":    "10.99.0.0/16",
        },
    }

    terraform.Init(t, terraformOptions)
    planExitCode := terraform.PlanExitCode(t, terraformOptions)
    assert.Equal(t, 0, planExitCode)
}
```

**Step 3: 다른 모듈도 동일하게 수정**

```go
// test/infra/storage_test.go
Vars: map[string]interface{}{
    "environment":            "test",
    "vpc_id":                 "vpc-test123",
    "private_subnet_ids":     []string{"subnet-test1", "subnet-test2"},
    "rds_security_group_id": "sg-test123",
    "domain_name":            "test.example.com",
}

// test/infra/security_test.go
Vars: map[string]interface{}{
    "environment":              "test",
    "s3_raw_videos_arn":        "arn:aws:s3:::test-raw-videos",
    "s3_thumbnails_arn":        "arn:aws:s3:::test-thumbnails",
    "s3_highlights_arn":        "arn:aws:s3:::test-highlights",
    "db_password_secret_arn":   "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:test-db",
}
```

#### 교훈

**변수 동기화 체크리스트:**

1. ✅ `terraform/modules/*/variables.tf` 확인
2. ✅ 필수 변수 (`default` 없는 변수) 식별
3. ✅ 테스트 코드에서 모든 필수 변수 제공
4. ✅ 존재하지 않는 변수 제거
5. ✅ 변수 타입 일치 (string, list, map 등)

**자동화 방안:**

```bash
# 모듈 변수 자동 추출 스크립트
cat terraform/modules/network/variables.tf | \
  grep -A3 "^variable" | \
  grep -E "variable|type|default"
```

---

### 🐛 Issue 5: Go UTF-8 Encoding Error

#### 증상

```
test/infra/integration_test.go:13:2: illegal UTF-8 encoding
test/infra/storage_test.go:45:3: illegal UTF-8 encoding
test/infra/network_test.go:28:1: illegal UTF-8 encoding
```

#### 발생 환경

- OS: Windows 11
- 편집기: VS Code
- Go 버전: 1.21

#### 원인 분석

한글 주석이나 이모지가 잘못된 인코딩(UTF-8 BOM, CP949 등)으로 저장됨.

**문제 예시:**

```go
// ���� S3 ��Ŷ �׽�Ʈ ����  // ❌ 깨진 한글

// 🎯 테스트 ���� ����  // ❌ 이모지 + 깨진 한글
```

#### 해결 방법

**Option 1: 주석 제거 (빠른 해결)**

```go
// 수정 전
// ���� S3 버킷 테스트 ����
func TestStorageModule(t *testing.T) {

// 수정 후
// S3 bucket creation test
func TestStorageModule(t *testing.T) {
```

**Option 2: VS Code 인코딩 설정**

```json
// .vscode/settings.json
{
  "files.encoding": "utf8",
  "files.autoGuessEncoding": false
}
```

**Option 3: 파일 재인코딩**

```bash
# Linux/Mac
iconv -f CP949 -t UTF-8 network_test.go > network_test_utf8.go
mv network_test_utf8.go network_test.go

# Windows PowerShell
Get-Content network_test.go -Encoding Default | `
  Set-Content network_test_utf8.go -Encoding UTF8
```

#### 검증

```bash
# UTF-8 인코딩 확인
file test/infra/*.go
# 출력: test/infra/network_test.go: UTF-8 Unicode text

# Go 컴파일 확인
cd test/infra
go build ./...
# 에러 없이 성공
```

**결과**: 모든 Go 파일 컴파일 성공

---

## GitHub Actions 이슈

### 🐛 Issue 6: go.sum Missing

#### 증상

```
Error: go: no modules specified
Error: missing go.sum entry for module providing package github.com/gruntwork-io/terratest
```

#### 발생 위치

`.github/workflows/terratest.yml` - `go mod download` 단계

#### 원인 분석

**문제 워크플로우:**

```yaml
- name: Download Go modules
  working-directory: test # ❌ 잘못된 경로
  run: |
    go mod download
```

`test/` 디렉토리에는 `go.mod`가 없음. 실제 위치는 `test/infra/`.

#### 해결 방법

**Step 1: 경로 수정**

```yaml
- name: Download Go modules
  working-directory: test/infra # ✅ 올바른 경로
  run: |
    go mod download
    go mod tidy  # go.sum 자동 생성
```

**Step 2: go.sum 커밋**

```bash
cd test/infra
go mod tidy
git add go.mod go.sum
git commit -m "chore: add go.sum for Terratest"
```

**Step 3: Cache 설정 (선택)**

```yaml
- name: Setup Go
  uses: actions/setup-go@v5
  with:
    go-version: '1.21'
    cache: true
    cache-dependency-path: test/infra/go.sum
```

---

## 향후 개선 계획

### 🚀 Phase 1: 보안 강화 (Q2 2026)

#### 1. Custom Checkov Policies

```yaml
# custom-policies/s3-kms-encryption.yaml
metadata:
  name: 'Ensure S3 uses KMS encryption'
  id: 'CUSTOM_S3_001'
  severity: 'HIGH'

definition:
  and:
    - cond_type: 'attribute'
      resource_types: ['aws_s3_bucket_server_side_encryption_configuration']
      attribute: 'rule.apply_server_side_encryption_by_default.sse_algorithm'
      operator: 'equals'
      value: 'aws:kms'
```

#### 2. OPA (Open Policy Agent) 통합

```rego
# policies/terraform.rego
package terraform.analysis

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  resource.change.after.instance_type == "t2.micro"
  input.variables.environment == "production"

  msg := "t2.micro instances are not allowed in production"
}
```

### 🔬 Phase 2: 테스팅 고도화 (Q3 2026)

#### 1. Chaos Engineering

```go
// test/chaos/network_failure_test.go
func TestNetworkLatency(t *testing.T) {
    // Simulate 200ms network latency
    chaos.InjectNetworkLatency(t, "200ms")

    // Test if application handles delay gracefully
    response := callAPI(t, apiEndpoint)
    assert.LessThan(t, response.Duration, 5*time.Second)
}
```

#### 2. Load Testing

```python
# test/load/batch_job_test.py
from locust import User, task, between

class BatchJobUser(User):
    wait_time = between(1, 3)

    @task
    def submit_video_analysis(self):
        self.client.post("/api/videos", json={
            "video_url": "s3://bucket/video.mp4"
        })
```

### 💡 Phase 3: 자동화 확장 (Q4 2026)

#### 1. Drift Detection

```yaml
# .github/workflows/drift-detection.yml
name: Daily Drift Detection

on:
  schedule:
    - cron: '0 0 * * *' # 매일 자정

jobs:
  detect-drift:
    steps:
      - run: terraform plan -detailed-exitcode

      - name: Alert if drift detected
        if: failure()
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -d '{"text":"Infrastructure drift detected!"}'
```

#### 2. Cost Estimation

```yaml
- name: Run Infracost
  uses: infracost/actions/setup@v2

- name: Generate cost estimate
  run: |
    infracost breakdown \
      --path terraform/ \
      --format json \
      --out-file infracost.json

- name: Comment PR with cost
  run: |
    infracost comment github \
      --path infracost.json \
      --github-token ${{ secrets.GITHUB_TOKEN }}
```

---

## 📚 참고 자료

### 디버깅 도구

- [Packer Debug Mode](https://developer.hashicorp.com/packer/docs/debugging)
- [Terraform Debug Logging](https://developer.hashicorp.com/terraform/internals/debugging)
- [Go Test Verbose](https://pkg.go.dev/testing#hdr-Verbose_output)

### 베스트 프랙티스

- [Terratest Best Practices](https://terratest.gruntwork.io/docs/testing-best-practices/)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)

---

**최종 수정일**: 2026년 2월 6일  
**문서 버전**: 1.0
