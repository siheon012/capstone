"""
Lambda Function: SQS to AWS Batch Trigger (Safe Version)
안전장치:
1. Lambda Concurrency = 1 (동시 실행 방지)
2. 실행 중인 Job 체크 (중복 제출 방지)
"""

import json
import boto3
import os
import logging
from datetime import datetime
from botocore.exceptions import ClientError

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS 클라이언트 초기화
batch_client = boto3.client('batch')

# 환경 변수
JOB_QUEUE = os.environ['BATCH_JOB_QUEUE']
JOB_DEFINITION = os.environ['BATCH_JOB_DEFINITION']
MAX_CONCURRENT_JOBS = int(os.environ.get('MAX_CONCURRENT_JOBS', '1'))

# PostgreSQL 환경 변수 (Job Definition에 있는 값을 Lambda에서도 가져옴)
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', '')
POSTGRES_DB = os.environ.get('POSTGRES_DB', '')
POSTGRES_USER = os.environ.get('POSTGRES_USER', '')


def check_running_jobs():
    """
    현재 실행 중인 Batch Job 수 확인
    RUNNING, RUNNABLE, STARTING 상태 모두 포함
    
    Returns:
        int: 활성 상태인 Job 수
    """
    total_jobs = 0
    
    try:
        # RUNNING, RUNNABLE, STARTING 상태 모두 확인
        for status in ['RUNNING', 'RUNNABLE', 'STARTING']:
            response = batch_client.list_jobs(
                jobQueue=JOB_QUEUE,
                jobStatus=status
            )
            job_count = len(response.get('jobSummaryList', []))
            total_jobs += job_count
            
            if job_count > 0:
                logger.info(f"Jobs in {status} state: {job_count}")
        
        logger.info(f"Total active jobs: {total_jobs}")
        
    except Exception as e:
        logger.error(f"Failed to check running jobs: {str(e)}")
        # 에러 시에는 안전하게 0 반환 (Job 제출 허용)
        total_jobs = 0
    
    return total_jobs


def parse_s3_event(body):
    """
    SQS 메시지에서 S3 이벤트 정보 추출
    
    Args:
        body: SQS 메시지 body (JSON string 또는 dict)
    
    Returns:
        tuple: (bucket, key) 또는 (None, None)
    """
    try:
        # JSON string인 경우 파싱
        if isinstance(body, str):
            body = json.loads(body)
        
        # S3 Event Notification 형식
        if 'Records' in body and len(body['Records']) > 0:
            s3_record = body['Records'][0]
            if 's3' in s3_record:
                bucket = s3_record['s3']['bucket']['name']
                key = s3_record['s3']['object']['key']
                return bucket, key
        
        # Backend에서 보낸 메시지 형식 (eventType: video-uploaded)
        if 's3' in body and isinstance(body['s3'], dict):
            if 'bucket' in body['s3'] and 'key' in body['s3']:
                return body['s3']['bucket'], body['s3']['key']
        
        # 직접 전송된 메시지 형식 (레거시)
        if 'bucket' in body and 'key' in body:
            return body['bucket'], body['key']
        
        logger.warning(f"Unknown message format: {body}")
        return None, None
        
    except Exception as e:
        logger.error(f"Failed to parse S3 event: {str(e)}")
        return None, None


