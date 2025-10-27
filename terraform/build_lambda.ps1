# Lambda 배포 패키지 생성 스크립트 (Windows PowerShell)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Creating Lambda Deployment Package" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 임시 디렉토리 생성
$TempDir = "lambda_build"
if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}
New-Item -ItemType Directory -Path $TempDir | Out-Null

# Python 파일 복사
Copy-Item -Path "..\lambda\sqs_to_batch.py" -Destination "$TempDir\"

# ZIP 파일 생성
$ZipPath = Join-Path (Get-Location) "lambda_deployment.zip"
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath

# 정리
Remove-Item -Recurse -Force $TempDir

Write-Host "✅ Lambda deployment package created: lambda_deployment.zip" -ForegroundColor Green

$FileSize = (Get-Item $ZipPath).Length / 1KB
Write-Host "File size: $([math]::Round($FileSize, 2)) KB" -ForegroundColor Green
