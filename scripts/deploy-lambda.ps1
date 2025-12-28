#!/usr/bin/env pwsh
# Lambda Function 배포 스크립트
# sqs_to_batch.py를 zip으로 패키징하고 Terraform으로 배포

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Lambda Function 배포 시작" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 프로젝트 루트로 이동
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Split-Path -Parent $SCRIPT_DIR
Set-Location $PROJECT_ROOT

Write-Host "📁 프로젝트 루트: $PROJECT_ROOT" -ForegroundColor Green

# 1. Lambda 배포 패키지 생성
Write-Host "`n📦 1단계: Lambda 배포 패키지 생성 중..." -ForegroundColor Yellow

$LAMBDA_DIR = Join-Path $PROJECT_ROOT "lambda"
$TERRAFORM_DIR = Join-Path $PROJECT_ROOT "terraform"
$ZIP_FILE = Join-Path $TERRAFORM_DIR "lambda_deployment.zip"

# 기존 zip 파일 삭제
if (Test-Path $ZIP_FILE) {
    Write-Host "🗑️ 기존 zip 파일 삭제: $ZIP_FILE" -ForegroundColor Gray
    Remove-Item $ZIP_FILE -Force
}

# sqs_to_batch.py를 zip으로 압축
Write-Host "📝 sqs_to_batch.py 압축 중..." -ForegroundColor Gray

# PowerShell의 Compress-Archive 사용
$SOURCE_FILE = Join-Path $LAMBDA_DIR "sqs_to_batch.py"

if (-not (Test-Path $SOURCE_FILE)) {
    Write-Host "❌ 오류: $SOURCE_FILE 파일을 찾을 수 없습니다." -ForegroundColor Red
    exit 1
}

Compress-Archive -Path $SOURCE_FILE -DestinationPath $ZIP_FILE -Force

Write-Host "✅ Lambda 배포 패키지 생성 완료: $ZIP_FILE" -ForegroundColor Green

# zip 파일 크기 확인
$fileSize = (Get-Item $ZIP_FILE).Length / 1KB
Write-Host "📊 패키지 크기: $([math]::Round($fileSize, 2)) KB" -ForegroundColor Cyan

# 2. Terraform으로 Lambda 업데이트
Write-Host "`n🚀 2단계: Terraform으로 Lambda 배포 중..." -ForegroundColor Yellow

Set-Location $TERRAFORM_DIR

# Terraform plan 실행
Write-Host "📋 Terraform plan 실행 중..." -ForegroundColor Gray
terraform plan -target=aws_lambda_function.sqs_to_batch -out=tfplan

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform plan 실패" -ForegroundColor Red
    exit 1
}

# 사용자 확인
Write-Host "`n⚠️ Lambda 함수를 업데이트하시겠습니까? (Y/N)" -ForegroundColor Yellow
$confirm = Read-Host

if ($confirm -ne 'Y' -and $confirm -ne 'y') {
    Write-Host "❌ 배포 취소됨" -ForegroundColor Red
    exit 0
}

# Terraform apply 실행
Write-Host "`n🔨 Terraform apply 실행 중..." -ForegroundColor Gray
terraform apply tfplan

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform apply 실패" -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ Lambda Function 배포 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# 배포된 Lambda 정보 확인
Write-Host "`n📊 배포된 Lambda 정보:" -ForegroundColor Cyan
terraform output lambda_function_name
terraform output lambda_function_arn

Write-Host "`n💡 다음 명령어로 로그를 확인할 수 있습니다:" -ForegroundColor Yellow
$functionName = terraform output -raw lambda_function_name
Write-Host "aws logs tail /aws/lambda/$functionName --follow --region ap-northeast-2" -ForegroundColor Gray

Set-Location $PROJECT_ROOT

