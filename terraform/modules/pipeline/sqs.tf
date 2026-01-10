# ========================================
# SQS Queues for Video Processing
# ========================================

# Dead Letter Queue (DLQ) - 실패한 메시지 처리
resource "aws_sqs_queue" "video_processing_dlq" {
  name                      = "capstone-${var.environment}-video-processing-dlq"
  message_retention_seconds = 1209600  # 14일
  
  tags = {
    Name        = "capstone-video-processing-dlq"
    Environment = var.environment
    Project     = "Unmanned"
    Purpose     = "Dead Letter Queue for failed video processing"
  }
}

# Main Queue - 비디오 처리 큐
resource "aws_sqs_queue" "video_processing" {
  name                       = "capstone-${var.environment}-video-processing"
  delay_seconds              = 0
  max_message_size           = 262144  # 256KB
  message_retention_seconds  = 345600  # 4일
  receive_wait_time_seconds  = 20      # Long polling
  visibility_timeout_seconds = 900     # 15분 (비디오 처리 시간 고려)

  # DLQ 설정
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.video_processing_dlq.arn
    maxReceiveCount     = 1  # 1번만 시도 (중복 실행 방지)
  })

  tags = {
    Name        = "capstone-video-processing"
    Environment = var.environment
    Project     = "Unmanned"
    Purpose     = "Video processing queue"
  }
}

# SQS Queue Policy - S3가 메시지를 보낼 수 있도록 허용
resource "aws_sqs_queue_policy" "video_processing" {
  queue_url = aws_sqs_queue.video_processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3ToSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.video_processing.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = var.s3_raw_videos_arn
          }
        }
      },
      {
        Sid    = "AllowBatchToReceiveMessage"
        Effect = "Allow"
        Principal = {
          Service = "batch.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.video_processing.arn
      }
    ]
  })
}

# ========================================
# S3 Event Notification to SQS
# ========================================

# S3 버킷 알림 설정 - 비디오 업로드 시 SQS로 이벤트 전송
resource "aws_s3_bucket_notification" "video_upload" {
  bucket = var.s3_raw_videos_bucket

  queue {
    queue_arn     = aws_sqs_queue.video_processing.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "videos/"  # videos/ 폴더 내 파일만
    filter_suffix = ""         # 모든 확장자
  }

  depends_on = [aws_sqs_queue_policy.video_processing]
}

# ========================================
# CloudWatch Alarms for SQS Monitoring
# ========================================

# DLQ 메시지 알람 - DLQ에 메시지가 쌓이면 알림
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "capstone-${var.environment}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300  # 5분
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "Alert when messages appear in DLQ"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.video_processing_dlq.name
  }

  # SNS 토픽이 있다면 여기에 추가
  # alarm_actions = [aws_sns_topic.alerts.arn]
}

# Main Queue 깊이 알람 - 큐에 메시지가 많이 쌓이면 알림
resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  alarm_name          = "capstone-${var.environment}-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300  # 5분
  statistic           = "Average"
  threshold           = 100
  alarm_description   = "Alert when queue depth exceeds 100 messages"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.video_processing.name
  }
}

# Outputs는 outputs.tf에 정의됨
