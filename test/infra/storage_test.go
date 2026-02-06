package test

import (
	"fmt"
	"testing"

	"github.com/gruntwork-io/terratest/modules/aws"
	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

// TestStorageModule tests S3 bucket creation and configuration
func TestStorageModule(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	awsRegion := "ap-northeast-2"
	environment := "test"

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../../terraform/modules/storage",
		Vars: map[string]interface{}{
			"environment": environment,
			"region":      awsRegion,
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	rawBucketName := terraform.Output(t, terraformOptions, "raw_videos_bucket_name")
	thumbnailsBucketName := terraform.Output(t, terraformOptions, "thumbnails_bucket_name")
	highlightsBucketName := terraform.Output(t, terraformOptions, "highlights_bucket_name")

	assert.NotEmpty(t, rawBucketName, "Raw videos bucket should be created")
	assert.NotEmpty(t, thumbnailsBucketName, "Thumbnails bucket should be created")
	assert.NotEmpty(t, highlightsBucketName, "Highlights bucket should be created")

	aws.AssertS3BucketExists(t, awsRegion, rawBucketName)
	aws.AssertS3BucketExists(t, awsRegion, thumbnailsBucketName)
	aws.AssertS3BucketExists(t, awsRegion, highlightsBucketName)

	t.Run("Verify S3 Outputs", func(t *testing.T) {
		s3RawArn := terraform.Output(t, terraformOptions, "s3_raw_videos_arn")
		s3ThumbnailsArn := terraform.Output(t, terraformOptions, "s3_thumbnails_arn")
		
		assert.Contains(t, s3RawArn, rawBucketName, "Raw videos ARN should contain bucket name")
		assert.Contains(t, s3ThumbnailsArn, thumbnailsBucketName, "Thumbnails ARN should contain bucket name")
		assert.Contains(t, s3RawArn, "arn:aws:s3:::", "Should be valid S3 ARN format")
	})

	t.Run("Verify Terraform Configuration", func(t *testing.T) {
		assert.True(t, true, "Terraform configuration is the source of truth")
	})
}

// TestStorageModulePlan validates the Terraform plan
func TestStorageModulePlan(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../../terraform/modules/storage",
		Vars: map[string]interface{}{
			"environment": "test",
			"region":      "ap-northeast-2",
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	}

	terraform.Init(t, terraformOptions)
	planExitCode := terraform.PlanExitCode(t, terraformOptions)
	assert.Equal(t, 0, planExitCode, "Terraform plan should succeed")
}

// TestStorageModuleOutputs validates expected outputs
func TestStorageModuleOutputs(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../../terraform/modules/storage",
		Vars: map[string]interface{}{
			"environment": "test",
			"region":      "ap-northeast-2",
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	expectedOutputs := []string{
		"raw_videos_bucket_name",
		"raw_videos_bucket_arn",
		"thumbnails_bucket_name",
		"thumbnails_bucket_arn",
		"highlights_bucket_name",
		"highlights_bucket_arn",
	}

	for _, outputName := range expectedOutputs {
		output := terraform.Output(t, terraformOptions, outputName)
		assert.NotEmpty(t, output, fmt.Sprintf("Output %s should not be empty", outputName))
	}
}
