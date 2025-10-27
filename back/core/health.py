from django.http import JsonResponse
from django.db import connection
import logging

logger = logging.getLogger(__name__)

def healthz(request):
    """App Runner 헬스체크 엔드포인트"""
    try:
        # DB 연결 확인
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        
        return JsonResponse({
            "status": "healthy",
            "service": "capstone-backend",
            "database": "connected"
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JsonResponse({
            "status": "unhealthy", 
            "error": str(e)
        }, status=503)