"""
AWS SQS 서비스 모듈
S3 업로드 완료 시 메시지 발행 및 EC2 GPU 워커용 메시지 처리
"""

import boto3
import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
import logging

logger = logging.getLogger(__name__)


class SQSVideoProcessingService:
    """
    SQS를 통한 비디오 처리 큐 관리 서비스
    """
    
    def __init__(self):
        """SQS 클라이언트 및 설정 초기화"""
        self.use_localstack = getattr(settings, 'USE_LOCALSTACK', False)
        self.queue_url = settings.AWS_SQS_QUEUE_URL
        self.region = settings.AWS_SQS_REGION
        
        # LocalStack 또는 실제 AWS SQS 클라이언트 설정
        if self.use_localstack:
            endpoint_url = self._get_env_var('AWS_ENDPOINT_URL', 'http://localhost:4566')
            self.sqs_client = boto3.client(
                'sqs',
                endpoint_url=endpoint_url,
                aws_access_key_id=self._get_env_var('AWS_ACCESS_KEY_ID', 'test'),
                aws_secret_access_key=self._get_env_var('AWS_SECRET_ACCESS_KEY', 'test'),
                region_name=self.region
            )
            logger.info(f"LocalStack SQS 클라이언트 초기화 완료 - endpoint: {endpoint_url}")
        else:
            # 실제 AWS 환경 - IAM Role 또는 환경변수 사용
            self.sqs_client = boto3.client('sqs', region_name=self.region)
            logger.info("AWS SQS 클라이언트 초기화 완료")
    
    def _get_env_var(self, var_name: str, default: Optional[str] = None) -> str:
        """환경변수 안전하게 가져오기"""
        value = os.getenv(var_name, default)
        if value is None:
            raise ImproperlyConfigured(f"환경변수 {var_name}가 설정되지 않았습니다.")
        return value
    
    def send_video_processing_message(
        self, 
        s3_bucket: str, 
        s3_key: str, 
        video_id: str,
        additional_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        비디오 처리 메시지를 SQS로 발송
        
        Args:
            s3_bucket: S3 버킷명
            s3_key: S3 객체 키
            video_id: 비디오 ID
            additional_data: 추가 처리 정보
            
        Returns:
            SQS 응답 정보
        """
        try:
            # 메시지 페이로드 생성
            message_body = {
                "eventType": "video-uploaded",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "s3": {
                    "bucket": s3_bucket,
                    "key": s3_key
                },
                "video": {
                    "id": video_id,
                    "status": "pending"
                },
                "processing": {
                    "requestTime": datetime.now(timezone.utc).isoformat(),
                    "priority": "normal"
                }
            }
            
            # 추가 데이터가 있으면 병합
            if additional_data:
                message_body.update(additional_data)
            
            # SQS 메시지 발송
            response = self.sqs_client.send_message(
                QueueUrl=self.queue_url,
                MessageBody=json.dumps(message_body),
                MessageAttributes={
                    'video_id': {
                        'StringValue': str(video_id),
                        'DataType': 'String'
                    },
                    'event_type': {
                        'StringValue': 'video-uploaded',
                        'DataType': 'String'
                    },
                    's3_bucket': {
                        'StringValue': s3_bucket,
                        'DataType': 'String'
                    }
                }
            )
            
            logger.info(f"SQS 메시지 발송 성공: MessageId={response['MessageId']}, video_id={video_id}")
            
            return {
                'success': True,
                'message_id': response['MessageId'],
                'md5_of_body': response.get('MD5OfBody', 'N/A')
            }
            
        except Exception as e:
            logger.error(f"SQS 메시지 발송 실패: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def receive_messages(
        self, 
        max_messages: int = 1,
        wait_time_seconds: int = 20,
        visibility_timeout: int = 300
    ) -> List[Dict[str, Any]]:
        """
        SQS에서 메시지 수신 (Long Polling)
        
        Args:
            max_messages: 최대 수신 메시지 수 (1-10)
            wait_time_seconds: 대기 시간 (Long Polling용, 최대 20초)
            visibility_timeout: 가시성 타임아웃 (초)
            
        Returns:
            수신된 메시지 리스트
        """
        try:
            response = self.sqs_client.receive_message(
                QueueUrl=self.queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=wait_time_seconds,
                VisibilityTimeout=visibility_timeout,
                MessageAttributeNames=['All']
            )
            
            messages = response.get('Messages', [])
            logger.info(f"SQS 메시지 수신: {len(messages)}개")
            
            return messages
            
        except Exception as e:
            logger.error(f"SQS 메시지 수신 실패: {e}")
            return []
    
    def delete_message(self, receipt_handle: str) -> bool:
        """
        처리 완료된 메시지 삭제
        
        Args:
            receipt_handle: 메시지 수신 핸들
            
        Returns:
            삭제 성공 여부
        """
        try:
            self.sqs_client.delete_message(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle
            )
            
            logger.info("SQS 메시지 삭제 완료")
            return True
            
        except Exception as e:
            logger.error(f"SQS 메시지 삭제 실패: {e}")
            return False
    
    def change_message_visibility(
        self, 
        receipt_handle: str, 
        visibility_timeout: int
    ) -> bool:
        """
        메시지 가시성 타임아웃 변경
        
        Args:
            receipt_handle: 메시지 수신 핸들
            visibility_timeout: 새로운 가시성 타임아웃 (초)
            
        Returns:
            변경 성공 여부
        """
        try:
            self.sqs_client.change_message_visibility(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=visibility_timeout
            )
            
            logger.info(f"SQS 메시지 가시성 타임아웃 변경: {visibility_timeout}초")
            return True
            
        except Exception as e:
            logger.error(f"SQS 메시지 가시성 변경 실패: {e}")
            return False
    
    def get_queue_attributes(self) -> Dict[str, Any]:
        """
        SQS 큐 속성 조회
        
        Returns:
            큐 속성 정보
        """
        try:
            response = self.sqs_client.get_queue_attributes(
                QueueUrl=self.queue_url,
                AttributeNames=['All']
            )
            
            attributes = response.get('Attributes', {})
            logger.info(f"SQS 큐 속성 조회 완료")
            
            return {
                'success': True,
                'attributes': attributes
            }
            
        except Exception as e:
            logger.error(f"SQS 큐 속성 조회 실패: {e}")
            return {
                'success': False,
                'error': str(e)
            }


# 싱글톤 인스턴스
sqs_service = SQSVideoProcessingService()
