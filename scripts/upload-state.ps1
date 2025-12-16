# Upload Terraform State to S3
# Usage: .\scripts\upload-state.ps1

param(
    [string]$Region = "ap-northeast-2",
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

$BucketName = "capstone-$Environment-terraform-state-backup"
$StateFile = "terraform\terraform.tfstate"
$BackupFile = "terraform\terraform.tfstate.backup"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Uploading Terraform State to S3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bucket: $BucketName" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host ""

# Check if state file exists
if (-not (Test-Path $StateFile)) {
    Write-Host "[ERROR] terraform.tfstate not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

# Upload current state
Write-Host "Uploading terraform.tfstate..." -ForegroundColor Yellow
aws s3 cp $StateFile "s3://$BucketName/terraform.tfstate" --region $Region
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to upload terraform.tfstate" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] terraform.tfstate uploaded" -ForegroundColor Green

# Upload timestamped backup
Write-Host "Uploading timestamped backup..." -ForegroundColor Yellow
aws s3 cp $StateFile "s3://$BucketName/backups/terraform.tfstate.$Timestamp" --region $Region
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Failed to upload timestamped backup" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Backup uploaded: terraform.tfstate.$Timestamp" -ForegroundColor Green
}

# Upload backup file if exists
if (Test-Path $BackupFile) {
    Write-Host "Uploading terraform.tfstate.backup..." -ForegroundColor Yellow
    aws s3 cp $BackupFile "s3://$BucketName/terraform.tfstate.backup" --region $Region
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] terraform.tfstate.backup uploaded" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] State uploaded to S3" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "- Commit and push your Terraform changes to Git" -ForegroundColor White
Write-Host "- Notify team members to download latest state" -ForegroundColor White
Write-Host ""