def lambda_handler(event, context):
    """
    Lambda 핸들러 - SQS 메시지를 받아서 AWS Batch Job 제출
    
    안전장치:
    1. 실행 중인 Job이 있으면 제출하지 않음
    2. MAX_CONCURRENT_JOBS 이상이면 메시지를 다시 큐로 반환
    """
    logger.info(f"Received {len(event['Records'])} messages from SQS")
    
    # 안전장치: 실행 중인 Job 체크
    running_jobs = check_running_jobs()
    
    if running_jobs >= MAX_CONCURRENT_JOBS:
        logger.warning(
            f"Too many jobs running ({running_jobs}/{MAX_CONCURRENT_JOBS}), "
            f"returning messages to queue"
        )
        # 모든 메시지를 실패로 표시하여 다시 큐로 반환
        return {
            'batchItemFailures': [
                {'itemIdentifier': record['messageId']} 
                for record in event['Records']
            ]
        }
    
    # 처리 결과 저장
    failed_messages = []
    successful_count = 0
    
    for record in event['Records']:
        message_id = record['messageId']
        
        try:
            # SQS 메시지 파싱
            body = record['body']
            bucket, key = parse_s3_event(body)
            
            if not bucket or not key:
                logger.error(f"Invalid message format: {body}")
                failed_messages.append({'itemIdentifier': message_id})
                continue
            
            logger.info(f"Processing video: s3://{bucket}/{key}")
            
            # AWS Batch Job 제출
            try:
                # VIDEO_ID 추출: 우선순위
                # 1. SQS 메시지의 video.id 필드
                # 2. MessageAttributes의 video_id
                # 3. S3 key 경로에서 추출 (videos/{video_id}/{filename})
                # 4. Fallback: S3 key에서 파일명 사용
                video_id = None
                
                # 1. 메시지 body에서 video.id 찾기
                try:
                    body_dict = json.loads(body) if isinstance(body, str) else body
                    if 'video' in body_dict and 'id' in body_dict['video']:
                        video_id = str(body_dict['video']['id'])
                        logger.info(f"Extracted video_id from message body: {video_id}")
                except Exception as e:
                    logger.debug(f"Could not extract video_id from body: {e}")
                
                # 2. MessageAttributes에서 찾기
                if not video_id and 'messageAttributes' in record:
                    attrs = record['messageAttributes']
                    if 'video_id' in attrs:
                        video_id = attrs['video_id'].get('stringValue', attrs['video_id'].get('StringValue'))
                        logger.info(f"Extracted video_id from MessageAttributes: {video_id}")
                
                # 3. S3 key 경로에서 추출: videos/{video_id}/{filename}
                if not video_id:
                    try:
                        # S3 key 형식: videos/123/test.mp4 → video_id = 123
                        key_parts = key.split('/')
                        if len(key_parts) >= 2 and key_parts[0] == 'videos':
                            extracted_id = key_parts[1]
                            # 숫자인지 확인
                            if extracted_id.isdigit():
                                video_id = extracted_id
                                logger.info(f"Extracted video_id from S3 key path: {video_id}")
                            else:
                                logger.warning(f"S3 key path segment is not a number: {extracted_id}")
                    except Exception as e:
                        logger.debug(f"Could not extract video_id from S3 key path: {e}")
                
                # 4. Fallback: S3 key에서 파일명 사용 (숫자만 추출)
                if not video_id:
                    filename = key.split('/')[-1].split('.')[0]
                    # 파일명에서 숫자만 추출 시도
                    import re
                    numbers = re.findall(r'\d+', filename)
                    if numbers:
                        video_id = numbers[-1]  # 마지막 숫자 그룹 사용
                        logger.warning(f"Using extracted number from filename as video_id (fallback): {video_id}")
                    else:
                        video_id = filename
                        logger.warning(f"Using filename as video_id (fallback): {video_id}")
                
                logger.info(f"✅ Final video_id: {video_id}")
                
                # 🎯 Job 이름 생성: video_id만 사용 (중복 방지를 위해 deterministic하게)
                # 타임스탬프나 UUID를 추가하지 않음
                job_name = f"video-process-{video_id}"
                logger.info(f"🚀 Submitting job: {job_name}")
                
                # 🔄 강화된 중복 Job 방지: job name으로 1차, S3 key로 2차 확인
                duplicate_found = False
                try:
                    # 모든 active 상태의 Job 조회
                    active_statuses = ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING']
                    all_active_jobs = []
                    
                    for status in active_statuses:
                        response = batch_client.list_jobs(
                            jobQueue=JOB_QUEUE,
                            jobStatus=status,
                            maxResults=100
                        )
                        all_active_jobs.extend(response.get('jobSummaryList', []))
                    
                    logger.info(f"📊 Total active jobs: {len(all_active_jobs)}")
                    
                    # 🎯 1차: job name으로 빠른 체크 (API 호출 불필요)
                    for job_summary in all_active_jobs:
                        if job_summary.get('jobName') == job_name:
                            logger.warning(
                                f"⚠️ DUPLICATE JOB DETECTED by job name! "
                                f"video_id: {video_id}, "
                                f"job_name: {job_name}, "
                                f"Existing Job ID: {job_summary['jobId']} (status: {job_summary['status']})"
                            )
                            duplicate_found = True
                            successful_count += 1  # 성공으로 처리 (SQS 메시지 삭제)
                            break
                    
                    # 🎯 2차: S3 key로 추가 확인 (job name이 다를 경우 대비)
                    if not duplicate_found:
                        current_time = int(datetime.now().timestamp() * 1000)
                        for job_summary in all_active_jobs:
                            job_id = job_summary['jobId']
                            created_at = job_summary.get('createdAt', 0)
                            time_diff_seconds = (current_time - created_at) / 1000
                            
                            # 5분 이내에 생성된 Job만 확인
                            if time_diff_seconds < 300:
                                try:
                                    # Job 상세 정보 조회 (태그 확인)
                                    job_detail = batch_client.describe_jobs(jobs=[job_id])
                                    if job_detail.get('jobs'):
                                        job_tags = job_detail['jobs'][0].get('tags', {})
                                        existing_key = job_tags.get('VideoKey', '')
                                        
                                        if existing_key == key:
                                            logger.warning(
                                                f"⚠️ DUPLICATE JOB DETECTED by S3 key! "
                                                f"S3 Key: {key}, "
                                                f"Existing Job ID: {job_id} (status: {job_summary['status']}, "
                                                f"created {time_diff_seconds:.0f}s ago)"
                                            )
                                            duplicate_found = True
                                            successful_count += 1  # 성공으로 처리 (SQS 메시지 삭제)
                                            break
                                except Exception as detail_error:
                                    logger.debug(f"Error checking job details: {detail_error}")
                    
                    if duplicate_found:
                        logger.info("✋ Skipping job submission due to duplicate detection.")
                        continue  # 다음 메시지로
                        
                except Exception as check_error:
                    logger.warning(f"⚠️ Failed to check for duplicate jobs: {check_error}. Proceeding with job submission anyway.")
                
                # containerOverrides.environment 사용하지 않음
                # Job Definition의 환경변수를 그대로 사용하고, 동적 값만 command로 전달
                response = batch_client.submit_job(
                    jobName=job_name,
                    jobQueue=JOB_QUEUE,
                    jobDefinition=JOB_DEFINITION,
                    containerOverrides={
                        'environment': [
                            # Lambda에서 전달하는 동적 값만 추가
                            {'name': 'VIDEO_ID', 'value': video_id},
                            {'name': 'S3_BUCKET', 'value': bucket},
                            {'name': 'S3_KEY', 'value': key},
                            {'name': 'SQS_MESSAGE_ID', 'value': message_id}
                        ]
                    },
                    tags={
                        'Environment': 'dev',
                        'Source': 'Lambda-SQS',
                        'VideoKey': key,
                        'SubmittedAt': datetime.now().strftime('%Y%m%d-%H%M%S')
                    }
                )
                
                job_id = response['jobId']
                logger.info(f"✅ Successfully submitted job: {job_id} ({job_name})")
                successful_count += 1
                    
            except Exception as e:
                logger.error(f"❌ Failed to submit job: {str(e)}")
                failed_messages.append({'itemIdentifier': message_id})
                    
        except Exception as e:
            logger.error(f"❌ Failed to process message {message_id}: {str(e)}")
            # 실패한 메시지는 다시 큐로 (자동 재시도)
            failed_messages.append({'itemIdentifier': message_id})
    
    # 결과 로깅
    logger.info(f"Processing complete: {successful_count} succeeded, {len(failed_messages)} failed")
    
    # 실패한 메시지가 있으면 SQS에 반환 (재시도됨)
    if failed_messages:
        return {'batchItemFailures': failed_messages}
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Successfully processed {successful_count} messages',
            'timestamp': datetime.now().isoformat()
        })
    }
