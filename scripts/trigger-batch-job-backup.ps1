# Manual Batch Job Trigger Script with Backend API Integration
# Backend ECS API瑜??듯빐 AWS RDS??Video ?덉퐫?쒕? 癒쇱? ?앹꽦????Batch Job ?ㅽ뻾
# 
# ?ъ슜踰?
#   .\scripts\trigger-batch-job.ps1 -FileName "20250526_193150.mp4" -BackendUrl "https://api.deepsentinel.cloud"
#
# ?꾩젣議곌굔:
# 1. Backend ECS ?쒕퉬?ㅺ? ?ㅽ뻾 以묒씠?댁빞 ??(.\scripts\start-services.ps1)
# 2. S3??鍮꾨뵒???뚯씪???낅줈?쒕릺???덉뼱????

param(
    [string]$FileName = "20250526_193150.mp4",  # ?뚯뒪?몄슜 湲곕낯媛?
    
    [string]$BackendUrl = "https://api.deepsentinel.cloud",  # Backend API URL
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-memi-gpu-queue",
    [string]$JobDefinition = "capstone-dev-memi-processor"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Batch Job Trigger with Backend API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "File Name: $FileName" -ForegroundColor Yellow
Write-Host "Backend URL: $BackendUrl" -ForegroundColor Yellow
Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Yellow
Write-Host ""

# Step 0: Check Backend ECS service is running
Write-Host "Step 0: Backend ECS ?쒕퉬???뺤씤..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-RestMethod -Uri "$BackendUrl/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] Backend ECS ?쒕퉬???ㅽ뻾 以? -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backend ECS ?쒕퉬?ㅺ? ?묐떟?섏? ?딆뒿?덈떎." -ForegroundColor Red
    Write-Host ""
    Write-Host "癒쇱? Backend ?쒕퉬?ㅻ? ?쒖옉?섏꽭??" -ForegroundColor Yellow
    Write-Host "  .\scripts\start-services.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "?먮뒗 Backend留??쒖옉:" -ForegroundColor Yellow
    Write-Host "  aws ecs update-service --cluster capstone-cluster --service capstone-backend-service --desired-count 1 --region $Region" -ForegroundColor Cyan
    exit 1
}
Write-Host ""

# Step 1: Check if original video exists in S3
$originalS3Key = "videos/$FileName"
Write-Host "Step 1: S3?먯꽌 鍮꾨뵒???뺤씤..." -ForegroundColor Yellow
Write-Host "  Path: s3://$S3Bucket/$originalS3Key" -ForegroundColor Gray
$videoExists = aws s3 ls "s3://$S3Bucket/$originalS3Key" --region $Region 2>$null
if (-not $videoExists) {
    Write-Host "[ERROR] S3??鍮꾨뵒?ㅺ? ?놁뒿?덈떎: s3://$S3Bucket/$originalS3Key" -ForegroundColor Red
    Write-Host ""
    Write-Host "鍮꾨뵒?ㅻ? 癒쇱? ?낅줈?쒗븯?몄슂:" -ForegroundColor Yellow
    Write-Host "  aws s3 cp your_video.mp4 s3://$S3Bucket/$originalS3Key --region $Region" -ForegroundColor Cyan
    exit 1
}
Write-Host "[OK] S3?먯꽌 鍮꾨뵒???뺤씤?? -ForegroundColor Green
Write-Host ""

# Step 2: Get video metadata from S3
Write-Host "Step 2: 鍮꾨뵒??硫뷀??곗씠??媛?몄삤湲?.." -ForegroundColor Yellow
$s3Info = aws s3api head-object `
    --bucket $S3Bucket `
    --key $originalS3Key `
    --region $Region `
    --output json | ConvertFrom-Json

$fileSize = $s3Info.ContentLength
Write-Host "[OK] ?뚯씪 ?ш린: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor Green
Write-Host ""

# Step 3: Create Video record via Backend API (AWS RDS)
Write-Host "Step 3: Backend API濡?Video ?앹꽦 (AWS RDS)..." -ForegroundColor Yellow
Write-Host "  Endpoint: $BackendUrl/api/videos/" -ForegroundColor Gray

