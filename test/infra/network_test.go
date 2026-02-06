package test

import (
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestNetworkModule tests the network module
func TestNetworkModule(t *testing.T) {
	t.Parallel()

	// ⚠️ 실제 AWS 리소스를 생성하므로 비용 발생
	// 로컬에서는 skip, CI/CD에서만 실행
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		// Terraform 코드 경로
		TerraformDir: "../terraform/modules/network",

		// 변수 설정
		Vars: map[string]interface{}{
			"environment":       "test",
			"vpc_cidr":          "10.99.0.0/16",
			"availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"},
		},

		// 백엔드 비활성화 (테스트용 로컬 상태 사용)
		BackendConfig: map[string]interface{}{},

		// 테스트 실패 시 리소스 자동 삭제
		NoColor: true,
	})

	// 테스트 종료 시 리소스 정리
	defer terraform.Destroy(t, terraformOptions)

	// Terraform init & apply
	terraform.InitAndApply(t, terraformOptions)

	// 출력값 검증
	vpcID := terraform.Output(t, terraformOptions, "vpc_id")
	assert.NotEmpty(t, vpcID, "VPC ID should not be empty")

	publicSubnetIDs := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
	assert.Len(t, publicSubnetIDs, 2, "Should have 2 public subnets")

	privateSubnetIDs := terraform.OutputList(t, terraformOptions, "private_subnet_ids")
	assert.Len(t, privateSubnetIDs, 2, "Should have 2 private subnets")
}

// TestNetworkModulePlan tests the network module plan without applying
func TestNetworkModulePlan(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../terraform/modules/network",
		Vars: map[string]interface{}{
			"environment":       "test",
			"vpc_cidr":          "10.99.0.0/16",
			"availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"},
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	}

	// Plan만 실행 (리소스 생성 안 함)
	terraform.Init(t, terraformOptions)
	planExitCode := terraform.PlanExitCode(t, terraformOptions)

	// Plan이 성공적으로 생성되었는지 확인
	assert.Equal(t, 0, planExitCode, "Terraform plan should succeed")
}

// TestNetworkModuleValidate tests Terraform validation
func TestNetworkModuleValidate(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../terraform/modules/network",
		BackendConfig: map[string]interface{}{},
	}

	// Terraform validate (문법 검사만, 리소스 생성 안 함)
	terraform.Init(t, terraformOptions)
	terraform.Validate(t, terraformOptions)
}
