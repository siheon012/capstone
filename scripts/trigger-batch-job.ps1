# Manual Batch Job Trigger Script with Backend API Integration
# Backend ECS API to AWS RDS then Batch Job
# Usage: .\scripts\trigger-batch-job.ps1 -FileName "video.mp4"

param(
    [string]$FileName = "20250526_193150.mp4",
    [string]$BackendUrl = "",  # Empty = auto-detect (ALB first, then ECS task IP)
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-video-analysis-gpu-queue",
    [string]$JobDefinition = "capstone-dev-video-analysis-processor"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Batch Job Trigger with Backend API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "File Name: $FileName" -ForegroundColor Yellow
Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Yellow
Write-Host ""

# Step 0: Get Backend URL (auto-detect if not provided)
if (-not $BackendUrl) {
    Write-Host "Step 0: Auto-detecting Backend URL..." -ForegroundColor Yellow
    
    # Try to get ALB DNS from Terraform output first
    try {
        Push-Location "$PSScriptRoot\..\terraform"
        $albDns = terraform output -raw alb_dns_name 2>$null
        Pop-Location
        
        if ($albDns -and $albDns -ne "") {
            $BackendUrl = "http://$albDns"
            Write-Host "[OK] Using ALB: $albDns" -ForegroundColor Green
            Write-Host "     Backend URL: $BackendUrl" -ForegroundColor Green
        }
    } catch {
        Pop-Location
        Write-Host "[WARNING] Could not get ALB DNS from Terraform" -ForegroundColor Yellow
    }
    
    # If ALB not found, fallback to ECS task IP
    if (-not $BackendUrl) {
        Write-Host "Falling back to ECS task IP detection..." -ForegroundColor Yellow
        
        # Get running task ARN
        $taskArns = aws ecs list-tasks --cluster capstone-cluster --service-name capstone-backend-service --region $Region --output json | ConvertFrom-Json
        
        if ($taskArns.taskArns.Count -eq 0) {
            Write-Host "[ERROR] No Backend ECS tasks running" -ForegroundColor Red
            Write-Host "Start Backend first: .\scripts\start-services.ps1" -ForegroundColor Yellow
            exit 1
        }
        
        $taskArn = $taskArns.taskArns[0]
        
        # Get task details
        $taskJson = aws ecs describe-tasks --cluster capstone-cluster --tasks $taskArn --region $Region --output json
        $task = $taskJson | ConvertFrom-Json
        
        # Get ENI ID
        $eniId = $null
        foreach ($detail in $task.tasks[0].attachments[0].details) {
            if ($detail.name -eq "networkInterfaceId") {
                $eniId = $detail.value
                break
            }
        }
        
        if (-not $eniId) {
            Write-Host "[ERROR] Could not find ENI ID" -ForegroundColor Red
            exit 1
        }
        
        # Get Public IP
        $publicIp = aws ec2 describe-network-interfaces --network-interface-ids $eniId --region $Region --query 'NetworkInterfaces[0].Association.PublicIp' --output text
        
        if ($publicIp -and $publicIp -ne "None" -and $publicIp -ne "") {
            $BackendUrl = "http://${publicIp}:8000"
            Write-Host "[OK] Using ECS task IP: $publicIp" -ForegroundColor Green
            Write-Host "     Backend URL: $BackendUrl" -ForegroundColor Green
            Write-Host "[WARNING] Direct ECS task access may fail due to security groups" -ForegroundColor Yellow
        } else {
            Write-Host "[ERROR] Could not get Backend URL" -ForegroundColor Red
            Write-Host "Make sure ALB or ECS task with public IP is available" -ForegroundColor Yellow
            exit 1
        }
    }
} else {
    Write-Host "Step 0: Using provided Backend URL..." -ForegroundColor Yellow
    Write-Host "     Backend URL: $BackendUrl" -ForegroundColor Green
}

Write-Host ""

# Step 1: Check Backend health
Write-Host "Step 1: Backend health check..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-RestMethod -Uri "$BackendUrl/api/health/" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] Backend responding" -ForegroundColor Green
    Write-Host "     Status: $($healthCheck.status)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backend not responding at $BackendUrl" -ForegroundColor Red
    Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Check S3 video
$originalS3Key = "videos/$FileName"
Write-Host "Step 2: Check S3 video..." -ForegroundColor Yellow
Write-Host "  Path: s3://$S3Bucket/$originalS3Key" -ForegroundColor Gray
$videoExists = aws s3 ls "s3://$S3Bucket/$originalS3Key" --region $Region 2>$null
if (-not $videoExists) {
    Write-Host "[ERROR] Video not found in S3" -ForegroundColor Red
    Write-Host "Upload first: aws s3 cp your_video.mp4 s3://$S3Bucket/$originalS3Key" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Video found in S3" -ForegroundColor Green
Write-Host ""

# Step 3: Get metadata
Write-Host "Step 3: Get metadata..." -ForegroundColor Yellow
$s3Info = aws s3api head-object --bucket $S3Bucket --key $originalS3Key --region $Region --output json | ConvertFrom-Json
$fileSize = $s3Info.ContentLength
Write-Host "[OK] File size: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor Green
Write-Host ""

# Step 4: Create Video via Backend API
Write-Host "Step 4: Create Video (AWS RDS)..." -ForegroundColor Yellow
Write-Host "  Endpoint: $BackendUrl/api/videos/" -ForegroundColor Gray

$videoData = @{
    name = $FileName
    filename = $FileName
    original_filename = $FileName
    file_size = $fileSize
    duration = 0
    s3_bucket = $S3Bucket
    s3_key = $originalS3Key
    s3_raw_key = $originalS3Key
    thumbnail_s3_key = ""
    analysis_status = "pending"
    analysis_progress = 0
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/videos/" -Method POST -ContentType "application/json" -Body $videoData -ErrorAction Stop
    
    $VideoId = $response.video_id
    $VideoName = if ($response.name) { $response.name } else { $FileName }
    
    if (-not $VideoId) {
        Write-Host "[ERROR] No video_id returned" -ForegroundColor Red
        $response | ConvertTo-Json | Write-Host -ForegroundColor DarkGray
        exit 1
    }
    
    Write-Host "[OK] Video created (AWS RDS): video_id = $VideoId, name = $VideoName" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "[ERROR] Backend API failed" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  Status: $statusCode" -ForegroundColor Red
        
        # Try to get detailed error message from response body
        try {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($responseStream)
            $responseBody = $reader.ReadToEnd()
            Write-Host "  Response: $responseBody" -ForegroundColor Red
        } catch {
            Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host "  Sent data:" -ForegroundColor Gray
    Write-Host $videoData -ForegroundColor DarkGray
    exit 1
}

# Step 5: Organize S3
$newS3Key = "videos/$VideoId/$VideoName"
Write-Host "Step 5: Organize S3..." -ForegroundColor Yellow
Write-Host "  From: s3://$S3Bucket/$originalS3Key" -ForegroundColor Gray
Write-Host "  To:   s3://$S3Bucket/$newS3Key" -ForegroundColor Gray

$checkNewPath = aws s3 ls "s3://$S3Bucket/$newS3Key" --region $Region 2>$null
if ($checkNewPath) {
    Write-Host "[OK] Already at correct path" -ForegroundColor Green
} else {
    Write-Host "  Copying..." -ForegroundColor Gray
    aws s3 cp "s3://$S3Bucket/$originalS3Key" "s3://$S3Bucket/$newS3Key" --region $Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to copy" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] S3 organized" -ForegroundColor Green
}
Write-Host ""

# Step 6: Submit Batch Job
Write-Host "Step 6: Submit Batch Job..." -ForegroundColor Yellow

$jobName = "api-test-$VideoId-$(Get-Date -Format 'yyyyMMddHHmmss')"
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

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($jsonFile, $containerOverrides, $utf8NoBom)

$result = aws batch submit-job --job-name $jobName --job-queue $JobQueue --job-definition $JobDefinition --container-overrides file://$jsonFile --region $Region --output json
Remove-Item $jsonFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to submit job" -ForegroundColor Red
    exit 1
}

$jobInfo = $result | ConvertFrom-Json
$jobId = $jobInfo.jobId

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video ID: $VideoId (saved in AWS RDS)" -ForegroundColor White
Write-Host "Video Name: $VideoName" -ForegroundColor White
Write-Host "S3 Path: s3://$S3Bucket/$newS3Key" -ForegroundColor White
Write-Host "Job ID: $jobId" -ForegroundColor White
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Monitor: .\scripts\monitor-batch-job.ps1 -JobId $jobId" -ForegroundColor Cyan
Write-Host "2. Check Video: curl $BackendUrl/api/videos/$VideoId/" -ForegroundColor Cyan
Write-Host ""

$monitor = Read-Host "Start monitoring? (yes/no)"
if ($monitor -eq "yes") {
    & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $jobId
}