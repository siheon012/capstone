# Download Terraform State from S3
# Usage: .\scripts\download-state.ps1

param(
    [string]$Region = "ap-northeast-2",
    [string]$Environment = "dev",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$BucketName = "capstone-$Environment-terraform-state-backup"
$StateFile = "terraform\terraform.tfstate"
$BackupFile = "terraform\terraform.tfstate.backup"
$LocalBackup = "terraform\terraform.tfstate.local_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading Terraform State from S3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bucket: $BucketName" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host ""

# Check if local state exists
if ((Test-Path $StateFile) -and (-not $Force)) {
    Write-Host "[WARNING] Local terraform.tfstate exists!" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Overwrite local state? (yes/no)"
    if ($response -ne "yes") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
    
    # Backup local state
    Write-Host "Backing up local state to: $LocalBackup" -ForegroundColor Yellow
    Copy-Item $StateFile $LocalBackup
    Write-Host "[OK] Local state backed up" -ForegroundColor Green
}

# Download current state
Write-Host "Downloading terraform.tfstate..." -ForegroundColor Yellow
aws s3 cp "s3://$BucketName/terraform.tfstate" $StateFile --region $Region
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to download terraform.tfstate" -ForegroundColor Red
    Write-Host "Make sure the bucket exists and you have access." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] terraform.tfstate downloaded" -ForegroundColor Green

# Download backup file
Write-Host "Downloading terraform.tfstate.backup..." -ForegroundColor Yellow
aws s3 cp "s3://$BucketName/terraform.tfstate.backup" $BackupFile --region $Region
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] terraform.tfstate.backup downloaded" -ForegroundColor Green
} else {
    Write-Host "[WARNING] terraform.tfstate.backup not found (this is okay)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] State downloaded from S3" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "- Run 'terraform plan' to verify state" -ForegroundColor White
Write-Host "- Make your changes" -ForegroundColor White
Write-Host "- Run '.\scripts\upload-state.ps1' after terraform apply" -ForegroundColor White
Write-Host ""

# Show state info
Write-Host "State file info:" -ForegroundColor Cyan
$stateInfo = Get-Item $StateFile
Write-Host "  Size: $([math]::Round($stateInfo.Length / 1KB, 2)) KB" -ForegroundColor White
Write-Host "  Modified: $($stateInfo.LastWriteTime)" -ForegroundColor White
Write-Host ""
