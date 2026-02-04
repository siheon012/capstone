# Custom AMI 생성 가이드 (모델 분리 아키텍처)

## 🎯 목표 및 리팩터링 배경

### 기존 방식의 문제점 ([CUSTOM_AMI_GUIDE.md](./OLD_VER_CUSTOM_AMI_GUIDE.md) 참조)

**"모든 것을 AMI에 스냅샷"** 방식의 한계:

- ❌ 코드 변경 시마다 17GB AMI 재생성 필요
- ❌ EC2 인스턴스 시작 시 17GB AMI 로딩 시간 (5-10분)
- ❌ 스냅샷 무게로 인한 스토리지 비용 증가
- ❌ 빌드 시간 손해 (Docker 이미지 17GB)

### 핵심 인사이트: 생명주기 분리

**코드 생명주기 vs 모델 생명주기의 차이**

| 구분                                          | 변경 빈도           | 용량   | 업데이트 방법        |
| --------------------------------------------- | ------------------- | ------ | -------------------- |
| **분석 코드** (`video-analysis/*.py`)         | 매우 빈번 (일 1회+) | ~50MB  | Docker 이미지 재빌드 |
| **AI 모델** (`models/*.pt`, `checkpoints/*`)  | 매우 드묾 (월 1회)  | 1.85GB | AMI 재생성           |
| **불필요한 파일** (`src/`, `tools/`, `*.csv`) | -                   | ~15GB  | 제거                 |

### 리팩터링된 아키텍처

**"Docker는 가볍게, 모델은 AMI에 무겁게"**

```
┌─────────────────────────────────────────────────┐
│ EC2 Instance (AMI에서 부팅)                      │
├─────────────────────────────────────────────────┤
│ /opt/dl-models/                  (1.85GB)       │
│ ├── models/                      ← AMI 스냅샷   │
│ │   └── yolov8x_person_face.pt                  │
│ ├── checkpoints/                 ← AMI 스냅샷   │
│ │   └── model_imdb_cross_person.pth.tar         │
│ └── experiments/                 ← AMI 스냅샷   │
│     └── coco/segm-4_lr1e-3.yaml                 │
├─────────────────────────────────────────────────┤
│ Docker Container (ECR 이미지)                    │
├─────────────────────────────────────────────────┤
│ /workspace/                      (~300MB)       │
│ ├── *.py (run.py, mebow.py 등)  ← Docker 이미지 │
│ ├── lib/                         ← Docker 이미지 │
│ ├── llava/                       ← Docker 이미지 │
│ ├── mivolo/                      ← Docker 이미지 │
│ └── models/ ────────────────────┐               │
│     (volume mount)               │               │
│                                  ↓               │
│     /opt/dl-models/models/  (read-only)         │
└─────────────────────────────────────────────────┘
```

---

## 📊 효과

| 항목                 | 기존 (모든 것 AMI)  | 개선 (생명주기 분리) | 개선율           |
| -------------------- | ------------------- | -------------------- | ---------------- |
| **Docker 이미지**    | 17GB                | 300MB                | **-98%** ✅      |
| **ECR Push 시간**    | 20분                | 2분                  | **-90%** ✅      |
| **AMI 크기**         | 17GB                | 2GB (모델만)         | **-88%** ✅      |
| **코드 수정 시**     | AMI + Docker 재생성 | Docker만 재빌드      | **10배 빠름** ✅ |
| **모델 업데이트 시** | AMI + Docker 재생성 | AMI만 재생성         | **변화 없음**    |
| **EC2 시작 시간**    | 5-10분 (17GB 로딩)  | 2-3분 (2GB 로딩)     | **-60%** ✅      |

### 실제 EBS 스냅샷 용량 비교

생명주기 분리 아키텍처 적용 후 실제 AWS EBS 스냅샷 용량:

![EBS Snapshot 용량](../assets/page_screenshots/ebs_snapshot.png)

**확인 가능한 항목:**

- ✅ AMI 스냅샷 크기: ~2GB (모델만 포함)
- ✅ 기존 17GB 대비 **88% 감소**
- ✅ 스토리지 비용: $0.85/월 → $0.10/월

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

### 스크립트 개요

**목적**: S3에서 모델 파일(1.85GB)만 `/opt/dl-models`에 다운로드

**포함되는 모델 (5개 파일):**

1. `models/yolov8x_person_face.pt` (~150MB) - 사람/얼굴 감지
2. `checkpoints/model_imdb_cross_person_4.22_99.46.pth.tar` (~80MB) - 나이/성별 추정
3. `checkpoints/llava-fastvithd_0.5b_stage2/` (~1.5GB) - VLM 모델
4. `experiments/coco/segm-4_lr1e-3.yaml` - MeBOW 설정
5. 기타 모델 가중치 파일

**제외되는 것들 (불필요한 15GB):**

