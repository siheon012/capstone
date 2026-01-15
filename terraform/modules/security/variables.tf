# ==========================================
# Security Module Variables
# ==========================================
# IAM 정책 생성에 필요한 최소한의 변수만 정의

variable "environment" {
  description = "Environment name (IAM role 이름에 사용)"
  type        = string
}

# ==========================================
# Storage Inputs (IAM 정책에서 참조)
# ==========================================
# IAM 정책에서 S3 버킷과 Secrets Manager 접근 권한을 정의할 때 필요

variable "s3_raw_videos_arn" {
  description = "Raw videos S3 bucket ARN (from storage module)"
  type        = string
}

variable "s3_thumbnails_arn" {
  description = "Thumbnails S3 bucket ARN (from storage module)"
  type        = string
}

variable "s3_highlights_arn" {
  description = "Highlights S3 bucket ARN (from storage module)"
  type        = string
}

variable "db_password_secret_arn" {
  description = "DB password secret ARN (from storage module)"
  type        = string
}

variable "django_secret_arn" {
  description = "Django secret key ARN (from storage module)"
  type        = string
  default     = ""
}

# ==========================================
# Pipeline Inputs (선택적 - IAM 정책용)
# ==========================================

variable "sqs_queue_arn" {
  description = "SQS queue ARN (from pipeline module, optional for conditional IAM policies)"
  type        = string
  default     = ""
}

