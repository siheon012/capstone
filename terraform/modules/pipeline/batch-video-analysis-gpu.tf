# ========================================
# AWS Batch - Video Analysis GPU Processing
# ========================================
# This file configures AWS Batch for Spot GPU video processing.
# 
# Key Features:
# - Custom AMI (ami-061fb5baa7da36413) with pre-loaded models (1.85GB)
# - Reduces startup time from 20 minutes to ~3 minutes
# - g5.xlarge GPU instances (NVIDIA A10G, 4 vCPU, 16GB RAM)
# - Auto-scaling: min_vcpus=0, max_vcpus=16 (supports 4 concurrent jobs)
# 
# Cost Optimization:
# - **Spot Instances**: 70-90% cheaper than On-Demand
# - **bid_percentage=60**: Maximum 60% of On-Demand price
# - Only provisions GPU instances when Batch jobs are submitted
# - Instances terminate automatically after job completion
# - Estimated cost: $0.3-1 per video (vs $1-3 On-Demand, $720/month 24/7 ECS)
# 
# Related Files:
# - batch.tf: Common IAM roles and security groups
# - ecs-gpu.tf: Alternative 24/7 mode (currently disabled)
# ========================================

# ECR Repository for Video Analysis Batch Processor - 기존 리포지토리 사용
data "aws_ecr_repository" "ai_batch" {
  name = "capstone-dev-batch-processor"
}

# Custom GPU AMI built with Packer
# Automatically uses the latest AMI built by Packer with pre-loaded models
data "aws_ami" "custom_gpu" {
  most_recent = true
  owners      = ["self"]  # Only AMIs owned by this account

  filter {
    name   = "name"
    values = ["capstone-ecs-gpu-custom-*"]  # Matches Packer naming convention
  }

  filter {
    name   = "tag:ManagedBy"
    values = ["Packer"]
  }

  filter {
    name   = "tag:Environment"
    values = [var.environment]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# 통합된 ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "ai_batch" {
  # 원본 파일에서 사용하던 data 소스나 리소스 이름을 그대로 사용하세요
  repository = data.aws_ecr_repository.ai_batch.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10 # 원본 설정 유지
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7 # 원본 설정(7일) 유지 시 destroy 0 가능성 높음
        }
        action = { type = "expire" }
      }
    ]
  })
}

# Launch Template for GPU Instances
resource "aws_launch_template" "batch_gpu" {
  name_prefix   = "capstone-batch-gpu-"
  image_id      = data.aws_ami.custom_gpu.id  # Packer로 빌드된 최신 커스텀 AMI 자동 사용
  instance_type = "g5.xlarge" # GPU 인스턴스 (NVIDIA A10G, 24GB VRAM)

  iam_instance_profile {
    arn = var.batch_instance_profile_arn
  }

  vpc_security_group_ids = [var.batch_compute_security_group_id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 30 # 모델 분리로 최적화 (Docker 0.3GB + 모델 1.85GB + OS 10GB + 버퍼 10GB = 22GB)
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  user_data = base64encode(<<-EOF
Content-Type: multipart/mixed; boundary="==BOUNDARY=="
MIME-Version: 1.0

--==BOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
# Append GPU configuration to ecs.config
# AWS Batch already sets ECS_CLUSTER, so we just add our settings
echo ECS_ENABLE_GPU_SUPPORT=true >> /etc/ecs/ecs.config
echo ECS_IMAGE_PULL_BEHAVIOR=prefer-cached >> /etc/ecs/ecs.config

--==BOUNDARY==--
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "capstone-batch-gpu-instance"
      Environment = var.environment
      Project     = "Unmanned"
    }
  }
}

# This AMI has the 17GB batch processor image pre-loaded to reduce startup time from 20 min to ~3 min
# Standard AWS ECS GPU AMI (for reference, not used):
# data "aws_ami" "ecs_gpu_ami" {
#   most_recent = true
#   owners      = ["amazon"]
#   filter {
#     name   = "name"
#     values = ["amzn2-ami-ecs-gpu-hvm-*-x86_64-ebs"]
#   }
#   filter {
#     name   = "virtualization-type"
#     values = ["hvm"]
#   }
# }

# ========================================
# IAM Resources - Moved to security module
# ========================================
# Note: All IAM roles and instance profiles are defined in the security module
# and passed to this module via variables:
# - var.batch_instance_profile_arn
# - var.batch_instance_role_name
# - var.batch_service_role_arn
# - var.batch_execution_role_arn
# - var.batch_task_role_arn

# ========================================
# AWS Batch GPU Compute Environment
# ========================================

resource "aws_batch_compute_environment" "video_analysis_gpu" {
  type         = "MANAGED"
  service_role = var.batch_service_role_arn
  state        = "ENABLED"

  compute_resources {
    type           = "EC2"
    min_vcpus      = 0
    max_vcpus      = 16 # 최대 4개의 g5.xlarge 인스턴스 (각 4 vCPU)


    instance_type = ["g5.xlarge"]

    # ✅ 비용 절감: Public Subnet 사용 (NAT Gateway $44/월 → $0)
    # Security Group으로 인바운드를 차단하므로 보안 문제 없음
    subnets = var.public_subnet_ids  # from network module

    security_group_ids = [
      var.batch_compute_security_group_id  # from network module
    ]

    instance_role = var.batch_instance_profile_arn  # from security module

    launch_template {
      launch_template_id = aws_launch_template.batch_gpu.id
      version            = "$Latest"
    }

    # EC2 Configuration to use Custom AMI with models in /opt/ml
    ec2_configuration {
      image_type = "ECS_AL2_NVIDIA"
      image_id_override = data.aws_ami.custom_gpu.id  # Packer로 빌드된 최신 커스텀 AMI
    }

    tags = {
      Name        = "capstone-video-analysis-gpu-instance"
      Environment = var.environment
      Project     = "Unmanned"
    }
  }

  tags = {
    Name        = "capstone-video-analysis-gpu-compute"
    Environment = var.environment
    Project     = "Unmanned"
  }

  # Note: IAM dependencies are managed in security module
}

