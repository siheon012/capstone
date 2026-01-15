# ==========================================
# Security Module Outputs
# ==========================================
# 다른 모듈에서 사용할 IAM 역할/프로파일만 출력

# ==========================================
# ECS 관련 IAM (compute 모듈에서 사용)
# ==========================================

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN (for ECS task definitions)"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ECS task role ARN (for ECS task definitions)"
  value       = aws_iam_role.ecs_task_role.arn
}

output "ecs_instance_profile_arn" {
  description = "ECS instance profile ARN (for GPU ECS instances)"
  value       = aws_iam_instance_profile.ecs_instance.arn
}

output "ecs_instance_profile_name" {
  description = "ECS instance profile name (for launch templates)"
  value       = aws_iam_instance_profile.ecs_instance.name
}

# ==========================================
# Batch 관련 IAM (pipeline 모듈에서 사용)
# ==========================================

output "batch_service_role_arn" {
  description = "Batch service role ARN (for Batch compute environment)"
  value       = aws_iam_role.batch_service_role.arn
}

output "batch_execution_role_arn" {
  description = "Batch execution role ARN (for Batch job definitions)"
  value       = aws_iam_role.batch_execution_role.arn
}

output "batch_task_role_arn" {
  description = "Batch task role ARN (for Batch job definitions)"
  value       = aws_iam_role.batch_task_role.arn
}

output "batch_instance_profile_arn" {
  description = "Batch instance profile ARN (for Batch compute instances)"
  value       = aws_iam_instance_profile.batch_instance.arn
}

output "batch_instance_profile_name" {
  description = "Batch instance profile name (for launch templates)"
  value       = aws_iam_instance_profile.batch_instance.name
}

output "batch_instance_role_name" {
  description = "Batch instance role name (for IAM policy attachments)"
  value       = aws_iam_role.batch_instance_role.name
}

output "ecs_instance_role_name" {
  description = "ECS instance role name (for IAM policy attachments)"
  value       = aws_iam_role.ecs_instance_role.name
}

# ==========================================
# Lambda 관련 IAM (pipeline 모듈에서 사용)
# ==========================================

output "lambda_sqs_to_batch_role_arn" {
  description = "Lambda SQS to Batch role ARN (for Lambda function)"
  value       = aws_iam_role.lambda_sqs_to_batch.arn
}

