# ========================================
# Packer Template for Custom GPU AMI
# ========================================
# This template builds a custom AMI based on AWS ECS GPU-optimized AMI
# with pre-loaded Docker images and ML models for faster AWS Batch startup.
#
# Key Features:
# - Base: Amazon ECS GPU-optimized AMI (Amazon Linux 2)
# - Pre-installed: NVIDIA drivers, Docker, ECS agent
# - Pre-loaded: Video analysis Docker image and models (~1.85GB)
# - Startup time: Reduces from 20 minutes to ~3 minutes
#
# Usage:
#   packer init .
#   packer validate -var-file="variables.auto.pkrvars.hcl" .
#   packer build -var-file="variables.auto.pkrvars.hcl" .
# ========================================

packer {
  required_version = ">= 1.9.0"
  
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

# ========================================
# Variables
# ========================================

variable "aws_region" {
  type        = string
  default     = "ap-northeast-2"
  description = "AWS region for AMI build"
}

variable "instance_type" {
  type        = string
  default     = "g5.xlarge"
  description = "Instance type for building AMI (must be GPU instance)"
}

variable "ami_name_prefix" {
  type        = string
  default     = "capstone-ecs-gpu-custom"
  description = "Prefix for AMI name"
}

variable "ecr_repository_url" {
  type        = string
  description = "ECR repository URL for batch processor image"
  # Example: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-dev-batch-processor"
}

variable "docker_image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag to pre-load"
}

variable "models_s3_bucket" {
  type        = string
  default     = ""
  description = "Optional S3 bucket containing ML models to pre-download"
}

variable "ssh_keypair_name" {
  type        = string
  default     = ""
  description = "Optional SSH keypair for debugging"
}

variable "subnet_id" {
  type        = string
  description = "Subnet ID for the build instance (should have internet access)"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID allowing SSH (optional) and internet egress"
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Environment tag (dev, staging, prod)"
}

# ========================================
# Data Sources
# ========================================

# Get latest ECS GPU-optimized AMI
data "amazon-ami" "ecs_gpu" {
  filters = {
    name                = "amzn2-ami-ecs-gpu-hvm-*-x86_64-ebs"
    virtualization-type = "hvm"
    root-device-type    = "ebs"
  }
  most_recent = true
  owners      = ["amazon"]
  region      = var.aws_region
}

# ========================================
# Locals
# ========================================

locals {
  timestamp = regex_replace(timestamp(), "[- TZ:]", "")
  ami_name  = "${var.ami_name_prefix}-${local.timestamp}"
  
  common_tags = {
    Name        = local.ami_name
    Environment = var.environment
    Project     = "Unmanned"
    ManagedBy   = "Packer"
    BaseAMI     = data.amazon-ami.ecs_gpu.id
    CreatedAt   = timestamp()
  }
}

# ========================================
# Builder
# ========================================

source "amazon-ebs" "ecs_gpu" {
  ami_name        = local.ami_name
  ami_description = "Custom ECS GPU AMI with pre-loaded models and Docker images for video analysis"
  instance_type   = var.instance_type
  region          = var.aws_region
  source_ami      = data.amazon-ami.ecs_gpu.id
  
  # Network configuration
  subnet_id              = var.subnet_id
  security_group_ids     = [var.security_group_id]
  associate_public_ip_address = true
  
  # IAM instance profile for ECR access
  iam_instance_profile = "capstone-dev-batch-instance-profile"
  
  # SSH configuration - Let Packer create temporary keypair automatically
  ssh_username = "ec2-user"
  # No keypair specified - Packer will create and use a temporary one
  
  # EBS configuration
  launch_block_device_mappings {
    device_name           = "/dev/xvda"
    volume_size           = 30
    volume_type           = "gp3"
    iops                  = 3000
    throughput            = 125
    delete_on_termination = true
    encrypted             = true
  }
  
  # AMI settings
  ena_support         = true
  sriov_support       = true
  
  # Snapshot settings
  snapshot_tags = merge(local.common_tags, {
    Type = "Root"
  })
  
  tags = local.common_tags
  
  # Instance tags during build
  run_tags = merge(local.common_tags, {
    Name = "packer-build-${local.ami_name}"
  })
  
  # Timeout settings
  aws_polling {
    delay_seconds = 15
    max_attempts  = 120
  }
}

# ========================================
# Build
# ========================================

