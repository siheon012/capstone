# App Runner → Fargate 변경 사항 정리

## 📋 변경 이유

- **App Runner는 서울 리전(ap-northeast-2)에서 사용 불가**
- **AWS Fargate (ECS)로 대체** - 서울 리전 지원

## 🔄 주요 변경 사항

### 1. **Terraform 파일 변경**

#### 새로 생성된 파일:

- ✅ `terraform/vpc.tf` - VPC, 서브넷, NAT Gateway, ALB 설정
- ✅ `terraform/ecs-fargate.tf` - ECS Cluster, Task Definitions, Services
- ✅ `terraform/secrets.tf` - Secrets Manager for DB password, Django secret

#### 기존 파일 유지 (사용 안함):

- ⚠️ `terraform/app-runner.tf` - App Runner 설정 (사용 중지)

#### 수정된 파일:

- ✅ `terraform/rds.tf` - Security Group이 vpc.tf로 이동
- ✅ `terraform/main.tf` - provider 설정 유지

### 2. **아키텍처 변경**

#### 이전 (App Runner):

```
Internet → App Runner → RDS
         ↓
         S3
```

#### 현재 (Fargate):

```
Internet → ALB → ECS Fargate (Frontend/Backend) → RDS
                      ↓
                      S3
```

### 3. **네트워킹 구조**

#### VPC 구성:

- **CIDR**: 10.0.0.0/16
- **Public Subnets**: 10.0.1.0/24, 10.0.2.0/24 (ALB, Fargate)
- **Private Subnets**: 10.0.10.0/24, 10.0.11.0/24 (RDS)
- **NAT Gateway**: Fargate에서 외부 API 호출용

#### Security Groups:

- **ALB SG**: 80, 443 포트 외부 오픈
- **ECS Tasks SG**: 3000(Frontend), 8000(Backend) ALB에서만
- **RDS SG**: 5432 포트 ECS Tasks에서만

### 4. **컨테이너 설정**

#### Frontend (Next.js):

- **CPU**: 0.5 vCPU (512 units)
- **Memory**: 1 GB
- **Port**: 3000
- **Auto Scaling**: 1-4 인스턴스 (CPU 70% 기준)

#### Backend (Django):

- **CPU**: 1 vCPU (1024 units)
- **Memory**: 2 GB
- **Port**: 8000
- **Auto Scaling**: 1-4 인스턴스 (CPU 70% 기준)

### 5. **환경변수 변경**

#### Frontend (.env.production):

```bash
# 이전
NEXT_PUBLIC_API_URL=https://YOUR_APP_RUNNER_URL/api

# 현재
NEXT_PUBLIC_API_URL=http://YOUR_ALB_DNS_NAME/api
AWS_DEPLOYMENT_TYPE=fargate
```

#### Backend (ECS Task Definition에서 자동 주입):

```bash
DB_HOST=<RDS endpoint>
DB_PASSWORD=<Secrets Manager에서>
AWS_STORAGE_BUCKET_NAME=<S3 bucket>
```

### 6. **비용 비교**

#### App Runner (서울 리전 미지원):

- N/A

#### Fargate (서울 리전):

| 리소스             | 스펙          | 월 예상 비용 |
| ------------------ | ------------- | ------------ |
| ALB                | 1개           | ~$25         |
| Frontend Task      | 0.5 vCPU, 1GB | ~$15         |
| Backend Task       | 1 vCPU, 2GB   | ~$30         |
| RDS t4g.micro      | 20GB          | ~$25         |
| S3 + Data Transfer | 100GB         | ~$10         |
| NAT Gateway        | 1개           | ~$35         |
| **총합**           |               | **~$140/월** |

> 💡 **최적화 팁**: NAT Gateway 제거 시 ~$35 절감 가능 (VPC Endpoints 사용)

### 7. **배포 프로세스 변경**

#### 이전 (App Runner):

```bash
1. ECR에 이미지 푸시
2. App Runner가 자동 배포
```

#### 현재 (Fargate):

```bash
1. ECR에 이미지 푸시
2. ECS Task Definition 업데이트
3. ECS Service 업데이트 (rolling update)
```

