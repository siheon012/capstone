# ==========================================
# IAM Module Variables
# ==========================================
# 사람(user)을 위한 IAM 리소스만 관리 (서비스 IAM role은 security/ 모듈에서 관리)

# ==========================================
# Basic
# ==========================================

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

# ==========================================
# Security Module Inputs (IAM role ARNs for GitHub Actions)
# ==========================================

variable "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN (GitHub Actions가 ECS 배포 시 PassRole 권한 필요)"
  type        = string
  default     = ""
}

variable "ecs_task_role_arn" {
  description = "ECS task role ARN (GitHub Actions가 ECS 배포 시 PassRole 권한 필요)"
  type        = string
  default     = ""
}

# ==========================================
# Storage Module Inputs (S3 ARNs for developers)
# ==========================================

variable "s3_raw_videos_arn" {
  description = "S3 raw videos bucket ARN (개발자들의 S3 접근 권한에 사용)"
  type        = string
}

variable "s3_thumbnails_arn" {
  description = "S3 thumbnails bucket ARN (개발자들의 S3 접근 권한에 사용)"
  type        = string
}

