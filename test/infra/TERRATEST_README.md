# Terratest - Infrastructure Testing

Terraform 코드에 대한 자동화된 테스트를 수행하여 인프라의 안정성과 신뢰성을 보장합니다.

## 📋 개요

### Terratest란?

**Go 언어 기반의 인프라 테스팅 프레임워크**로, 실제 AWS 리소스를 생성하여 테스트하고 자동으로 정리합니다.

### 왜 필요한가?

```
┌─────────────────────────────────────────────────────────┐
│           문제: 인프라 변경의 위험성                     │
├─────────────────────────────────────────────────────────┤
│ ❌ 모듈 업데이트 시 기존 인프라 영향 불확실              │
│ ❌ 수동 테스트는 시간이 오래 걸리고 실수 발생            │
│ ❌ 프로덕션 배포 전 검증 방법 부재                       │
└─────────────────────────────────────────────────────────┘
                         ⬇️
┌─────────────────────────────────────────────────────────┐
│           해결: Terratest 자동화 테스트                  │
├─────────────────────────────────────────────────────────┤
│ ✅ 실제 AWS에서 인프라 생성 및 검증                      │
│ ✅ 테스트 완료 후 자동 정리 (비용 최소화)                │
│ ✅ CI/CD 파이프라인 통합으로 지속적 검증                 │
│ ✅ 모듈 업데이트 시 회귀 테스트 자동화                   │
└─────────────────────────────────────────────────────────┘
```

## 🎯 테스트 계층 구조

### 1. Validation Tests (빠름, 무료) 🔍

**목적**: 문법 오류 및 기본 구성 검증  
**실행 시점**: 모든 PR  
**비용**: $0  
**소요 시간**: 1-2분

```go
// 예: Terraform 포맷 검사
go test -v -run TestTerraformFormatting

// Terraform validate
go test -v -run TestTerraformValidation

// Plan 생성 (리소스 생성 없음)
go test -v -run TestNetworkModulePlan
```

**검사 항목**:

- ✅ HCL 문법 오류
- ✅ 코드 포맷팅 (`terraform fmt`)
- ✅ 변수 참조 오류
- ✅ 모듈 의존성 검증
- ✅ Plan 생성 가능 여부

### 2. Unit Tests (중간, 저비용) 🧪

**목적**: 개별 모듈 기능 검증  
**실행 시점**: 주간 스케줄  
**비용**: ~$0.10-0.50  
**소요 시간**: 10-20분

```go
// 예: Network 모듈 테스트 (실제 VPC 생성)
go test -v -run TestNetworkModule

// Storage 모듈 테스트 (실제 S3 생성)
go test -v -run TestStorageModule
```

**검사 항목**:

- ✅ 리소스가 올바르게 생성되는지
- ✅ 출력값이 예상대로 나오는지
- ✅ 보안 설정 (암호화, public access block)
- ✅ 태그 및 명명 규칙 준수

### 3. Integration Tests (느림, 고비용) 🚀

**목적**: 전체 인프라 스택 검증  
**실행 시점**: 수동 트리거  
**비용**: ~$1-2  
**소요 시간**: 15-30분

```go
// 전체 인프라 배포 및 검증
go test -v -run TestCompleteInfrastructure

// Idempotency 검증 (2번 apply 시 변경 없음)
go test -v -run TestInfrastructurePlanNoChanges
```

**검사 항목**:

- ✅ 전체 스택 배포 성공
- ✅ 모듈 간 통합 검증
- ✅ Idempotency (멱등성)
- ✅ 리소스 정리 확인

## 📁 프로젝트 구조

```
test/
├── go.mod                    # Go 모듈 정의
├── go.sum                    # 의존성 체크섬
├── network_test.go           # Network 모듈 테스트
├── storage_test.go           # Storage 모듈 테스트
├── security_test.go          # Security 모듈 테스트
├── integration_test.go       # 통합 테스트
├── module_test.go            # 공통 모듈 테스트
└── README.md                 # 이 문서
```

## 🚀 사용 방법

### 로컬 실행

#### 1. 환경 준비

```bash
# Go 설치 확인
go version  # Go 1.21 이상 필요

# 프로젝트 의존성 다운로드
cd test
go mod download

# AWS 자격증명 설정
# ~/.aws/credentials 또는 환경변수
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=ap-northeast-2
```

#### 2. 빠른 검증 (무료)

