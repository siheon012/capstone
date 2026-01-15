# ==========================================
# Network Module Variables
# ==========================================
# VPC, 서브넷, 보안 그룹, ALB, Route53 생성에 필요한 변수만 정의

variable "environment" {
  description = "Environment name (태그에 사용)"
  type        = string
}

variable "region" {
  description = "AWS Region (Availability Zone, VPC Endpoint 이름에 사용)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block (예: 10.0.0.0/16)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "domain_name" {
  description = "Domain name for Route53 and ACM (선택적, 비어있으면 Route53/ACM 생성 안 함)"
  type        = string
  default     = ""
}

