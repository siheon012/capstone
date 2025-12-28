# Get CloudWatch Logs for Failed Batch Job
# Exit Code 127 디버깅용
# 귀찮으면 이거로  aws logs tail /aws/batch/capstone-memi-processor --follow --region ap-northeast-2
param(
    [string]$JobId = "",
    [string]$LogGroup = "/aws/batch/capstone-memi-processor",
    [string]$Region = "ap-northeast-2",
    [int]$Minutes = 30
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CloudWatch Logs Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($JobId) {
    Write-Host "Job ID: $JobId" -ForegroundColor Yellow
    
    # Get log stream name for this job
    $logStreamsJson = aws logs describe-log-streams `
        --log-group-name $LogGroup `
        --order-by LastEventTime `
        --descending `
        --region $Region `
        --output json
    
    $logStreams = ($logStreamsJson | ConvertFrom-Json).logStreams
    
    # Find stream containing job ID
    $matchingStream = $logStreams | Where-Object { $_.logStreamName -like "*$JobId*" } | Select-Object -First 1
    
    if ($matchingStream) {
        Write-Host "Log Stream: $($matchingStream.logStreamName)" -ForegroundColor Yellow
        Write-Host ""
        
        # Get logs from this stream
        $logsJson = aws logs get-log-events `
            --log-group-name $LogGroup `
            --log-stream-name $matchingStream.logStreamName `
            --region $Region `
            --output json
        
        $events = ($logsJson | ConvertFrom-Json).events
        
        if ($events) {
            Write-Host "Logs:" -ForegroundColor Cyan
            Write-Host "----------------------------------------" -ForegroundColor Gray
            foreach ($event in $events) {
                $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($event.timestamp).LocalDateTime.ToString("HH:mm:ss")
                $message = $event.message
                
                # Color code errors
                if ($message -match "ERROR|FAIL|error|failed") {
                    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
                    Write-Host $message -ForegroundColor Red
                } elseif ($message -match "WARNING|WARN|warning") {
                    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
                    Write-Host $message -ForegroundColor Yellow
                } else {
                    Write-Host "[$timestamp] $message" -ForegroundColor White
                }
            }
        } else {
            Write-Host "[WARNING] No logs found for this job" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARNING] No log stream found for job ID: $JobId" -ForegroundColor Yellow
        Write-Host "Showing recent logs instead..." -ForegroundColor Yellow
        Write-Host ""
    }
} else {
    Write-Host "Showing recent logs (last $Minutes minutes)..." -ForegroundColor Yellow
    Write-Host ""
}

# Show recent logs
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Recent Logs (last $Minutes minutes)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$since = "${Minutes}m"
aws logs tail $LogGroup --since $since --region $Region --format short

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To follow live logs:" -ForegroundColor Yellow
Write-Host "  aws logs tail $LogGroup --follow --region $Region" -ForegroundColor Cyan
Write-Host ""
