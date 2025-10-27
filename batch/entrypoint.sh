#!/bin/bash
set -e

echo "=========================================="
echo "AWS Batch Video Processor Starting..."
echo "=========================================="
echo "Environment: $ENVIRONMENT"
echo "SQS Queue URL: $SQS_QUEUE_URL"
echo "S3 Raw Bucket: $S3_BUCKET_RAW"
echo "FastAPI Endpoint: $FASTAPI_ENDPOINT"
echo "Note: FastAPI saves results to PostgreSQL + pgvector"
echo "=========================================="

# Python 스크립트 실행
python process_video.py

echo "Batch job completed successfully"
