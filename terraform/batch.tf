# ========================================
# AWS Batch Infrastructure
# ========================================

# IAM Role for Batch Compute Environment
resource "aws_iam_role" "batch_service_role" {
  name = "capstone-${var.environment}-batch-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "batch.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-batch-service-role"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Attach AWS managed Batch service policy
resource "aws_iam_role_policy_attachment" "batch_service_role" {
  role       = aws_iam_role.batch_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole"
}

# IAM Role for Batch Job Execution (ECS Task Execution Role)
resource "aws_iam_role" "batch_execution_role" {
  name = "capstone-${var.environment}-batch-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-batch-execution-role"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Attach ECS Task Execution policy
resource "aws_iam_role_policy_attachment" "batch_execution_role" {
  role       = aws_iam_role.batch_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Batch Execution Role에 Secrets Manager 접근 권한 추가
resource "aws_iam_role_policy" "batch_execution_secrets" {
  name = "capstone-${var.environment}-batch-execution-secrets"
  role = aws_iam_role.batch_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.db_password.arn
      }
    ]
  })
}

# IAM Role for Batch Job Tasks (Container Runtime)
resource "aws_iam_role" "batch_task_role" {
  name = "capstone-${var.environment}-batch-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-batch-task-role"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Batch Task Policy - SQS, S3, RDS, Secrets Manager 접근
resource "aws_iam_role_policy" "batch_task_policy" {
  name = "capstone-${var.environment}-batch-task-policy"
  role = aws_iam_role.batch_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = [
          aws_sqs_queue.video_processing.arn,
          aws_sqs_queue.video_processing_dlq.arn
        ]
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "${aws_s3_bucket.raw_videos.arn}",
          "${aws_s3_bucket.raw_videos.arn}/*"
        ]
      },
      {
        Sid    = "S3ThumbnailsWrite"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "${aws_s3_bucket.thumbnails.arn}/*",
          "${aws_s3_bucket.highlights.arn}/*"
        ]
      },
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.db_password.arn
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Security Group for Batch Compute Environment
resource "aws_security_group" "batch_compute" {
  name        = "capstone-${var.environment}-batch-compute-sg"
  description = "Security group for AWS Batch compute environment"
  vpc_id      = aws_vpc.main.id

  # Outbound: 모든 트래픽 허용 (FastAPI, RDS, S3 접근)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "capstone-batch-compute-sg"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# AWS Batch Compute Environment
# ========================================

# GPU Compute Environment for EC2 instances
# Launch Template for GPU instances with larger EBS volume
resource "aws_launch_template" "gpu_batch" {
  name_prefix = "capstone-${var.environment}-gpu-batch-"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 50  # 50GB (기본 30GB에서 증가)
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "capstone-gpu-batch-instance"
      Environment = var.environment
      Project     = "Unmanned"
    }
  }
}

# 🔧 이 Compute Environment는 사용하지 않음 (batch-memi-gpu.tf의 memi_gpu 사용)
# resource "aws_batch_compute_environment" "gpu_video_processing" {
#   type                           = "MANAGED"
#   service_role                   = aws_iam_role.batch_service_role.arn
#   state                          = "ENABLED"

#   compute_resources {
#     type               = "EC2"
#     allocation_strategy = "BEST_FIT_PROGRESSIVE"
#     min_vcpus          = 0
#     max_vcpus          = 8  # g5.xlarge는 4 vCPU이므로 2개 인스턴스 가능
#     
#     instance_type = ["g5.xlarge"]  # GPU 인스턴스 (NVIDIA A10G, 24GB VRAM)
#     
#     instance_role = aws_iam_instance_profile.ecs_instance.arn
#
#     subnets = [
#       aws_subnet.private_1.id,
#       aws_subnet.private_2.id
#     ]
#
#     security_group_ids = [
#       aws_security_group.batch_compute.id
#     ]
#
#     # Launch Template with larger EBS volume
#     launch_template {
#       launch_template_id = aws_launch_template.gpu_batch.id
#       version            = "$Latest"
#     }
#
#     # EC2 Key Pair (optional, for debugging)
#     # ec2_key_pair = "your-key-pair-name"
#     
#     # Image ID for ECS GPU-optimized AMI
#     image_id = data.aws_ami.ecs_gpu.id
#   }

