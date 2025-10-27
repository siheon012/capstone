"""
오류 처리 및 재시도 로직 관리 모듈
GPU 워커의 안정성과 복원력 향상을 위한 오류 처리
"""

import time
import logging
import traceback
from typing import Callable, Any, Optional, Dict, List
from datetime import datetime, timezone
from enum import Enum
import functools

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """오류 타입 분류"""
    TEMPORARY = "temporary"      # 일시적 오류 (재시도 가능)
    PERMANENT = "permanent"      # 영구적 오류 (재시도 불가)
    SYSTEM = "system"           # 시스템 오류 (워커 중단 필요)


class RetryManager:
    """
    재시도 로직 관리자
    지수 백오프와 오류 분류를 통한 지능적 재시도
    """
    
    def __init__(self):
        self.max_retries = 3
        self.base_delay = 2.0  # 초
        self.backoff_multiplier = 2.0
        self.max_delay = 60.0  # 최대 대기 시간
        
        # 일시적 오류로 분류할 예외들
        self.temporary_exceptions = {
            'ConnectionError': ErrorType.TEMPORARY,
            'TimeoutError': ErrorType.TEMPORARY,
            'BotoCoreError': ErrorType.TEMPORARY,
            'ClientError': ErrorType.TEMPORARY,  # S3 일시적 오류
        }
        
        # 영구적 오류로 분류할 예외들  
        self.permanent_exceptions = {
            'PermissionError': ErrorType.PERMANENT,
            'FileNotFoundError': ErrorType.PERMANENT,
            'ValueError': ErrorType.PERMANENT,
            'KeyError': ErrorType.PERMANENT,
        }
        
        # 시스템 오류로 분류할 예외들
        self.system_exceptions = {
            'MemoryError': ErrorType.SYSTEM,
            'OSError': ErrorType.SYSTEM,
            'RuntimeError': ErrorType.SYSTEM,
        }
    
    def classify_error(self, exception: Exception) -> ErrorType:
        """
        예외를 타입별로 분류
        
        Args:
            exception: 발생한 예외
            
        Returns:
            ErrorType: 오류 타입
        """
        exception_name = type(exception).__name__
        
        # 일시적 오류 체크
        if exception_name in self.temporary_exceptions:
            return ErrorType.TEMPORARY
        
        # 영구적 오류 체크
        if exception_name in self.permanent_exceptions:
            return ErrorType.PERMANENT
            
        # 시스템 오류 체크
        if exception_name in self.system_exceptions:
            return ErrorType.SYSTEM
        
        # S3 ClientError 세부 분류
        if hasattr(exception, 'response') and 'Error' in exception.response:
            error_code = exception.response['Error']['Code']
            if error_code in ['NoSuchBucket', 'NoSuchKey', 'AccessDenied']:
                return ErrorType.PERMANENT
            elif error_code in ['ServiceUnavailable', 'SlowDown', 'RequestTimeout']:
                return ErrorType.TEMPORARY
        
        # 기본값: 일시적 오류로 분류
        return ErrorType.TEMPORARY
    
    def calculate_delay(self, attempt: int) -> float:
        """
        재시도 간격 계산 (지수 백오프)
        
        Args:
            attempt: 현재 시도 횟수 (1부터 시작)
            
        Returns:
            대기 시간 (초)
        """
        delay = self.base_delay * (self.backoff_multiplier ** (attempt - 1))
        return min(delay, self.max_delay)
    
    def retry_with_backoff(
        self, 
        func: Callable, 
        *args, 
        context: str = "", 
        **kwargs
    ) -> Any:
        """
        지수 백오프를 사용한 재시도 실행
        
        Args:
            func: 실행할 함수
            *args: 함수 인자
            context: 로깅용 컨텍스트 정보
            **kwargs: 함수 키워드 인자
            
        Returns:
            함수 실행 결과
            
        Raises:
            Exception: 최대 재시도 횟수 초과 시
        """
        last_exception = None
        
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(f"{context} 시도 {attempt}/{self.max_retries}")
                result = func(*args, **kwargs)
                
                if attempt > 1:
                    logger.info(f"{context} 재시도 성공 ({attempt}번째 시도)")
                
                return result
                
            except Exception as e:
                last_exception = e
                error_type = self.classify_error(e)
                
                logger.warning(f"{context} 실패 (시도 {attempt}/{self.max_retries}): "
                             f"{type(e).__name__}: {str(e)[:100]}")
                
                # 영구적 오류나 시스템 오류면 즉시 중단
                if error_type in [ErrorType.PERMANENT, ErrorType.SYSTEM]:
                    logger.error(f"{context} {error_type.value} 오류로 재시도 중단")
                    raise e
                
                # 마지막 시도였으면 예외 발생
                if attempt >= self.max_retries:
                    logger.error(f"{context} 최대 재시도 횟수 초과")
                    break
                
                # 재시도 대기
                delay = self.calculate_delay(attempt)
                logger.info(f"{delay:.1f}초 후 재시도...")
                time.sleep(delay)
        
        # 모든 재시도 실패
        raise last_exception


