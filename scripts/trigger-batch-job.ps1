# Manual Batch Job Trigger Script
# 영상 업로드 없이 직접 Batch Job 실행하여 EC2/ECS 문제 디버깅

param(
    [string]$VideoId = "test_$(Get-Date -Format 'yyyyMMddHHmmss')",
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$S3Key = "videos/test_video.mp4",  # 이미 업로드된 테스트 영상
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-memi-gpu-queue",
    [string]$JobDefinition = "capstone-dev-memi-processor"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Manual Batch Job Trigger" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video ID: $VideoId" -ForegroundColor Yellow
Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Yellow
Write-Host "S3 Key: $S3Key" -ForegroundColor Yellow
Write-Host "Job Queue: $JobQueue" -ForegroundColor Yellow
Write-Host "Job Definition: $JobDefinition" -ForegroundColor Yellow
Write-Host ""

# Check if test video exists in S3
Write-Host "Checking if test video exists in S3..." -ForegroundColor Yellow
$videoExists = aws s3 ls "s3://$S3Bucket/$S3Key" --region $Region 2>$null
if (-not $videoExists) {
    Write-Host "[WARNING] Test video not found in S3: s3://$S3Bucket/$S3Key" -ForegroundColor Yellow
    Write-Host "You can upload a test video with:" -ForegroundColor White
    Write-Host "  aws s3 cp test_video.mp4 s3://$S3Bucket/$S3Key --region $Region" -ForegroundColor Cyan
    Write-Host ""
    $response = Read-Host "Continue anyway? (yes/no)"
    if ($response -ne "yes") {
        exit 0
    }
} else {
    Write-Host "[OK] Test video found" -ForegroundColor Green
}

# Submit Batch Job
Write-Host ""
Write-Host "Submitting Batch Job..." -ForegroundColor Yellow

$jobName = "manual-test-$VideoId"

# Create temporary JSON file (UTF-8 without BOM)
$jsonFile = [System.IO.Path]::GetTempFileName()
$containerOverrides = @"
{
    "environment": [
        {"name": "VIDEO_ID", "value": "$VideoId"},
        {"name": "S3_BUCKET", "value": "$S3Bucket"},
        {"name": "S3_KEY", "value": "$S3Key"}
    ]
}
"@
# Write with UTF-8 without BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($jsonFile, $containerOverrides, $utf8NoBom)

$result = aws batch submit-job `
    --job-name $jobName `
    --job-queue $JobQueue `
    --job-definition $JobDefinition `
    --container-overrides file://$jsonFile `
    --region $Region `
    --output json

# Cleanup
Remove-Item $jsonFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to submit job" -ForegroundColor Red
    exit 1
}

$jobInfo = $result | ConvertFrom-Json
$jobId = $jobInfo.jobId

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Job Submitted" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Job Name: $jobName" -ForegroundColor White
Write-Host "Job ID: $jobId" -ForegroundColor White
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Monitor job status:" -ForegroundColor White
Write-Host "   .\scripts\monitor-batch-job.ps1 -JobId $jobId" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. View logs in CloudWatch:" -ForegroundColor White
Write-Host "   https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups/log-group/`$252Faws`$252Fbatch`$252Fcapstone-memi-processor" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Check job in AWS Console:" -ForegroundColor White
Write-Host "   https://ap-northeast-2.console.aws.amazon.com/batch/home?region=ap-northeast-2#jobs/detail/$jobId" -ForegroundColor Cyan
Write-Host ""

# Auto-monitor job
$monitor = Read-Host "Start monitoring job? (yes/no)"
if ($monitor -eq "yes") {
    Write-Host ""
    & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $jobId
}
