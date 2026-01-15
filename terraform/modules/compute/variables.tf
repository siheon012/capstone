# ==========================================
# Compute Module Variables
# ==========================================

# 기본 정보
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS Region"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID (for ECR image URLs)"
  type        = string
}

variable "domain_name" {
  description = "Domain name (for frontend environment variables)"
  type        = string
}

# ==========================================
# Network Inputs (from network module)
# ==========================================

variable "vpc_id" {
  description = "VPC ID for service discovery namespace"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_tasks_security_group_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "batch_compute_security_group_id" {
  description = "Security group ID for Batch compute environment"
  type        = string
}

variable "frontend_target_group_arn" {
  description = "ALB target group ARN for frontend service"
  type        = string
}

variable "backend_target_group_arn" {
  description = "ALB target group ARN for backend service"
  type        = string
}

# ==========================================
# Storage Inputs (from storage module)
# ==========================================
# DB 연결 정보 (컨테이너 환경변수로 전달)

variable "db_host" {
  description = "Database endpoint (from storage module output)"
  type        = string
}

variable "db_port" {
  description = "Database port (from storage module output)"
  type        = number
}

variable "db_name" {
  description = "Database name (from storage module output)"
  type        = string
}

variable "db_user" {
  description = "Database user (from storage module output)"
  type        = string
}

# S3 버킷 이름 (컨테이너 환경변수로 전달)

variable "s3_raw_videos_bucket" {
  description = "Raw videos S3 bucket name (from storage module)"
  type        = string
}

variable "s3_thumbnails_bucket" {
  description = "Thumbnails S3 bucket name (from storage module)"
  type        = string
}

variable "s3_highlights_bucket" {
  description = "Highlights S3 bucket name (from storage module)"
  type        = string
}

# S3 버킷 ARN (IAM 정책에서 사용 - 하지만 IAM은 security 모듈로 이동)

variable "s3_raw_videos_arn" {
  description = "Raw videos S3 bucket ARN (passed through for reference)"
  type        = string
}

variable "s3_thumbnails_arn" {
  description = "Thumbnails S3 bucket ARN (passed through for reference)"
  type        = string
}

variable "s3_highlights_arn" {
  description = "Highlights S3 bucket ARN (passed through for reference)"
  type        = string
}

# Secrets Manager ARN (컨테이너에서 참조)

variable "db_password_secret_arn" {
  description = "DB password secret ARN (from storage module)"
  type        = string
}

variable "django_secret_arn" {
  description = "Django secret key ARN (from storage module)"
  type        = string
}

# ==========================================
# Pipeline Inputs (from pipeline module)
# ==========================================

variable "sqs_queue_url" {
  description = "SQS queue URL (optional, for backend environment)"
  type        = string
  default     = ""
}

variable "sqs_queue_arn" {
  description = "SQS queue ARN (optional, passed through)"
  type        = string
  default     = ""
}

variable "batch_ecr_repository_url" {
  description = "Batch processor ECR repository URL (for GPU ECS task)"
  type        = string
  default     = ""
}

# ==========================================
# IAM Inputs (from security module)
# ==========================================

variable "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN (from security module)"
  type        = string
}

variable "ecs_task_role_arn" {
  description = "ECS task role ARN (from security module)"
  type        = string
}

variable "ecs_instance_profile_arn" {
  description = "ECS instance profile ARN for GPU instances (from security module)"
  type        = string
}

variable "batch_instance_profile_arn" {
  description = "Batch instance profile ARN (from security module)"
  type        = string
}