```bash
# 모든 모듈 포맷 검사
go test -v -run TestTerraformFormatting -timeout 5m

# 모든 모듈 validate
go test -v -run TestTerraformValidation -timeout 10m

# 특정 모듈 Plan 테스트
go test -v -run TestNetworkModulePlan -timeout 5m
```

#### 3. 단위 테스트 (비용 발생)

```bash
# Network 모듈 테스트 (VPC 생성)
go test -v -run TestNetworkModule -timeout 30m

# Storage 모듈 테스트 (S3 생성)
go test -v -run TestStorageModule -timeout 30m

# Security 모듈 테스트 (IAM 생성)
go test -v -run TestIAMRoleCreation -timeout 30m
```

#### 4. 통합 테스트 (고비용)

```bash
# ⚠️ 전체 인프라 생성 (비용 발생!)
export RUN_FULL_INTEGRATION_TEST=true
go test -v -run TestCompleteInfrastructure -timeout 60m
```

#### 5. 단축 모드 (빠른 검증만)

```bash
# -short 플래그: 비용 발생 테스트 스킵
go test -v -short ./...
```

### GitHub Actions 실행

#### 자동 실행

- **PR 생성 시**: Validation 테스트 자동 실행
- **매주 월요일**: Unit 테스트 자동 실행

#### 수동 실행

1. GitHub → **Actions** 탭
2. **Terratest - Infrastructure Testing** 선택
3. **Run workflow** 클릭
4. 테스트 타입 선택:
   - `validate`: 빠른 검증 (무료)
   - `unit`: 단위 테스트 (~$0.50)
   - `integration`: 통합 테스트 (~$1-2)
5. **Run workflow** 버튼 클릭

## 📊 테스트 예제

### 예제 1: Network 모듈 테스트

```go
func TestNetworkModule(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../terraform/modules/network",
        Vars: map[string]interface{}{
            "environment": "test",
            "vpc_cidr":    "10.99.0.0/16",
        },
    }

    // 테스트 종료 시 리소스 자동 삭제
    defer terraform.Destroy(t, terraformOptions)

    // 인프라 생성
    terraform.InitAndApply(t, terraformOptions)

    // 검증
    vpcID := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcID)

    subnets := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
    assert.Len(t, subnets, 2)
}
```

**실행 흐름**:

1. Terraform init
2. Terraform apply (실제 VPC 생성)
3. 출력값 검증
4. Terraform destroy (자동 정리)

### 예제 2: S3 암호화 검증

```go
func TestS3Encryption(t *testing.T) {
    // ... terraform apply ...

    bucketName := terraform.Output(t, terraformOptions, "bucket_name")

    // AWS SDK로 실제 설정 확인
    encryption := aws.GetS3BucketEncryption(t, "ap-northeast-2", bucketName)

    assert.Equal(t, "AES256", encryption.SSEAlgorithm)
}
```

### 예제 3: Idempotency 검증

```go
func TestIdempotency(t *testing.T) {
    // 첫 번째 apply
    terraform.InitAndApply(t, terraformOptions)

    // 두 번째 plan - 변경사항 없어야 함
    planStruct := terraform.Plan(t, terraformOptions)
    resourceChanges := terraform.GetResourceChanges(t, planStruct)

    assert.Equal(t, 0, len(resourceChanges.Add))
    assert.Equal(t, 0, len(resourceChanges.Change))
    assert.Equal(t, 0, len(resourceChanges.Destroy))
}
```

## 🔧 고급 기능

### 병렬 테스트 실행

```go
func TestNetworkModule(t *testing.T) {
    t.Parallel()  // 다른 테스트와 동시 실행
    // ...
}
```

### 타임아웃 설정

```bash
# 30분 타임아웃
go test -v -run TestNetworkModule -timeout 30m
```

### 재시도 로직

```go
terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
    // ...
    MaxRetries:         3,
    TimeBetweenRetries: 5 * time.Second,
})
```

### 조건부 스킵

```go
func TestExpensiveTest(t *testing.T) {
    if testing.Short() {
        t.Skip("Skipping expensive test in short mode")
    }
    // ... 비용 발생 테스트 ...
}
```

## 💰 비용 관리

### 비용 최소화 전략

1. **테스트 계층 분리**
   - Validation: PR마다 (무료)
   - Unit: 주간 (저비용)
   - Integration: 수동 (고비용)

2. **자동 정리**

   ```go
   defer terraform.Destroy(t, terraformOptions)
   ```

3. **타임아웃 설정**
   - 테스트 실패 시 빠르게 종료하여 비용 절감

