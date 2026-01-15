# Create Video via Backend ECS API
# AWS Backend ECS API를 호출하여 AWS RDS에 Video 레코드를 생성하고 Batch Job을 트리거
#
# ⚙️ 시스템 구조:
#   - Frontend: AWS ECS/CloudFront
#   - Backend: AWS ECS (Django REST API)
#   - Database: AWS RDS (PostgreSQL)
#   - Storage: AWS S3
#   - Processing: AWS Batch (GPU)
#
# 사용법:
#   .\scripts\create-video-via-api.ps1 -FileName "20250526_193150.mp4" -BackendUrl "http://your-alb.amazonaws.com"
#
# 전제조건:
# 1. S3에 비디오 파일이 업로드되어 있어야 함
# 2. Backend ECS 서비스가 실행 중이어야 함
# 3. Backend URL (ALB DNS)을 알아야 함

param(
    [Parameter(Mandatory=$true)]
    [string]$FileName,  # 비디오 파일명
    
    [string]$S3Bucket = "capstone-dev-raw",
    [string]$S3Key = "",  # S3 키 (비어있으면 videos/{FileName}으로 설정)
    [string]$Region = "ap-northeast-2",
    [string]$BackendUrl = "",  # Backend API URL (비어있으면 ECS 서비스 URL 자동 탐지)
    [string]$JobQueue = "capstone-dev-video-analysis-gpu-queue",
    [string]$JobDefinition = "capstone-dev-video-analysis-processor"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Create Video via Backend API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# S3 키 기본값 설정
if (-not $S3Key) {
    $S3Key = "videos/$FileName"
}

# Step 1: Check if video exists in S3
Write-Host "Step 1: S3에서 비디오 확인..." -ForegroundColor Yellow
Write-Host "  Path: s3://$S3Bucket/$S3Key" -ForegroundColor Gray

$videoExists = aws s3 ls "s3://$S3Bucket/$S3Key" --region $Region 2>$null
if (-not $videoExists) {
    Write-Host "[ERROR] S3에 비디오가 없습니다: s3://$S3Bucket/$S3Key" -ForegroundColor Red
    Write-Host ""
    Write-Host "비디오를 먼저 업로드하세요:" -ForegroundColor Yellow
    Write-Host "  aws s3 cp your_video.mp4 s3://$S3Bucket/$S3Key --region $Region" -ForegroundColor Cyan
    exit 1
}

Write-Host "[OK] S3에서 비디오 확인됨" -ForegroundColor Green
Write-Host ""

# Step 2: Get Backend ECS service URL if not provided
if (-not $BackendUrl) {
    Write-Host "Step 2: Backend ECS 서비스 URL 탐지 중..." -ForegroundColor Yellow
    
    # ECS 클러스터 및 서비스 이름 (환경에 맞게 조정)
    $clusterName = "capstone-dev-cluster"
    $serviceName = "capstone-dev-backend"
    
    # ALB DNS 이름 가져오기 (실제 환경에 맞게 조정 필요)
    try {
        # ECS 서비스에서 로드 밸런서 정보 가져오기
        $serviceInfo = aws ecs describe-services `
            --cluster $clusterName `
            --services $serviceName `
            --region $Region `
            --output json | ConvertFrom-Json
        
        if ($serviceInfo.services.Count -eq 0) {
            Write-Host "[WARNING] ECS 서비스를 찾을 수 없습니다: $serviceName" -ForegroundColor Yellow
            Write-Host "Backend URL을 수동으로 지정해주세요:" -ForegroundColor Yellow
            Write-Host "  .\scripts\create-video-via-api.ps1 -FileName '$FileName' -BackendUrl 'http://your-backend-url'" -ForegroundColor Cyan
            exit 1
        }
        
        # 서비스가 실행 중인지 확인
        $runningCount = $serviceInfo.services[0].runningCount
        if ($runningCount -eq 0) {
            Write-Host "[ERROR] Backend ECS 서비스가 실행 중이 아닙니다." -ForegroundColor Red
            Write-Host ""
            Write-Host "먼저 Backend 서비스를 시작하세요:" -ForegroundColor Yellow
            Write-Host "  aws ecs update-service --cluster $clusterName --service $serviceName --desired-count 1 --region $Region" -ForegroundColor Cyan
            exit 1
        }
        
        # 로드 밸런서 정보에서 DNS 추출
        $loadBalancers = $serviceInfo.services[0].loadBalancers
        if ($loadBalancers.Count -gt 0) {
            $targetGroupArn = $loadBalancers[0].targetGroupArn
            
            # Target Group에서 Load Balancer 정보 가져오기
            $tgInfo = aws elbv2 describe-target-groups `
                --target-group-arns $targetGroupArn `
                --region $Region `
                --output json | ConvertFrom-Json
            
            $lbArn = $tgInfo.TargetGroups[0].LoadBalancerArns[0]
            
            $lbInfo = aws elbv2 describe-load-balancers `
                --load-balancer-arns $lbArn `
                --region $Region `
                --output json | ConvertFrom-Json
            
            $lbDns = $lbInfo.LoadBalancers[0].DNSName
            $BackendUrl = "http://$lbDns"
            
            Write-Host "[OK] Backend URL: $BackendUrl" -ForegroundColor Green
        } else {
            Write-Host "[WARNING] 로드 밸런서 정보를 찾을 수 없습니다." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Backend ALB URL을 수동으로 지정해주세요:" -ForegroundColor Yellow
            Write-Host "  -BackendUrl 'http://your-backend-alb.ap-northeast-2.elb.amazonaws.com'" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "ALB DNS는 AWS Console에서 확인:" -ForegroundColor Yellow
            Write-Host "  EC2 > Load Balancers > DNS name" -ForegroundColor Cyan
            exit 1
        }
        
    } catch {
        Write-Host "[WARNING] ECS 서비스 정보를 가져오는데 실패했습니다: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Backend ALB URL을 수동으로 지정해주세요:" -ForegroundColor Yellow
        Write-Host "  -BackendUrl 'http://your-backend-alb.ap-northeast-2.elb.amazonaws.com'" -ForegroundColor Cyan
        exit 1
    }
} else {
    Write-Host "Step 2: Backend URL (수동 지정)" -ForegroundColor Yellow
    Write-Host "  URL: $BackendUrl" -ForegroundColor Gray
}

Write-Host ""

# Step 3: Get video metadata from S3
Write-Host "Step 3: 비디오 메타데이터 가져오기..." -ForegroundColor Yellow

$s3Info = aws s3api head-object `
    --bucket $S3Bucket `
    --key $S3Key `
    --region $Region `
    --output json | ConECS API to create Video record in RDS
Write-Host "Step 4: Backend ECS API 호출 (AWS RDS에 Video 생성)..." -ForegroundColor Yellow
Write-Host "  Endpoint: $BackendUrl/api/videos/" -ForegroundColor Gray
Write-Host "  Database: AWS RDS PostgreSQL
Write-Host "[OK] 파일 크기: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor Green
Write-Host ""

# Step 4: Call Backend API to create Video record
Write-Host "Step 4: Backend API 호출 (Video 생성)..." -ForegroundColor Yellow
Write-Host "  Endpoint: $BackendUrl/api/videos/" -ForegroundColor Gray

# Video 생성 요청 데이터
$videoData = @{
    name = $FileName
    filename = $FileName
    original_filename = $FileName
    file_size = $fileSize
    duration = 0  # 실제 duration은 Backend에서 추출하거나 별도로 계산 필요
    s3_bucket = $S3Bucket
    s3_key = $S3Key
    video_file = "$S3Key"
    thumbnail_path = ""
    analysis_status = "pending"
    analysis_progress = 0
} | ConvertTo-Json

Write-Host "  요청 데이터:" -ForegroundColor Gray
Write-Host $videoData -ForegroundColor DarkGray

try {
    $response = Invoke-RestMethod `
        -Uri "$BackendUrl/api/videos/" `
        -Method POST `
        -ContentType "application/json" `
        -Body $videoData `
        -ErrorAction Stop
    
    $videoId = $response.video_id
    
    if (-not $videoId) {
        Write-Host "[ERROR] Backend API가 video_id를 반환하지 않았습니다." -ForegroundColor Red
        Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor DarkGray
        exit 1
    }
     (AWS RDS에 저장됨)
    Write-Host "[OK] Video 생성 성공: video_id = $videoId" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "[ERROR] Backend API 호출 실패" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Backend 서비스가 실행 중인지 확인하세요:" -ForegroundColor Yellow
    Write-Host "  curl $BackendUrl/health" -ForegroundColor Cyan
    exit 1
}

# Step 5: Organize S3 structure (videos/{video_id}/{filename})
$newS3Key = "videos/$videoId/$FileName"

Write-Host "Step 5: S3 구조 정리..." -ForegroundColor Yellow
Write-Host "  From: s3://$S3Bucket/$S3Key" -ForegroundColor Gray
Write-Host "  To:   s3://$S3Bucket/$newS3Key" -ForegroundColor Gray

$checkNewPath = aws s3 ls "s3://$S3Bucket/$newS3Key" --region $Region 2>$null
if ($checkNewPath) {
    Write-Host "[OK] 비디오가 이미 정리된 경로에 있습니다." -ForegroundColor Green
} else {
    Write-Host "  복사 중..." -ForegroundColor Gray
    aws s3 cp "s3://$S3Bucket/$S3Key" "s3://$S3Bucket/$newS3Key" --region $Region
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] S3 복사 실패" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "[OK] S3 구조 정리 완료" -ForegroundColor Green
}

Write-Host ""

# Step 6: Submit Batch Job
Write-Host "Step 6: AWS Batch Job 제출..." -ForegroundColor Yellow

$jobName = "api-triggered-$videoId-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Create temporary JSON file (UTF-8 without BOM)
$jsonFile = [System.IO.Path]::GetTempFileName()
$containerOverrides = @"
{
    "environment": [
        {"name": "VIDEO_ID", "value": "$videoId"},
        {"name": "S3_BUCKET", "value": "$S3Bucket"},
        {"name": "S3_KEY", "value": "$newS3Key"},
        {"name": "VIDEO_NAME", "value": "$FileName"}
    ]
}
"@
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
    Write-Host "[ERROR] Batch Job 제출 실패" -ForegroundColor Red
    exit 1
}

$jobInfo = $result | ConvertFrom-Json
$jobId = $jobInfo.jobId

Write-Host "[OK] Batch Job 제출 성공" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] 완료" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video ID: $videoId" -ForegroundColor White
Write-Host "Video Name: $FileName" -ForegroundColor White
Write-Host "S3 Path: s3://$S3Bucket/$newS3Key" -ForegroundColor White
Write-Host "Job ID: $jobId" -ForegroundColor White
Write-Host ""

Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "1. Job 모니터링:" -ForegroundColor White
Write-Host "   .\scripts\monitor-batch-job.ps1 -JobId $jobId" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Backend ECS에서 Video 확인 (AWS RDS):" -ForegroundColor White
Write-Host "   curl $BackendUrl/api/videos/$videoId/" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. CloudWatch 로그:" -ForegroundColor White
Write-Host "   https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. RDS 데이터베이스에서 직접 확인:" -ForegroundColor White
Write-Host "   psql -h <rds-endpoint> -U <username> -d <dbname> -c 'SELECT * FROM db_video WHERE video_id=$videoId;'" -ForegroundColor Cyan
Write-Host ""

# Auto-monitor option
$monitor = Read-Host "Job 모니터링을 시작하시겠습니까? (yes/no)"
if ($monitor -eq "yes") {
    Write-Host ""
    & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $jobId
}
