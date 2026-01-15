# Custom AMI 생성 가이드 (모델 포함 버전)

## 🎯 목표

**"Docker는 가볍게, 모델은 AMI에 무겁게"** 아키텍처 구현

- **S3**: 모델의 원본 저장소 (1.8GB)
- **AMI**: S3에서 모델을 `/opt/dl-models`에 캐싱
- **Docker**: 모델 없이 코드만 (~300MB), 볼륨 마운트로 `/opt/dl-models` 사용

---

## 📊 효과

| 항목 | 기존 (모델 포함) | 개선 (모델 분리) |
|------|-----------------|-----------------|
| **Docker 이미지** | 17GB | 300MB |
| **ECR Push 시간** | 20분 | 2분 |
| **빌드 속도** | 코드 수정 시 17GB 재빌드 | 코드 수정 시 300MB만 재빌드 |
| **모델 업데이트** | Docker 재빌드 + AMI 재생성 | AMI만 재생성 (Docker 그대로) |

---

## 🚀 Step 1: 임시 EC2 인스턴스 생성

### AWS Console에서 Launch Instance

```
Name: temp-ami-with-models
AMI: Amazon Linux 2 AMI (HVM) with GPU support
     AMI ID: ami-0bc13ebede01cf578 (ECS GPU optimized)
Instance type: g5.xlarge (GPU 필수)
Key pair: Skip (Session Manager 사용)

Network:
  VPC: capstone-vpc
  Subnet: Public subnet (subnet-0b819fa7474377daa)
  Auto-assign public IP: Enable
  Security group: capstone-batch-compute-sg

Storage: 100 GiB gp3

IAM instance profile: capstone-dev-batch-instance-profile
```

**Launch Instance 클릭**

---

## 🔐 Step 2: EC2에 접속

### Session Manager 사용

AWS Console → EC2 → Instances → 인스턴스 선택 → Connect → Session Manager → Connect

또는 CLI:

```bash
# 인스턴스 ID 확인
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=temp-ami-with-models" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text

# Session Manager 접속
aws ssm start-session --target i-XXXXXXXXX --region ap-northeast-2
```

---

## 📦 Step 3: 모델 다운로드 스크립트 실행

### 로컬에서 스크립트 업로드

```powershell
# PowerShell (로컬)
cd e:\capstone
aws s3 cp scripts/setup-ami-with-models.sh s3://capstone-dev-raw/temp/ --region ap-northeast-2
```

### EC2에서 스크립트 다운로드 및 실행

```bash
# Session Manager 안에서

# 스크립트 다운로드
aws s3 cp s3://capstone-dev-raw/temp/setup-ami-with-models.sh /tmp/setup-ami-with-models.sh

# 실행 권한
chmod +x /tmp/setup-ami-with-models.sh

# 실행 (15-20분 소요)
sudo /tmp/setup-ami-with-models.sh
```

### 완료 확인

다음 메시지가 나오면 성공:

```
🎉 Custom AMI 생성 준비 완료!

📦 생성된 리소스:
  - Docker 이미지: XXXXX.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:latest
  - 모델 경로: /opt/dl-models
  - 총 용량: 1.8G
```

---

## 🖼️ Step 4: AMI 생성

### AWS Console

1. EC2 Dashboard → Instances
2. `temp-ami-with-models` 인스턴스 선택
3. **Actions** → **Image and templates** → **Create image**

### 설정

```
Image name: capstone-batch-gpu-models-20260115
Description: Batch GPU processor with Docker image + AI models in /opt/dl-models
No reboot: ✅ 체크 해제 (안전한 AMI 생성)
```

4. **Create image** 클릭

### AMI 상태 확인

- EC2 Dashboard → **AMIs**
- 생성된 AMI 선택 → AMI ID 복사 (예: `ami-0abc123def456789`)
- **상태가 "available"이 될 때까지 대기** (5-10분)

---

## 🗑️ Step 5: 임시 인스턴스 종료

AMI 생성 완료 후:

```bash
# 로컬 PowerShell
aws ec2 terminate-instances --instance-ids i-XXXXXXXXX --region ap-northeast-2
```

또는 Console에서:

- 인스턴스 선택 → **Instance state** → **Terminate instance**

---

## 📝 Step 6: Terraform 수정

### 6-1. AMI ID 업데이트

`terraform/modules/pipeline/batch-video-analysis-gpu.tf`:

```terraform
# Launch Template for GPU Instances
resource "aws_launch_template" "batch_gpu" {
  name_prefix   = "capstone-batch-gpu-"
  image_id      = "ami-NEW_AMI_ID_HERE"  # 새로 생성한 AMI ID로 교체
  instance_type = "g5.xlarge"
  
  # ... (나머지 동일)
}
```

### 6-2. 볼륨 마운트 설정 추가

`terraform/modules/pipeline/batch-video-analysis-gpu.tf`:

Job Definition의 `container_properties`에 추가:

```terraform
container_properties = jsonencode({
  # ... (기존 설정)
  
  mountPoints = [
    {
      sourceVolume  = "models"
      containerPath = "/workspace/models"
      readOnly      = true
    },
    {
      sourceVolume  = "checkpoints"
      containerPath = "/workspace/checkpoints"
      readOnly      = true
    },
    {
      sourceVolume  = "experiments"
      containerPath = "/workspace/experiments"
      readOnly      = true
    }
  ]
  
  volumes = [
    {
      name = "models"
      host = {
        sourcePath = "/opt/dl-models/models"
      }
    },
    {
      name = "checkpoints"
      host = {
        sourcePath = "/opt/dl-models/checkpoints"
      }
    },
    {
      name = "experiments"
      host = {
        sourcePath = "/opt/dl-models/experiments"
      }
    }
  ]
})
```

---

## 🐳 Step 7: Dockerfile 최적화

`batch/Dockerfile`에서 모델 COPY 제거:

```dockerfile
# 삭제할 줄들:
# COPY video-analysis/models /workspace/models
# COPY video-analysis/checkpoints /workspace/checkpoints
# COPY video-analysis/experiments /workspace/experiments
```

→ **Docker 이미지 크기: 17GB → 300MB**

---

## 🧪 Step 8: 배포 및 테스트

```powershell
# Terraform 적용
cd e:\capstone\terraform
terraform plan
terraform apply

# Docker 이미지 재빌드 (가벼워진 버전)
.\scripts\build-and-push-batch.ps1

# 테스트
.\scripts\trigger-batch-job.ps1
```

---

## 📊 검증 체크리스트

- [ ] AMI 상태가 "available"
- [ ] `/opt/dl-models/` 디렉터리에 모델 파일 존재 (1.8GB)
- [ ] Docker 이미지 크기 < 500MB
- [ ] Terraform apply 성공
- [ ] Batch Job 실행 시 모델 로드 성공

---

## 🔧 트러블슈팅

### 문제: 컨테이너에서 모델 파일을 찾을 수 없음

```bash
# EC2 인스턴스에 SSH 접속
ls -lh /opt/dl-models/models/

# 권한 확인
sudo chmod -R 755 /opt/dl-models
```

### 문제: Docker 이미지 Pull 실패

```bash
# ECR 로그인 확인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com
```

---

## 📚 참고

- 기존 AMI: `ami-05a7c7234d12946e9` (Docker 이미지만 포함, 17GB)
- 새 AMI: `ami-NEW_ID` (Docker 이미지 + 모델 분리, 2GB)
- S3 버킷: `s3://capstone-ai-models-dev/`
