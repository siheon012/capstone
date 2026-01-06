# ========================================
# AWS Batch - MEMI GPU Video Processing
# ========================================
# This file configures AWS Batch for on-demand GPU video processing.
# 
# Key Features:
# - Custom AMI (ami-05a7c7234d12946e9) with pre-loaded 17GB Docker image
# - Reduces startup time from 20 minutes to ~3 minutes
# - g5.xlarge GPU instances (NVIDIA A10G, 4 vCPU, 16GB RAM)
# - Auto-scaling: min_vcpus=0, max_vcpus=8 (supports 2 concurrent jobs)
# 
# Cost Optimization:
# - Only provisions GPU instances when Batch jobs are submitted
# - Instances terminate automatically after job completion
# - Estimated cost: $1-3 per video (vs $720/month for 24/7 ECS)
# 
# Related Files:
# - batch.tf: Common IAM roles and security groups
# - ecs-gpu.tf: Alternative 24/7 mode (currently disabled)
# ========================================

# ECR Repository for Memi Batch Processor - 기존 리포지토리 사용
data "aws_ecr_repository" "ai_batch" {
  name = "capstone-dev-batch-processor"
}

# ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "ai_batch" {
  repository = data.aws_ecr_repository.ai_batch.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images older than 3 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 3
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Launch Template for GPU Instances
resource "aws_launch_template" "batch_gpu" {
  name_prefix   = "capstone-batch-gpu-"
  image_id      = "ami-05a7c7234d12946e9"  # Custom AMI with pre-loaded 17GB Docker image
  instance_type = "g5.xlarge" # GPU 인스턴스 (NVIDIA A10G, 24GB VRAM)

  iam_instance_profile {
    arn = aws_iam_instance_profile.batch_instance.arn
  }

  vpc_security_group_ids = [aws_security_group.batch_compute.id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 100 # GPU 모델이 크므로 100GB
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

# GPU-optimized Custom AMI (ami-05a7c7234d12946e9)
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

# IAM Instance Profile for Batch GPU Instances
resource "aws_iam_instance_profile" "batch_instance" {
  name = "capstone-${var.environment}-batch-instance-profile"
  role = aws_iam_role.batch_instance_role.name
}

# IAM Role for Batch GPU Instances
resource "aws_iam_role" "batch_instance_role" {
  name = "capstone-${var.environment}-batch-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-batch-instance-role"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Attach ECS Instance Role Policy
resource "aws_iam_role_policy_attachment" "batch_instance_ecs" {
  role       = aws_iam_role.batch_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# ========================================
# AWS Batch GPU Compute Environment
# ========================================

resource "aws_batch_compute_environment" "memi_gpu" {
  type         = "MANAGED"
  service_role = aws_iam_role.batch_service_role.arn
  state        = "ENABLED"

  compute_resources {
    type      = "EC2"
    min_vcpus = 0
    max_vcpus = 16 # 최대 4개의 g5.xlarge 인스턴스 (각 4 vCPU)

    instance_type = ["g5.xlarge"]

    subnets = [
      aws_subnet.private_1.id,
      aws_subnet.private_2.id
    ]

    security_group_ids = [
      aws_security_group.batch_compute.id
    ]

    instance_role = aws_iam_instance_profile.batch_instance.arn

    launch_template {
      launch_template_id = aws_launch_template.batch_gpu.id
      version            = "$Latest"
    }

    # EC2 Configuration to use Custom AMI with pre-loaded Docker image
    ec2_configuration {
      image_type = "ECS_AL2_NVIDIA"
      image_id_override = "ami-05a7c7234d12946e9"  # Custom AMI with 17GB image pre-loaded
    }

    tags = {
      Name        = "capstone-memi-gpu-instance"
      Environment = var.environment
      Project     = "Unmanned"
    }
  }

  tags = {
    Name        = "capstone-memi-gpu-compute"
    Environment = var.environment
    Project     = "Unmanned"
  }

  depends_on = [
    aws_iam_role_policy_attachment.batch_service_role,
    aws_iam_role_policy_attachment.batch_instance_ecs
  ]
}

# ========================================
# AWS Batch Job Queue for GPU
# ========================================

resource "aws_batch_job_queue" "memi_gpu" {
  name     = "capstone-${var.environment}-memi-gpu-queue"
  state    = "ENABLED"
  priority = 10 # 높은 우선순위

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.memi_gpu.arn
  }

  tags = {
    Name        = "capstone-memi-gpu-queue"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# AWS Batch Job Definition for Memi AI
# ========================================

resource "aws_batch_job_definition" "memi_processor" {
  name = "capstone-${var.environment}-memi-processor"
  type = "container"

  platform_capabilities = ["EC2"]

  container_properties = jsonencode({
    # Use specific digest for production stability
    # Latest pushed: 2025-12-16
    image = "${data.aws_ecr_repository.ai_batch.repository_url}@sha256:9563dd8058b55fd473a52e5d93d9d3425f09d2b007230167a619bacf6d6bed71"

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

    executionRoleArn = aws_iam_role.batch_execution_role.arn
    jobRoleArn       = aws_iam_role.batch_task_role.arn

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/aws/batch/capstone-memi-processor"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "memi"
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
        value = aws_s3_bucket.raw_videos.bucket
      },
      {
        name  = "S3_BUCKET_HIGHLIGHTS"
        value = aws_s3_bucket.highlights.bucket
      },
      {
        name  = "POSTGRES_HOST"
        value = aws_db_instance.postgres.address
      },
      {
        name  = "POSTGRES_PORT"
        value = tostring(aws_db_instance.postgres.port)
      },
      {
        name  = "POSTGRES_DB"
        value = aws_db_instance.postgres.db_name
      },
      {
        name  = "POSTGRES_USER"
        value = aws_db_instance.postgres.username
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
        valueFrom = aws_secretsmanager_secret.db_password.arn
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
    Name        = "capstone-memi-processor"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# CloudWatch Log Group for Memi Batch Jobs
resource "aws_cloudwatch_log_group" "batch_memi_processor" {
  name              = "/aws/batch/capstone-memi-processor"
  retention_in_days = 7

  tags = {
    Name        = "capstone-memi-batch-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# Outputs
# ========================================

output "memi_batch_compute_environment_arn" {
  description = "Memi GPU Batch Compute Environment ARN"
  value       = aws_batch_compute_environment.memi_gpu.arn
}

output "memi_batch_job_queue_arn" {
  description = "Memi GPU Batch Job Queue ARN"
  value       = aws_batch_job_queue.memi_gpu.arn
}

output "memi_batch_job_definition_arn" {
  description = "Memi Batch Job Definition ARN"
  value       = aws_batch_job_definition.memi_processor.arn
}

output "ai_batch_ecr_url" {
  description = "ECR Repository URL for AI Batch Processor"
  value       = data.aws_ecr_repository.ai_batch.repository_url
}
