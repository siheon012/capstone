# AWS Batch Job Cleanup Script v2
# 모든 활성 상태의 Job을 조회하고 삭제 (상태 전환 추적)

param(
    [string]$Region = "ap-northeast-2",
    [string]$JobQueue = "capstone-dev-memi-gpu-queue",
    [switch]$IncludeFailed,  # FAILED 상태도 포함
    [switch]$Force           # 확인 없이 바로 삭제
)

$ErrorActionPreference = "Stop"

Write-Host "AWS Batch Job Cleanup v2" -ForegroundColor Cyan
Write-Host "============================================================`n"

# Active 상태 정의
$activeStatuses = @('SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING')
if ($IncludeFailed) {
    $activeStatuses += 'FAILED'
}
$allJobs = @()

# 각 상태별로 Job 조회
Write-Host "Checking active jobs..." -ForegroundColor Gray
foreach ($status in $activeStatuses) {
    Write-Host "  - $status ..." -NoNewline -ForegroundColor Gray
    
    try {
        $jobs = aws batch list-jobs `
            --job-queue $JobQueue `
            --job-status $status `
            --region $Region `
            --output json | ConvertFrom-Json
        
        $count = $jobs.jobSummaryList.Count
        Write-Host " $count jobs" -ForegroundColor $(if ($count -gt 0) { 'Yellow' } else { 'Gray' })
        
        if ($count -gt 0) {
            $allJobs += $jobs.jobSummaryList
        }
    }
    catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
    }
}

Write-Host ""

if ($allJobs.Count -eq 0) {
    Write-Host "No active jobs found." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($allJobs.Count) active jobs:" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
for ($i = 0; $i -lt $allJobs.Count; $i++) {
    $job = $allJobs[$i]
    $createdAt = [DateTime]::FromFileTimeUtc($job.createdAt * 10000).ToLocalTime()
    $jobNameShort = if ($job.jobName.Length -gt 50) { $job.jobName.Substring(0, 50) } else { $job.jobName }
    
    Write-Host "[$($i + 1)] $jobNameShort" -ForegroundColor White
    Write-Host "    Job ID: $($job.jobId)" -ForegroundColor Gray
    Write-Host "    Status: $($job.status)" -ForegroundColor $(
        switch ($job.status) {
            'RUNNING' { 'Green' }
            'FAILED' { 'Red' }
            'STARTING' { 'Cyan' }
            default { 'Yellow' }
        }
    )
    Write-Host "    Created: $($createdAt.ToString('MM/dd/yyyy HH:mm:ss'))" -ForegroundColor Gray
    Write-Host ""
}

# 삭제 확인
if (-not $Force) {
    $confirm = Read-Host "`nDelete all jobs? (Y/N)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host "`nCancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Job 삭제
Write-Host "`nTerminating jobs..." -ForegroundColor Cyan
$terminatedCount = 0
$alreadyDoneCount = 0
$failCount = 0

foreach ($job in $allJobs) {
    $jobNameShort = if ($job.jobName.Length -gt 50) { $job.jobName.Substring(0, 50) } else { $job.jobName }
    Write-Host "  - $jobNameShort [$($job.status)]..." -NoNewline
    
    try {
        # FAILED/SUCCEEDED 상태는 이미 종료된 것
        if ($job.status -in @('FAILED', 'SUCCEEDED')) {
            Write-Host " Already done" -ForegroundColor Gray
            $alreadyDoneCount++
        }
        else {
            aws batch terminate-job `
                --job-id $job.jobId `
                --reason "Manual cleanup via script" `
                --region $Region `
                --output json 2>&1 | Out-Null
            
            Write-Host " Terminated" -ForegroundColor Green
            $terminatedCount++
        }
    }
    catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    Error: $_" -ForegroundColor Red
        $failCount++
    }
}

# 잠시 대기 후 최종 상태 확인
if ($terminatedCount -gt 0) {
    Write-Host "`nWaiting for state transitions (5 seconds)..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    Write-Host "Checking final job states..." -ForegroundColor Cyan
    $stillActive = @()
    
    foreach ($job in $allJobs) {
        if ($job.status -notin @('FAILED', 'SUCCEEDED')) {
            try {
                $jobDetails = aws batch describe-jobs `
                    --jobs $job.jobId `
                    --region $Region `
                    --output json 2>$null | ConvertFrom-Json
                
                if ($jobDetails.jobs -and $jobDetails.jobs.Count -gt 0) {
                    $currentStatus = $jobDetails.jobs[0].status
                    $statusReason = $jobDetails.jobs[0].statusReason
                    
                    if ($currentStatus -notin @('SUCCEEDED', 'FAILED')) {
                        $stillActive += @{
                            jobId = $job.jobId
                            jobName = $job.jobName
                            status = $currentStatus
                            reason = $statusReason
                        }
                    }
                }
            }
            catch {
                # Job이 조회되지 않으면 삭제된 것으로 간주
            }
        }
    }
    
    Write-Host "`n============================================================"
    Write-Host "Result:" -ForegroundColor Cyan
    Write-Host "   Terminated: $terminatedCount" -ForegroundColor Green
    if ($alreadyDoneCount -gt 0) {
        Write-Host "   Already done: $alreadyDoneCount" -ForegroundColor Gray
    }
    if ($failCount -gt 0) {
        Write-Host "   Failed: $failCount" -ForegroundColor Red
    }
    
    if ($stillActive.Count -gt 0) {
        Write-Host "   Still transitioning: $($stillActive.Count)" -ForegroundColor Yellow
        Write-Host "`nJobs still in transition:" -ForegroundColor Yellow
        foreach ($j in $stillActive) {
            $nameShort = if ($j.jobName.Length -gt 50) { $j.jobName.Substring(0, 50) } else { $j.jobName }
            Write-Host "   - $nameShort" -ForegroundColor White
            Write-Host "     Status: $($j.status)" -ForegroundColor Yellow
            if ($j.reason) {
                Write-Host "     Reason: $($j.reason)" -ForegroundColor Gray
            }
        }
        Write-Host "`n⚠️  Note: Jobs in STARTING/RUNNING state may take 30-60 seconds to fully terminate." -ForegroundColor Yellow
        Write-Host "   Run this script again in a minute to verify." -ForegroundColor Gray
    }
    else {
        Write-Host "`n✅ All jobs have been terminated successfully!" -ForegroundColor Green
    }
    Write-Host "============================================================"
}
else {
    Write-Host "`n============================================================"
    Write-Host "No jobs were terminated." -ForegroundColor Gray
    Write-Host "============================================================"
}