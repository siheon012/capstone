package test

import (
	"fmt"
	"testing"
	"time"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestCompleteInfrastructure tests the complete infrastructure stack
// ?†Ô∏è WARNING: This test creates real AWS resources and may incur costs
// Only run this in a dedicated test AWS account
func TestCompleteInfrastructure(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping expensive integration test in short mode")
	}

	// ?òÍ≤Ω Î≥Ä?òÎ°ú Î™ÖÏãú?ÅÏúºÎ°??úÏÑ±?îÌï¥?ºÎßå ?§Ìñâ
	// export RUN_FULL_INTEGRATION_TEST=true
	// if os.Getenv("RUN_FULL_INTEGRATION_TEST") != "true" {
	// 	t.Skip("Skipping full integration test. Set RUN_FULL_INTEGRATION_TEST=true to run")
	// }

	t.Log("?†Ô∏è This test will create actual AWS infrastructure")
	t.Log("Expected duration: 10-15 minutes")
	t.Log("Expected cost: ~$0.50-1.00")

	uniqueID := fmt.Sprintf("test-%d", time.Now().Unix())

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../../terraform",
		Vars: map[string]interface{}{
			"environment":  "test",
			"project_name": uniqueID,
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,

		// ?Ä?ÑÏïÑ???§Ï†ï (?∏ÌîÑ???ùÏÑ±???úÍ∞Ñ??Í±∏Î¶º)
		MaxRetries:         3,
		TimeBetweenRetries: 5 * time.Second,
	})

	// ?åÏä§??Ï¢ÖÎ£å ??Î™®Îì† Î¶¨ÏÜå???ïÎ¶¨
	defer terraform.Destroy(t, terraformOptions)

	// Terraform init & apply
	terraform.InitAndApply(t, terraformOptions)

	// Ï£ºÏöî Ï∂úÎ†•Í∞?Í≤ÄÏ¶?
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

	t.Log("??All infrastructure components validated successfully")
}

// TestInfrastructurePlanNoChanges tests that running plan twice produces no changes
func TestInfrastructurePlanNoChanges(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir:  "../../terraform",
		Vars:          map[string]interface{}{"environment": "test"},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)

	// Ï≤?Î≤àÏß∏ apply
	terraform.InitAndApply(t, terraformOptions)

	// ??Î≤àÏß∏ plan - Î≥ÄÍ≤ΩÏÇ¨??ù¥ ?ÜÏñ¥????(idempotent)
	planExitCode := terraform.PlanExitCode(t, terraformOptions)

	// Exit code 0 = no changes (idempotent)
	// Exit code 2 = changes detected
	assert.Equal(t, 0, planExitCode, "Second plan should show no changes (infrastructure is idempotent)")
}
