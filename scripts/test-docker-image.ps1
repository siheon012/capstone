# Quick Test: Check if AWS CLI is installed in Docker image
# awscli 설치 확인용

param(
    [string]$ImageName = "capstone-dev-batch-processor:latest"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Docker Image" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check AWS CLI
Write-Host "Test 1: Checking AWS CLI..." -ForegroundColor Yellow
docker run --rm $ImageName aws --version
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] AWS CLI installed" -ForegroundColor Green
} else {
    Write-Host "[FAIL] AWS CLI not found" -ForegroundColor Red
}
Write-Host ""

# Test 2: Check Python
Write-Host "Test 2: Checking Python..." -ForegroundColor Yellow
docker run --rm $ImageName python3 --version
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Python3 installed" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Python3 not found" -ForegroundColor Red
}
Write-Host ""

# Test 3: Check entrypoint.sh
Write-Host "Test 3: Checking entrypoint.sh..." -ForegroundColor Yellow
docker run --rm $ImageName ls -la /workspace/entrypoint.sh
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] entrypoint.sh exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] entrypoint.sh not found" -ForegroundColor Red
}
Write-Host ""

# Test 4: Check run_memi_analysis.py
Write-Host "Test 4: Checking run_memi_analysis.py..." -ForegroundColor Yellow
docker run --rm $ImageName ls -la /workspace/run_memi_analysis.py
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] run_memi_analysis.py exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] run_memi_analysis.py not found" -ForegroundColor Red
}
Write-Host ""

# Test 5: Check models
Write-Host "Test 5: Checking model files..." -ForegroundColor Yellow
docker run --rm $ImageName ls -la /workspace/models/
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Model directory exists" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Model directory not found" -ForegroundColor Red
}
Write-Host ""

# Test 6: Import test
Write-Host "Test 6: Testing Python imports..." -ForegroundColor Yellow
docker run --rm $ImageName python3 -c "import torch; import boto3; print('Imports OK')"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Python packages importable" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Import errors" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Image Test Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
