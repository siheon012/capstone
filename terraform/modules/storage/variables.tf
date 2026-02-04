# ==========================================
# Storage Module Variables
# ==========================================
# RDS, S3 buckets, Secrets Manager를 생성하는 모듈

# ==========================================
# Basic
# ==========================================

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

# ==========================================
# Network Inputs (from network module)
# ==========================================

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs (RDS는 private subnet에 배치)"
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "RDS Security Group ID"
  type        = string
}

variable "domain_name" {
  description = "Domain name for CORS configuration"
  type        = string
}

# Note: ecs_task_execution_role은 security 모듈로 이동됨
