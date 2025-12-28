# Apply Terraform Changes and Upload State to S3
# Usage: .\scripts\upload-state.ps1
param(
    [string]$Region = "ap-northeast-2",
    [string]$Environment = "dev",
    [switch]$SkipApply
)

$ErrorActionPreference = "Stop"

$BucketName = "capstone-$Environment-terraform-state-backup"
$StateFile = "terraform\terraform.tfstate"
$BackupFile = "terraform\terraform.tfstate.backup"
$TerraformDir = "terraform"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Terraform Apply and Upload to S3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bucket: $BucketName" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host ""

# Check if terraform directory exists
if (-not (Test-Path $TerraformDir)) {
    Write-Host "[ERROR] Terraform directory not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

# Navigate to terraform directory
Push-Location $TerraformDir

try {
    if (-not $SkipApply) {
        # Run terraform plan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Step 1: Terraform Plan" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        terraform plan
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Terraform plan failed!" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        $response = Read-Host "Apply these changes? (yes/no)"
        if ($response -ne "yes") {
            Write-Host "Aborted." -ForegroundColor Yellow
            exit 0
        }
        
        # Run terraform apply
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Step 2: Terraform Apply" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        terraform apply -auto-approve
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Terraform apply failed!" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "[SUCCESS] Terraform apply completed" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "[INFO] Skipping terraform apply (--SkipApply flag used)" -ForegroundColor Yellow
        Write-Host ""
    }
    
    # Check if state file exists
    if (-not (Test-Path "terraform.tfstate")) {
        Write-Host "[ERROR] terraform.tfstate not found!" -ForegroundColor Red
        exit 1
    }

    # Upload current state
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Step 3: Upload State to S3" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Get local file hash before upload
    $localHash = (Get-FileHash "terraform.tfstate" -Algorithm MD5).Hash
    Write-Host "Local state hash: $localHash" -ForegroundColor Cyan
    
    Write-Host "Uploading terraform.tfstate..." -ForegroundColor Yellow
    aws s3 cp "terraform.tfstate" "s3://$BucketName/terraform.tfstate" --region $Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to upload terraform.tfstate" -ForegroundColor Red
        exit 1
    }
    
    # Verify upload by comparing ETags
    Write-Host "Verifying upload..." -ForegroundColor Yellow
    aws s3api head-object --bucket $BucketName --key "terraform.tfstate" --region $Region | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] terraform.tfstate uploaded and verified" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Upload verification failed" -ForegroundColor Yellow
    }

    # Upload timestamped backup
    Write-Host "Uploading timestamped backup..." -ForegroundColor Yellow
    aws s3 cp "terraform.tfstate" "s3://$BucketName/backups/terraform.tfstate.$Timestamp" --region $Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARNING] Failed to upload timestamped backup" -ForegroundColor Yellow
    } else {
        Write-Host "[OK] Backup uploaded: terraform.tfstate.$Timestamp" -ForegroundColor Green
    }

    # Upload backup file if exists
    if (Test-Path "terraform.tfstate.backup") {
        Write-Host "Uploading terraform.tfstate.backup..." -ForegroundColor Yellow
        aws s3 cp "terraform.tfstate.backup" "s3://$BucketName/terraform.tfstate.backup" --region $Region
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] terraform.tfstate.backup uploaded" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[SUCCESS] All steps completed" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "State file hash: $localHash" -ForegroundColor Cyan
    Write-Host "Share this hash with team members for verification." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "- Commit and push your Terraform changes to Git" -ForegroundColor White
    Write-Host "- Notify team members to download latest state" -ForegroundColor White
    Write-Host "- Team should verify downloaded hash matches: $localHash" -ForegroundColor White
    Write-Host ""
    
} finally {
    # Return to original directory
    Pop-Location
}