- ❌ `video-analysis/src/` - 미사용 소스코드
- ❌ `video-analysis/tools/` - 학습/테스트 스크립트
- ❌ `video-analysis/result/*.csv` - 샘플 데이터
- ❌ 기타 개발 환경 파일

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
  - 모델 경로: /opt/dl-models
  - 총 용량: 1.85GB (압축된 모델만)

📁 디렉토리 구조:
  /opt/dl-models/
  ├── models/              (150MB)
  ├── checkpoints/         (1.6GB)
  └── experiments/         (100MB)
```

**검증:**

```bash
# 모델 파일 확인
ls -lh /opt/dl-models/models/
ls -lh /opt/dl-models/checkpoints/
du -sh /opt/dl-models/  # 총 용량: ~1.85GB
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

````terraform
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
### 리팩터링 세부사항

**파일**: [`batch/Dockerfile`](../../batch/Dockerfile)

#### Before: 17GB (비효율적)

```dockerfile
# ❌ 모든 것을 Docker 이미지에 포함
COPY video-analysis/ /workspace/

# 문제점:
# 1. 불필요한 파일 포함 (src/, tools/, result/*.csv) - 15GB
# 2. 모델 파일까지 포함 (models/, checkpoints/) - 1.85GB
# 3. 코드 변경 시 17GB 전체 재빌드
````

#### After: ~300MB (최적화)

```dockerfile
# ✅ 필수 파일만 선택적으로 복사