$videoData = @{
    name = $FileName
    filename = $FileName
    original_filename = $FileName
    file_size = $fileSize
    duration = 0
    s3_bucket = $S3Bucket
    s3_key = $originalS3Key
    video_file = $originalS3Key
    thumbnail_path = ""
    analysis_status = "pending"
    analysis_progress = 0
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$BackendUrl/api/videos/" `
        -Method POST `
        -ContentType "application/json" `
        -Body $videoData `
        -ErrorAction Stop
    
    $VideoId = $response.video_id
    $VideoName = $response.name  # Backend?먯꽌 諛섑솚???뚯씪紐??ъ슜
    
    if (-not $VideoId) {
        Write-Host "[ERROR] Backend API媛 video_id瑜?諛섑솚?섏? ?딆븯?듬땲??" -ForegroundColor Red
        Write-Host "Response:" -ForegroundColor DarkGray
        $response | ConvertTo-Json | Write-Host -ForegroundColor DarkGray
        exit 1
    }
    
    if (-not $VideoName) {
        Write-Host "[WARNING] Backend API媛 name??諛섑솚?섏? ?딆쓬. ?낅젰媛??ъ슜: $FileName" -ForegroundColor Yellow
        $VideoName = $FileName
    }
    
    Write-Host "[OK] Video ?앹꽦 ?깃났 (AWS RDS): video_id = $VideoId, name = $VideoName" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "[ERROR] Backend API ?몄텧 ?ㅽ뙣" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  Status Code: $statusCode" -ForegroundColor Red
    }
    
    Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "  Error Details:" -ForegroundColor Red
            $errorJson | ConvertTo-Json | Write-Host -ForegroundColor DarkGray
        } catch {
            Write-Host "  Raw Error: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
    
    exit 1
}

# Step 4: Organize S3 structure (videos/{video_id}/{filename})
$newS3Key = "videos/$VideoId/$VideoName"
Write-Host "Step 4: S3 援ъ“ ?뺣━..." -ForegroundColor Yellow
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
    Write-Host "[OK] S3 援ъ“ ?뺣━ ?꾨즺" -ForegroundColor Green
}
Write-Host ""

# Step 5: Submit Batch Job
Write-Host "Step 5: AWS Batch Job ?쒖텧..." -ForegroundColor Yellow

$jobName = "manual-test-$VideoId-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Create temporary JSON file (UTF-8 without BOM)
$jsonFile = [System.IO.Path]::GetTempFileName()
$containerOverrides = @"
{
    "environment": [
        {"name": "VIDEO_ID", "value": "$VideoId"},
        {"name": "S3_BUCKET", "value": "$S3Bucket"},
        {"name": "S3_KEY", "value": "$newS3Key"},
        {"name": "VIDEO_NAME", "value": "$VideoName"}
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
Write-Host "[SUCCESS] ?꾨즺" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video Name: $VideoId (AWS RDS????λ맖)" -ForegroundColor White
Write-Host "File Name: $FileName" -ForegroundColor White
Write-Host "S3 Path: s3://$S3Bucket/$newS3Key" -ForegroundColor White
Write-Host "Job ID: $jobId" -ForegroundColor White
Write-Host ""

Write-Host "?ㅼ쓬 ?④퀎:" -ForegroundColor Yellow
Write-Host "1. Job 紐⑤땲?곕쭅:" -ForegroundColor White
Write-Host "   .\scripts\monitor-batch-job.ps1 -JobId $jobId" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Backend?먯꽌 Video ?뺤씤:" -ForegroundColor White
Write-Host "   curl $BackendUrl/api/videos/$VideoId/" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. CloudWatch 濡쒓렇:" -ForegroundColor White
Write-Host "   https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups" -ForegroundColor Cyan
Write-Host ""

# Auto-monitor job
$monitor = Read-Host "Start monitoring job? (yes/no)"
if ($monitor -eq "yes") {
    Write-Host ""
    & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $jobId
}
