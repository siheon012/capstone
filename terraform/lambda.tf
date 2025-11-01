# ========================================
# Lambda Function: SQS to Batch Trigger
# ========================================

# Lambda IAM Role
resource "aws_iam_role" "sqs_to_batch_lambda" {
  name = "capstone-${var.environment}-sqs-to-batch-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "capstone-sqs-to-batch-lambda"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Lambda Execution Policy
resource "aws_iam_role_policy" "sqs_to_batch_lambda" {
  name = "capstone-${var.environment}-sqs-to-batch-lambda-policy"
  role = aws_iam_role.sqs_to_batch_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Sid    = "SQSAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.video_processing.arn
      },
      {
        Sid    = "BatchSubmitJob"
        Effect = "Allow"
        Action = [
          "batch:SubmitJob",
          "batch:DescribeJobs",
          "batch:TagResource"
        ]
        Resource = [
          aws_batch_job_queue.video_processing.arn,
          aws_batch_job_definition.gpu_video_processor.arn
        ]
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "sqs_to_batch" {
  filename         = "lambda_deployment.zip"  # 배포 패키지
  function_name    = "capstone-${var.environment}-sqs-to-batch"
  role             = aws_iam_role.sqs_to_batch_lambda.arn
  handler          = "sqs_to_batch.lambda_handler"
  source_code_hash = filebase64sha256("lambda_deployment.zip")
  runtime          = "python3.11"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      BATCH_JOB_QUEUE      = aws_batch_job_queue.video_processing.name
      BATCH_JOB_DEFINITION = aws_batch_job_definition.gpu_video_processor.arn
      ENVIRONMENT          = var.environment
    }
  }

  tags = {
    Name        = "capstone-sqs-to-batch"
    Environment = var.environment
    Project     = "Unmanned"
  }

  depends_on = [aws_iam_role_policy.sqs_to_batch_lambda]
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "sqs_to_batch_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.sqs_to_batch.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "capstone-sqs-to-batch-lambda-logs"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# Lambda Event Source Mapping (SQS Trigger)
resource "aws_lambda_event_source_mapping" "sqs_to_batch" {
  event_source_arn = aws_sqs_queue.video_processing.arn
  function_name    = aws_lambda_function.sqs_to_batch.arn
  batch_size       = 1  # 한 번에 1개 메시지 처리
  enabled          = true

  # Partial Batch Response 활성화 (실패한 메시지만 재시도)
  function_response_types = ["ReportBatchItemFailures"]

  # 동시 실행 제한 (선택사항)
  scaling_config {
    maximum_concurrency = 10  # 최대 10개 Lambda 동시 실행
  }
}

# ========================================
# Outputs
# ========================================

output "lambda_function_arn" {
  description = "Lambda Function ARN"
  value       = aws_lambda_function.sqs_to_batch.arn
}

output "lambda_function_name" {
  description = "Lambda Function Name"
  value       = aws_lambda_function.sqs_to_batch.function_name
}