# ========================================
# AWS Batch Job Queue for GPU
# ========================================

resource "aws_batch_job_queue" "video_analysis_gpu" {
  name     = "capstone-${var.environment}-video-analysis-gpu-queue"
  state    = "ENABLED"
  priority = 10 # 높은 우선순위

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.video_analysis_gpu.arn
  }

  tags = {
    Name        = "capstone-video-analysis-gpu-queue"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# AWS Batch Job Definition for Video Analysis AI
# ========================================

resource "aws_batch_job_definition" "video_analysis_processor" {
  name = "capstone-${var.environment}-video-analysis-processor"
  type = "container"

  platform_capabilities = ["EC2"]

  container_properties = jsonencode({
    # Use specific digest for production stability
    # Latest pushed: 2025-12-16
    image = "${data.aws_ecr_repository.ai_batch.repository_url}@sha256:d21057925cfce9da963e84506d0e4aeec423b747fd88f4a0343e13cd847fa3ed"

    resourceRequirements = [
      {
        type  = "VCPU"
        value = "4"
      },
      {
        type  = "MEMORY"
        value = "15360" # 15GB (g5.xlarge는 16GB 메모리)
      },
      {
        type  = "GPU"
        value = "1"
      }
    ]

    executionRoleArn = var.batch_execution_role_arn
    jobRoleArn       = var.batch_task_role_arn

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/aws/batch/capstone-video-analysis-processor"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "video-analysis"
      }
    }

    linuxParameters = {
      devices = [
        {
          hostPath      = "/dev/nvidia0"
          containerPath = "/dev/nvidia0"
          permissions   = ["read", "write", "mknod"]
        },
        {
          hostPath      = "/dev/nvidia-uvm"
          containerPath = "/dev/nvidia-uvm"
          permissions   = ["read", "write", "mknod"]
        },
        {
          hostPath      = "/dev/nvidiactl"
          containerPath = "/dev/nvidiactl"
          permissions   = ["read", "write", "mknod"]
        }
      ]
    }

    # 볼륨 마운트: AMI의 /opt/ml → 컨테이너의 /workspace
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
          sourcePath = "/opt/ml/models"
        }
      },
      {
        name = "checkpoints"
        host = {
          sourcePath = "/opt/ml/checkpoints"
        }
      },
      {
        name = "experiments"
        host = {
          sourcePath = "/opt/ml/experiments"
        }
      }
    ]

    environment = [
      {
        name  = "AWS_DEFAULT_REGION"
        value = var.region
      },
      {
        name  = "SQS_QUEUE_URL"
        value = aws_sqs_queue.video_processing.url
      },
      {
        name  = "S3_BUCKET_RAW"
        value = var.s3_raw_videos_bucket
      },
      {
        name  = "S3_BUCKET_HIGHLIGHTS"
        value = var.s3_highlights_bucket
      },
      {
        name  = "POSTGRES_HOST"
        value = var.db_host
      },
      {
        name  = "POSTGRES_PORT"
        value = tostring(var.db_port)
      },
      {
        name  = "POSTGRES_DB"
        value = var.db_name
      },
      {
        name  = "POSTGRES_USER"
        value = var.db_user
      },
      {
        name  = "ENVIRONMENT"
        value = var.environment
      },
      {
        name  = "DEVICE"
        value = "cuda:0"
      },
      {
        name  = "DETECTOR_WEIGHTS"
        value = "/workspace/models/yolov8x_person_face.pt"
      },
      {
        name  = "MIVOLO_CHECKPOINT"
        value = "/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar"
      },
      {
        name  = "MEBOW_CFG"
        value = "/workspace/experiments/coco/segm-4_lr1e-3.yaml"
      },
      {
        name  = "VLM_PATH"
        value = "/workspace/checkpoints/llava-fastvithd_0.5b_stage2"
      }
    ]

    secrets = [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = var.db_password_secret_arn
      }
    ]
  })

  retry_strategy {
    attempts = 2 # GPU 작업은 재시도 최소화
    evaluate_on_exit {
      action       = "RETRY"
      on_exit_code = "1"
    }
    evaluate_on_exit {
      action       = "EXIT"
      on_exit_code = "0"
    }
  }

  timeout {
    attempt_duration_seconds = 3600 # 60분 (AI 분석은 오래 걸릴 수 있음)
  }

  tags = {
    Name        = "capstone-video-analysis-processor"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# CloudWatch Log Group for Video Analysis Batch Jobs
resource "aws_cloudwatch_log_group" "batch_video_analysis_processor" {
  name              = "/aws/batch/capstone-video-analysis-processor"
  retention_in_days = 7

  tags = {
    Name        = "capstone-video-analysis-batch-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# Outputs
# ========================================


