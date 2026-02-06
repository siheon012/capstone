# Packer - Custom GPU AMI Builder

This directory contains Packer configurations for automatically building **custom GPU AMIs** used by AWS Batch.

## 📋 Overview

### Why Custom AMI?

AWS Batch needs to download Docker images from ECR and load ML models at job startup. This process has several issues:

- **Long startup time**: Docker image 17GB + models 1.85GB = ~20 minutes
- **Repetitive downloads**: Same resources downloaded for every job
- **Increased costs**: Network transfer costs and wait time

### Benefits of Custom AMI

- ✅ **Reduced startup time**: 20min → 3min (~85% reduction)
- ✅ **Lower network costs**: Minimize ECR/S3 transfer costs
- ✅ **Improved stability**: Use pre-validated images and models
- ✅ **Automation**: Reproducible builds with Packer

## 🏗️ Architecture

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

## 📦 File Structure

```
packer/
├── aws-gpu-ami.pkr.hcl              # Main Packer template
├── variables.auto.pkrvars.hcl.example  # Variables example file
├── .gitignore                        # Git ignore file
├── scripts/
│   ├── download-models.sh            # ML model downloader
│   └── verify-gpu.sh                 # GPU verification script
└── README.md                         # This document
```

## 🚀 Usage

### 1. Prerequisites

- **Install Packer**: Download from [official website](https://www.packer.io/downloads)
- **AWS Credentials**: Configure `~/.aws/credentials` or environment variables
- **Network Resources**:
  - Public subnet (requires Internet Gateway)
  - Security group (HTTPS outbound, optionally SSH)

### 2. Configuration

#### 2.1 Create Variables File

```bash
# Copy example file
cd packer
cp variables.auto.pkrvars.hcl.example variables.auto.pkrvars.hcl

# Edit values
# - ecr_repository_url: ECR repository URL
# - subnet_id: Public subnet ID
# - security_group_id: Security group ID
```

#### 2.2 Set Required Variables

Open **variables.auto.pkrvars.hcl** and configure the following values:

```hcl
# Check AWS account ID and region
ecr_repository_url = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor"

# VPC resources (check from Terraform output)
subnet_id         = "subnet-0abc123def456789a"
security_group_id = "sg-0abc123def456789a"
```

### 3. Build AMI

#### 3.1 Initialize Packer

```bash
# Run in packer directory
cd packer
packer init .
```

#### 3.2 Validate Template

```bash
packer validate -var-file="variables.auto.pkrvars.hcl" .
```

#### 3.3 Build AMI

```bash
packer build -var-file="variables.auto.pkrvars.hcl" .
```

Or **use PowerShell script** (Windows):

```powershell
# Run from project root
.\scripts\build-ami.ps1 -Action init      # First time only
.\scripts\build-ami.ps1 -Action validate  # Validate
.\scripts\build-ami.ps1 -Action build     # Build
```

### 4. Build Process

The build takes approximately **15-30 minutes** and goes through these steps:

1. ✅ **Select Base AMI**: Latest ECS GPU-optimized AMI
2. ✅ **Launch EC2 Instance**: g5.xlarge (NVIDIA A10G)
3. ✅ **System Update**: yum update, install essential packages
4. ✅ **Pull Docker Image**: Download batch-processor image from ECR
5. ✅ **Download Models**: Save to /opt/ml from S3 or direct download
6. ✅ **Optimize ECS**: Configure GPU support and image caching
7. ✅ **Cleanup**: Remove logs, temporary files
8. ✅ **Create AMI**: Generate EBS snapshot and AMI
9. ✅ **Generate Manifest**: Save AMI ID to manifest.json

### 5. Update Terraform

After build completes, check new AMI ID in **manifest.json** and apply to Terraform:

```bash
# Check AMI ID in manifest.json
cat packer/manifest.json | jq '.builds[0].artifact_id'

# Update Terraform configuration
# terraform/modules/pipeline/batch-video-analysis-gpu.tf
# image_id = "ami-NEW_AMI_ID"

# Apply Terraform
cd terraform
terraform plan
terraform apply
```

## 🔧 Advanced Settings

### Add Custom Models

Modify **scripts/download-models.sh** to add required models:

```bash
# Example: Add YOLO model
download_if_missing \
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt" \
    "$MODEL_DIR/yolov8n.pt" \
    "YOLOv8 Nano"

# Example: Download custom model from S3
aws s3 cp "s3://your-bucket/models/custom-model.pth" \
    "$MODEL_DIR/custom-model.pth" \
    --region ap-northeast-2
```

### Batch Download Models from S3

If models are pre-uploaded to S3 bucket:

```hcl
# variables.auto.pkrvars.hcl
models_s3_bucket = "your-models-bucket-name"
```

Packer will automatically sync all files from `s3://your-models-bucket-name/models/` to `/opt/ml/models/`.

### Debug Mode

Run in debug mode if build fails:

```bash
packer build -debug -var-file="variables.auto.pkrvars.hcl" .
```

Or with PowerShell:

```powershell
.\scripts\build-ami.ps1 -Action build -Debug
```

## 💰 Cost

### Build Cost

- **Instance cost**: g5.xlarge @ $0.20/hour (Seoul region Spot)
- **Build time**: ~20-30 minutes
- **Estimated cost**: **$0.07 - 0.10** per build

### Storage Cost

- **EBS snapshot**: 30GB @ $0.05/GB/month
- **AMI storage**: Same as snapshot
- **Estimated cost**: **$1.50/month** per AMI

### Cost Savings

Savings from using custom AMI:

- **Time savings**: 17 minutes saved per job = cost reduction
- **Network cost**: Eliminated ECR/S3 transfer costs (~$0.10 per job)
- **Assuming 10 jobs/month**: **$1/month savings**

**Conclusion**: Cost-effective for 10+ jobs per month

## 🔄 CI/CD Integration

### GitHub Actions Example

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

## 📚 References

- [Packer Documentation](https://www.packer.io/docs)
- [AWS ECS GPU-optimized AMI](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-gpu.html)
- [NVIDIA Docker](https://github.com/NVIDIA/nvidia-docker)

## 🐛 Troubleshooting

### Build Failures

1. **ECR Login Failed**

   ```bash
   # Check IAM permissions (AmazonEC2ContainerRegistryReadOnly)
   aws ecr get-login-password --region ap-northeast-2
   ```

2. **Network Errors**
   - Verify subnet is connected to Internet Gateway
   - Check security group allows HTTPS (443) outbound

3. **GPU Not Detected**
   - Normal behavior (build instance may not have GPU)
   - Verify GPU works in actual Batch jobs

4. **Disk Space Insufficient**
   - Increase EBS volume size (currently 30GB)
   - Adjust volume_size in launch_block_device_mappings

### Delete AMI

Delete unused AMIs to save costs:

```bash
# Deregister AMI
aws ec2 deregister-image --image-id ami-xxxxxxxxx --region ap-northeast-2

# Delete associated snapshot
aws ec2 describe-snapshots --owner-ids self --filters "Name=description,Values=*ami-xxxxxxxxx*"
aws ec2 delete-snapshot --snapshot-id snap-xxxxxxxxx --region ap-northeast-2
```

## 📝 License

This project follows the license of the project root.
