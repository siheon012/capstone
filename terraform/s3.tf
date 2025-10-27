# S3 버킷들
resource "aws_s3_bucket" "raw_videos" {
  bucket = "capstone-${var.environment}-raw"

  tags = {
    Name        = "capstone-raw-videos"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# video_storage alias for raw_videos (backward compatibility)
resource "aws_s3_bucket" "video_storage" {
  bucket = "capstone-${var.environment}-videos"

  tags = {
    Name        = "capstone-video-storage"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

resource "aws_s3_bucket" "results" {
  bucket = "capstone-${var.environment}-results"

  tags = {
    Name        = "capstone-results"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# S3 버킷 설정들
resource "aws_s3_bucket_versioning" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "results" {
  bucket = aws_s3_bucket.results.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 버킷 암호화
resource "aws_s3_bucket_server_side_encryption_configuration" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "results" {
  bucket = aws_s3_bucket.results.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 퍼블릭 액세스 차단
resource "aws_s3_bucket_public_access_block" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "results" {
  bucket = aws_s3_bucket.results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 버킷 암호화 - video_storage
resource "aws_s3_bucket_server_side_encryption_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 퍼블릭 액세스 차단 - video_storage
resource "aws_s3_bucket_public_access_block" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}