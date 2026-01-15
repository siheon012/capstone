# Custom AMI 생성 가이드

## 목표

FastAPI 영상 분석 서비스의 Docker 이미지를 사전 로드한 Custom AMI 생성
→ Batch 실행 시간 20분 → 3분으로 단축

---

## Step 1: 임시 GPU EC2 인스턴스 생성 (AWS Console)

### 1-1. EC2 Console 이동

```
https://ap-northeast-2.console.aws.amazon.com/ec2/home?region=ap-northeast-2#Instances:
```

### 1-2. Launch Instance 설정

- **Name**: `temp-ami-builder`
- **AMI**: `Amazon Linux 2 AMI (HVM) - Kernel 5.10, SSD Volume Type` with GPU support
  - AMI ID: `ami-0bc13ebede01cf578` (ECS GPU optimized)
- **Instance type**: `g5.xlarge` (GPU 필수)
- **Key pair**: Skip (세션 매니저 사용)
- **Network settings**:
  - VPC: `capstone-vpc` (vpc-08885c409d4e859b7)
  - Subnet: Public subnet (subnet-0b819fa7474377daa)
  - Auto-assign public IP: Enable
  - Security group: `capstone-batch-compute` (sg-0fed2adfcbc1765e7)
- **Configure storage**: 100 GiB gp3
- **Advanced details**:
  - IAM instance profile: `capstone-dev-batch-instance-profile`

### 1-3. Launch Instance

클릭 후 인스턴스 시작 대기 (2-3분)

---

## Step 2: 인스턴스에 접속

### 2-1. 인스턴스 ID 복사

```
예: i-0123456789abcdef0
```

### 2-2. Session Manager로 접속

AWS Console → EC2 → Instances → 인스턴스 선택 → Connect → Session Manager → Connect

또는 CLI:

```bash
aws ssm start-session --target i-XXXXXXXXX --region ap-northeast-2
```

---

## Step 3: Docker 이미지 사전 로드 스크립트 실행

### 3-1. 스크립트 업로드

로컬에서 스크립트를 S3에 업로드:

```bash
aws s3 cp e:\capstone\scripts\create-custom-ami.sh s3://capstone-dev-raw/temp/create-custom-ami.sh --region ap-northeast-2
```

### 3-2. EC2에서 스크립트 다운로드 및 실행

Session Manager에서:

```bash
# 스크립트 다운로드
aws s3 cp s3://capstone-dev-raw/temp/create-custom-ami.sh /tmp/create-custom-ami.sh

# 실행 권한 부여
chmod +x /tmp/create-custom-ami.sh

# 스크립트 실행 (10-15분 소요)
sudo /tmp/create-custom-ami.sh
```

### 3-3. 완료 확인

다음과 같은 메시지가 나오면 성공:

```
✅ Docker 이미지 사전 로드 완료!
```

---

## Step 4: AMI 생성

### 4-1. AWS Console에서

- EC2 Dashboard → Instances
- `temp-ami-builder` 인스턴스 선택
- Actions → Image and templates → Create image

### 4-2. AMI 설정

- **Image name**: `capstone-batch-gpu-custom-20251112`
- **Image description**: `FastAPI batch processor with GPU models preloaded`
- **No reboot**: 체크 해제 (권장)
- Create image 클릭

### 4-3. AMI ID 복사

- EC2 Dashboard → AMIs
- 생성된 AMI의 ID 복사 (예: ami-0abc123def456789)
- **상태가 "available"이 될 때까지 대기 (5-10분)**

---

## Step 5: 임시 인스턴스 종료

### 5-1. 인스턴스 종료

```bash
aws ec2 terminate-instances --instance-ids i-XXXXXXXXX --region ap-northeast-2
```

또는 Console에서:

- 인스턴스 선택 → Instance state → Terminate instance

---

## Step 6: Terraform에 AMI ID 반영

### 6-1. batch-memi-gpu.tf 수정

```terraform
# 기존
data "aws_ami" "ecs_gpu_ami" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["amzn2-ami-ecs-gpu-hvm-*-x86_64-ebs"]
  }
}

# 변경 후
data "aws_ami" "ecs_gpu_ami" {
  most_recent = false
  owners      = ["self"]  # 내 계정

  filter {
    name   = "image-id"
    values = ["ami-XXXXXXXXX"]  # Step 4에서 복사한 AMI ID
  }
}
```

### 6-2. Terraform Apply

```bash
cd e:\capstone\terraform
terraform plan
terraform apply -auto-approve
```

---

## Step 7: 테스트

### 7-1. 영상 업로드로 Batch Job 트리거

```bash
# S3에 테스트 영상 업로드
aws s3 cp test-video.mp4 s3://capstone-dev-raw/videos/ --region ap-northeast-2
```

### 7-2. Batch Job 실행 시간 확인

- AWS Batch Console에서 Job 확인
- 시작 시간: EC2 생성 → Docker pull → 실행
- **예상 시간: 2-3분** (기존 20분에서 단축)

---

## 비용 예상

| 항목                    | 비용           |
| ----------------------- | -------------- |
| 임시 EC2 (1시간)        | $1.006         |
| AMI 스토리지 (100GB/월) | $5             |
| **총 초기 비용**        | **$1 + $5/월** |

**절약 효과:**

- 영상 100개 처리 시: $33.6 → $5 = **$28 절약/월**

---

## 완료 체크리스트

- [ ] 임시 GPU EC2 인스턴스 생성
- [ ] Docker 이미지 사전 로드 스크립트 실행
- [ ] Custom AMI 생성 및 ID 확인
- [ ] 임시 인스턴스 종료
- [ ] Terraform AMI 설정 업데이트
- [ ] Terraform apply 완료
- [ ] 테스트 영상으로 검증
- [ ] 실행 시간 확인 (3분 이내)

---

## 다음 명령어 모음

```bash
# 1. 인스턴스 시작 확인
aws ec2 describe-instances --instance-ids i-XXXXXXXXX --query "Reservations[0].Instances[0].State.Name" --region ap-northeast-2

# 2. AMI 생성 상태 확인
aws ec2 describe-images --image-ids ami-XXXXXXXXX --query "Images[0].State" --region ap-northeast-2

# 3. Batch Job 상태 확인
aws batch describe-jobs --jobs JOB_ID --region ap-northeast-2
```
