# ========================================
# ECS GPU Cluster for Video Analysis FastAPI
# ========================================

# CloudWatch Log Group for Video Analysis GPU
resource "aws_cloudwatch_log_group" "video_analysis_gpu" {
  name              = "/ecs/capstone-video-analysis-gpu"
  retention_in_days = 7

  tags = {
    Name        = "capstone-video-analysis-gpu-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# GPU AMI lookup
data "aws_ami" "ecs_gpu" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-ecs-gpu-hvm-*-x86_64-ebs"]
  }
}

# ECS Cluster는 ecs-fargate.tf에 정의되어 있음 (aws_ecs_cluster.main)

# Launch Template for GPU EC2
resource "aws_launch_template" "gpu_ecs" {
  name_prefix   = "capstone-${var.environment}-gpu-ecs-"
  image_id      = data.aws_ami.ecs_gpu.id
  instance_type = "g5.xlarge"

  iam_instance_profile {
    arn = var.ecs_instance_profile_arn # from security module
  }

  vpc_security_group_ids = [var.ecs_tasks_security_group_id]

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
  vpc_zone_identifier = var.private_subnet_ids # from network module
  min_size            = 0                      # 비활성화: AWS Batch 사용 중
  max_size            = 0                      # 비활성화: AWS Batch 사용 중
  desired_capacity    = 0                      # 비활성화: AWS Batch 사용 중

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
  cluster_name = aws_ecs_cluster.main.name

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
# Video Analysis GPU FastAPI Task Definition
# ========================================

resource "aws_ecs_task_definition" "video_analysis_gpu" {
  family                   = "capstone-video-analysis-gpu"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  cpu                      = "2048"                          # 2 vCPU
  memory                   = "8192"                          # 8GB
  execution_role_arn       = var.ecs_task_execution_role_arn # from security module
  task_role_arn            = var.ecs_task_role_arn           # from security module

  container_definitions = jsonencode([
    {
      name      = "video-analysis-gpu"
      image     = "${var.batch_ecr_repository_url}:latest"
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
        },
        {
          name  = "CUDA_VISIBLE_DEVICES"
          value = "0"
        },
        {
          name  = "S3_BUCKET_RAW"
          value = var.s3_raw_videos_bucket
        },
        {
          name  = "POSTGRES_HOST"
          value = var.db_host
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
          valueFrom = var.db_password_secret_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.video_analysis_gpu.name
          "awslogs-region"        = "ap-northeast-2"
          "awslogs-stream-prefix" = "video-analysis-gpu"
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
    Name        = "capstone-video-analysis-gpu"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ========================================
# ECS Service for Video Analysis GPU
# ========================================

resource "aws_ecs_service" "video_analysis_gpu" {
  name            = "capstone-video-analysis-gpu-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.video_analysis_gpu.arn
  desired_count   = 1
  launch_type     = "EC2"

  network_configuration {
    subnets         = var.private_subnet_ids            # from network module
    security_groups = [var.ecs_tasks_security_group_id] # from network module
  }

  placement_constraints {
    type = "distinctInstance"
  }

  service_registries {
    registry_arn = aws_service_discovery_service.video_analysis_gpu.arn
  }

  depends_on = [
    aws_autoscaling_group.gpu_ecs,
    aws_ecs_capacity_provider.gpu
  ]

  tags = {
    Name        = "capstone-video-analysis-gpu-service"
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
  vpc         = var.vpc_id

  tags = {
    Name        = "capstone-internal-dns"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

resource "aws_service_discovery_service" "video_analysis_gpu" {
  name = "video-analysis-gpu"

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
    Name        = "capstone-video-analysis-gpu-discovery"
    Environment = var.environment
    Project     = "Unmanned"
  }
}
