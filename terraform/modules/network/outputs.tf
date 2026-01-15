# ==========================================
# Network Module Outputs
# ==========================================
# 다른 모듈(storage, compute, pipeline)에서 필요로 하는 네트워크 리소스 ID/ARN만 출력

# ==========================================
# VPC (모든 모듈에서 사용)
# ==========================================

output "vpc_id" {
  description = "VPC ID (storage, compute, pipeline에서 사용)"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block (보안 그룹 규칙에서 참조)"
  value       = aws_vpc.main.cidr_block
}

# ==========================================
# Subnets (compute, storage, pipeline에서 사용)
# ==========================================

output "public_subnet_ids" {
  description = "Public Subnet IDs (ALB용)"
  value       = [aws_subnet.public_1.id, aws_subnet.public_2.id]
}

output "private_subnet_ids" {
  description = "Private Subnet IDs (ECS, RDS, Batch용)"
  value       = [aws_subnet.private_1.id, aws_subnet.private_2.id]
}

# ==========================================
# Security Groups (다른 모듈의 리소스에 연결)
# ==========================================

output "alb_security_group_id" {
  description = "ALB Security Group ID"
  value       = aws_security_group.alb.id
}

output "ecs_tasks_security_group_id" {
  description = "ECS Tasks Security Group ID (compute 모듈에서 사용)"
  value       = aws_security_group.ecs_tasks.id
}

output "rds_security_group_id" {
  description = "RDS Security Group ID (storage 모듈에서 사용)"
  value       = aws_security_group.rds.id
}

output "batch_compute_security_group_id" {
  description = "Batch Compute Security Group ID (pipeline 모듈에서 사용)"
  value       = aws_security_group.batch_compute.id
}

output "vpc_endpoints_security_group_id" {
  description = "VPC Endpoints Security Group ID"
  value       = aws_security_group.vpc_endpoints.id
}

# ==========================================
# ALB (compute 모듈에서 사용)
# ==========================================

output "alb_id" {
  description = "ALB ID"
  value       = aws_lb.main.id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS Name (Route53 레코드 생성에 사용)"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB Zone ID (Route53 Alias 레코드에 사용)"
  value       = aws_lb.main.zone_id
}

# ==========================================
# Target Groups (compute 모듈 ECS 서비스에서 사용)
# ==========================================

output "frontend_target_group_arn" {
  description = "Frontend Target Group ARN"
  value       = aws_lb_target_group.frontend.arn
}

output "backend_target_group_arn" {
  description = "Backend Target Group ARN"
  value       = aws_lb_target_group.backend.arn
}

# ==========================================
# ALB Listeners (참고용)
# ==========================================

output "http_listener_arn" {
  description = "HTTP Listener ARN"
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "HTTPS Listener ARN (domain이 있을 때만)"
  value       = var.domain_name != "" ? aws_lb_listener.https[0].arn : null
}

# ==========================================
# Route53 & ACM (선택적 - domain_name이 있을 때만)
# ==========================================

output "route53_zone_id" {
  description = "Route 53 Hosted Zone ID"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].zone_id : null
}

output "route53_name_servers" {
  description = "Route 53 Name Servers (도메인 등록 업체에 설정)"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].name_servers : null
}

output "acm_certificate_arn" {
  description = "ACM Certificate ARN (HTTPS 리스너에 사용)"
  value       = var.domain_name != "" ? aws_acm_certificate.main[0].arn : null
}

# URLs
output "frontend_url" {
  description = "Frontend URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "api_url" {
  description = "API URL"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "http://${aws_lb.main.dns_name}/api"
}

# VPC Endpoints
output "s3_endpoint_id" {
  description = "S3 VPC Endpoint ID"
  value       = aws_vpc_endpoint.s3.id
}

output "ecr_api_endpoint_id" {
  description = "ECR API VPC Endpoint ID"
  value       = aws_vpc_endpoint.ecr_api.id
}

output "ecr_dkr_endpoint_id" {
  description = "ECR DKR VPC Endpoint ID"
  value       = aws_vpc_endpoint.ecr_dkr.id
}

output "logs_endpoint_id" {
  description = "CloudWatch Logs VPC Endpoint ID"
  value       = aws_vpc_endpoint.logs.id
}
