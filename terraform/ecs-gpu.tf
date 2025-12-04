# ========================================
# ECS GPU Cluster for memi FastAPI
# ========================================

# ECS Cluster (기존 클러스터 사용)
data "aws_ecs_cluster" "main" {
  cluster_name = "capstone-cluster"
}

# Launch Template for GPU EC2
resource "aws_launch_template" "gpu_ecs" {
  name_prefix   = "capstone-${var.environment}-gpu-ecs-"
  image_id      = data.aws_ami.ecs_gpu.id
  instance_type = "g5.xlarge"

  iam_instance_profile {
    arn = aws_iam_instance_profile.ecs_instance.arn
  }

  vpc_security_group_ids = [aws_security_group.ecs_tasks.id]

  user_data = base64encode(<<-EOF
              #!/bin/bash
              echo ECS_CLUSTER=capstone-cluster >> /etc/ecs/ecs.config
              echo ECS_ENABLE_GPU_SUPPORT=true >> /etc/ecs/ecs.config
              EOF
  )

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 50
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "capstone-gpu-ecs-instance"
      Environment = var.environment
      Project     = "Unmanned"
    }
  }
}

# Auto Scaling Group for GPU EC2
resource "aws_autoscaling_group" "gpu_ecs" {
  name                = "capstone-${var.environment}-gpu-ecs-asg"
  vpc_zone_identifier = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1

  launch_template {
    id      = aws_launch_template.gpu_ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "capstone-gpu-ecs-instance"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }
}

# ECS Capacity Provider
resource "aws_ecs_capacity_provider" "gpu" {
  name = "capstone-${var.environment}-gpu-capacity-provider"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.gpu_ecs.arn
    managed_termination_protection = "DISABLED"

    managed_scaling {
      status          = "ENABLED"
      target_capacity = 100
    }
  }
}

# Attach Capacity Provider to Cluster
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = data.aws_ecs_cluster.main.cluster_name

  capacity_providers = [
    "FARGATE",
    "FARGATE_SPOT",
    aws_ecs_capacity_provider.gpu.name
  ]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ========================================
# memi GPU FastAPI Task Definition
# ========================================

resource "aws_ecs_task_definition" "memi_gpu" {
  family                   = "capstone-memi-gpu"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  cpu                      = "2048"  # 2 vCPU
  memory                   = "8192"  # 8GB
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "memi-gpu"
      image     = "${aws_ecr_repository.batch_processor.repository_url}:latest"
      cpu       = 2048
      memory    = 8192
      essential = true

      resourceRequirements = [
        {
          type  = "GPU"
          value = "1"
        }
      ]

      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "DETECTOR_WEIGHTS"
          value = "/app/models/yolov8x_person_face.pt"
        },
        {
          name  = "MIVOLO_CHECKPOINT"
          value = "/app/models/model_imdb_cross_person_4.22_99.46.pth.tar"
        },
        {
          name  = "MEBOW_CFG"
          value = "/app/config/mebow.yaml"
        },
        {
          name  = "VLM_PATH"
          value = "/app/checkpoints/llava-fastvithd_0.5b_stage2"
        },
        {
          name  = "CUDA_VISIBLE_DEVICES"
          value = "0"
        },
        {
          name  = "S3_BUCKET_RAW"
          value = aws_s3_bucket.raw_videos.id
        },
        {
          name  = "POSTGRES_HOST"
          value = aws_db_instance.postgres.address
        },
        {
          name  = "POSTGRES_PORT"
          value = "5432"
        },
        {
          name  = "POSTGRES_DB"
          value = "capstone"
        },
        {
          name  = "POSTGRES_USER"
          value = "postgres"
        }
      ]

      secrets = [
        {
          name      = "POSTGRES_PASSWORD"
          valueFrom = aws_secretsmanager_secret.db_password.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.memi_gpu.name
          "awslogs-region"        = "ap-northeast-2"
          "awslogs-stream-prefix" = "memi-gpu"
        }
      }

      command = [
        "uvicorn",
        "fastapi_app:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000"
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name        = "capstone-memi-gpu"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# CloudWatch Log Group for memi GPU
resource "aws_cloudwatch_log_group" "memi_gpu" {
  name              = "/ecs/capstone-memi-gpu"
  retention_in_days = 7

  tags = {
    Name        = "capstone-memi-gpu-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# ECS Service for memi GPU
# ========================================

resource "aws_ecs_service" "memi_gpu" {
  name            = "capstone-memi-gpu-service"
  cluster         = data.aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.memi_gpu.arn
  desired_count   = 1
  launch_type     = "EC2"

  network_configuration {
    subnets         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  placement_constraints {
    type = "distinctInstance"
  }

  service_registries {
    registry_arn = aws_service_discovery_service.memi_gpu.arn
  }

  depends_on = [
    aws_autoscaling_group.gpu_ecs,
    aws_ecs_capacity_provider.gpu
  ]

  tags = {
    Name        = "capstone-memi-gpu-service"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# Service Discovery for Internal DNS
# ========================================

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name        = "capstone.local"
  description = "Private DNS namespace for ECS services"
  vpc         = aws_vpc.main.id

  tags = {
    Name        = "capstone-internal-dns"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

resource "aws_service_discovery_service" "memi_gpu" {
  name = "memi-gpu"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  # health_check_custom_config {
  #   failure_threshold = 1  # deprecated 속성 제거
  # }

  tags = {
    Name        = "capstone-memi-gpu-discovery"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# Outputs
# ========================================

output "memi_gpu_service_name" {
  description = "memi GPU ECS Service name"
  value       = aws_ecs_service.memi_gpu.name
}

output "memi_gpu_internal_url" {
  description = "Internal URL for memi GPU API"
  value       = "http://memi-gpu.capstone.local:8000"
}

output "gpu_asg_name" {
  description = "GPU Auto Scaling Group name"
  value       = aws_autoscaling_group.gpu_ecs.name
}
