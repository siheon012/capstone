# 인프라 비용 최적화 - 2026년 1월

## 📊 요약

총 절감 예상액: **월 $80+ (연간 $960+)**

| 항목                    | 기존 비용     | 절감액       | 절감 방법                 |
| ----------------------- | ------------- | ------------ | ------------------------- |
| NAT Gateway             | $44.36/월     | **$44.36**   | 삭제 (Public Subnet 사용) |
| NAT Gateway EIP         | $3.76/월      | **$3.76**    | NAT 삭제로 자동 제거      |
| VPC Interface Endpoints | $29.34/월     | **$29.34**   | 삭제 (IGW로 무료 접근)    |
| **GPU Batch**           | 가변          | **70% 절감** | Spot Instance 전환        |
| **총 네트워크 절감**    | **$77.46/월** | **$77.46**   | **~93% 절감**             |

---

## � 비용 절감 현황 (2026년 1월)

![비용 절감 전 AWS 청구서](../assets/page_screenshots/the%20cost%20optimization.png)

### 주요 비용 항목 분석

위 이미지는 최적화 전 AWS 비용을 보여줍니다:

**VPC 관련 비용 ($41.03)**:

- **VPC Endpoints**: $29.34 (Interface Endpoints 3개 × $0.013/시간)
  - ECR API Endpoint
  - ECR DKR Endpoint
  - CloudWatch Logs Endpoint
- **Public IPv4 주소**: $11.69 (NAT Gateway + ALB용 IP)

**NAT Gateway 비용 ($44.36)**:

- $0.059/시간 × 752시간 = $44.36/월
- Private Subnet의 ECS/Batch가 인터넷 접근을 위해 사용

**총 네트워크 비용**: **$85.39/월** → 이 중 **$77.46을 절감 예정**

---

## �📉 1. 네트워크 비용: 월 $77.46 절감 확정

### 1-1. NAT Gateway & EIP 삭제 (월 $47.6 절감)

**변경 사항**:

```diff
- aws_nat_gateway.main
- aws_eip.nat
```

**이유**:

- 모든 리소스(ECS, Batch)를 Public Subnet으로 이동
- Internet Gateway를 통해 직접 인터넷 접근 가능
- NAT Gateway 불필요

**Terraform Plan 결과**:

```
# aws_nat_gateway.main will be destroyed
# aws_eip.nat will be destroyed
```

**절감액**:

- NAT Gateway: $0.059/시간 × 752시간 = **$44.36/월**
- Elastic IP (NAT용): $0.005/시간 × 752시간 = **$3.76/월**
- **합계: $48.12/월**

---

### 1-2. VPC Interface Endpoints 삭제 (월 $29.34 절감)

**변경 사항**:

```diff
- aws_vpc_endpoint.ecr_api (Interface)
- aws_vpc_endpoint.ecr_dkr (Interface)
- aws_vpc_endpoint.logs (Interface)
- aws_security_group.vpc_endpoints

✅ aws_vpc_endpoint.s3 (Gateway) - 유지 (무료)
```

**이유**:

- Public Subnet의 리소스는 Internet Gateway를 통해 ECR, CloudWatch Logs에 무료 접근 가능
- Gateway Endpoint(S3)는 무료이므로 유지

**Terraform Plan 결과**:

```
# aws_vpc_endpoint.ecr_api will be destroyed
# aws_vpc_endpoint.ecr_dkr will be destroyed
# aws_vpc_endpoint.logs will be destroyed
# aws_security_group.vpc_endpoints will be destroyed
```

**절감액**:

- ECR API Endpoint: $0.013/시간 × 752시간 = **$9.78/월**
- ECR DKR Endpoint: $0.013/시간 × 752시간 = **$9.78/월**
- CloudWatch Logs Endpoint: $0.013/시간 × 752시간 = **$9.78/월**
- **합계: $29.34/월**

---

## 📉 2. 아키텍처 개선을 통한 비용 최적화 여정

### 2-1. Batch 파이프라인 진화 과정

영상 분석 파이프라인의 아키텍처를 단계별로 개선하며 비용을 대폭 절감했습니다.

**Phase별 월간 비용 변화**:

