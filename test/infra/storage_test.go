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
		TerraformDir: "../terraform/modules/storage",
		Vars: map[string]interface{}{
			"environment": environment,
			"region":      awsRegion,
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	// S3 버킷 이름 가져오기
	rawBucketName := terraform.Output(t, terraformOptions, "raw_videos_bucket_name")
	thumbnailsBucketName := terraform.Output(t, terraformOptions, "thumbnails_bucket_name")
	highlightsBucketName := terraform.Output(t, terraformOptions, "highlights_bucket_name")

	// 버킷이 생성되었는지 확인
	assert.NotEmpty(t, rawBucketName, "Raw videos bucket should be created")
	assert.NotEmpty(t, thumbnailsBucketName, "Thumbnails bucket should be created")
	assert.NotEmpty(t, highlightsBucketName, "Highlights bucket should be created")

	// S3 버킷이 실제로 존재하는지 AWS에서 확인
	aws.AssertS3BucketExists(t, awsRegion, rawBucketName)
	aws.AssertS3BucketExists(t, awsRegion, thumbnailsBucketName)
	aws.AssertS3BucketExists(t, awsRegion, highlightsBucketName)

	// 버킷 암호화 확인
	t.Run("Verify S3 Encryption", func(t *testing.T) {
		encryption := aws.GetS3BucketEncryption(t, awsRegion, rawBucketName)
		assert.NotNil(t, encryption, "S3 bucket should have encryption enabled")
		assert.Equal(t, "AES256", encryption.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm)
	})

	// 버킷 버전 관리 확인 (raw videos만)
	t.Run("Verify S3 Versioning", func(t *testing.T) {
		versioning := aws.GetS3BucketVersioning(t, awsRegion, rawBucketName)
		assert.Equal(t, "Enabled", versioning, "Raw videos bucket should have versioning enabled")
	})

	// Public Access Block 확인
	t.Run("Verify Public Access Block", func(t *testing.T) {
		publicAccessBlock := aws.GetS3PublicAccessBlock(t, awsRegion, rawBucketName)
		assert.True(t, publicAccessBlock.BlockPublicAcls, "Block public ACLs should be enabled")
		assert.True(t, publicAccessBlock.IgnorePublicAcls, "Ignore public ACLs should be enabled")
	})
}

// TestStorageModulePlan validates the Terraform plan
func TestStorageModulePlan(t *testing.T) {
	t.Parallel()

	terraformOptions := &terraform.Options{
		TerraformDir: "../terraform/modules/storage",
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
		TerraformDir: "../terraform/modules/storage",
		Vars: map[string]interface{}{
			"environment": "test",
			"region":      "ap-northeast-2",
		},
		BackendConfig: map[string]interface{}{},
		NoColor:       true,
	})

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	// 모든 필수 출력값이 있는지 확인
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
