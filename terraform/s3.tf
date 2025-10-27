# S3 버킷들

# 1. 원본 영상 저장 버킷 (Raw Videos)
resource "aws_s3_bucket" "raw_videos" {
  bucket = "capstone-${var.environment}-raw"

  tags = {
    Name        = "capstone-raw-videos"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# 2. 썸네일 이미지 저장 버킷 (Thumbnails)
resource "aws_s3_bucket" "thumbnails" {
  bucket = "capstone-${var.environment}-thumbnails"

  tags = {
    Name        = "capstone-thumbnails"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ============================================
# S3 버킷 설정
# ============================================

# Raw Videos - Versioning
resource "aws_s3_bucket_versioning" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Raw Videos - Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Raw Videos - Public Access Block
resource "aws_s3_bucket_public_access_block" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Thumbnails - Versioning
resource "aws_s3_bucket_versioning" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Thumbnails - Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Thumbnails - Public Access Block
resource "aws_s3_bucket_public_access_block" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ============================================
# Outputs
# ============================================
output "s3_raw_videos_bucket" {
  description = "Raw videos S3 bucket name"
  value       = aws_s3_bucket.raw_videos.id
}

output "s3_thumbnails_bucket" {
  description = "Thumbnails S3 bucket name"
  value       = aws_s3_bucket.thumbnails.id
}