```
Phase 1 (FastAPI 동기):      $50/월   ■■■■■
Phase 2 (SQS+Batch):         $113/월  ■■■■■■■■■■■
Phase 3 (24시간 EC2):        $724/월  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 💀
Phase 4 (AMI 사전로드):       $66/월   ■■■■■■
Phase 5 (생명주기 분리):      $40/월   ■■■■
```

**핵심 개선 사항**:

| Phase   | 주요 변경            | 월간 비용   | 비고              |
| ------- | -------------------- | ----------- | ----------------- |
| Phase 1 | FastAPI 동기 처리    | $50         | 타임아웃 문제     |
| Phase 2 | SQS+Lambda+Batch     | $113        | 30분 빌드 시간    |
| Phase 3 | 24시간 EC2 상시 실행 | **$724** 💀 | **2일 만에 철회** |
| Phase 4 | AMI EBS 스냅샷       | $66         | 3분 부팅          |
| Phase 5 | 코드/모델 분리       | **$40** ✅  | 30초 빌드         |

**총 절감**: Phase 3 대비 **$684/월 (94%)**, Phase 2 대비 **$73/월 (65%)**

### 2-2. Phase 3 실패 사례: 24시간 GPU EC2 ($724/월)

**시도 이유**:

- Phase 2에서 매번 30분씩 Docker 빌드하는 것이 비효율적
- EC2를 24시간 켜두면 빌드 시간 0초 달성 가능

**결과**:

```
GPU EC2 g5.xlarge 비용:
- 시간당: $1.006
- 일일: $24.14
- 월간: $724.32 💀

실제 GPU 사용률: 3.5% (96.5% 유휴)
```

**교훈**:

> "Fast but expensive" < "Fast enough and cheap"

→ **2일 만에 철회**, AMI 방식으로 전환

### 2-3. Phase 4-5: EBS 스냅샷 최적화

![EBS Snapshot 비교](../assets/page_screenshots/ebs_snapshot.png)

**EBS 스냅샷 용량 감소**:

- **Phase 4**: 16GB (모델 + 코드)
- **Phase 5**: 8GB (모델만)
- **50% 용량 감소** 달성

**비용 절감**:

- EBS 스냅샷: $1.60/월 → $0.80/월
- ECR 스토리지: 18GB ($1.80/월) → 300MB ($0.03/월)
- **Docker 빌드 시간**: 30분 → 30초 (98% 감소)

**월간 총 절감**: 약 **$3/월** (스토리지) + 개발 생산성 12배 향상

📄 **상세 문서**: [Batch Pipeline Evolution](../01_architecture/BATCH_PIPELINE_EVOLUTION.md)

---

## 📉 3. GPU 컴퓨팅 비용: 70% 절감 (Spot Instance)

### 3-1. Spot Instance 전환

**변경 사항**:

```diff
resource "aws_batch_compute_environment" "video_analysis_gpu" {
  compute_resources {
-   type      = "EC2"
+   type      = "SPOT"
+   bid_percentage = 60
  }
}
```

**Terraform Plan 결과**:

```
# aws_batch_compute_environment.video_analysis_gpu must be replaced
-/+ type: "EC2" → "SPOT"
-/+ bid_percentage: 0 → 60
```

**절감 효과**:

- **On-Demand 대비 70-90% 절감**
- `bid_percentage=60`: On-Demand 가격의 최대 60%까지만 지불
- g5.xlarge Spot 가격: ~$0.30-0.50/시간 (On-Demand $1.006/시간)
- **영상당 예상 비용: $0.3-1 (기존 $1-3 대비 70% 절감)**

**안전성**:

- GPU 인스턴스 Spot 중단 확률: ~5% (매우 낮음)
- `retry_strategy.attempts = 2` 설정으로 자동 재시도

---

### 3-2. Public Subnet 이동

**변경 사항**:

```diff
resource "aws_batch_compute_environment" "video_analysis_gpu" {
  compute_resources {
-   subnets = var.private_subnet_ids
+   subnets = var.public_subnet_ids
  }
}
```

**Terraform Plan 결과**:

```
# aws_batch_compute_environment.video_analysis_gpu must be replaced
-/+ subnets: ["subnet-01d..."] → ["subnet-07a..."]
```

**효과**:

- NAT Gateway 없이 직접 인터넷 접근 (무료)
- ECR, S3, Bedrock API에 Internet Gateway를 통해 접근
- 보안: Security Group으로 인바운드 완전 차단

