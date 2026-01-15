# ==========================================
# Security Module - IAM Resources
# ==========================================

# ========================================
# ECS 전용 IAM Roles
# ========================================

# ECS Task Execution Role (이미지 pull, 로그 작성 등)
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "capstone-ecs-task-execution-role"

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
    Name        = "capstone-ecs-task-execution-role"
    Environment = var.environment
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Execution Role - Secrets Manager Access
resource "aws_iam_role_policy" "ecs_secrets_policy" {
  name = "ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.db_password_secret_arn != "" && var.django_secret_arn != "" ? [
          var.db_password_secret_arn,
          var.django_secret_arn
        ] : []
      }
    ]
  })
}

# ECS Task Role (컨테이너 런타임 권한 - S3, Bedrock, SQS 등)
resource "aws_iam_role" "ecs_task_role" {
  name = "capstone-ecs-task-role"

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
    Name        = "capstone-ecs-task-role"
    Environment = var.environment
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy" "ecs_task_s3_policy" {
  name = "ecs-task-s3-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.s3_raw_videos_arn,
          "${var.s3_raw_videos_arn}/*",
          var.s3_thumbnails_arn,
          "${var.s3_thumbnails_arn}/*",
          var.s3_highlights_arn,
          "${var.s3_highlights_arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_bedrock_policy" {
  name = "ecs-task-bedrock-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:GetFoundationModelAvailability",
          "bedrock:ListFoundationModels"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = "ap-northeast-2"
          }
        }
      }
    ]
  })
}

# ecs_task_sqs_policy 부분 (수정)
resource "aws_iam_role_policy" "ecs_task_sqs_policy" {
  name = "ecs-task-sqs-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        # 변수가 비어있으면 에러가 나므로, 명시적으로 처리합니다.
        Resource = var.sqs_queue_arn != "" ? [
          var.sqs_queue_arn,
          "${var.sqs_queue_arn}-dlq"
        ] : ["*"] # 비어있을 때 fallback 처리
      }
    ]
  })
}

# lambda_sqs_batch_policy 부분 (Resource "*" 확인됨 - 그대로 유지)

# ========================================
# Batch/GPU 전용 IAM Roles
# ========================================

# Batch Service Role
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
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy_attachment" "batch_service_role" {
  role       = aws_iam_role.batch_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole"
}

# Batch Execution Role (컨테이너 시작 권한)
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
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy_attachment" "batch_execution_role" {
  role       = aws_iam_role.batch_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

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
        Resource = var.db_password_secret_arn
      }
    ]
  })
}

# Batch Task Role (컨테이너 런타임 권한)
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
    Project     = "Capstone"
  }
}

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
        # 에러 방지: 변수가 비어있으면 "*"를 할당하여 문법 오류를 막습니다.
        Resource = var.sqs_queue_arn != "" ? [
          var.sqs_queue_arn,
          "${var.sqs_queue_arn}-dlq"
        ] : ["*"]
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        # S3 ARN이 비어있을 경우를 대비한 방어 코드
        Resource = var.s3_raw_videos_arn != "" ? [
          var.s3_raw_videos_arn,
          "${var.s3_raw_videos_arn}/*"
        ] : ["*"]
      },
      {
        Sid    = "S3ThumbnailsWrite"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = var.s3_thumbnails_arn != "" && var.s3_highlights_arn != "" ? [
          "${var.s3_thumbnails_arn}/*",
          "${var.s3_highlights_arn}/*"
        ] : ["*"]
      },
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        # 중요: 단일 ARN 문자열도 리스트 [] 형식으로 감싸주는 것이 안전합니다.
        Resource = var.db_password_secret_arn != "" ? [var.db_password_secret_arn] : ["*"]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = ["arn:aws:logs:*:*:*"] # 리스트 형식 통일
      }
    ]
  })
}

# EC2 Instance Role for Batch (GPU instances)
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
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy_attachment" "batch_instance_ecs" {
  role       = aws_iam_role.batch_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_instance_profile" "batch_instance" {
  name = "capstone-${var.environment}-batch-instance-profile"
  role = aws_iam_role.batch_instance_role.name
}

# ECS Instance Role for GPU ECS (not Batch)
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

# ========================================
# Lambda 전용 IAM Roles
# ========================================

resource "aws_iam_role" "lambda_sqs_to_batch" {
  name = "capstone-dev-sqs-to-batch-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-lambda-sqs-to-batch"
    Environment = var.environment
    Project     = "Capstone"
  }
}

resource "aws_iam_role_policy" "lambda_sqs_batch_policy" {
  name = "capstone-dev-sqs-to-batch-lambda-policy"
  role = aws_iam_role.lambda_sqs_to_batch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = var.sqs_queue_arn != "" ? var.sqs_queue_arn : "*"
      },
      {
        Effect = "Allow"
        Action = [
          "batch:SubmitJob",
          "batch:DescribeJobs",
          "batch:ListJobs",
          "batch:TagResource"
        ]
        Resource = "*"
      }
    ]
  })
}
