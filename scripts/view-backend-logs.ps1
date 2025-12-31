# Backend ECS CloudWatch 로그 확인 스크립트
param(
    [string]$Region = "ap-northeast-2",
    [int]$TailLines = 100,
    [switch]$Follow
)

$LogGroup = "/ecs/capstone-backend"
$ServiceName = "capstone-backend-service"
$ClusterName = "capstone-cluster"

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " Backend ECS Logs Viewer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Log Group: $LogGroup" -ForegroundColor White
Write-Host "Region: $Region" -ForegroundColor White
Write-Host ""

# 최신 로그 스트림 찾기
Write-Host "Finding latest log stream..." -ForegroundColor Yellow
$streams = aws logs describe-log-streams `
    --log-group-name $LogGroup `
    --order-by LastEventTime `
    --descending `
    --max-items 5 `
    --region $Region `
    --output json | ConvertFrom-Json

if (-not $streams.logStreams -or $streams.logStreams.Count -eq 0) {
    Write-Host "[ERROR] No log streams found in $LogGroup" -ForegroundColor Red
    Write-Host ""
    Write-Host "Checking if ECS service is running..." -ForegroundColor Yellow
    
    $service = aws ecs describe-services `
        --cluster $ClusterName `
        --services $ServiceName `
        --region $Region `
        --output json | ConvertFrom-Json
    
    if ($service.services.Count -eq 0) {
        Write-Host "[ERROR] Service $ServiceName not found" -ForegroundColor Red
    } else {
        $runningCount = $service.services[0].runningCount
        $desiredCount = $service.services[0].desiredCount
        Write-Host "Service Status: Running=$runningCount, Desired=$desiredCount" -ForegroundColor White
        
        if ($desiredCount -eq 0) {
            Write-Host "[WARNING] Service is stopped (desired count = 0)" -ForegroundColor Yellow
            Write-Host "Start service with: .\scripts\start-services.ps1" -ForegroundColor Cyan
        }
    }
    exit 1
}

Write-Host "Found $($streams.logStreams.Count) log streams" -ForegroundColor Green
Write-Host ""

# 각 로그 스트림의 최신 로그 표시
foreach ($stream in $streams.logStreams) {
    $streamName = $stream.logStreamName
    Write-Host "=== Stream: $streamName ===" -ForegroundColor Cyan
    Write-Host "Last Event: $(if ($stream.lastEventTimestamp) { [DateTimeOffset]::FromUnixTimeMilliseconds($stream.lastEventTimestamp).LocalDateTime } else { 'N/A' })" -ForegroundColor Gray
    
    # 최신 로그 가져오기
    $events = aws logs get-log-events `
        --log-group-name $LogGroup `
        --log-stream-name $streamName `
        --limit $TailLines `
        --region $Region `
        --output json | ConvertFrom-Json
    
    if ($events.events -and $events.events.Count -gt 0) {
        foreach ($event in $events.events) {
            $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($event.timestamp).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")
            $message = $event.message.TrimEnd()
            
            # 색상 코딩
            if ($message -match "ERROR|Exception|Traceback") {
                Write-Host "[$timestamp] $message" -ForegroundColor Red
            } elseif ($message -match "WARNING|WARN") {
                Write-Host "[$timestamp] $message" -ForegroundColor Yellow
            } elseif ($message -match "INFO|Starting|Listening") {
                Write-Host "[$timestamp] $message" -ForegroundColor Green
            } elseif ($message -match "DEBUG") {
                Write-Host "[$timestamp] $message" -ForegroundColor Gray
            } else {
                Write-Host "[$timestamp] $message" -ForegroundColor White
            }
        }
    } else {
        Write-Host "  (No events in this stream)" -ForegroundColor Gray
    }
    Write-Host ""
}

# Follow 모드
if ($Follow) {
    Write-Host "Following logs (Ctrl+C to stop)..." -ForegroundColor Cyan
    Write-Host ""
    
    $latestStream = $streams.logStreams[0].logStreamName
    
    # tail -f 처럼 실시간 로그 표시
    aws logs tail $LogGroup `
        --follow `
        --format short `
        --region $Region
}

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "To follow logs in real-time, use:" -ForegroundColor Yellow
Write-Host "  .\scripts\view-backend-logs.ps1 -Follow" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