---

## 🔐 4. 보안 그룹 (Security Group) 변경

### 4-1. ECS Tasks Security Group

**변경 내용**:

```terraform
resource "aws_security_group" "ecs_tasks" {
  # 인바운드: ALB에서만 허용 (외부 직접 접근 차단)
  ingress {
    from_port       = 3000/8000
    security_groups = [aws_security_group.alb.id]
    description     = "Allow inbound from ALB only"
  }

  # 아웃바운드: 전체 허용 (ECR, S3, RDS 접근용)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound for ECR, RDS, S3, etc."
  }
}
```

**보안 검증**:

- ✅ Public Subnet에 있어도 안전
- ✅ ALB Security Group에서만 인바운드 허용
- ✅ 외부 직접 접근 완전 차단

---

### 4-2. Batch Compute Security Group

**변경 내용**:

```terraform
resource "aws_security_group" "batch_compute" {
  # 인바운드 규칙 없음: 외부 접근 불가능

  # 아웃바운드: 전체 허용 (S3, RDS, Bedrock, ECR 접근용)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound for S3, RDS, Bedrock, ECR"
  }
}
```

**보안 검증**:

- ✅ Public Subnet에 있어도 안전
- ✅ 인바운드 규칙 없음 (외부 접근 완전 차단)
- ✅ 아웃바운드만 허용 (필요한 AWS 서비스 접근)

---

## 📁 변경된 파일 목록

### 1. Terraform 코드

```
terraform/
├── modules/
│   ├── network/
│   │   ├── main.tf          # NAT Gateway, Interface Endpoints 삭제
│   │   └── outputs.tf       # Endpoint outputs 제거
│   └── pipeline/
│       ├── batch-video-analysis-gpu.tf  # Spot Instance, Public Subnet
│       └── variables.tf     # public_subnet_ids 추가
└── main.tf                  # pipeline 모듈에 public_subnet_ids 전달
```

### 2. 주요 변경 사항

**modules/network/main.tf**:

```diff
# NAT Gateway 삭제
- resource "aws_eip" "nat" { ... }
- resource "aws_nat_gateway" "main" { ... }

# Private Route Table에서 NAT 라우팅 제거
resource "aws_route_table" "private" {
-   route {
-     cidr_block     = "0.0.0.0/0"
-     nat_gateway_id = aws_nat_gateway.main.id
-   }
}

# Interface Endpoints 삭제
- resource "aws_vpc_endpoint" "ecr_api" { ... }
- resource "aws_vpc_endpoint" "ecr_dkr" { ... }
- resource "aws_vpc_endpoint" "logs" { ... }
- resource "aws_security_group" "vpc_endpoints" { ... }

✅ resource "aws_vpc_endpoint" "s3" { ... }  # Gateway Endpoint 유지
```

**modules/pipeline/batch-video-analysis-gpu.tf**:

```diff
resource "aws_batch_compute_environment" "video_analysis_gpu" {
  compute_resources {
-   type      = "EC2"
+   type      = "SPOT"
+   bid_percentage = 60

-   subnets = var.private_subnet_ids
+   subnets = var.public_subnet_ids
  }
}
```

---

## ✅ 검증 체크리스트

- [x] `terraform plan` 성공
- [x] NAT Gateway 삭제 확인 (- destroy)
- [x] Interface Endpoints 삭제 확인 (- destroy)
- [x] Batch Spot Instance 전환 확인 (-/+ replace)
- [x] Public Subnet 이동 확인
- [x] Security Group 설정 검증
- [x] S3 Gateway Endpoint 유지 확인

---

## 🚀 배포 단계

### 1. Terraform Apply

```bash
cd terraform
terraform plan    # 변경사항 최종 확인
terraform apply   # 적용
```

### 2. 예상 변경사항

```
Plan: X to add, Y to change, Z to destroy

Destroy:
- aws_nat_gateway.main
- aws_eip.nat
- aws_vpc_endpoint.ecr_api
- aws_vpc_endpoint.ecr_dkr
- aws_vpc_endpoint.logs
- aws_security_group.vpc_endpoints

Replace:
- aws_batch_compute_environment.video_analysis_gpu
```

### 3. 배포 후 검증

