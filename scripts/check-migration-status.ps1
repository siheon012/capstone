# Django migrations 테이블 상태 확인 스크립트

Write-Host "🔍 Django migrations 상태 확인 중..." -ForegroundColor Cyan

# ECS 태스크에서 직접 확인
$taskArn = aws ecs list-tasks --cluster capstone-prod-cluster --service-name capstone-backend-service --desired-status RUNNING --region ap-northeast-2 --query 'taskArns[0]' --output text

if ($taskArn) {
    Write-Host "📋 Task ARN: $taskArn" -ForegroundColor Green
    
    # Django migrations 테이블 조회
    $command = "python manage.py showmigrations db"
    
    Write-Host "`n🔍 실행 중인 migrations 목록:" -ForegroundColor Yellow
    
    aws ecs execute-command `
        --cluster capstone-prod-cluster `
        --task $taskArn `
        --container backend `
        --interactive `
        --command "$command" `
        --region ap-northeast-2
} else {
    Write-Host "❌ 실행 중인 태스크를 찾을 수 없습니다." -ForegroundColor Red
}