### 8. **Health Check**

#### Frontend:

- **Path**: `/`
- **Interval**: 30초
- **Timeout**: 5초

#### Backend:

- **Path**: `/api/health/`
- **Interval**: 30초
- **Timeout**: 5초
- **Start Period**: 60초 (DB migration 시간 고려)

### 9. **Logging**

#### CloudWatch Logs:

- **Frontend**: `/ecs/capstone-frontend`
- **Backend**: `/ecs/capstone-backend`
- **Retention**: 7일

### 10. **필요한 추가 작업**

#### Django Backend:

```python
# views.py에 health check 엔드포인트 추가
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "healthy"})

# urls.py
urlpatterns = [
    path('api/health/', health_check),
    ...
]
```

#### Docker Entrypoint:

- DB 연결 대기 로직 추가
- Migration 자동 실행
- Gunicorn으로 서버 시작

### 11. **Terraform 배포 순서**

```bash
# 1. VPC 및 네트워킹 생성
terraform apply -target=aws_vpc.main
terraform apply -target=aws_subnet.public_1
terraform apply -target=aws_subnet.public_2
terraform apply -target=aws_subnet.private_1
terraform apply -target=aws_subnet.private_2
terraform apply -target=aws_internet_gateway.main
terraform apply -target=aws_nat_gateway.main

# 2. Security Groups
terraform apply -target=aws_security_group.alb
terraform apply -target=aws_security_group.ecs_tasks
terraform apply -target=aws_security_group.rds

# 3. ALB
terraform apply -target=aws_lb.main
terraform apply -target=aws_lb_target_group.frontend
terraform apply -target=aws_lb_target_group.backend
terraform apply -target=aws_lb_listener.http

# 4. ECR (이미지 푸시)
terraform apply -target=aws_ecr_repository.frontend
terraform apply -target=aws_ecr_repository.backend

# 5. RDS
terraform apply -target=aws_db_instance.postgres

# 6. S3
terraform apply -target=aws_s3_bucket.video_storage

# 7. Secrets Manager
terraform apply -target=aws_secretsmanager_secret.db_password
terraform apply -target=aws_secretsmanager_secret.django_secret

# 8. ECS
terraform apply -target=aws_ecs_cluster.main
terraform apply -target=aws_ecs_task_definition.backend
terraform apply -target=aws_ecs_task_definition.frontend
terraform apply -target=aws_ecs_service.backend
terraform apply -target=aws_ecs_service.frontend

# 9. 전체 적용
terraform apply
```

### 12. **Migration 실행 방법**

#### 옵션 A: ECS Task로 실행 (추천)

```bash
aws ecs run-task \
  --cluster capstone-cluster \
  --task-definition capstone-backend \
  --overrides '{
    "containerOverrides": [{
      "name": "backend",
      "command": ["python", "manage.py", "migrate"]
    }]
  }'
```

#### 옵션 B: Entrypoint에서 자동 실행

```bash
# entrypoint.sh
python manage.py migrate --noinput
gunicorn core.wsgi:application
```

### 13. **모니터링**

#### CloudWatch 메트릭:

- **CPU Utilization**
- **Memory Utilization**
- **Request Count**
- **Target Response Time**

#### 알람 설정 권장:

- CPU > 80%
- Memory > 85%
- HTTP 5xx > 10/분
- Target Health < 1

## ✅ 변경 완료 항목

- [x] VPC 및 네트워킹 설정
- [x] ECS Fargate Task Definitions
- [x] ALB 및 Target Groups
- [x] Security Groups
- [x] Secrets Manager
- [x] RDS 설정 업데이트
- [x] 프론트엔드 환경변수 업데이트

## 📝 TODO

- [ ] Health check 엔드포인트 추가 (Django)
- [ ] Docker entrypoint.sh 작성
- [ ] ECR에 이미지 푸시
- [ ] Terraform 배포 테스트
- [ ] 비용 모니터링 설정

## 🔗 참고 링크

- [AWS Fargate 요금](https://aws.amazon.com/fargate/pricing/)
- [ECS Task Definition](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html)
- [ALB 설정](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
