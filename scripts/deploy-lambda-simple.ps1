#!/usr/bin/env pwsh
# Lambda Function Deployment Script

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Lambda Function Deployment Started" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Move to project root
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Split-Path -Parent $SCRIPT_DIR
Set-Location $PROJECT_ROOT

Write-Host "Project Root: $PROJECT_ROOT" -ForegroundColor Green

# Create Lambda zip package
$LAMBDA_DIR = Join-Path $PROJECT_ROOT "lambda"
$TERRAFORM_DIR = Join-Path $PROJECT_ROOT "terraform"
$ZIP_FILE = Join-Path $TERRAFORM_DIR "lambda_deployment.zip"
$SOURCE_FILE = Join-Path $LAMBDA_DIR "sqs_to_batch.py"

Write-Host "`nCreating Lambda deployment package..." -ForegroundColor Yellow

if (-not (Test-Path $SOURCE_FILE)) {
    Write-Host "ERROR: Cannot find $SOURCE_FILE" -ForegroundColor Red
    exit 1
}

if (Test-Path $ZIP_FILE) {
    Remove-Item $ZIP_FILE -Force
}

Compress-Archive -Path $SOURCE_FILE -DestinationPath $ZIP_FILE -Force

$fileSize = (Get-Item $ZIP_FILE).Length / 1KB
Write-Host "Package created: $([math]::Round($fileSize, 2)) KB" -ForegroundColor Green

# Update Lambda using AWS CLI
Write-Host "`nUpdating Lambda function..." -ForegroundColor Yellow

aws lambda update-function-code `
    --function-name capstone-dev-sqs-to-batch `
    --zip-file fileb://$ZIP_FILE `
    --region ap-northeast-2

if ($LASTEXITCODE -ne 0) {
    Write-Host "Lambda update failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Lambda Function Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nView logs with:" -ForegroundColor Yellow
Write-Host 'aws logs tail /aws/lambda/capstone-dev-sqs-to-batch --follow --region ap-northeast-2' -ForegroundColor Gray

Set-Location $PROJECT_ROOT
 