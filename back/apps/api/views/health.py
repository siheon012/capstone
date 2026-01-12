"""
Health Check Views
서버 상태 확인 및 모니터링
"""
from rest_framework.decorators import api_view
from django.http import JsonResponse
from django.db import connection
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
def health_check(request):
    """
    헬스체크 엔드포인트 - 서버 상태 확인
    ALB Target Group Health Check용
    """
    health_status = {
        'status': 'healthy',
        'timestamp': None,
        'checks': {
            'database': 'unknown',
            'pgvector': 'unknown',
            's3': 'unknown'
        },
        'details': {}
    }
    
    try:
        from django.utils import timezone
        health_status['timestamp'] = timezone.now().isoformat()
        
        # 1. 데이터베이스 연결 확인
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                health_status['checks']['database'] = 'connected'
        except Exception as e:
            health_status['checks']['database'] = 'disconnected'
            health_status['details']['database_error'] = str(e)
            health_status['status'] = 'unhealthy'
        
        # 2. pgvector 확장 확인
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
                result = cursor.fetchone()
                if result:
                    health_status['checks']['pgvector'] = 'enabled'
                else:
                    health_status['checks']['pgvector'] = 'disabled'
        except Exception as e:
            health_status['checks']['pgvector'] = 'error'
            health_status['details']['pgvector_error'] = str(e)
        
        # 3. S3 연결 확인 (선택사항)
        try:
            import os
            if os.environ.get('USE_S3', 'false').lower() == 'true':
                import boto3
                from botocore.exceptions import ClientError
                
                s3_client = boto3.client('s3')
                bucket_name = os.environ.get('AWS_STORAGE_BUCKET_NAME')
                
                if bucket_name:
                    try:
                        s3_client.head_bucket(Bucket=bucket_name)
                        health_status['checks']['s3'] = 'connected'
                    except ClientError:
                        health_status['checks']['s3'] = 'bucket_not_found'
                else:
                    health_status['checks']['s3'] = 'not_configured'
            else:
                health_status['checks']['s3'] = 'disabled'
        except Exception as e:
            health_status['checks']['s3'] = 'error'
            health_status['details']['s3_error'] = str(e)
        
        # 최종 상태 결정
        if health_status['checks']['database'] != 'connected':
            return JsonResponse(health_status, status=503)
        
        return JsonResponse(health_status, status=200)
    
    except Exception as e:
        return JsonResponse({
            'status': 'unhealthy',
            'error': str(e),
            'message': 'Unexpected error occurred'
        }, status=503)
