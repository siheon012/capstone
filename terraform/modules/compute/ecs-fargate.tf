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

# IAM Roles는 security 모듈로 이동했습니다
# 변수로 받아서 사용: var.ecs_task_execution_role_arn, var.ecs_task_role_arn

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
  cpu                      = "512"                           # 0.5 vCPU
  memory                   = "1024"                          # 1 GB
  execution_role_arn       = var.ecs_task_execution_role_arn # from security module
  task_role_arn            = var.ecs_task_role_arn           # from security module

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
          value = "https://api.${var.domain_name}"
        },
        {
          name  = "DJANGO_DB_URL"
          value = "https://api.${var.domain_name}/db"
        },
        {
          name  = "NEXT_PUBLIC_PRODUCTION_API_URL"
          value = "https://api.${var.domain_name}"
        },
        {
          name  = "NEXT_PUBLIC_S3_BUCKET"
          value = var.s3_raw_videos_bucket
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
        },
        {
          name  = "NODE_ENV"
          value = "production"
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
  cpu                      = "1024"                          # 1 vCPU
  memory                   = "2048"                          # 2 GB
  execution_role_arn       = var.ecs_task_execution_role_arn # from security module
  task_role_arn            = var.ecs_task_role_arn           # from security module

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
          value = var.db_host
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
          value = var.s3_raw_videos_bucket
        },
        {
          name  = "AWS_S3_THUMBNAILS_BUCKET"
          value = var.s3_thumbnails_bucket
        },
        {
          name  = "AWS_S3_REGION_NAME"
          value = var.region
        },
        {
          name  = "AWS_SQS_QUEUE_URL"
          value = var.sqs_queue_url
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
          name  = "DEBUG"
          value = "False"
        },
        {
          name  = "CORS_ALLOW_ALL_ORIGINS"
          value = "False"
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
          value = "anthropic.claude-3-5-sonnet-20240620-v1:0"
        },
        {
          name  = "AWS_BEDROCK_EMBEDDING_MODEL_ID"
          value = "amazon.titan-embed-text-v2:0"
        },
        {
          name  = "VECTOR_DIMENSION"
          value = "1024"
        },
        {
          name  = "PRODUCTION_DOMAIN"
          value = var.domain_name
        }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = var.db_password_secret_arn
        },
        {
          name      = "SECRET_KEY"
          valueFrom = var.django_secret_arn
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
  desired_count   = 1 # 필요할 때 꺼
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_tasks_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.frontend_target_group_arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # depends_on removed - ALB listener is in network module

  tags = {
    Name = "capstone-frontend-service"
  }
}

# ECS Service - Backend
resource "aws_ecs_service" "backend" {
  name            = "capstone-backend-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1 # 필요할때 끄자
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_tasks_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.backend_target_group_arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # depends_on 제거: aws_lb_listener.http는 network 모듈, aws_db_instance.postgres는 storage 모듈에 있음
  # 모듈 간 의존성은 main.tf의 module 블록 순서로 자동 처리됨

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

# Outputs는 outputs.tf에 정의됨