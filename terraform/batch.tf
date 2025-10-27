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
          "${aws_s3_bucket.thumbnails.arn}/*"
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

resource "aws_batch_compute_environment" "video_processing" {
  compute_environment_name = "capstone-${var.environment}-video-processing"
  type                     = "MANAGED"
  service_role             = aws_iam_role.batch_service_role.arn

  compute_resources {
    type      = "FARGATE"
    max_vcpus = 16  # 동시 처리 가능한 최대 vCPU

    subnets = [
      aws_subnet.private_1.id,
      aws_subnet.private_2.id
    ]

    security_group_ids = [
      aws_security_group.batch_compute.id
    ]
  }

  tags = {
    Name        = "capstone-video-processing-compute"
    Environment = var.environment
    Project     = "Unmanned"
  }

  depends_on = [aws_iam_role_policy_attachment.batch_service_role]
}

# ========================================
# AWS Batch Job Queue
# ========================================

resource "aws_batch_job_queue" "video_processing" {
  name     = "capstone-${var.environment}-video-processing-queue"
  state    = "ENABLED"
  priority = 1

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.video_processing.arn
  }

  tags = {
    Name        = "capstone-video-processing-queue"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# AWS Batch Job Definition
# ========================================

resource "aws_batch_job_definition" "video_processor" {
  name = "capstone-${var.environment}-video-processor"
  type = "container"

  platform_capabilities = ["FARGATE"]

  container_properties = jsonencode({
    image = "${aws_ecr_repository.batch_processor.repository_url}:latest"
    
    fargatePlatformConfiguration = {
      platformVersion = "LATEST"
    }

    resourceRequirements = [
      {
        type  = "VCPU"
        value = "2"
      },
      {
        type  = "MEMORY"
        value = "4096"  # 4GB
      }
    ]

    executionRoleArn = aws_iam_role.batch_execution_role.arn
    jobRoleArn       = aws_iam_role.batch_task_role.arn

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/aws/batch/capstone-video-processor"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "batch"
      }
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
        name  = "S3_BUCKET_THUMBNAILS"
        value = aws_s3_bucket.thumbnails.bucket
      },
      {
        name  = "FASTAPI_ENDPOINT"
        value = "http://${aws_lb.main.dns_name}:8087"  # FastAPI 서비스 엔드포인트
      },
      {
        name  = "DB_SECRET_ARN"
        value = aws_secretsmanager_secret.db_password.arn
      },
      {
        name  = "ENVIRONMENT"
        value = var.environment
      }
    ]
  })

  retry_strategy {
    attempts = 3
    evaluate_on_exit {
      action          = "RETRY"
      on_exit_code    = "1"
    }
    evaluate_on_exit {
      action          = "EXIT"
      on_exit_code    = "0"
    }
  }

  timeout {
    attempt_duration_seconds = 1800  # 30분
  }

  tags = {
    Name        = "capstone-video-processor"
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

output "batch_compute_environment_arn" {
  description = "Batch Compute Environment ARN"
  value       = aws_batch_compute_environment.video_processing.arn
}

output "batch_job_queue_arn" {
  description = "Batch Job Queue ARN"
  value       = aws_batch_job_queue.video_processing.arn
}

output "batch_job_definition_arn" {
  description = "Batch Job Definition ARN"
  value       = aws_batch_job_definition.video_processor.arn
}

output "batch_processor_ecr_url" {
  description = "ECR Repository URL for Batch Processor"
  value       = aws_ecr_repository.batch_processor.repository_url
}
