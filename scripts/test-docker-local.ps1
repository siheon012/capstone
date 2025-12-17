# Test Batch Docker Image Locally
# AWS Batch 없이 로컬에서 컨테이너 테스트

param(
    [string]$VideoPath = "test_video.mp4",
    [string]$VideoId = "local_test_$(Get-Date -Format 'yyyyMMddHHmmss')",
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$S3Key = "videos/test_video.mp4"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Local Docker Image Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if video exists
if (-not (Test-Path $VideoPath)) {
    Write-Host "[ERROR] Video file not found: $VideoPath" -ForegroundColor Red
    exit 1
}

# Build image if needed
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -f batch/Dockerfile -t capstone-batch-test:latest .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker image built" -ForegroundColor Green
Write-Host ""

# Create local directories
$outputDir = "batch_test_output"
$videosDir = "batch_test_videos"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $videosDir | Out-Null

# Copy test video
Copy-Item $VideoPath "$videosDir/video_$VideoId.mp4"

Write-Host "Running container locally..." -ForegroundColor Yellow
Write-Host "Note: S3 download will fail (expected), testing container setup only" -ForegroundColor Yellow
Write-Host ""

# Run container with mock environment
docker run --rm `
    -v "${PWD}/${outputDir}:/workspace/output" `
    -v "${PWD}/${videosDir}:/workspace/videos" `
    -e VIDEO_ID=$VideoId `
    -e S3_BUCKET=$S3Bucket `
    -e S3_KEY=$S3Key `
    -e POSTGRES_HOST=localhost `
    -e POSTGRES_PORT=5432 `
    -e POSTGRES_DB=capstone `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=test `
    -e AWS_DEFAULT_REGION=ap-northeast-2 `
    -e CUDA_VISIBLE_DEVICES=0 `
    capstone-batch-test:latest

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Check output in: $outputDir" -ForegroundColor White
Write-Host ""
