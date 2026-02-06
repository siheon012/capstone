# 🧪 Terratest 인프라 테스팅 상세

**작성일**: 2026년 2월 6일  
**관련 워크플로우**: `.github/workflows/terratest.yml`  
**테스트 코드**: `test/infra/*.go`

> **관련 문서**
>
> - [Secure IaC Pipeline 개요](./SECURE_IAC_PIPELINE_OVERVIEW.md)
> - [Policy as Code 상세 구현](./POLICY_AS_CODE_DETAILS.md)

---

## 📋 목차

- [Terratest란](#terratest란)
- [3-Tier Testing 전략](#3-tier-testing-전략)
- [테스트 코드 상세](#테스트-코드-상세)
  - [Validation Tests](#tier-1-validation-tests)
  - [Unit Tests](#tier-2-unit-tests)
  - [Integration Tests](#tier-3-integration-tests)
- [워크플로우 구현](#워크플로우-구현)
- [실행 및 디버깅](#실행-및-디버깅)

---

## Terratest란

### 🎯 개요

**Terratest**는 Gruntwork에서 개발한 **Go 기반 인프라 테스팅 프레임워크**입니다. Terraform, Packer, Docker, Kubernetes 등 다양한 인프라 도구를 실제 환경에서 자동으로 테스트할 수 있습니다.

### 왜 Terratest인가?

| 기존 방식                             | Terratest                             |
| ------------------------------------- | ------------------------------------- |
| `terraform plan` 결과를 육안으로 확인 | 자동화된 Go 테스트로 검증             |
| 배포 후 수동으로 리소스 확인          | 실제 AWS API 호출하여 자동 검증       |
| 롤백 시 수동으로 리소스 삭제          | `defer terraform.Destroy()` 자동 정리 |
| 테스트 환경 불일치                    | 실제 AWS 환경에서 재현 가능한 테스트  |

### 주요 기능

1. **실제 인프라 배포**: AWS, Azure, GCP에서 리소스를 실제로 생성
2. **자동 검증**: Output 값, 리소스 속성, API 응답 자동 확인
3. **자동 정리**: 테스트 후 `terraform destroy` 자동 실행
4. **병렬 실행**: `t.Parallel()` 로 테스트 속도 향상
5. **재시도 로직**: 일시적 네트워크 오류 자동 재시도

---

## 3-Tier Testing 전략

### 비용 효율적인 테스트 설계

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1: Validation (무료)                               │
│ - terraform fmt, validate, plan                         │
│ - 실행: PR마다 자동                                      │
│ - 시간: ~5분                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Tier 2: Unit Tests (~$0.50)                            │
│ - 모듈별 리소스 실제 생성                                │
│ - 실행: 수동 트리거                                      │
│ - 시간: ~25분                                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Tier 3: Integration Tests (~$1-2)                      │
│ - 전체 스택 통합 테스트                                  │
│ - 실행: 릴리스 전 수동                                   │
│ - 시간: ~45분                                            │
└─────────────────────────────────────────────────────────┘
```

### Tier 비교

| Tier       | 목적           | 리소스 생성     | 비용   | 실행 빈도        |
| ---------- | -------------- | --------------- | ------ | ---------------- |
| **Tier 1** | 문법/포맷 검증 | ❌              | $0     | PR마다 (자동)    |
| **Tier 2** | 모듈 단위 검증 | ✅ VPC, S3, IAM | ~$0.50 | 주 1-2회 (수동)  |
| **Tier 3** | 전체 통합 검증 | ✅ 전체 인프라  | ~$1-2  | 릴리스 전 (수동) |

---

## 테스트 코드 상세

### 환경 설정

```go
// test/infra/go.mod
module github.com/deepsentinel/capstone/test/infra

go 1.21

require (
    github.com/gruntwork-io/terratest v0.46.8
    github.com/stretchr/testify v1.8.4
)
```

---

### Tier 1: Validation Tests

#### 1. Terraform Format 검사

```go
// test/infra/module_test.go
package test

import (
    "testing"

    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestTerraformFormatting(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../../terraform",
    }

    // terraform init
    terraform.Init(t, terraformOptions)

    // terraform fmt -check -recursive
    output, err := terraform.RunTerraformCommandE(
        t,
        terraformOptions,
        "fmt",
        "-check",
        "-recursive",
    )

    assert.NoError(t, err, "All Terraform files should be formatted")
    assert.Empty(t, output, "No formatting changes required")
}
```

**검증 내용:**

- 모든 `.tf` 파일이 `terraform fmt` 규칙 준수
- 들여쓰기, 공백, 정렬 일관성 확인

---

#### 2. Terraform Validate 검사

```go
func TestTerraformValidation(t *testing.T) {
    t.Parallel()

    modulePaths := []string{
        "../../terraform/modules/network",
        "../../terraform/modules/storage",
        "../../terraform/modules/security",
        "../../terraform/modules/pipeline",
    }

    for _, modulePath := range modulePaths {
        t.Run(modulePath, func(t *testing.T) {
            terraformOptions := &terraform.Options{
                TerraformDir: modulePath,
                BackendConfig: map[string]interface{}{}, // 로컬 백엔드 사용
            }

            terraform.Init(t, terraformOptions)
            terraform.Validate(t, terraformOptions)
        })
    }
}
```

**검증 내용:**

- HCL 문법 오류 없음
- 리소스 타입 유효성
- 변수 참조 정합성

---

#### 3. Network Module Plan 테스트

```go
// test/infra/network_test.go
func TestNetworkModulePlan(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../../terraform/modules/network",
        Vars: map[string]interface{}{
            "environment": "test",
            "region":      "ap-northeast-2",
            "vpc_cidr":    "10.99.0.0/16",
        },
        BackendConfig: map[string]interface{}{},
        NoColor:       true,
    }

    terraform.Init(t, terraformOptions)

    // Plan 실행 성공 여부 확인 (리소스 생성 안 함)
    planExitCode := terraform.PlanExitCode(t, terraformOptions)

    assert.Equal(t, 0, planExitCode, "Terraform plan should succeed")
}
```

**검증 내용:**

- Plan 생성 성공 (AWS API 호환성)
- 변수 전달 정상
- 리소스 의존성 올바름

---

#### 4. Idempotency 테스트

```go
// test/infra/integration_test.go
func TestPlanIdempotency(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../../terraform/modules/network",
        Vars: map[string]interface{}{
            "environment": "test",
            "region":      "ap-northeast-2",
        },
    }

    terraform.Init(t, terraformOptions)

    // 첫 번째 Plan
    terraform.Plan(t, terraformOptions)

    // 두 번째 Plan (변경사항 없어야 함)
    planExitCode := terraform.PlanExitCode(t, terraformOptions)

    assert.Equal(t, 0, planExitCode, "Plan should have no changes on second run")
}
```

**검증 내용:**

- 동일 코드 재실행 시 변경사항 없음
- 안전한 재배포 가능

---

### Tier 2: Unit Tests

#### 1. Network Module 테스트

```go
func TestNetworkModule(t *testing.T) {
    t.Parallel()

    if testing.Short() {
        t.Skip("Skipping integration test in short mode")
    }

    awsRegion := "ap-northeast-2"

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../../terraform/modules/network",
        Vars: map[string]interface{}{
            "environment": "test",
            "region":      awsRegion,
            "vpc_cidr":    "10.99.0.0/16",
        },
        BackendConfig: map[string]interface{}{},
        NoColor:       true,
    })

    // 테스트 종료 시 자동 삭제
    defer terraform.Destroy(t, terraformOptions)

    // 실제 VPC, Subnet 생성
    terraform.InitAndApply(t, terraformOptions)

    // Output 검증
    vpcID := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcID, "VPC ID should not be empty")
    assert.Contains(t, vpcID, "vpc-", "Should be valid VPC ID format")

    // Subnet 개수 확인
    publicSubnets := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
    assert.Len(t, publicSubnets, 2, "Should have 2 public subnets")

    privateSubnets := terraform.OutputList(t, terraformOptions, "private_subnet_ids")
    assert.Len(t, privateSubnets, 2, "Should have 2 private subnets")
}
```

**실제 생성되는 리소스:**

- VPC (1개)
- Public Subnet (2개)
- Private Subnet (2개)
- Internet Gateway (1개)
- NAT Gateway (2개)
- Route Tables (4개)

**비용**: ~$0.10 (NAT Gateway 10분 실행)

---

#### 2. Storage Module 테스트

```go
// test/infra/storage_test.go
func TestStorageModule(t *testing.T) {
    t.Parallel()

    if testing.Short() {
        t.Skip("Skipping integration test")
    }

    awsRegion := "ap-northeast-2"

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../../terraform/modules/storage",
        Vars: map[string]interface{}{
            "environment":            "test",
            "vpc_id":                 "vpc-test123",
            "private_subnet_ids":     []string{"subnet-test1", "subnet-test2"},
            "rds_security_group_id": "sg-test123",
            "domain_name":            "test.example.com",
        },
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    // S3 버킷 검증
    rawBucketName := terraform.Output(t, terraformOptions, "raw_videos_bucket_name")
    assert.NotEmpty(t, rawBucketName)

    // AWS SDK로 S3 버킷 존재 확인
    aws.AssertS3BucketExists(t, awsRegion, rawBucketName)

    // S3 ARN 검증
    s3Arn := terraform.Output(t, terraformOptions, "s3_raw_videos_arn")
    assert.Contains(t, s3Arn, "arn:aws:s3:::", "Should be valid S3 ARN")
}
```

**실제 생성되는 리소스:**

- S3 Bucket (3개: raw, thumbnails, highlights)
- S3 Bucket Versioning
- S3 Bucket Encryption
- S3 Public Access Block

**비용**: ~$0.05 (S3 PUT/GET 요청)

---

#### 3. Security Module 테스트

```go
// test/infra/security_test.go
func TestIAMRoleCreation(t *testing.T) {
    t.Parallel()

    if testing.Short() {
        t.Skip("Skipping integration test")
    }

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../../terraform/modules/security",
        Vars: map[string]interface{}{
            "environment":              "test",
            "s3_raw_videos_arn":        "arn:aws:s3:::test-raw-videos",
            "s3_thumbnails_arn":        "arn:aws:s3:::test-thumbnails",
            "s3_highlights_arn":        "arn:aws:s3:::test-highlights",
            "db_password_secret_arn":   "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:test-db",
        },
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    // IAM Role ARN 검증
    ecsTaskRoleArn := terraform.Output(t, terraformOptions, "ecs_task_role_arn")
    assert.NotEmpty(t, ecsTaskRoleArn)
    assert.Contains(t, ecsTaskRoleArn, "arn:aws:iam::", "Should be valid IAM ARN")

    batchServiceRoleArn := terraform.Output(t, terraformOptions, "batch_service_role_arn")
    assert.NotEmpty(t, batchServiceRoleArn)
}
```

**실제 생성되는 리소스:**

- IAM Role (5개)
- IAM Policy (10개)
- IAM Policy Attachment (15개)

**비용**: $0 (IAM은 무료)

---

### Tier 3: Integration Tests

#### 전체 스택 통합 테스트

```go
// test/infra/integration_test.go
func TestCompleteInfrastructure(t *testing.T) {
    t.Parallel()

    if testing.Short() {
        t.Skip("Skipping integration test")
    }

    awsRegion := "ap-northeast-2"

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../../terraform",
        Vars: map[string]interface{}{
            "environment": "test",
            "region":      awsRegion,
        },
        BackendConfig: map[string]interface{}{},
    })

    defer terraform.Destroy(t, terraformOptions)

    // 전체 인프라 배포 (30분 소요)
    terraform.InitAndApply(t, terraformOptions)

    // Network 모듈 검증
    t.Run("VerifyNetwork", func(t *testing.T) {
        vpcID := terraform.Output(t, terraformOptions, "vpc_id")
        assert.NotEmpty(t, vpcID)
    })

    // Storage 모듈 검증
    t.Run("VerifyStorage", func(t *testing.T) {
        rawBucket := terraform.Output(t, terraformOptions, "raw_videos_bucket_name")
        aws.AssertS3BucketExists(t, awsRegion, rawBucket)
    })

    // Security 모듈 검증
    t.Run("VerifySecurity", func(t *testing.T) {
        ecsTaskRole := terraform.Output(t, terraformOptions, "ecs_task_role_arn")
        assert.Contains(t, ecsTaskRole, "arn:aws:iam::")
    })

    // Pipeline 모듈 검증
    t.Run("VerifyPipeline", func(t *testing.T) {
        sqsQueueUrl := terraform.Output(t, terraformOptions, "sqs_queue_url")
        assert.NotEmpty(t, sqsQueueUrl)
    })
}
```

**실제 생성되는 리소스:**

- Network: VPC, Subnet, NAT Gateway 등
- Storage: S3, RDS, Secrets Manager
- Security: IAM Role, Policy
- Pipeline: SQS, Lambda, Batch

**비용**: ~$1-2 (RDS 20분 + NAT Gateway + Batch Compute)

---

## 워크플로우 구현

### GitHub Actions 설정

```yaml
# .github/workflows/terratest.yml
name: Terratest - Infrastructure Testing

on:
  pull_request:
    branches: [main, develop]
    paths: ['terraform/**', 'test/**']
  workflow_dispatch:
    inputs:
      test_type:
        description: 'Test type to run'
        required: true
        default: 'validate'
        type: choice
        options:
          - validate
          - unit
          - integration

permissions:
  contents: read
  pull-requests: write

env:
  GO_VERSION: '1.21'
  AWS_REGION: 'ap-northeast-2'

jobs:
  # Tier 1: Validation (무료)
  validate:
    name: 🔍 Terraform Validation Tests
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Download Go modules
        working-directory: test/infra
        run: |
          go mod download
          go mod tidy

      - name: Run Validation Tests
        working-directory: test/infra
        run: |
          echo "🔍 Running fast validation tests..."

          # Format 검사
          go test -v -run TestTerraformFormatting -timeout 5m

          # Validate 검사
          go test -v -run TestTerraformValidation -timeout 10m

          # Plan 테스트
          go test -v -run TestNetworkModulePlan -timeout 5m
          go test -v -run TestStorageModulePlan -timeout 5m
          go test -v -run TestSecurityModulePlan -timeout 5m

      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## ✅ Terratest Validation Passed
              
              All Terraform modules passed validation tests.
              No AWS resources were created.`
            });

  # Tier 2: Unit Tests (유료, 수동)
  unit-tests:
    name: 🧪 Unit Tests (AWS Resources)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.test_type == 'unit'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Run Network Module Tests
        working-directory: test/infra
        run: |
          echo "🌐 Testing Network Module..."
          go test -v -run TestNetworkModule -timeout 30m

      - name: Run Storage Module Tests
        working-directory: test/infra
        run: |
          echo "🗄️ Testing Storage Module..."
          go test -v -run TestStorageModule -timeout 30m

      - name: Run Security Module Tests
        working-directory: test/infra
        run: |
          echo "🔐 Testing Security Module..."
          go test -v -run TestIAMRoleCreation -timeout 30m

  # Tier 3: Integration Tests (전체 스택)
  integration-tests:
    name: 🚀 Integration Tests (Full Stack)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.test_type == 'integration'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go & Terraform
        # ... (위와 동일)

      - name: Run Full Integration Tests
        working-directory: test/infra
        run: |
          echo "🚀 Running full integration test..."
          go test -v -run TestCompleteInfrastructure -timeout 60m
```

---

## 실행 및 디버깅

### 로컬 실행

```bash
# 1. Validation 테스트 (무료)
cd test/infra
go test -v -run TestTerraformFormatting -timeout 5m
go test -v -run TestNetworkModulePlan -timeout 5m

# 2. Unit 테스트 (비용 발생)
go test -v -run TestNetworkModule -timeout 30m

# 3. Integration 테스트 (비용 많이 발생)
go test -v -run TestCompleteInfrastructure -timeout 60m

# 4. 특정 테스트만 실행
go test -v -run TestStorageModule

# 5. Short mode (Integration 테스트 스킵)
go test -v -short
```

### 디버깅

```bash
# 1. Verbose 로그 활성화
export TF_LOG=DEBUG
go test -v -run TestNetworkModule

# 2. Terraform 출력 저장
go test -v -run TestNetworkModule > test.log 2>&1

# 3. 실패 시 리소스 유지 (수동 확인용)
# terraform.Destroy() 주석 처리 후 실행

# 4. Plan만 확인하고 Apply 안 함
# terraform.InitAndApply() 대신 terraform.Init() + terraform.Plan() 사용
```

### 트러블슈팅

**문제: Test timeout**

```bash
# 해결: timeout 시간 늘리기
go test -v -run TestNetworkModule -timeout 45m
```

**문제: AWS 권한 오류**

```bash
# 해결: AWS credentials 확인
aws sts get-caller-identity
```

**문제: 리소스 정리 실패**

```bash
# 해결: 수동으로 리소스 삭제
cd ../../terraform/modules/network
terraform destroy -auto-approve
```

---

## 참고 자료

### 공식 문서

- [Terratest Official Documentation](https://terratest.gruntwork.io/)
- [Terratest AWS Module](https://pkg.go.dev/github.com/gruntwork-io/terratest/modules/aws)
- [Terratest Terraform Module](https://pkg.go.dev/github.com/gruntwork-io/terratest/modules/terraform)

### 예제

- [Terratest Examples](https://github.com/gruntwork-io/terratest/tree/master/examples)
- [AWS Examples](https://github.com/gruntwork-io/terratest/tree/master/examples/terraform-aws-example)

---

**최종 수정일**: 2026년 2월 6일  
**문서 버전**: 1.0
