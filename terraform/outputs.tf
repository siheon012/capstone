# ==========================================
# Root Outputs
# ==========================================
# 모듈들의 outputs를 루트 레벨에서 다시 export

# ==========================================
# Network Outputs
# ==========================================

output "vpc_id" {
  description = "VPC ID"
  value       = module.network.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.network.private_subnet_ids
}

output "ecs_security_group_id" {
  description = "ECS tasks security group ID"
  value       = module.network.ecs_tasks_security_group_id
}

output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = module.network.rds_security_group_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.network.alb_dns_name
}

output "alb_url" {
  description = "ALB URL"
  value       = "http://${module.network.alb_dns_name}"
}

output "route53_zone_id" {
  description = "Route 53 Hosted Zone ID"
  value       = module.network.route53_zone_id
}

output "route53_name_servers" {
  description = "Route 53 Name Servers"
  value       = module.network.route53_name_servers
}

output "acm_certificate_arn" {
  description = "ACM Certificate ARN"
  value       = module.network.acm_certificate_arn
}

output "frontend_url" {
  description = "Frontend URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${module.network.alb_dns_name}"
}

output "api_url" {
  description = "Backend API URL"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "http://${module.network.alb_dns_name}/api"
}

output "s3_endpoint_id" {
  description = "S3 VPC Endpoint ID (Gateway Endpoint - 무료)"
  value       = module.network.s3_endpoint_id
}

# ==========================================
# Storage Outputs
# ==========================================

output "s3_raw_videos_bucket" {
  description = "Raw videos S3 bucket name"
  value       = module.storage.s3_raw_videos_bucket
}

output "s3_thumbnails_bucket" {
  description = "Thumbnails S3 bucket name"
  value       = module.storage.s3_thumbnails_bucket
}

output "s3_terraform_state_bucket" {
  description = "Terraform state backup S3 bucket name"
  value       = module.storage.s3_terraform_state_bucket
}

output "db_password_secret_arn" {
  description = "DB password secret ARN"
  value       = module.storage.db_password_secret_arn
  sensitive   = true
}

output "django_secret_arn" {
  description = "Django secret key ARN"
  value       = module.storage.django_secret_arn
  sensitive   = true
}

# ==========================================
# Compute Outputs
# ==========================================

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.ecs_cluster_name
}

output "frontend_service_name" {
  description = "Frontend ECS service name"
  value       = module.compute.frontend_service_name
}

output "backend_service_name" {
  description = "Backend ECS service name"
  value       = module.compute.backend_service_name
}

output "video_analysis_gpu_service_name" {
  description = "Video analysis GPU service name"
  value       = module.compute.video_analysis_gpu_service_name
}

output "gpu_asg_name" {
  description = "GPU Auto Scaling Group name"
  value       = module.compute.gpu_asg_name
}

output "video_analysis_gpu_internal_url" {
  description = "Video Analysis GPU internal service URL"
  value       = "http://video-analysis-gpu.capstone.local:8000"
}

# ==========================================
# Pipeline Outputs
# ==========================================

output "sqs_queue_url" {
  description = "SQS queue URL"
  value       = module.pipeline.sqs_queue_url
}

output "sqs_queue_arn" {
  description = "SQS queue ARN"
  value       = module.pipeline.sqs_queue_arn
}

output "sqs_dlq_url" {
  description = "SQS DLQ URL"
  value       = module.pipeline.sqs_dlq_url
}

output "sqs_dlq_arn" {
  description = "SQS DLQ ARN"
  value       = module.pipeline.sqs_dlq_arn
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = module.pipeline.lambda_function_arn
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = module.pipeline.lambda_function_name
}

output "batch_processor_ecr_url" {
  description = "Batch processor ECR repository URL"
  value       = module.pipeline.batch_processor_ecr_url
}

output "video_analysis_batch_compute_environment_arn" {
  description = "Batch compute environment ARN"
  value       = module.pipeline.batch_compute_environment_arn
}

output "video_analysis_batch_job_queue_arn" {
  description = "Batch job queue ARN"
  value       = module.pipeline.batch_job_queue_arn
}

output "video_analysis_batch_job_definition_arn" {
  description = "Batch job definition ARN"
  value       = module.pipeline.batch_job_definition_arn
}

output "batch_job_definition_arn" {
  description = "GPU Batch job definition ARN"
  value       = module.pipeline.batch_job_definition_gpu_arn
}

output "ai_batch_ecr_url" {
  description = "AI Batch ECR repository URL (same as batch_processor)"
  value       = module.pipeline.batch_processor_ecr_url
}
