"""
JWT 인증 미들웨어 및 유틸리티
"""

import jwt
from functools import wraps
from django.http import JsonResponse
from django.conf import settings
import os
import logging

logger = logging.getLogger(__name__)


def jwt_required(view_func):
    """
    JWT 토큰 검증 데코레이터
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return JsonResponse(
                {'error': 'Authorization 헤더가 필요합니다.'}, 
                status=401
            )
        
        try:
            # Bearer 토큰 추출
            if not auth_header.startswith('Bearer '):
                raise ValueError("Bearer 토큰 형식이 아닙니다.")
            
            token = auth_header.split(' ')[1]
            secret_key = os.getenv('SECRET_KEY')
            
            # JWT 토큰 검증
            payload = jwt.decode(token, secret_key, algorithms=['HS256'])
            
            # request에 사용자 정보 추가
            request.user_payload = payload
            
            logger.info(f"✅ JWT 인증 성공: user_id={payload.get('user_id')}")
            
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError) as e:
            logger.error(f"❌ JWT 인증 실패: {e}")
            return JsonResponse(
                {'error': '유효하지 않은 토큰입니다.'}, 
                status=401
            )
        
        return view_func(request, *args, **kwargs)
    
    return wrapper


def generate_user_jwt(user_id: str, email: str = None, **extra_claims) -> str:
    """
    사용자 JWT 토큰 생성
    
    Args:
        user_id: 사용자 ID
        email: 사용자 이메일 (선택)
        **extra_claims: 추가 클레임
        
    Returns:
        JWT 토큰 문자열
    """
    from datetime import datetime, timedelta
    
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=7),  # 7일 유효
        'iat': datetime.utcnow(),
        'iss': 'capstone-auth-service',
        **extra_claims
    }
    
    if email:
        payload['email'] = email
    
    secret_key = os.getenv('SECRET_KEY')
    token = jwt.encode(payload, secret_key, algorithm='HS256')
    
    logger.info(f"🎫 사용자 JWT 생성: user_id={user_id}")
    return token
