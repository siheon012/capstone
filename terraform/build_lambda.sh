#!/bin/bash
# Lambda 배포 패키지 생성 스크립트

set -e

echo "=========================================="
echo "Creating Lambda Deployment Package"
echo "=========================================="

# 임시 디렉토리 생성
TEMP_DIR="lambda_build"
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# Python 파일 복사
cp ../lambda/sqs_to_batch.py $TEMP_DIR/

# 의존성 설치 (boto3는 Lambda에 기본 포함되므로 제외)
# pip install -r ../lambda/requirements.txt -t $TEMP_DIR/ --platform manylinux2014_x86_64 --only-binary=:all:

# ZIP 파일 생성
cd $TEMP_DIR
zip -r ../lambda_deployment.zip .
cd ..

# 정리
rm -rf $TEMP_DIR

echo "✅ Lambda deployment package created: lambda_deployment.zip"
echo "File size: $(du -h lambda_deployment.zip | cut -f1)"
