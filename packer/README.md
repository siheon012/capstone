# Packer - Custom GPU AMI Builder

이 디렉토리는 AWS Batch에서 사용하는 **커스텀 GPU AMI**를 자동으로 빌드하는 Packer 설정을 포함합니다.

## 📋 개요

### 왜 커스텀 AMI가 필요한가?

AWS Batch는 작업 시작 시 Docker 이미지를 ECR에서 다운로드하고 ML 모델을 로드해야 합니다. 이 과정은 다음과 같은 문제가 있습니다:

- **긴 시작 시간**: Docker 이미지 17GB + 모델 1.85GB = 약 20분
- **반복적인 다운로드**: 매 작업마다 동일한 리소스 다운로드
- **비용 증가**: 네트워크 전송 비용 및 대기 시간

### 커스텀 AMI의 장점

- ✅ **시작 시간 단축**: 20분 → 3분 (약 85% 감소)
- ✅ **네트워크 비용 절감**: ECR/S3 전송 비용 최소화
- ✅ **안정성 향상**: 사전 검증된 이미지와 모델 사용
- ✅ **자동화**: Packer로 재현 가능한 빌드

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                     Packer Build                        │
│                                                         │
│  1. Base AMI: Amazon ECS GPU-optimized AMI              │
│     ├─ Amazon Linux 2                                   │
│     ├─ NVIDIA drivers pre-installed                     │
│     ├─ Docker + nvidia-docker2                          │
│     └─ ECS agent                                        │
│                                                         │
│  2. Provisioning Steps:                                 │
│     ├─ System update                                    │
│     ├─ ECR login                                        │
│     ├─ Docker pull (batch-processor:latest)             │
│     ├─ Download ML models to /opt/ml                    │
│     ├─ ECS configuration optimization                   │
│     └─ Cleanup                                          │
│                                                         │
│  3. Output: Custom AMI with EBS Snapshot                │
│     ├─ Pre-loaded Docker image (~17GB)                  │
│     ├─ Pre-loaded ML models (~1.85GB)                   │
│     └─ Optimized ECS config                             │
└─────────────────────────────────────────────────────────┘
```

## 📦 파일 구조

```
packer/
├── aws-gpu-ami.pkr.hcl              # 메인 Packer 템플릿
├── variables.auto.pkrvars.hcl.example  # 변수 예제 파일
├── .gitignore                        # Git 무시 파일
├── scripts/
│   ├── download-models.sh            # ML 모델 다운로드
│   └── verify-gpu.sh                 # GPU 검증 스크립트
└── README.md                         # 이 문서
```

## 🚀 사용 방법

### 1. 사전 요구사항

- **Packer 설치**: [공식 사이트](https://www.packer.io/downloads)에서 다운로드
- **AWS 자격증명**: `~/.aws/credentials` 또는 환경변수 설정
- **네트워크 리소스**:
  - Public subnet (Internet Gateway 필요)
  - Security group (HTTPS outbound, 선택적으로 SSH)

### 2. 설정

#### 2.1 변수 파일 생성

```bash
# 예제 파일을 복사
cd packer
cp variables.auto.pkrvars.hcl.example variables.auto.pkrvars.hcl

# 편집기로 열어서 값 수정
# - ecr_repository_url: ECR 리포지토리 URL
# - subnet_id: Public subnet ID
# - security_group_id: Security group ID
```

#### 2.2 필수 변수 설정

**variables.auto.pkrvars.hcl** 파일을 열어 다음 값들을 설정하세요:

```hcl
# AWS 계정 ID와 리전 확인
ecr_repository_url = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor"

# VPC 리소스 (Terraform output에서 확인 가능)
subnet_id         = "subnet-0abc123def456789a"
security_group_id = "sg-0abc123def456789a"
```

### 3. AMI 빌드

#### 3.1 Packer 초기화

```bash
# packer 디렉토리에서 실행
cd packer
packer init .
```

#### 3.2 템플릿 검증

```bash
packer validate -var-file="variables.auto.pkrvars.hcl" .
```

#### 3.3 AMI 빌드

```bash
packer build -var-file="variables.auto.pkrvars.hcl" .
```

또는 **PowerShell 스크립트 사용** (Windows):

```powershell
# 프로젝트 루트에서 실행
.\scripts\build-ami.ps1 -Action init      # 최초 1회
.\scripts\build-ami.ps1 -Action validate  # 검증
.\scripts\build-ami.ps1 -Action build     # 빌드
```

### 4. 빌드 프로세스

빌드는 약 **15-30분** 소요되며 다음 단계를 거칩니다:

1. ✅ **Base AMI 선택**: 최신 ECS GPU-optimized AMI
2. ✅ **EC2 인스턴스 시작**: g5.xlarge (NVIDIA A10G)
3. ✅ **시스템 업데이트**: yum update, 필수 패키지 설치
4. ✅ **Docker 이미지 Pull**: ECR에서 batch-processor 이미지 다운로드
5. ✅ **모델 다운로드**: S3 또는 직접 다운로드로 /opt/ml에 저장
6. ✅ **ECS 최적화**: GPU 지원 및 이미지 캐싱 설정
7. ✅ **정리**: 로그, 임시 파일 삭제
8. ✅ **AMI 생성**: EBS 스냅샷과 AMI 생성
9. ✅ **매니페스트 생성**: manifest.json에 AMI ID 저장

### 5. Terraform 업데이트

빌드가 완료되면 **manifest.json**에서 새 AMI ID를 확인하고 Terraform에 적용합니다:

```bash
# manifest.json에서 AMI ID 확인
cat packer/manifest.json | jq '.builds[0].artifact_id'

