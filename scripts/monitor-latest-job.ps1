# Monitor Latest Batch Job
# 가장 최근에 생성된 Job을 자동으로 찾아서 모니터링

param(
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-video-analysis-gpu-queue",
    [string]$Status = "",  # 비어있으면 모든 상태
    [int]$Limit = 5  # 확인할 Job 개수
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Finding Latest Batch Job" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Job Queue: $JobQueue" -ForegroundColor Yellow
Write-Host ""

# Get recent jobs
Write-Host "Fetching recent jobs..." -ForegroundColor Yellow

$statusFilters = @("SUBMITTED", "PENDING", "RUNNABLE", "STARTING", "RUNNING")
$allJobs = @()

foreach ($s in $statusFilters) {
    $jobsJson = aws batch list-jobs `
        --job-queue $JobQueue `
        --job-status $s `
        --region $Region `
        --max-items $Limit `
        --output json
    
    if ($LASTEXITCODE -eq 0) {
        $jobs = ($jobsJson | ConvertFrom-Json).jobSummaryList
        if ($jobs) {
            $allJobs += $jobs
        }
    }
}

if ($allJobs.Count -eq 0) {
    Write-Host "[INFO] No active jobs found. Checking completed jobs..." -ForegroundColor Yellow
    
    # Check recently completed jobs
    $completedJson = aws batch list-jobs `
        --job-queue $JobQueue `
        --job-status SUCCEEDED `
        --region $Region `
        --max-items $Limit `
        --output json
    
    $failedJson = aws batch list-jobs `
        --job-queue $JobQueue `
        --job-status FAILED `
        --region $Region `
        --max-items $Limit `
        --output json
    
    $completedJobs = ($completedJson | ConvertFrom-Json).jobSummaryList
    $failedJobs = ($failedJson | ConvertFrom-Json).jobSummaryList
    
    if ($completedJobs) { $allJobs += $completedJobs }
    if ($failedJobs) { $allJobs += $failedJobs }
}

if ($allJobs.Count -eq 0) {
    Write-Host "[ERROR] No jobs found in queue: $JobQueue" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure:" -ForegroundColor Yellow
    Write-Host "  - Videos are uploaded to S3" -ForegroundColor White
    Write-Host "  - SQS/Lambda is working correctly" -ForegroundColor White
    Write-Host "  - Or use .\scripts\trigger-batch-job.ps1 to create a test job" -ForegroundColor White
    exit 1
}

# Sort by createdAt (most recent first)
$sortedJobs = $allJobs | Sort-Object -Property createdAt -Descending

Write-Host ""
Write-Host "Recent Jobs:" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

$index = 1
foreach ($job in $sortedJobs) {
    $createdTime = [DateTimeOffset]::FromUnixTimeMilliseconds($job.createdAt).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")
    $statusColor = switch ($job.status) {
        "RUNNING" { "Green" }
        "SUCCEEDED" { "Green" }
        "FAILED" { "Red" }
        default { "Yellow" }
    }
    
    Write-Host "$index. " -NoNewline -ForegroundColor White
    Write-Host "$($job.jobName) " -NoNewline -ForegroundColor Cyan
    Write-Host "[$($job.status)]" -ForegroundColor $statusColor
    Write-Host "   ID: $($job.jobId)" -ForegroundColor Gray
    Write-Host "   Created: $createdTime" -ForegroundColor Gray
    Write-Host ""
    
    $index++
}

# Get latest job
$latestJob = $sortedJobs[0]

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Latest Job:" -ForegroundColor Green
Write-Host "  Name: $($latestJob.jobName)" -ForegroundColor White
Write-Host "  ID: $($latestJob.jobId)" -ForegroundColor White
Write-Host "  Status: $($latestJob.status)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$response = Read-Host "Monitor this job? (yes/no/number)"

if ($response -match '^\d+$') {
    # User entered a number
    $selectedIndex = [int]$response - 1
    if ($selectedIndex -ge 0 -and $selectedIndex -lt $sortedJobs.Count) {
        $selectedJob = $sortedJobs[$selectedIndex]
        Write-Host ""
        Write-Host "Monitoring Job: $($selectedJob.jobName)" -ForegroundColor Green
        Write-Host ""
        & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $selectedJob.jobId -Region $Region
    } else {
        Write-Host "[ERROR] Invalid selection" -ForegroundColor Red
        exit 1
    }
} elseif ($response -eq "yes") {
    Write-Host ""
    Write-Host "Monitoring Job: $($latestJob.jobName)" -ForegroundColor Green
    Write-Host ""
    & "$PSScriptRoot\monitor-batch-job.ps1" -JobId $latestJob.jobId -Region $Region
} else {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}
