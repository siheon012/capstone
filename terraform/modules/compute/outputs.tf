# ==========================================
# Compute Module Outputs
# ==========================================

# ECR Repositories
output "frontend_ecr_repository_url" {
  description = "Frontend ECR repository URL"
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr_repository_url" {
  description = "Backend ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

# ECS Cluster (pipeline 모듈에서 Batch 설정 시 필요)
output "ecs_cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

# ECS Services (모니터링/디버깅용)
output "frontend_service_name" {
  description = "Frontend service name"
  value       = aws_ecs_service.frontend.name
}

output "backend_service_name" {
  description = "Backend service name"
  value       = aws_ecs_service.backend.name
}

output "video_analysis_gpu_service_name" {
  description = "Video analysis GPU service name"
  value       = aws_ecs_service.video_analysis_gpu.name
}

# GPU Auto Scaling Group (모니터링/스케일링 설정용)
output "gpu_asg_name" {
  description = "GPU Auto Scaling Group name"
  value       = aws_autoscaling_group.gpu_ecs.name
}

