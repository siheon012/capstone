# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "capstone-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "capstone-ecs-cluster"
  }
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "capstone-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (애플리케이션이 사용)
resource "aws_iam_role" "ecs_task_role" {
  name = "capstone-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# S3 접근 권한
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
          "${aws_s3_bucket.video_storage.arn}",
          "${aws_s3_bucket.video_storage.arn}/*"
        ]
      }
    ]
  })
}

# Bedrock 접근 권한
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

# CloudWatch Logs Group - Frontend
resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/capstone-frontend"
  retention_in_days = 7

  tags = {
    Name = "capstone-frontend-logs"
  }
}

# CloudWatch Logs Group - Backend
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/capstone-backend"
  retention_in_days = 7

  tags = {
    Name = "capstone-backend-logs"
  }
}

# ECS Task Definition - Frontend
resource "aws_ecs_task_definition" "frontend" {
  family                   = "capstone-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"  # 0.5 vCPU
  memory                   = "1024" # 1 GB
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${var.account_id}.dkr.ecr.${var.region}.amazonaws.com/capstone-frontend:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NEXT_PUBLIC_API_URL"
          value = "http://${aws_lb.main.dns_name}/api"
        },
        {
          name  = "NEXT_PUBLIC_S3_BUCKET"
          value = aws_s3_bucket.video_storage.id
        },
        {
          name  = "NEXT_PUBLIC_S3_REGION"
          value = var.region
        },
        {
          name  = "USE_S3"
          value = "true"
        },
        {
          name  = "NEXT_PUBLIC_ENABLE_VECTOR_SEARCH"
          value = "true"
        },
        {
          name  = "NEXT_PUBLIC_ENABLE_AUTO_TIER_MANAGEMENT"
          value = "true"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name = "capstone-frontend-task"
  }
}

# ECS Task Definition - Backend
resource "aws_ecs_task_definition" "backend" {
  family                   = "capstone-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024" # 1 vCPU
  memory                   = "2048" # 2 GB
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${var.account_id}.dkr.ecr.${var.region}.amazonaws.com/capstone-backend:latest"
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "DB_HOST"
          value = aws_db_instance.postgres.address
        },
        {
          name  = "DB_PORT"
          value = "5432"
        },
        {
          name  = "DB_NAME"
          value = "capstone_db"
        },
        {
          name  = "DB_USER"
          value = "capstone_user"
        },
        {
          name  = "AWS_STORAGE_BUCKET_NAME"
          value = aws_s3_bucket.video_storage.id
        },
        {
          name  = "AWS_S3_REGION_NAME"
          value = var.region
        },
        {
          name  = "USE_S3"
          value = "true"
        },
        {
          name  = "DJANGO_SETTINGS_MODULE"
          value = "core.settings"
        },
        {
          name  = "ALLOWED_HOSTS"
          value = "*"
        },
        {
          name  = "USE_BEDROCK"
          value = "true"
        },
        {
          name  = "AWS_BEDROCK_REGION"
          value = var.region
        },
        {
          name  = "AWS_BEDROCK_MODEL_ID"
          value = "anthropic.claude-3-sonnet-20240229-v1:0"
        },
        {
          name  = "AWS_BEDROCK_EMBEDDING_MODEL_ID"
          value = "amazon.titan-embed-text-v1"
        }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = aws_secretsmanager_secret.db_password.arn
        },
        {
          name      = "DJANGO_SECRET_KEY"
          valueFrom = aws_secretsmanager_secret.django_secret.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command = [
          "CMD-SHELL",
          "curl -f http://localhost:8000/api/health/ || exit 1"
        ]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "capstone-backend-task"
  }
}

# ECS Service - Frontend
resource "aws_ecs_service" "frontend" {
  name            = "capstone-frontend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Name = "capstone-frontend-service"
  }
}

# ECS Service - Backend
resource "aws_ecs_service" "backend" {
  name            = "capstone-backend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http, aws_db_instance.postgres]

  tags = {
    Name = "capstone-backend-service"
  }
}

# Auto Scaling Target - Frontend
resource "aws_appautoscaling_target" "frontend" {
  max_capacity       = 4
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.frontend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Auto Scaling Policy - Frontend (CPU 기반)
resource "aws_appautoscaling_policy" "frontend_cpu" {
  name               = "capstone-frontend-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.frontend.resource_id
  scalable_dimension = aws_appautoscaling_target.frontend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.frontend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Auto Scaling Target - Backend
resource "aws_appautoscaling_target" "backend" {
  max_capacity       = 4
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Auto Scaling Policy - Backend (CPU 기반)
resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "capstone-backend-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Outputs
output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.main.name
}

output "frontend_service_name" {
  description = "Frontend Service Name"
  value       = aws_ecs_service.frontend.name
}

output "backend_service_name" {
  description = "Backend Service Name"
  value       = aws_ecs_service.backend.name
}