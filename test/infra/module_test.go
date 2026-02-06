package test

import (
	"testing"

	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestModuleOutputConsistency ensures all modules produce expected outputs
func TestModuleOutputConsistency(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name         string
		modulePath   string
		vars         map[string]interface{}
		requiredOutputs []string
	}{
		{
			name:       "Network Module",
			modulePath: "../../terraform/modules/network",
			vars: map[string]interface{}{
				"environment":       "test",
				"vpc_cidr":          "10.99.0.0/16",
				"availability_zones": []string{"ap-northeast-2a", "ap-northeast-2c"},
			},
			requiredOutputs: []string{"vpc_id", "public_subnet_ids", "private_subnet_ids"},
		},
		{
			name:       "Storage Module",
			modulePath: "../../terraform/modules/storage",
			vars: map[string]interface{}{
				"environment": "test",
				"region":      "ap-northeast-2",
			},
			requiredOutputs: []string{
				"raw_videos_bucket_name",
				"thumbnails_bucket_name",
				"highlights_bucket_name",
			},
		},
	}

	for _, tc := range testCases {
		// ?åÏä§??ÏºÄ?¥Ïä§ÎßàÎã§ Î≥ëÎ†¨ ?§Ìñâ
		tc := tc // ?¥Î°ú?Ä Î≥Ä??Ï∫°Ï≤ò
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			terraformOptions := &terraform.Options{
				TerraformDir:  tc.modulePath,
				Vars:          tc.vars,
				BackendConfig: map[string]interface{}{},
				NoColor:       true,
			}

			// PlanÎß??§Ìñâ?òÏó¨ Ï∂úÎ†•Í∞??ïÏãù Í≤ÄÏ¶?
			terraform.Init(t, terraformOptions)
			planExitCode := terraform.PlanExitCode(t, terraformOptions)
			assert.Equal(t, 0, planExitCode, "%s plan should succeed", tc.name)

			// Ï∂úÎ†•Í∞íÏù¥ ?ïÏùò?òÏñ¥ ?àÎäîÏßÄ ?ïÏù∏ (Plan ?®Í≥Ñ?êÏÑú Í∞Ä??
			for _, output := range tc.requiredOutputs {
				// Terraform showÎ°?Ï∂úÎ†•Í∞??ïÏùò ?ïÏù∏
				planJSON := terraform.Show(t, terraformOptions)
				assert.Contains(t, planJSON, output, "%s should have output: %s", tc.name, output)
			}
		})
	}
}

// TestTerraformFormatting ensures all Terraform files are properly formatted
func TestTerraformFormatting(t *testing.T) {
	testCases := []struct {
		name string
		path string
	}{
		{"Root Module", "../../terraform"},
		{"Network Module", "../../terraform/modules/network"},
		{"Storage Module", "../../terraform/modules/storage"},
		{"Security Module", "../../terraform/modules/security"},
		{"Compute Module", "../../terraform/modules/compute"},
		{"Pipeline Module", "../../terraform/modules/pipeline"},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			terraformOptions := &terraform.Options{
				TerraformDir: tc.path,
			}

			// terraform fmt -check ?§Ìñâ
			stdout, stderr, err := terraform.RunTerraformCommandE(t, terraformOptions, "fmt", "-check", "-recursive")
			
			if err != nil {
				t.Logf("Format check failed for %s", tc.name)
				t.Logf("Stdout: %s", stdout)
				t.Logf("Stderr: %s", stderr)
				t.Logf("Run 'terraform fmt -recursive' to fix formatting issues")
			}
			
			assert.NoError(t, err, "%s should be properly formatted. Run 'terraform fmt -recursive' to fix.", tc.name)
		})
	}
}

// TestTerraformValidation validates all modules
func TestTerraformValidation(t *testing.T) {
	t.Parallel()

	modules := []string{
		"../../terraform/modules/network",
		"../../terraform/modules/storage",
		"../../terraform/modules/security",
		"../../terraform/modules/iam",
		"../../terraform/modules/compute",
		"../../terraform/modules/pipeline",
	}

	for _, modulePath := range modules {
		modulePath := modulePath
		t.Run(modulePath, func(t *testing.T) {
			t.Parallel()

			terraformOptions := &terraform.Options{
				TerraformDir:  modulePath,
				BackendConfig: map[string]interface{}{},
			}

			terraform.Init(t, terraformOptions)
			terraform.Validate(t, terraformOptions)
		})
	}
}