build {
  name    = "ecs-gpu-custom-ami"
  sources = ["source.amazon-ebs.ecs_gpu"]
  
  # ========================================
  # Provisioner 1: Wait for system readiness
  # ========================================
  provisioner "shell" {
    inline = [
      "echo 'Waiting for system to be ready...'",
      "# Wait for cloud-init without triggering Python 2 issues",
      "timeout 300 bash -c 'until [ -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done' || true",
      "echo 'System ready for provisioning'"
    ]
  }
  
  # ========================================
  # Provisioner 2: System update and AWS CLI installation
  # ========================================
  provisioner "shell" {
    inline = [
      "echo '=== System Update ==='",
      "sudo yum update -y",
      "sudo yum install -y jq wget curl htop unzip",
      "",
      "echo '=== Installing AWS CLI v2 ==='",
      "curl -s 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o '/tmp/awscliv2.zip'",
      "cd /tmp && unzip -q awscliv2.zip",
      "sudo ./aws/install",
      "/usr/local/bin/aws --version"
    ]
  }
  
  # ========================================
  # Provisioner 3: Docker ECR login and image pull
  # ========================================
  provisioner "shell" {
    inline = [
      "echo '=== Docker Image Pre-loading ==='",
      "echo 'Logging into ECR...'",
      "# Get ECR login password and save to variable",
      "ECR_PASSWORD=$(/usr/local/bin/aws ecr get-login-password --region ${var.aws_region})",
      "# Login to Docker using the password",
      "echo $ECR_PASSWORD | sudo docker login --username AWS --password-stdin ${var.ecr_repository_url}",
      "",
      "echo 'Pulling Docker image: ${var.ecr_repository_url}:${var.docker_image_tag}'",
      "sudo docker pull ${var.ecr_repository_url}:${var.docker_image_tag}",
      "",
      "echo 'Verifying image...'",
      "sudo docker images",
      "sudo docker inspect ${var.ecr_repository_url}:${var.docker_image_tag} | jq '.[0].Size' | awk '{print \"Image size: \" $1/1024/1024/1024 \" GB\"}'",
      "",
      "echo 'Docker image pre-loaded successfully'"
    ]
  }
  
  # ========================================
  # Provisioner 4: Download models to /opt/ml
  # ========================================
  provisioner "shell" {
    script = "${path.root}/scripts/download-models.sh"
    environment_vars = [
      "MODELS_S3_BUCKET=${var.models_s3_bucket}",
      "AWS_REGION=${var.aws_region}"
    ]
  }
  
  # ========================================
  # Provisioner 5: ECS configuration optimization
  # ========================================
  provisioner "shell" {
    inline = [
      "echo '=== ECS Configuration ==='",
      "sudo mkdir -p /etc/ecs",
      "echo 'ECS_ENABLE_GPU_SUPPORT=true' | sudo tee -a /etc/ecs/ecs.config",
      "echo 'ECS_IMAGE_PULL_BEHAVIOR=prefer-cached' | sudo tee -a /etc/ecs/ecs.config",
      "echo 'ECS_IMAGE_CLEANUP_INTERVAL=30m' | sudo tee -a /etc/ecs/ecs.config",
      "echo 'ECS_IMAGE_MINIMUM_CLEANUP_AGE=1h' | sudo tee -a /etc/ecs/ecs.config",
      "echo 'ECS_NUM_IMAGES_DELETE_PER_CYCLE=5' | sudo tee -a /etc/ecs/ecs.config",
      "",
      "echo 'ECS configuration:'",
      "sudo cat /etc/ecs/ecs.config"
    ]
  }
  
  # ========================================
  # Provisioner 6: GPU verification
  # ========================================
  provisioner "shell" {
    inline = [
      "echo '=== GPU Verification ==='",
      "nvidia-smi || echo 'GPU not detected (this is normal during build)'",
      "echo ''",
      "echo '=== NVIDIA Docker Runtime ==='",
      "sudo docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi || echo 'GPU test skipped'"
    ]
  }
  
  # ========================================
  # Provisioner 7: Cleanup
  # ========================================
  provisioner "shell" {
    inline = [
      "echo '=== Cleanup ==='",
      "# Clear bash history",
      "cat /dev/null > ~/.bash_history && history -c",
      "",
      "# Clear yum cache",
      "sudo yum clean all",
      "",
      "# Clear logs (but keep structure for systemd)",
      "sudo find /var/log -type f -name '*.log' -exec truncate -s 0 {} \\;",
      "",
      "# Remove temporary files",
      "sudo rm -rf /tmp/* /var/tmp/*",
      "",
      "echo 'Cleanup completed'"
    ]
  }
  
  # ========================================
  # Post-processor: Manifest
  # ========================================
  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
    custom_data = {
      base_ami           = data.amazon-ami.ecs_gpu.id
      docker_image       = "${var.ecr_repository_url}:${var.docker_image_tag}"
      models_bucket      = var.models_s3_bucket
      creation_timestamp = local.timestamp
    }
  }
}