#   tags = {
#     Name        = "capstone-gpu-video-processing-compute"
#     Environment = var.environment
#     Project     = "Unmanned"
#   }
#
#   depends_on = [aws_iam_role_policy_attachment.batch_service_role]
# }

# ========================================
# EC2 Instance Profile for Batch GPU
# ========================================

resource "aws_iam_role" "ecs_instance_role" {
  name = "capstone-${var.environment}-ecs-instance-role"

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
    Name        = "capstone-ecs-instance-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_instance_role" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_instance_profile" "ecs_instance" {
  name = "capstone-${var.environment}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance_role.name
}

# ECS GPU-optimized AMI
data "aws_ami" "ecs_gpu" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-ecs-gpu-hvm-*-x86_64-ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ========================================
# AWS Batch Job Queue
# ========================================

# GPU Job Queue (EC2) - 사용 안함 (batch-memi-gpu.tf의 memi_gpu_queue 사용)
# resource "aws_batch_job_queue" "video_processing" {
#   name     = "capstone-${var.environment}-video-processing-queue"
#   state    = "ENABLED"
#   priority = 1
#
#   compute_environment_order {
#     order               = 1
#     compute_environment = aws_batch_compute_environment.gpu_video_processing.arn
#   }
#
#   tags = {
#     Name        = "capstone-gpu-video-processing-queue"
#     Environment = var.environment
#     Project     = "Unmanned"
#   }
# }

# ========================================
# AWS Batch Job Definition - GPU
# ========================================

resource "aws_batch_job_definition" "gpu_video_processor" {
  name = "capstone-${var.environment}-gpu-video-processor"
  type = "container"

  platform_capabilities = ["EC2"]

  container_properties = jsonencode({
    image = "${aws_ecr_repository.batch_processor.repository_url}:latest"
    
    resourceRequirements = [
      {
        type  = "VCPU"
        value = "2"
      },
      {
        type  = "MEMORY"
        value = "8192"  # 8GB
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
        "awslogs-group"         = "/aws/batch/capstone-video-processor"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "batch-gpu"
      }
    }

    environment = [
      {
        name  = "AWS_DEFAULT_REGION"
        value = var.region
      },
      {
        name  = "S3_BUCKET_RAW"
        value = aws_s3_bucket.raw_videos.id
      },
      {
        name  = "SQS_QUEUE_URL"
        value = aws_sqs_queue.video_processing.url
      },
      # ALB 비활성화로 FASTAPI_ENDPOINT 제거
      # {
      #   name  = "FASTAPI_ENDPOINT"
      #   value = "http://${aws_lb.main.dns_name}:8087"  # FastAPI 서비스 엔드포인트
      # },
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
    attempts = 3
  }

  timeout {
    attempt_duration_seconds = 3600  # 1시간
  }

  tags = {
    Name        = "capstone-gpu-video-processor"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# CloudWatch Log Group for Batch Jobs
resource "aws_cloudwatch_log_group" "batch_video_processor" {
  name              = "/aws/batch/capstone-video-processor"
  retention_in_days = 7

  tags = {
    Name        = "capstone-batch-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# ECR Repository for Batch Processor
# ========================================

resource "aws_ecr_repository" "batch_processor" {
  name                 = "capstone-${var.environment}-batch-processor"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "capstone-batch-processor"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "batch_processor" {
  repository = aws_ecr_repository.batch_processor.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ========================================
# Outputs
# ========================================

# 사용 안 함 - MEMI Compute Environment 사용
# output "batch_compute_environment_arn" {
#   description = "Batch Compute Environment ARN"
#   value       = aws_batch_compute_environment.gpu_video_processing.arn
# }

# output "batch_job_queue_arn" {
#   description = "Batch Job Queue ARN"
#   value       = aws_batch_job_queue.video_processing.arn
# }

output "batch_job_definition_arn" {
  description = "Batch Job Definition ARN"
  value       = aws_batch_job_definition.gpu_video_processor.arn
}

output "batch_processor_ecr_url" {
  description = "ECR Repository URL for Batch Processor"
  value       = aws_ecr_repository.batch_processor.repository_url
}
