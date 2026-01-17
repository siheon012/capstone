# ==========================================
# Pipeline Module Variables
# ==========================================
# SQS, Lambda, Batch job definitions, ECR (batch processor)

# ==========================================
# Basic
# ==========================================

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

variable "region" {
  description = "AWS Region"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}

# ==========================================
# Network Inputs (from network module)
# ==========================================

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs (비용 절감: NAT Gateway 없이 직접 인터넷 연결)"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs (RDS 전용)"
  type        = list(string)
}

variable "batch_compute_security_group_id" {
  description = "Batch compute security group ID (from network module)"
  type        = string
}

# ==========================================
# Storage Inputs (from storage module)
# ==========================================

variable "s3_raw_videos_bucket" {
  description = "Raw videos S3 bucket name"
  type        = string
}

variable "s3_raw_videos_arn" {
  description = "Raw videos S3 bucket ARN (SQS policy, IAM policy에서 사용)"
  type        = string
}

variable "s3_thumbnails_arn" {
  description = "Thumbnails S3 bucket ARN (IAM policy에서 사용)"
  type        = string
}

variable "s3_highlights_bucket" {
  description = "Highlights S3 bucket name"
  type        = string
}

variable "s3_highlights_arn" {
  description = "Highlights S3 bucket ARN (IAM policy에서 사용)"
  type        = string
}

variable "db_password_secret_arn" {
  description = "DB password secret ARN (Batch job definition에서 참조)"
  type        = string
  sensitive   = true
}

# Database connection info (Source of Truth: storage module)
variable "db_host" {
  description = "Database host (Batch container 환경변수에 전달)"
  type        = string
}

variable "db_port" {
  description = "Database port (Batch container 환경변수에 전달)"
  type        = number
}

variable "db_name" {
  description = "Database name (Batch container 환경변수에 전달)"
  type        = string
}

variable "db_user" {
  description = "Database user (Batch container 환경변수에 전달)"
  type        = string
}

# ==========================================
# Compute Inputs (from compute module)
# ==========================================

variable "ecs_cluster_id" {
  description = "ECS cluster ID (Batch compute environment에서 사용)"
  type        = string
}

variable "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  type        = string
}

# ==========================================
# IAM Inputs (from security module)
# ==========================================

variable "batch_service_role_arn" {
  description = "Batch service role ARN"
  type        = string
}

variable "batch_spot_fleet_role_arn" {
  description = "Batch Spot Fleet role ARN (for Spot instances)"
  type        = string
}

variable "batch_execution_role_arn" {
  description = "Batch execution role ARN"
  type        = string
}

variable "batch_task_role_arn" {
  description = "Batch task role ARN"
  type        = string
}

variable "batch_instance_profile_arn" {
  description = "Batch instance profile ARN (EC2 instances for Batch)"
  type        = string
}

variable "lambda_sqs_to_batch_role_arn" {
  description = "Lambda SQS to Batch role ARN"
  type        = string
}

variable "batch_instance_role_name" { type = string }
variable "ecs_instance_role_name"   { type = string }