4. **리전 선택**
   - 저렴한 리전 사용 (예: us-east-1)

5. **테스트 환경 분리**
   - 전용 AWS 계정 사용 권장

### 예상 비용

| 테스트 타입   | 리소스       | 소요 시간 | 예상 비용 |
| ------------- | ------------ | --------- | --------- |
| Validation    | 없음         | 1-2분     | $0        |
| Network Unit  | VPC, Subnets | 5-10분    | $0.05     |
| Storage Unit  | S3 buckets   | 3-5분     | $0.01     |
| Security Unit | IAM roles    | 2-3분     | $0        |
| Integration   | Full stack   | 15-30분   | $1-2      |

## 🐛 트러블슈팅

### "aws: command not found"

```bash
# AWS CLI 설치 확인
aws --version

# 또는 AWS SDK가 자격증명 자동 감지
export AWS_PROFILE=default
```

### "timeout exceeded"

```bash
# 타임아웃 증가
go test -v -run TestNetworkModule -timeout 60m
```

### "리소스가 정리되지 않음"

```bash
# 수동 정리
cd terraform/modules/network
terraform init
terraform destroy
```

### "Plan에서 변경사항 감지"

Idempotency 문제 - 다음 확인:

- 랜덤 값 사용 (UUID 등)
- Timestamp 사용
- 외부 의존성 (data source)

## 📚 베스트 프랙티스

### 1. 테스트 격리

```go
// 각 테스트마다 고유 ID 사용
uniqueID := fmt.Sprintf("test-%d", time.Now().Unix())
```

### 2. 명확한 테스트 이름

```go
func TestNetworkModule_CreatesVPCWithTwoSubnets(t *testing.T) {
    // ...
}
```

### 3. 테이블 기반 테스트

```go
testCases := []struct{
    name string
    vars map[string]interface{}
}{
    {"Dev Environment", map[string]interface{}{"env": "dev"}},
    {"Prod Environment", map[string]interface{}{"env": "prod"}},
}

for _, tc := range testCases {
    t.Run(tc.name, func(t *testing.T) {
        // ...
    })
}
```

### 4. 적절한 에러 메시지

```go
assert.NotEmpty(t, vpcID, "VPC ID should not be empty after creation")
```

### 5. 리소스 태깅

```go
Vars: map[string]interface{}{
    "tags": map[string]string{
        "Testing": "true",
        "ManagedBy": "Terratest",
    },
}
```

## 📖 참고 자료

### 공식 문서

- [Terratest Documentation](https://terratest.gruntwork.io/)
- [Terratest AWS Examples](https://github.com/gruntwork-io/terratest/tree/master/examples)
- [Testing Terraform Code](https://www.terraform.io/docs/language/modules/testing-experiment.html)

### 유용한 링크

- [Terratest GitHub](https://github.com/gruntwork-io/terratest)
- [AWS SDK for Go](https://aws.amazon.com/sdk-for-go/)
- [Go Testing Package](https://pkg.go.dev/testing)

## 🎓 학습 자료

### 튜토리얼

1. **첫 번째 테스트 작성**

   ```bash
   cd test
   go test -v -run TestNetworkModulePlan
   ```

2. **실제 리소스로 테스트**

   ```bash
   go test -v -run TestNetworkModule
   ```

3. **전체 통합 테스트**
   ```bash
   export RUN_FULL_INTEGRATION_TEST=true
   go test -v -run TestCompleteInfrastructure
   ```

### 실습 과제

1. ☑️ 새로운 모듈 추가 시 테스트 작성
2. ☑️ CI/CD 파이프라인에서 테스트 실행 확인
3. ☑️ 실패 시나리오 테스트 추가
4. ☑️ 성능 벤치마크 추가

## 💡 FAQ

### Q: 테스트가 너무 오래 걸려요

A: `-short` 플래그 사용 또는 Validation 테스트만 실행

```bash
go test -v -short ./...
```

### Q: AWS 비용이 걱정됩니다

A: Validation 테스트는 무료입니다. Unit/Integration은 필요시에만 실행하세요.

### Q: 테스트 실패 시 리소스가 남아있나요?

A: `defer terraform.Destroy`로 자동 정리되지만, 실패 시 수동 확인 권장

### Q: 프로덕션 계정에서 테스트해도 되나요?

A: ❌ 절대 안됩니다! 전용 테스트 계정 사용 필수

## 📝 라이선스

이 테스트 코드는 프로젝트 루트의 라이선스를 따릅니다.
