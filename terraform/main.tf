# Terraform 설정
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  #  Backend 설정 블록
  backend "s3" {
    bucket         = "capstone-dev-terraform-state-backup" # 사용자님이 이미 만든 S3 버킷 이름
    key            = "backend_state/terraform.tfstate"     # S3 안에 저장될 파일 경로
    region         = "ap-northeast-2"
    encrypt        = true                   # 보안을 위해 암호화
    dynamodb_table = "terraform-state-lock" # 방금 만든 DynamoDB 테이블 이름
  }
}


# AWS Provider 설정
provider "aws" {
  region = "ap-northeast-2"
}

# 변수는 variables.tf에 정의됨

# Data sources
data "aws_caller_identity" "current" {}

# Network Module
module "network" {
  source = "./modules/network"

  environment = var.environment
  region      = var.region
  domain_name = var.domain_name
  vpc_cidr    = var.vpc_cidr
}

# Storage Module  
module "storage" {
  source = "./modules/storage"

  environment           = var.environment
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  rds_security_group_id = module.network.rds_security_group_id
}

# Security Module (IAM)
module "security" {
  source = "./modules/security"

  environment            = var.environment
  s3_raw_videos_arn      = module.storage.s3_raw_videos_arn
  s3_thumbnails_arn      = module.storage.s3_thumbnails_arn
  s3_highlights_arn      = module.storage.s3_highlights_arn
  db_password_secret_arn = module.storage.db_password_secret_arn
  django_secret_arn      = module.storage.django_secret_arn
  sqs_queue_arn          = "" # Pipeline 모듈 생성 후 업데이트 예정
}

# Pipeline Module
module "pipeline" {
  source = "./modules/pipeline"

  environment                     = var.environment
  region                          = var.region
  account_id                      = data.aws_caller_identity.current.account_id
  vpc_id                          = module.network.vpc_id
  private_subnet_ids              = module.network.private_subnet_ids
  batch_compute_security_group_id = module.network.batch_compute_security_group_id
  s3_raw_videos_bucket            = module.storage.s3_raw_videos_bucket
  s3_raw_videos_arn               = module.storage.s3_raw_videos_arn
  s3_thumbnails_arn               = module.storage.s3_thumbnails_arn
  s3_highlights_arn               = module.storage.s3_highlights_arn
  s3_highlights_bucket            = module.storage.s3_highlights_bucket
  db_password_secret_arn          = module.storage.db_password_secret_arn
  db_host                         = module.storage.db_host
  db_port                         = module.storage.db_port
  db_name                         = module.storage.db_name
  db_user                         = module.storage.db_user
  ecs_cluster_id                  = module.compute.ecs_cluster_id
  ecs_cluster_arn                 = module.compute.ecs_cluster_arn
  batch_service_role_arn          = module.security.batch_service_role_arn
  batch_execution_role_arn        = module.security.batch_execution_role_arn
  batch_task_role_arn             = module.security.batch_task_role_arn
  batch_instance_profile_arn      = module.security.batch_instance_profile_arn
  lambda_sqs_to_batch_role_arn    = module.security.lambda_sqs_to_batch_role_arn
  batch_instance_role_name        = module.security.batch_instance_role_name
  ecs_instance_role_name          = module.security.ecs_instance_role_name
}

# Compute Module
module "compute" {
  source = "./modules/compute"

  environment                     = var.environment
  region                          = var.region
  account_id                      = data.aws_caller_identity.current.account_id
  domain_name                     = var.domain_name
  vpc_id                          = module.network.vpc_id
  public_subnet_ids               = module.network.public_subnet_ids
  private_subnet_ids              = module.network.private_subnet_ids
  ecs_tasks_security_group_id     = module.network.ecs_tasks_security_group_id
  batch_compute_security_group_id = module.network.batch_compute_security_group_id
  frontend_target_group_arn       = module.network.frontend_target_group_arn
  backend_target_group_arn        = module.network.backend_target_group_arn
  s3_raw_videos_bucket            = module.storage.s3_raw_videos_bucket
  s3_raw_videos_arn               = module.storage.s3_raw_videos_arn
  s3_thumbnails_bucket            = module.storage.s3_thumbnails_bucket
  s3_thumbnails_arn               = module.storage.s3_thumbnails_arn
  s3_highlights_bucket            = module.storage.s3_highlights_bucket
  s3_highlights_arn               = module.storage.s3_highlights_arn
  db_host                         = module.storage.db_host
  db_port                         = module.storage.db_port
  db_name                         = module.storage.db_name
  db_user                         = module.storage.db_user
  db_password_secret_arn          = module.storage.db_password_secret_arn
  django_secret_arn               = module.storage.django_secret_arn
  sqs_queue_url                   = module.pipeline.sqs_queue_url
  sqs_queue_arn                   = module.pipeline.sqs_queue_arn
  batch_ecr_repository_url        = module.pipeline.batch_processor_ecr_url
  ecs_task_execution_role_arn     = module.security.ecs_task_execution_role_arn
  ecs_task_role_arn               = module.security.ecs_task_role_arn
  ecs_instance_profile_arn        = module.security.ecs_instance_profile_arn
  batch_instance_profile_arn      = module.security.batch_instance_profile_arn
}

# IAM Module
module "iam" {
  source = "./modules/iam"

  environment                 = var.environment
  s3_raw_videos_arn           = module.storage.s3_raw_videos_arn
  s3_thumbnails_arn           = module.storage.s3_thumbnails_arn
  ecs_task_execution_role_arn = module.security.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.security.ecs_task_role_arn
}