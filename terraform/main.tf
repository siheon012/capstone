# Terraform 설정
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# AWS Provider 설정
provider "aws" {
  region = "ap-northeast-2"
}

# 변수 정의
variable "account_id" {
  description = "AWS Account ID"
  type        = string
  default     = "287709190208"
}

variable "region" {
  description = "AWS Region"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}