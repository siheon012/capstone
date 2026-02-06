package test

import (
	"fmt"
	"testing"
	"time"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestCompleteInfrastructure tests the complete infrastructure stack
// ⚠️ WARNING: This test creates real AWS resources and may incur costs
// Only run this in a dedicated test AWS account
func TestCompleteInfrastructure(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping expensive integration test in short mode")
	}

	// 환경 변수로 명시적으로 활성화해야만 실행
	// export RUN_FULL_INTEGRATION_TEST=true
	// if os.Getenv("RUN_FULL_INTEGRATION_TEST") != "true" {
	// 	t.Skip("Skipping full integration test. Set RUN_FULL_INTEGRATION_TEST=true to run")
	// }

	t.Log("⚠️ This test will create actual AWS infrastructure")
	t.Log("Expected duration: 10-15 minutes")
	t.Log("Expected cost: ~$0.50-1.00")

	uniqueID := fmt.Sprintf("test-%d", time.Now().Unix())

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../terraform",
		Vars: map[string]interface{}{
			"environment":  "test",
			"project_name": uniqueID,
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,

		// 타임아웃 설정 (인프라 생성에 시간이 걸림)
		MaxRetries:         3,
		TimeBetweenRetries: 5 * time.Second,
	})

	// 테스트 종료 시 모든 리소스 정리
	defer terraform.Destroy(t, terraformOptions)

	// Terraform init & apply
	terraform.InitAndApply(t, terraformOptions)

	// 주요 출력값 검증
	t.Run("Verify Network Outputs", func(t *testing.T) {
		vpcID := terraform.Output(t, terraformOptions, "vpc_id")
		assert.NotEmpty(t, vpcID, "VPC ID should not be empty")

		publicSubnets := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
		assert.NotEmpty(t, publicSubnets, "Public subnets should be created")
	})

	t.Run("Verify Storage Outputs", func(t *testing.T) {
		rawBucket := terraform.Output(t, terraformOptions, "raw_videos_bucket")
		assert.NotEmpty(t, rawBucket, "Raw videos bucket should be created")
	})

	t.Run("Verify Compute Outputs", func(t *testing.T) {
		ecsClusterArn := terraform.Output(t, terraformOptions, "ecs_cluster_arn")
		assert.NotEmpty(t, ecsClusterArn, "ECS cluster should be created")
		assert.Contains(t, ecsClusterArn, "arn:aws:ecs:", "Should be a valid ECS cluster ARN")
	})

	t.Log("✅ All infrastructure components validated successfully")
}

// TestInfrastructurePlanNoChanges tests that running plan twice produces no changes
func TestInfrastructurePlanNoChanges(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir:  "../terraform",
		Vars:          map[string]interface{}{"environment": "test"},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)

	// 첫 번째 apply
	terraform.InitAndApply(t, terraformOptions)

	// 두 번째 plan - 변경사항이 없어야 함 (idempotent)
	planStruct := terraform.InitAndPlan(t, terraformOptions)
	resourceChanges := terraform.GetResourceChanges(t, planStruct)

	// 리소스 추가/변경/삭제가 없어야 함
	assert.Equal(t, 0, len(resourceChanges.Add), "No resources should be added")
	assert.Equal(t, 0, len(resourceChanges.Change), "No resources should be changed")
	assert.Equal(t, 0, len(resourceChanges.Destroy), "No resources should be destroyed")
}
