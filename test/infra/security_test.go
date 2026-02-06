package test

import (
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestSecurityModulePlan tests IAM roles and security groups plan
func TestSecurityModulePlan(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../../terraform/modules/security",
		Vars: map[string]interface{}{
			"environment": "test",
			"vpc_id":      "vpc-test123",
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	}

	terraform.Init(t, terraformOptions)
	planExitCode := terraform.PlanExitCode(t, terraformOptions)
	assert.Equal(t, 0, planExitCode, "Security module plan should succeed")
}

// TestSecurityModuleValidate validates HCL syntax
func TestSecurityModuleValidate(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir:  "../../terraform/modules/security",
		BackendConfig: map[string]interface{}{},
	}

	terraform.Init(t, terraformOptions)
	terraform.Validate(t, terraformOptions)
}

// TestIAMRoleCreation tests IAM role creation
func TestIAMRoleCreation(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../../terraform/modules/security",
		Vars: map[string]interface{}{
			"environment": "test",
			"vpc_id":      "vpc-test123",
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	ecsTaskRoleArn := terraform.Output(t, terraformOptions, "ecs_task_role_arn")
	assert.NotEmpty(t, ecsTaskRoleArn, "ECS task role ARN should not be empty")
	assert.Contains(t, ecsTaskRoleArn, "arn:aws:iam::", "Should be a valid IAM role ARN")

	batchServiceRoleArn := terraform.Output(t, terraformOptions, "batch_service_role_arn")
	assert.NotEmpty(t, batchServiceRoleArn, "Batch service role ARN should not be empty")
}
