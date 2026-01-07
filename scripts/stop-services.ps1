# AWS 비용 절감 스크립트 - 서비스 중지
# 실행: .\scripts\stop-services.ps1

$REGION = "ap-northeast-2"
$CLUSTER = "capstone-cluster"

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "AWS 비용 절감 - 서비스 중지 시작" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1. ECS 서비스 Desired Count를 0으로 설정
Write-Host "`n[1/4] ECS 서비스 중지..." -ForegroundColor Yellow
$services = @("capstone-frontend-service", "capstone-backend-service", "capstone-video-analysis-gpu-service")
foreach ($service in $services) {
    Write-Host "  - $service 중지 중..." -ForegroundColor Gray
    aws ecs update-service --cluster $CLUSTER --service $service --desired-count 0 --region $REGION --query 'service.[serviceName,desiredCount]' --output text
}

# 2. RDS 인스턴스 중지 (최대 7일간 중지 가능)
Write-Host "`n[2/4] RDS 인스턴스 중지..." -ForegroundColor Yellow
Write-Host "  - capstone-postgres 중지 중..." -ForegroundColor Gray
aws rds stop-db-instance --db-instance-identifier capstone-postgres --region $REGION --query 'DBInstance.[DBInstanceIdentifier,DBInstanceStatus]' --output text

# 3. NAT Gateway 정보 표시 (수동 삭제 필요)
Write-Host "`n[3/4] NAT Gateway 확인..." -ForegroundColor Yellow
Write-Host "  ⚠️  NAT Gateway는 Terraform으로 관리되므로 수동 삭제가 필요합니다." -ForegroundColor Red
Write-Host "  현재 NAT Gateway:" -ForegroundColor Gray
aws ec2 describe-nat-gateways --region $REGION --query 'NatGateways[?State==`available`].[NatGatewayId,State]' --output table

# 4. Route53 정보 표시
Write-Host "`n[4/4] Route53 호스팅존 확인..." -ForegroundColor Yellow
Write-Host "  ⚠️  Route53 호스팅존은 삭제하지 않는 것을 권장합니다 (재설정 복잡)." -ForegroundColor Red
Write-Host "  현재 호스팅존:" -ForegroundColor Gray
aws route53 list-hosted-zones --query 'HostedZones[*].[Name,Id]' --output table

Write-Host "`n=====================================" -ForegroundColor Green
Write-Host "서비스 중지 완료!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

Write-Host "`n📊 예상 비용 절감:" -ForegroundColor Cyan
Write-Host "  - RDS 중지: ~$15-20/월 절감" -ForegroundColor White
Write-Host "  - ECS 서비스 중지: ~$10-15/월 절감" -ForegroundColor White
Write-Host "  - 총 예상 절감: ~$25-35/월" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  여전히 과금되는 리소스:" -ForegroundColor Yellow
Write-Host "  - NAT Gateway: ~$32/월" -ForegroundColor Red
Write-Host "  - ALB: ~$18/월" -ForegroundColor Red
Write-Host "  - Route53: ~$1/월" -ForegroundColor Yellow
Write-Host "  - S3/ECR/CloudWatch: ~$2-5/월" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 추가 절감을 원하시면 NAT Gateway와 ALB를 Terraform에서 주석 처리하세요." -ForegroundColor Cyan
