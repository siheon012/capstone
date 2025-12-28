# Manual Batch Job Trigger Script
# 영상 업로드 없이 직접 Batch Job 실행하여 EC2/ECS 문제 디버깅
# 사용법:
#   .\scripts\trigger-batch-job.ps1 -FileName "20250526_193150.mp4" -VideoId 123
#
# VideoId를 모르면 Django shell에서 확인:
#   python manage.py shell -c "from apps.db.models import Video; print(Video.objects.filter(name='20250526_193150.mp4').values_list('video_id', flat=True).first())"

param(
    [string]$FileName = "20250526_193150.mp4",  # videos/ 폴더에 있는 파일명
    [Parameter(Mandatory=$true)]
    [string]$VideoId,  # DB의 video_id (필수)
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-memi-gpu-queue",
    [string]$JobDefinition = "capstone-dev-memi-processor"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Manual Batch Job Trigger" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video ID: $VideoId" -ForegroundColor Yellow
Write-Host "File Name: $FileName" -ForegroundColor Yellow
Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Yellow
Write-Host ""

# Step 1: Check if original video exists in S3
$originalS3Key = "videos/$FileName"
Write-Host "Step 1: Checking if video exists in S3..." -ForegroundColor Yellow
Write-Host "  Path: s3://$S3Bucket/$originalS3Key" -ForegroundColor Gray
$videoExists = aws s3 ls "s3://$S3Bucket/$originalS3Key" --region $Region 2>$null
if (-not $videoExists) {
    Write-Host "[ERROR] Video not found in S3: s3://$S3Bucket/$originalS3Key" -ForegroundColor Red
    Write-Host "Upload a video first with:" -ForegroundColor Yellow
    Write-Host "  aws s3 cp your_video.mp4 s3://$S3Bucket/$originalS3Key --region $Region" -ForegroundColor Cyan
    exit 1
}
Write-Host "[OK] Video found in S3" -ForegroundColor Green

# Step 2: Copy video to video_id folder structure (videos/{video_id}/{filename})
$newS3Key = "videos/$VideoId/$FileName"
Write-Host ""
Write-Host "Step 2: Organizing S3 structure..." -ForegroundColor Yellow
Write-Host "  From: s3://$S3Bucket/$originalS3Key" -ForegroundColor Gray
Write-Host "  To:   s3://$S3Bucket/$newS3Key" -ForegroundColor Gray

$checkNewPath = aws s3 ls "s3://$S3Bucket/$newS3Key" --region $Region 2>$null
if ($checkNewPath) {
    Write-Host "[OK] Video already exists at correct path" -ForegroundColor Green
} else {
    Write-Host "  Copying video to video_id folder..." -ForegroundColor Gray
    aws s3 cp "s3://$S3Bucket/$originalS3Key" "s3://$S3Bucket/$newS3Key" --region $Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to copy video" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Video copied successfully" -ForegroundColor Green
}

# Step 3: Submit Batch Job
Write-Host ""
Write-Host "Step 3: Submitting Batch Job..." -ForegroundColor Yellow

$jobName = "manual-test-$VideoId-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Create temporary JSON file (UTF-8 without BOM)
$jsonFile = [System.IO.Path]::GetTempFileName()
$containerOverrides = @"
{
    "environment": [
        {"name": "VIDEO_ID", "value": "$VideoId"},
        {"name": "S3_BUCKET", "value": "$S3Bucket"},
        {"name": "S3_KEY", "value": "$newS3Key"}
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
Write-Host "Video ID: $VideoId" -ForegroundColor White
Write-Host "S3 Path: s3://$S3Bucket/$newS3Key" -ForegroundColor White
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