# Terraform 설정 업데이트
# terraform/modules/pipeline/batch-video-analysis-gpu.tf
# image_id = "ami-NEW_AMI_ID"

# Terraform 적용
cd terraform
terraform plan
terraform apply
```

## 🔧 고급 설정

### 커스텀 모델 추가

**scripts/download-models.sh** 파일을 수정하여 필요한 모델을 추가하세요:

```bash
# 예: YOLO 모델 추가
download_if_missing \
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt" \
    "$MODEL_DIR/yolov8n.pt" \
    "YOLOv8 Nano"

# 예: S3에서 커스텀 모델 다운로드
aws s3 cp "s3://your-bucket/models/custom-model.pth" \
    "$MODEL_DIR/custom-model.pth" \
    --region ap-northeast-2
```

### S3에서 모델 일괄 다운로드

S3 버킷에 모델을 미리 업로드한 경우:

```hcl
# variables.auto.pkrvars.hcl
models_s3_bucket = "your-models-bucket-name"
```

Packer는 자동으로 `s3://your-models-bucket-name/models/` 경로의 모든 파일을 `/opt/ml/models/`로 동기화합니다.

### 디버그 모드

빌드 중 문제가 발생하면 디버그 모드로 실행:

```bash
packer build -debug -var-file="variables.auto.pkrvars.hcl" .
```

또는 PowerShell:

```powershell
.\scripts\build-ami.ps1 -Action build -Debug
```

## 💰 비용

### 빌드 비용

- **인스턴스 비용**: g5.xlarge @ $0.20/hour (Seoul 리전 Spot)
- **빌드 시간**: 약 20-30분
- **예상 비용**: **$0.07 - 0.10** per build

### 스토리지 비용

- **EBS 스냅샷**: 30GB @ $0.05/GB/month
- **AMI 스토리지**: 스냅샷과 동일
- **예상 비용**: **$1.50/month** per AMI

### 절감 효과

커스텀 AMI 사용으로 얻는 절감 효과:

- **시간 절감**: 작업당 17분 단축 = 비용 절감
- **네트워크 비용**: ECR/S3 전송 비용 제거 (작업당 ~$0.10)
- **월 10개 작업 가정**: **$1/month 절감**

**결론**: 월 10개 이상 작업 시 비용 효율적

## 🔄 CI/CD 통합

### GitHub Actions 예제

```yaml
name: Build Custom AMI

on:
  push:
    paths:
      - 'packer/**'
      - 'video-analysis/**'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Packer
        uses: hashicorp/setup-packer@main

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Packer Init
        run: packer init packer/

      - name: Packer Validate
        run: packer validate -var-file="packer/variables.auto.pkrvars.hcl" packer/

      - name: Packer Build
        run: packer build -var-file="packer/variables.auto.pkrvars.hcl" packer/

      - name: Upload Manifest
        uses: actions/upload-artifact@v3
        with:
          name: packer-manifest
          path: packer/manifest.json
```

## 📚 참고 자료

- [Packer Documentation](https://www.packer.io/docs)
- [AWS ECS GPU-optimized AMI](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-gpu.html)
- [NVIDIA Docker](https://github.com/NVIDIA/nvidia-docker)

## 🐛 트러블슈팅

### 빌드 실패 시

1. **ECR 로그인 실패**

   ```bash
   # IAM 권한 확인 (AmazonEC2ContainerRegistryReadOnly)
   aws ecr get-login-password --region ap-northeast-2
   ```

2. **네트워크 오류**
   - Subnet이 Internet Gateway에 연결되어 있는지 확인
   - Security Group에서 HTTPS (443) outbound 허용 확인

3. **GPU 감지 안됨**
   - 정상 동작 (빌드 인스턴스는 GPU 없을 수 있음)
   - 실제 Batch 작업에서 GPU 작동 확인

4. **디스크 공간 부족**
   - EBS 볼륨 크기 증가 (현재 30GB)
   - launch_block_device_mappings에서 volume_size 조정

### AMI 삭제

더 이상 사용하지 않는 AMI는 비용 절감을 위해 삭제:

```bash
# AMI 등록 해제
aws ec2 deregister-image --image-id ami-xxxxxxxxx --region ap-northeast-2

# 연관된 스냅샷 삭제
aws ec2 describe-snapshots --owner-ids self --filters "Name=description,Values=*ami-xxxxxxxxx*"
aws ec2 delete-snapshot --snapshot-id snap-xxxxxxxxx --region ap-northeast-2
```

## 📝 라이선스

이 프로젝트는 프로젝트 루트의 라이선스를 따릅니다.