# 1. 필수 실행 스크립트
COPY video-analysis/*.py /workspace/

# 2. 필수 모듈만
COPY video-analysis/lib/ /workspace/lib/
COPY video-analysis/llava/ /workspace/llava/
COPY video-analysis/mivolo/ /workspace/mivolo/
COPY video-analysis/result/ /workspace/result/

# 3. 모델은 볼륨 마운트 (AMI에서)
# COPY video-analysis/models /workspace/models  ← 삭제
### AMI 검증
- [ ] AMI 상태가 "available"
- [ ] AMI 크기 < 3GB (모델만 포함)
- [ ] `/opt/dl-models/` 디렉터리에 모델 파일 존재 (1.85GB)
- [ ] 불필요한 파일 제외 (src/, tools/, *.csv 없음)

### Docker 이미지 검증
- [ ] Docker 이미지 크기 < 500MB
- [ ] 모델 파일이 이미지에 포함되지 않음
- [ ] 필수 모듈만 포함 (lib/, llava/, mivolo/, result/)
- [ ] ECR Push 시간 < 3분

### 실행 검증
- [ ] Terraform apply 성공
- [ ] Batch Job 실행 시 모델 로드 성공
- [ ] 볼륨 마운트로 `/opt/dl-models` 접근 확인
- [ ] 영상 분석 정상 작동

### 성능 검증
- [ ] EC2 인스턴스 시작 시간 < 3분
- [ ] 코드 수정 시 빌드 시간 < 5분 (기존 30분)
- [ ] 메모리 사용량 정상 (모델 중복 로딩 없음)스코드
# video-analysis/tools/ ← 학습/테스트 스크립트
# video-analysis/result/*.csv ← 샘플 데이터
```

**증상:**

```
FileNotFoundError: /workspace/models/yolov8x_person_face.pt
```

**원인**: 볼륨 마운트 설정 누락 또는 권한 문제

**해결:**

```bash
# 1. EC2 인스턴스에서 모델 존재 확인
aws ssm start-session --target i-XXXXXXXXX
ls -lh /opt/dl-models/models/

# 2. 권한 확인 및 수정
sudo chmod -R 755 /opt/dl-models

# 3. Job Definition에서 mountPoints 확인
aws batch describe-job-definitions --job-definition-name capstone-dev-video-analysis
```

### 문제: Docker 이미지 크기가 여전히 큼 (> 1GB)

**원인**: Dockerfile에서 불필요한 파일 COPY

**해결:**

```bash
# batch/Dockerfile 확인
grep "COPY video-analysis" batch/Dockerfile

# 삭제해야 할 줄들:
# ❌ COPY video-analysis/ /workspace/  (전체 복사)
# ❌ COPY video-analysis/src/ /workspace/src/
# ❌ COPY video-analysis/tools/ /workspace/tools/

# 유지해야 할 줄들:
# ✅ COPY video-analysis/*.py /workspace/
# ✅ COPY video-analysis/lib/ /workspace/lib/
```

### 문제: 모델 로딩 시간이 오래 걸림

**원인**: 모델이 여전히 Docker 이미지에 포함되어 있음

**확인:**

```bash
# Docker 이미지 레이어 분석
docker history ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor:latest

# 큰 레이어 찾기
# 1.5GB 이상 레이어가 있으면 모델이 포함된 것
```

**해결:**

```dockerfile
# Dockerfile에서 완전히 제거
# COPY video-analysis/models /workspace/models  ← 삭제
# COPY video-analysis/checkpoints /workspace/checkpoints  ← 삭제
```

### 문제: AMI 크기가 너무 큼 (> 5GB)

**원인**: 불필요한 파일이 포함됨

**해결:**

```bash
# EC2 인스턴스에서 확인
du -sh /opt/dl-models/*

# 불필요한 파일 삭제
sudo rm -rf /opt/dl-models/src/
sudo rm -rf /opt/dl-models/tools/
sudo rm -f /opt/dl-models/result/*.csv
```

### 아키텍처 변천사

1. **v1 (초기)**: 모든 것을 Docker 이미지에 포함 (17GB)
   - 문제: 빌드 느림, ECR Push 20분, 코드 수정 시 17GB 재빌드
   - 참고: 초기 `batch/Dockerfile` (deprecated)

2. **v2 (첫 개선)**: 모든 것을 AMI에 스냅샷 (17GB AMI)
   - 문제: EC2 시작 시간 10분, AMI 스토리지 비용 높음
   - 참고: [CUSTOM_AMI_GUIDE.md](./OLD_VER_CUSTOM_AMI_GUIDE.md)

3. **v3 (현재)**: 생명주기 분리 아키텍처
   - Docker: 코드만 (300MB) - 자주 변경
   - AMI: 모델만 (1.85GB) - 드물게 변경
   - 참고: 현재 문서

### 관련 파일

- **Dockerfile**: `batch/Dockerfile` - Docker 이미지 빌드 설정
- **AMI 설정 스크립트**: `scripts/setup-ami-with-models.sh`
- **Terraform**: `terraform/modules/pipeline/batch-video-analysis-gpu.tf`
- **빌드 스크립트**: `scripts/build-and-push-batch.ps1`

### 생명주기 관리 전략

| 변경 사항                            | 필요한 작업                 | 소요 시간 | 비용                             |
| ------------------------------------ | --------------------------- | --------- | -------------------------------- |
| **코드 수정** (`*.py` 변경)          | Docker 이미지 재빌드 + Push | 3-5분     | 무료 (ECR 1GB 무료)              |
| **모델 업데이트** (새 모델)          | AMI 재생성                  | 20분      | $1 (임시 EC2) + $5/월 (스토리지) |
| **의존성 추가** (`requirements.txt`) | Docker 이미지 재빌드        | 5-10분    | 무료                             |
| **시스템 패키지** (`apt install`)    | AMI 재생성                  | 20분      | $1 + $5/월                       |

### 비용 비교

**v1 (Docker에 모든 것):**

- ECR 스토리지: 17GB × $0.10/GB = $1.70/월
- 빌드 시간: 30분/빌드 × 주 5회 = 10시간/월 (개발자 시간)

**v2 (AMI에 모든 것):**

- AMI 스토리지: 17GB × $0.05/GB = $0.85/월
- EC2 시작 시간: 10분/작업 × 100작업 = 16.7시간/월 (GPU 시간)
- GPU 비용: 16.7h × $1.006/h = $16.80/월

**v3 (생명주기 분리) ← 현재:**

- Docker (ECR): 0.3GB × $0.10/GB = $0.03/월
- AMI: 2GB × $0.05/GB = $0.10/월
- EC2 시작 시간: 3분/작업 × 100작업 = 5시간/월
- GPU 비용: 5h × $1.006/h = $5.03/월
- **총**: $5.16/월 (v2 대비 **-69% 절감**)

### 추가 최적화 가능성

1. **Multi-stage Docker 빌드**: 빌드 도구 제거로 100MB 추가 절감
2. **Layer 캐싱**: GitHub Actions에서 Docker 레이어 캐싱
3. **모델 압축**: ONNX 변환으로 모델 크기 30% 감소
4. **S3 Direct Access**: AMI 없이 S3에서 직접 모델 로드 (실험 중)

```
Error: Failed to pull image
```

**해결:**

````bash
# ECR 로그인 확인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# IAM 권한 확인 (ECS Task Execution Role)
# ecr:GetAuthorizationToken
# ecr:BatchCheckLayerAvailability
# ecr:GetDownloadUrlForLayer
# ecr:BatchGetImage

| 모듈 | 용량 | 필요 이유 |
|------|------|----------|
| `*.py` (run.py, mebow.py 등) | ~10MB | 실행 스크립트 |
| `lib/` | ~50MB | 필수 공통 라이브러리 |
| `llava/` | ~100MB | VLM 추론 모듈 |
| `mivolo/` | ~80MB | 나이/성별 추정 모듈 |
| `result/` | ~60MB | 후처리 모듈 |
| **총 포함** | **~300MB** | - |

## 🐳 Step 7: Dockerfile 최적화

`batch/Dockerfile`에서 모델 COPY 제거:

```dockerfile
# 삭제할 줄들:
# COPY video-analysis/models /workspace/models
# COPY video-analysis/checkpoints /workspace/checkpoints
# COPY video-analysis/experiments /workspace/experiments
````

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

- 기존 AMI: `ami-05a7c7234d12946e9` (Docker 이미지만 포함, 15GB)
- 새 AMI: `ami-NEW_ID` (Docker 이미지 + 모델 분리, 2GB)
- S3 버킷: `s3://capstone-ai-models-dev/`
