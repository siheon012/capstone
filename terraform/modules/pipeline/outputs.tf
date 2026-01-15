# ==========================================
# Pipeline Module Outputs
# ==========================================
# SQS, Lambda, Batch 리소스를 다른 모듈에 제공

# ==========================================
# SQS (비디오 처리 큐)
# ==========================================

output "sqs_queue_url" {
  description = "SQS queue URL (Lambda에서 메시지 수신)"
  value       = aws_sqs_queue.video_processing.url
}

output "sqs_queue_arn" {
  description = "SQS queue ARN"
  value       = aws_sqs_queue.video_processing.arn
}

output "sqs_queue_name" {
  description = "SQS queue name"
  value       = aws_sqs_queue.video_processing.name
}

output "sqs_dlq_url" {
  description = "SQS DLQ URL (실패한 메시지 저장)"
  value       = aws_sqs_queue.video_processing_dlq.url
}

output "sqs_dlq_arn" {
  description = "SQS DLQ ARN"
  value       = aws_sqs_queue.video_processing_dlq.arn
}

# ==========================================
# Lambda (SQS → Batch 트리거)
# ==========================================

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.sqs_to_batch.arn
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.sqs_to_batch.function_name
}

# ==========================================
# Batch (비디오 분석 GPU 작업)
# ==========================================

output "batch_compute_environment_arn" {
  description = "Batch compute environment ARN (GPU instances)"
  value       = aws_batch_compute_environment.video_analysis_gpu.arn
}

output "batch_job_queue_arn" {
  description = "Batch job queue ARN"
  value       = aws_batch_job_queue.video_analysis_gpu.arn
}

output "batch_job_queue_name" {
  description = "Batch job queue name"
  value       = aws_batch_job_queue.video_analysis_gpu.name
}

output "batch_job_definition_arn" {
  description = "Batch job definition ARN (video_analysis_processor)"
  value       = aws_batch_job_definition.video_analysis_processor.arn
}

output "batch_job_definition_gpu_arn" {
  description = "GPU Batch job definition ARN (gpu_video_processor)"
  value       = aws_batch_job_definition.gpu_video_processor.arn
}

# ==========================================
# ECR (Batch processor 이미지)
# ==========================================

output "batch_processor_ecr_url" {
  description = "Batch processor ECR repository URL"
  value       = aws_ecr_repository.batch_processor.repository_url
}
