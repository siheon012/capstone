# ========================================
# Lambda Function: SQS to Batch Trigger
# ========================================
# Note: Lambda IAM role and policies are defined in security module

# Lambda Function
resource "aws_lambda_function" "sqs_to_batch" {
  filename         = "lambda_deployment.zip"  # 배포 패키지
  function_name    = "capstone-${var.environment}-sqs-to-batch"
  role             = var.lambda_sqs_to_batch_role_arn
  handler          = "sqs_to_batch.lambda_handler"
  source_code_hash = filebase64sha256("lambda_deployment.zip")
  runtime          = "python3.11"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      BATCH_JOB_QUEUE      = aws_batch_job_queue.video_analysis_gpu.name  # batch-video-analysis-gpu.tf의 GPU Queue 사용
      BATCH_JOB_DEFINITION = aws_batch_job_definition.video_analysis_processor.arn  # batch-video-analysis-gpu.tf의 Job Definition 사용
      MAX_CONCURRENT_JOBS  = "1" # 안전장치: 최대 1개 Job만 동시 실행
      ENVIRONMENT          = var.environment
    }
  }

  tags = {
    Name        = "capstone-sqs-to-batch"
    Environment = var.environment
    Project     = "Unmanned"
  }

  # Note: IAM dependencies are managed in security module
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

# Outputs는 outputs.tf에 정의됨
