# Monitor Batch Job Status
# 실시간으로 Job 상태 모니터링

param(
    [Parameter(Mandatory=$true)]
    [string]$JobId,
    [string]$Region = "ap-northeast-2",
    [int]$RefreshInterval = 10  # seconds
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Monitoring Batch Job" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Job ID: $JobId" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Yellow
Write-Host ""

$previousStatus = ""

while ($true) {
    try {
        # Get job details
        $jobJson = aws batch describe-jobs --jobs $JobId --region $Region --output json
        $job = ($jobJson | ConvertFrom-Json).jobs[0]
        
        $status = $job.status
        $statusReason = $job.statusReason
        $createdAt = [DateTimeOffset]::FromUnixTimeMilliseconds($job.createdAt).LocalDateTime
        $startedAt = if ($job.startedAt) { [DateTimeOffset]::FromUnixTimeMilliseconds($job.startedAt).LocalDateTime } else { "N/A" }
        $stoppedAt = if ($job.stoppedAt) { [DateTimeOffset]::FromUnixTimeMilliseconds($job.stoppedAt).LocalDateTime } else { "N/A" }
        
        # Clear screen only if status changed
        if ($status -ne $previousStatus) {
            Clear-Host
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "Batch Job Status Monitor" -ForegroundColor Cyan
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host ""
        }
        
        $previousStatus = $status
        
        # Status with color
        $statusColor = switch ($status) {
            "SUBMITTED" { "Yellow" }
            "PENDING" { "Yellow" }
            "RUNNABLE" { "Cyan" }
            "STARTING" { "Cyan" }
            "RUNNING" { "Green" }
            "SUCCEEDED" { "Green" }
            "FAILED" { "Red" }
            default { "White" }
        }
        
        Write-Host "Job ID: " -NoNewline -ForegroundColor White
        Write-Host $JobId -ForegroundColor Cyan
        Write-Host "Status: " -NoNewline -ForegroundColor White
        Write-Host $status -ForegroundColor $statusColor
        
        if ($statusReason) {
            Write-Host "Reason: " -NoNewline -ForegroundColor White
            Write-Host $statusReason -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "Timeline:" -ForegroundColor Cyan
        Write-Host "  Created:  $createdAt" -ForegroundColor White
        Write-Host "  Started:  $startedAt" -ForegroundColor White
        Write-Host "  Stopped:  $stoppedAt" -ForegroundColor White
        
        # Show attempts if any
        if ($job.attempts -and $job.attempts.Count -gt 0) {
            Write-Host ""
            Write-Host "Attempts:" -ForegroundColor Cyan
            foreach ($attempt in $job.attempts) {
                $attemptStatus = $attempt.container.exitCode
                $attemptReason = $attempt.statusReason
                Write-Host "  - Exit Code: $attemptStatus" -ForegroundColor White
                if ($attemptReason) {
                    Write-Host "    Reason: $attemptReason" -ForegroundColor Yellow
                }
            }
        }
        
        Write-Host ""
        Write-Host "Last Updated: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
        
        # Terminal states
        if ($status -eq "SUCCEEDED") {
            Write-Host ""
            Write-Host "[SUCCESS] Job completed successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "View logs:" -ForegroundColor Yellow
            Write-Host "  aws logs tail /aws/batch/capstone-video-analysis-processor --follow --region $Region" -ForegroundColor Cyan
            break
        }
        
        if ($status -eq "FAILED") {
            Write-Host ""
            Write-Host "[FAILED] Job failed!" -ForegroundColor Red
            Write-Host ""
            Write-Host "Check logs for details:" -ForegroundColor Yellow
            Write-Host "  aws logs tail /aws/batch/capstone-video-analysis-processor --region $Region" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Common issues:" -ForegroundColor Yellow
            Write-Host "  - EC2 instance failed to start (check AMI)" -ForegroundColor White
            Write-Host "  - Docker image pull failed (check ECR permissions)" -ForegroundColor White
            Write-Host "  - Container crashed (check CloudWatch logs)" -ForegroundColor White
            break
        }
        
        # Wait before next refresh
        Start-Sleep -Seconds $RefreshInterval
        
    } catch {
        Write-Host "[ERROR] Failed to get job status: $_" -ForegroundColor Red
        Start-Sleep -Seconds $RefreshInterval
    }
}
