# AWS Account ID 동적 조회
$AWS_ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com"

# 1. ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin $ECR_REGISTRY

# 2. Backend 이미지 빌드 및 푸시
cd ..\back
docker build --no-cache --target production -t capstone-backend:latest .
docker tag capstone-backend:latest ${ECR_REGISTRY}/capstone-backend:latest
docker push ${ECR_REGISTRY}/capstone-backend:latest

aws ecs update-service --cluster capstone-cluster --service capstone-backend-service --force-new-deployment --region ap-northeast-2