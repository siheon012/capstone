package test

import (
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestNetworkModule tests the network module
func TestNetworkModule(t *testing.T) {
	t.Parallel()

	// ? ï¸ ?¤ì œ AWS ë¦¬ì†Œ?¤ë? ?ì„±?˜ë?ë¡?ë¹„ìš© ë°œìƒ
	// ë¡œì»¬?ì„œ??skip, CI/CD?ì„œë§??¤í–‰
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		// Terraform ì½”ë“œ ê²½ë¡œ
		TerraformDir: "../../terraform/modules/network",

		// ë³€???¤ì •
		Vars: map[string]interface{}{
			"environment":       "test",
			"vpc_cidr":          "10.99.0.0/16",
			"availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"},
		},

		// ë°±ì—”??ë¹„í™œ?±í™” (?ŒìŠ¤?¸ìš© ë¡œì»¬ ?íƒœ ?¬ìš©)
		BackendConfig: map[string]interface{}{},

		// ?ŒìŠ¤???¤íŒ¨ ??ë¦¬ì†Œ???ë™ ?? œ
		NoColor: true,
	})

	// ?ŒìŠ¤??ì¢…ë£Œ ??ë¦¬ì†Œ???•ë¦¬
	defer terraform.Destroy(t, terraformOptions)

	// Terraform init & apply
	terraform.InitAndApply(t, terraformOptions)

	// ì¶œë ¥ê°?ê²€ì¦?
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
			"environment":       "test",
			"vpc_cidr":          "10.99.0.0/16",
			"availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"},
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	}

	// Planë§??¤í–‰ (ë¦¬ì†Œ???ì„± ????
	terraform.Init(t, terraformOptions)
	planExitCode := terraform.PlanExitCode(t, terraformOptions)

	// Plan???±ê³µ?ìœ¼ë¡??ì„±?˜ì—ˆ?”ì? ?•ì¸
	assert.Equal(t, 0, planExitCode, "Terraform plan should succeed")
}

// TestNetworkModuleValidate tests Terraform validation
func TestNetworkModuleValidate(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../../terraform/modules/network",
		BackendConfig: map[string]interface{}{},
	}

	// Terraform validate (ë¬¸ë²• ê²€?¬ë§Œ, ë¦¬ì†Œ???ì„± ????
	terraform.Init(t, terraformOptions)
	terraform.Validate(t, terraformOptions)
}