class ErrorTracker:
    """
    오류 통계 및 모니터링
    """
    
    def __init__(self):
        self.error_stats = {
            'total_errors': 0,
            'by_type': {},
            'by_function': {},
            'recent_errors': []
        }
        self.max_recent_errors = 100
        
    def record_error(
        self, 
        exception: Exception, 
        context: str = "",
        function_name: str = ""
    ):
        """
        오류 발생 기록
        
        Args:
            exception: 발생한 예외
            context: 컨텍스트 정보
            function_name: 함수명
        """
        error_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'type': type(exception).__name__,
            'message': str(exception)[:200],
            'context': context,
            'function': function_name,
            'traceback': traceback.format_exc()
        }
        
        # 전체 통계 업데이트
        self.error_stats['total_errors'] += 1
        
        # 타입별 통계
        error_type = error_info['type']
        if error_type not in self.error_stats['by_type']:
            self.error_stats['by_type'][error_type] = 0
        self.error_stats['by_type'][error_type] += 1
        
        # 함수별 통계
        if function_name:
            if function_name not in self.error_stats['by_function']:
                self.error_stats['by_function'][function_name] = 0
            self.error_stats['by_function'][function_name] += 1
        
        # 최근 오류 목록
        self.error_stats['recent_errors'].append(error_info)
        if len(self.error_stats['recent_errors']) > self.max_recent_errors:
            self.error_stats['recent_errors'].pop(0)
        
        logger.error(f"오류 기록: {context} - {error_type}: {str(exception)[:100]}")
    
    def get_error_summary(self) -> Dict:
        """오류 요약 정보 반환"""
        return {
            'total_errors': self.error_stats['total_errors'],
            'error_types': len(self.error_stats['by_type']),
            'most_common_error': max(
                self.error_stats['by_type'].items(), 
                key=lambda x: x[1], 
                default=('None', 0)
            )[0],
            'functions_with_errors': len(self.error_stats['by_function'])
        }
    
    def get_detailed_stats(self) -> Dict:
        """상세 오류 통계 반환"""
        return self.error_stats.copy()


# 전역 인스턴스
retry_manager = RetryManager()
error_tracker = ErrorTracker()


def retry_on_error(max_retries: int = 3, context: str = ""):
    """
    함수 데코레이터: 자동 재시도 기능 추가
    
    Args:
        max_retries: 최대 재시도 횟수
        context: 로깅용 컨텍스트
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            function_context = context or func.__name__
            
            # 임시로 재시도 횟수 변경
            original_max_retries = retry_manager.max_retries
            retry_manager.max_retries = max_retries
            
            try:
                return retry_manager.retry_with_backoff(
                    func, 
                    *args, 
                    context=function_context, 
                    **kwargs
                )
            except Exception as e:
                error_tracker.record_error(e, function_context, func.__name__)
                raise
            finally:
                # 원래 설정 복구
                retry_manager.max_retries = original_max_retries
        
        return wrapper
    return decorator


def safe_execute(func: Callable, *args, context: str = "", **kwargs) -> tuple:
    """
    안전한 함수 실행 (예외를 잡아서 반환)
    
    Args:
        func: 실행할 함수
        context: 컨텍스트 정보
        
    Returns:
        (성공여부, 결과 또는 예외)
    """
    try:
        result = func(*args, **kwargs)
        return True, result
    except Exception as e:
        error_tracker.record_error(e, context, func.__name__)
        logger.error(f"❌ {context} 실행 오류: {type(e).__name__}: {str(e)}")
        return False, e