# ==========================================
# Storage Module Outputs
# ==========================================
# DB, S3, Secrets를 다른 모듈(compute, pipeline, security)에 제공

# ==========================================
# RDS PostgreSQL (Source of Truth for DB connection)
# ==========================================
# 사용처: compute, pipeline 모듈

output "rds_endpoint" {
  description = "RDS endpoint (host:port 형식)"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS address (호스트만)"
  value       = aws_db_instance.postgres.address
}

output "db_host" {
  description = "Database host (rds_address와 동일, 다른 모듈에서 사용)"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "RDS port"
  value       = aws_db_instance.postgres.port
}

output "db_port" {
  description = "Database port (rds_port와 동일, 다른 모듈에서 사용)"
  value       = aws_db_instance.postgres.port
}

output "db_name" {
  description = "Database name (PostgreSQL DB명)"
  value       = aws_db_instance.postgres.db_name
}

output "db_user" {
  description = "Database user (PostgreSQL 사용자명)"
  value       = aws_db_instance.postgres.username
}

# ==========================================
# S3 Buckets
# ==========================================
# 사용처: security 모듈(IAM policy), compute/pipeline 모듈(환경변수)

output "s3_raw_videos_bucket" {
  description = "Raw videos S3 bucket name"
  value       = aws_s3_bucket.raw_videos.id
}

output "s3_raw_videos_arn" {
  description = "Raw videos S3 bucket ARN (IAM policy에서 사용)"
  value       = aws_s3_bucket.raw_videos.arn
}

output "s3_thumbnails_bucket" {
  description = "Thumbnails S3 bucket name"
  value       = aws_s3_bucket.thumbnails.id
}

output "s3_thumbnails_arn" {
  description = "Thumbnails S3 bucket ARN (IAM policy에서 사용)"
  value       = aws_s3_bucket.thumbnails.arn
}

output "s3_highlights_bucket" {
  description = "Highlights S3 bucket name"
  value       = aws_s3_bucket.highlights.id
}

output "s3_highlights_arn" {
  description = "Highlights S3 bucket ARN (IAM policy에서 사용)"
  value       = aws_s3_bucket.highlights.arn
}

output "s3_terraform_state_bucket" {
  description = "Terraform state S3 bucket name (백업용)"
  value       = aws_s3_bucket.terraform_state.id
}

output "s3_analysis_models_bucket" {
  description = "Analysis models S3 bucket name (Packer AMI builds)"
  value       = aws_s3_bucket.analysis_models.id
}

output "s3_analysis_models_arn" {
  description = "Analysis models S3 bucket ARN (IAM policy에서 사용)"
  value       = aws_s3_bucket.analysis_models.arn
}

# ==========================================
# Secrets Manager
# ==========================================
# 사용처: security 모듈(IAM policy), compute 모듈(ECS task definition)

output "db_password_secret_arn" {
  description = "DB password secret ARN (ECS task에서 참조)"
  value       = aws_secretsmanager_secret.db_password.arn
  sensitive   = true
}

output "django_secret_arn" {
  description = "Django secret key ARN (ECS task에서 참조)"
  value       = aws_secretsmanager_secret.django_secret.arn
  sensitive   = true
}

output "db_password_secret_name" {
  description = "DB password secret name"
  value       = aws_secretsmanager_secret.db_password.name
}

output "django_secret_name" {
  description = "Django secret name"
  value       = aws_secretsmanager_secret.django_secret.name
}
