"""
Lambda Function: SQS to AWS Batch Trigger
SQS에 메시지가 들어오면 자동으로 AWS Batch Job을 제출
"""

import json
import os
import logging
from datetime import datetime
from typing import Dict, Any

import boto3
from botocore.exceptions import ClientError

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS 클라이언트
batch_client = boto3.client('batch')

# 환경 변수
JOB_QUEUE = os.environ.get('BATCH_JOB_QUEUE')
JOB_DEFINITION = os.environ.get('BATCH_JOB_DEFINITION')


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda 핸들러 - SQS 이벤트를 받아서 Batch Job 제출
    
    Args:
        event: SQS 이벤트
        context: Lambda 컨텍스트
    
    Returns:
        처리 결과
    """
    
    logger.info(f"Received event: {json.dumps(event)}")
    
    # 환경 변수 검증
    if not JOB_QUEUE or not JOB_DEFINITION:
        logger.error("Missing required environment variables")
        raise ValueError("BATCH_JOB_QUEUE and BATCH_JOB_DEFINITION must be set")
    
    successful_jobs = []
    failed_jobs = []
    
    # SQS 레코드 처리
    for record in event.get('Records', []):
        try:
            message_id = record['messageId']
            receipt_handle = record['receiptHandle']
            
            logger.info(f"Processing message: {message_id}")
            
            # 메시지 바디 파싱
            body = json.loads(record['body'])
            
            # S3 이벤트 정보 추출
            s3_records = body.get('Records', [])
            if not s3_records:
                logger.warning(f"No S3 records in message: {message_id}")
                continue
            
            s3_record = s3_records[0]
            bucket = s3_record['s3']['bucket']['name']
            key = s3_record['s3']['object']['key']
            
            # Batch Job 제출
            job_name = f"video-process-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{message_id[:8]}"
            
            logger.info(f"Submitting Batch job: {job_name}")
            logger.info(f"S3 Object: s3://{bucket}/{key}")
            
            # S3 키에서 video_id 추출 시도 (예: uploads/36/video.mp4 → video_id=36)
            # 또는 메시지에 video_id가 포함되어 있을 수 있음
            video_id = None
            try:
                # body에서 video_id 추출 시도
                if 'video' in body and 'id' in body['video']:
                    video_id = str(body['video']['id'])
                    logger.info(f"Extracted video_id from message: {video_id}")
            except Exception as e:
                logger.warning(f"Failed to extract video_id: {e}")
            
            container_env = [
                {
                    'name': 'S3_BUCKET',
                    'value': bucket
                },
                {
                    'name': 'S3_KEY',
                    'value': key
                },
                {
                    'name': 'MESSAGE_ID',
                    'value': message_id
                }
            ]
            
            # video_id가 있으면 환경 변수에 추가
            if video_id:
                container_env.append({
                    'name': 'VIDEO_ID',
                    'value': video_id
                })
            
            response = batch_client.submit_job(
                jobName=job_name,
                jobQueue=JOB_QUEUE,
                jobDefinition=JOB_DEFINITION,
                containerOverrides={
                    'environment': container_env
                },
                tags={
                    'Source': 'Lambda-SQS-Trigger',
                    'MessageId': message_id,
                    'S3Bucket': bucket
                }
            )
            
            job_id = response['jobId']
            
            logger.info(f"✅ Batch job submitted: {job_id}")
            
            successful_jobs.append({
                'message_id': message_id,
                'job_id': job_id,
                'job_name': job_name,
                's3_bucket': bucket,
                's3_key': key
            })
            
        except ClientError as e:
            logger.error(f"❌ AWS error processing message {record.get('messageId')}: {e}")
            failed_jobs.append({
                'message_id': record.get('messageId'),
                'error': str(e)
            })
            # 실패한 메시지는 SQS에 남겨서 재시도
            
        except Exception as e:
            logger.error(f"❌ Unexpected error processing message {record.get('messageId')}: {e}")
            logger.exception("Full traceback:")
            failed_jobs.append({
                'message_id': record.get('messageId'),
                'error': str(e)
            })
    
    # 결과 요약
    result = {
        'total_messages': len(event.get('Records', [])),
        'successful_jobs': len(successful_jobs),
        'failed_jobs': len(failed_jobs),
        'jobs': successful_jobs,
        'failures': failed_jobs
    }
    
    logger.info(f"Processing complete: {json.dumps(result)}")
    
    # Lambda와 SQS 통합에서는 예외를 발생시키지 않으면 자동으로 메시지 삭제됨
    # 실패한 메시지만 재시도하려면 batchItemFailures 반환
    if failed_jobs:
        return {
            'batchItemFailures': [
                {'itemIdentifier': record['receiptHandle']}
                for record in event['Records']
                if record['messageId'] in [f['message_id'] for f in failed_jobs]
            ]
        }
    
    return result