```bash
# ECS 서비스 상태 확인
aws ecs describe-services --cluster capstone-cluster \
  --services capstone-frontend-service capstone-backend-service

# Batch Compute Environment 확인
aws batch describe-compute-environments \
  --compute-environments capstone-dev-video-analysis-gpu-compute

# 테스트 영상 업로드 및 처리 확인
```

---

## 💡 추가 최적화 제안

### 1. 개발 환경 자동 On/Off (추가 50% 절감 가능)

GitHub Actions를 사용한 스케줄링:

```yaml
# .github/workflows/dev-environment-schedule.yml
- cron: '0 0 * * *' # 밤 12시 destroy
- cron: '0 9 * * 1-5' # 평일 오전 9시 apply
```

### 2. ECS Desired Count 조정

운영 시간대에만 2개, 야간에는 1개로 자동 조정

### 3. CloudWatch Logs 보존 기간 단축

현재: 7일 → 3일로 변경 시 추가 절감

---

## 📊 예상 월간 비용 비교

| 항목                | 변경 전    | 변경 후 | 절감액            |
| ------------------- | ---------- | ------- | ----------------- |
| **아키텍처 개선**   | $113       | $40     | **-$73 (65%)**    |
| NAT Gateway         | $44.36     | $0      | **-$44.36**       |
| NAT EIP             | $3.76      | $0      | **-$3.76**        |
| Interface Endpoints | $29.34     | $0      | **-$29.34**       |
| GPU Batch (예상)    | $30-50     | $9-15   | **-70%**          |
| ALB Public IP       | $11.69     | $11.69  | $0 (필수)         |
| **총 VPC 비용**     | **$77.46** | **~$3** | **-$74.46 (96%)** |

**총 절감액**:

- 아키텍처 개선: **$73/월** (Phase 2 → Phase 5)
- 네트워크 최적화: **$77/월**
- **합아키텍처 개선**: 파이프라인 최적화로 **월 $73 절감** (Phase 2 → Phase 5)

2. **네트워크 최적화**: NAT Gateway 및 Interface Endpoints 제거로 **월 $77 절감**
3. **GPU 최적화**: Spot Instance 사용으로 **70% 비용 절감**
4. **보안 유지**: Security Group으로 인바운드 차단, 보안성 동일
5. **성능 향상**: Public Subnet 사용으로 네트워크 레이턴시 개선

**총 예상 절감: 월 $150+ (연간 $1,800+)**

**핵심 교훈**:

- ❌ Phase 3 실패 사례: 24시간 EC2는 $724/월 → 2일 만에 철회
- ✅ 아키텍처 개선 + 인프라 최적화 = 비용 65-96% 절감
- ✅ 생명주기 분리: 코드(자주 변경) vs 모델(드문 변경)

1. **즉시 효과**: NAT Gateway 및 Interface Endpoints 제거로 **월 $77.46 확정 절감**
2. **지속 효과**: Spot Instance 사용으로 **GPU 비용 70% 절감**
3. **보안 유지**: Security Group으로 인바운드 차단, 보안성 동일
4. **성능 유지**: Public Subnet 사용으로 네트워크 레이턴시 개선 가능

**총 예상 절감: 월 $100+ (연간 $1,200+)**

---

Batch Pipeline Evolution](../01_architecture/BATCH_PIPELINE_EVOLUTION.md) - 아키텍처 진화 과정 상세

- [AMI 생명주기 분리](../02_infrastructure/AMI_WITH_MODELS_GUIDE.md) - Phase 5 구현 상세
- [GitHub Actions Cost Optimization](GITHUB_ACTIONS_COST_OPTIMIZATION.md) - CI/CD 비용 최적화
- **2026-01-18**: 비용 분석 및 최적화 전략 수립
- **2026-01-18**: Terraform 코드 수정 완료
- **2026-01-18**: `terraform plan` 검증 완료
- **예정**: `terraform apply` 실행 및 배포 검증

---

## 🔗 관련 문서

- [AWS_Batch_Pipeline_Evolution.md](../01_architecture/BATCH_PIPELINE_EVOLUTION.md)
- [AWS_BATCH_SQS_GUIDE.md](../08_guides/AWS_BATCH_SQS_GUIDE.md)
- [HYBRID_RAG_GUIDE.md](../01_architecture/HYBRID_RAG_GUIDE.md)
