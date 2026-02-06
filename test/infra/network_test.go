package test

import (
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestNetworkModule tests the network module
func TestNetworkModule(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		// Terraform 코드 경로
		TerraformDir: "../../terraform/modules/network",

		Vars: map[string]interface{}{
			"environment": "test",
			"region":      "ap-northeast-2",
			"vpc_cidr":    "10.99.0.0/16",
		},

		BackendConfig: map[string]interface{}{},

		NoColor: true,
	})

	defer terraform.Destroy(t, terraformOptions)

	// Terraform init & apply
	terraform.InitAndApply(t, terraformOptions)

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
	planExitCode := terraform.PlanExitCode(t, terraformOptions)

	assert.Equal(t, 0, planExitCode, "Terraform plan should succeed")
}

// TestNetworkModuleValidate tests Terraform validation
func TestNetworkModuleValidate(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../../terraform/modules/network",
		BackendConfig: map[string]interface{}{},
	}

	terraform.Init(t, terraformOptions)
	terraform.Validate(t, terraformOptions)
}
