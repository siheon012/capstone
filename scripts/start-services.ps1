# AWS 서비스 재시작 스크립트
# 실행: .\scripts\start-services.ps1

$REGION = "ap-northeast-2"
$CLUSTER = "capstone-cluster"

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "AWS 서비스 재시작" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1. RDS 인스턴스 시작
Write-Host "`n[1/2] RDS 인스턴스 시작..." -ForegroundColor Yellow
Write-Host "  - capstone-postgres 시작 중..." -ForegroundColor Gray
aws rds start-db-instance --db-instance-identifier capstone-postgres --region $REGION --query 'DBInstance.[DBInstanceIdentifier,DBInstanceStatus]' --output text

Write-Host "  ⏳ RDS가 available 상태가 될 때까지 대기 중... (약 2-3분)" -ForegroundColor Gray
aws rds wait db-instance-available --db-instance-identifier capstone-postgres --region $REGION
Write-Host "  ✅ RDS 시작 완료!" -ForegroundColor Green

# 2. ECS 서비스 Desired Count 복원
Write-Host "`n[2/2] ECS 서비스 시작..." -ForegroundColor Yellow
Write-Host "  - capstone-frontend-service 시작 중..." -ForegroundColor Gray
aws ecs update-service --cluster $CLUSTER --service capstone-frontend-service --desired-count 1 --region $REGION --query 'service.[serviceName,desiredCount]' --output text

Write-Host "  - capstone-backend-service 시작 중..." -ForegroundColor Gray
aws ecs update-service --cluster $CLUSTER --service capstone-backend-service --desired-count 1 --region $REGION --query 'service.[serviceName,desiredCount]' --output text

Write-Host "  - capstone-video-analysis-gpu-service 시작 중 (optional)..." -ForegroundColor Gray
aws ecs update-service --cluster $CLUSTER --service capstone-video-analysis-gpu-service --desired-count 0 --region $REGION --query 'service.[serviceName,desiredCount]' --output text

Write-Host "`n=====================================" -ForegroundColor Green
Write-Host "서비스 재시작 완료!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

Write-Host "`n💡 서비스 상태 확인:" -ForegroundColor Cyan
Write-Host "  - Frontend: https://deepsentinel.cloud" -ForegroundColor White
Write-Host "  - Backend API: https://api.deepsentinel.cloud" -ForegroundColor White
Write-Host ""
Write-Host "⏳ ECS 태스크가 완전히 시작되려면 약 2-3분이 소요됩니다." -ForegroundColor Yellow
