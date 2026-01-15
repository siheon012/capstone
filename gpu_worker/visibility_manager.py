"""
SQS 메시지 가시성 타임아웃 관리 모듈
메시지 처리 중 가시성 타임아웃을 동적으로 관리
"""

import time
import threading
import logging
from typing import Dict, Optional, Callable
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class VisibilityTimeoutManager:
    """
    SQS 메시지 가시성 타임아웃 관리자
    메시지 처리 중 자동으로 가시성 연장
    """
    
    def __init__(self, sqs_service):
        """
        Args:
            sqs_service: SQS 서비스 인스턴스
        """
        self.sqs_service = sqs_service
        self.active_messages: Dict[str, Dict] = {}  # receipt_handle -> message_info
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
        
        # 설정값
        self.default_timeout = 300  # 5분 기본 가시성 타임아웃
        self.extension_interval = 240  # 4분마다 연장 체크
        self.max_processing_time = 5400  # 최대 처리 시간 1시간 30분
        
    def start_monitoring(self):
        """가시성 타임아웃 모니터링 시작"""
        if self._monitor_thread and self._monitor_thread.is_alive():
            logger.warning("가시성 타임아웃 모니터링이 이미 실행 중입니다")
            return
            
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor_visibility_timeouts,
            daemon=True
        )
        self._monitor_thread.start()
        logger.info("가시성 타임아웃 모니터링 시작")
    
    def stop_monitoring(self):
        """가시성 타임아웃 모니터링 중지"""
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
        logger.info("가시성 타임아웃 모니터링 중지")
    
    def register_message(
        self, 
        receipt_handle: str, 
        video_id: str,
        estimated_processing_time: int = None
    ):
        """
        메시지 처리 시작 등록
        
        Args:
            receipt_handle: SQS 메시지 수신 핸들
            video_id: 처리할 비디오 ID
            estimated_processing_time: 예상 처리 시간 (초)
        """
        processing_time = estimated_processing_time or self.default_timeout
        
        message_info = {
            'video_id': video_id,
            'start_time': datetime.now(timezone.utc),
            'last_extended': datetime.now(timezone.utc),
            'visibility_timeout': processing_time,
            'extension_count': 0,
            'status': 'processing'
        }
        
        self.active_messages[receipt_handle] = message_info
        
        # 초기 가시성 타임아웃 설정
        success = self.sqs_service.change_message_visibility(
            receipt_handle, 
            processing_time
        )
        
        if success:
            logger.info(f"메시지 처리 등록: video_id={video_id}, timeout={processing_time}초")
        else:
            logger.error(f"초기 가시성 타임아웃 설정 실패: video_id={video_id}")
    
    def extend_visibility(self, receipt_handle: str, additional_time: int = 300):
        """
        특정 메시지의 가시성 타임아웃 연장
        
        Args:
            receipt_handle: SQS 메시지 수신 핸들
            additional_time: 추가 연장 시간 (초)
        """
        if receipt_handle not in self.active_messages:
            logger.warning(f"등록되지 않은 메시지: {receipt_handle[:20]}...")
            return False
        
        message_info = self.active_messages[receipt_handle]
        
        # 가시성 타임아웃 연장
        success = self.sqs_service.change_message_visibility(receipt_handle, additional_time)
        
        if success:
            message_info['last_extended'] = datetime.now(timezone.utc)
            message_info['extension_count'] += 1
            message_info['visibility_timeout'] = additional_time
            
            logger.info(f"가시성 타임아웃 연장: video_id={message_info['video_id']}, "
                       f"추가시간={additional_time}초, 연장횟수={message_info['extension_count']}")
            return True
        else:
            logger.error(f"가시성 타임아웃 연장 실패: video_id={message_info['video_id']}")
            return False
    
    def unregister_message(self, receipt_handle: str, status: str = 'completed'):
        """
        메시지 처리 완료 또는 실패 등록 해제
        
        Args:
            receipt_handle: SQS 메시지 수신 핸들  
            status: 완료 상태 ('completed', 'failed', 'timeout')
        """
        if receipt_handle not in self.active_messages:
            logger.warning(f"등록되지 않은 메시지 해제 시도: {receipt_handle[:20]}...")
            return
        
        message_info = self.active_messages[receipt_handle]
        processing_time = (datetime.now(timezone.utc) - message_info['start_time']).total_seconds()
        
        logger.info(f"메시지 처리 완료: video_id={message_info['video_id']}, "
                   f"상태={status}, 처리시간={processing_time:.1f}초, "
                   f"연장횟수={message_info['extension_count']}")
        
        del self.active_messages[receipt_handle]
    
    def get_active_message_count(self) -> int:
        """현재 처리 중인 메시지 수 반환"""
        return len(self.active_messages)
    
    def get_message_status(self, receipt_handle: str) -> Optional[Dict]:
        """특정 메시지의 상태 정보 반환"""
        return self.active_messages.get(receipt_handle)
    
    def _monitor_visibility_timeouts(self):
        """백그라운드에서 가시성 타임아웃 모니터링"""
        logger.info("가시성 타임아웃 모니터링 스레드 시작")
        
        while not self._stop_event.is_set():
            try:
                current_time = datetime.now(timezone.utc)
                messages_to_extend = []
                messages_to_timeout = []
                
                # 활성 메시지들 체크
                for receipt_handle, message_info in self.active_messages.items():
                    elapsed_since_extension = (current_time - message_info['last_extended']).total_seconds()
                    total_elapsed = (current_time - message_info['start_time']).total_seconds()
                    
                    # 최대 처리 시간 초과 체크
                    if total_elapsed > self.max_processing_time:
                        messages_to_timeout.append(receipt_handle)
                        continue
                    
                    # 연장이 필요한 메시지 체크
                    if elapsed_since_extension >= self.extension_interval:
                        messages_to_extend.append(receipt_handle)
                
                # 가시성 타임아웃 연장
                for receipt_handle in messages_to_extend:
                    self.extend_visibility(receipt_handle, self.default_timeout)
                
                # 타임아웃된 메시지들 정리
                for receipt_handle in messages_to_timeout:
                    message_info = self.active_messages[receipt_handle]
                    logger.error(f"메시지 처리 타임아웃: video_id={message_info['video_id']}")
                    self.unregister_message(receipt_handle, 'timeout')
                
                # 상태 로깅 (5분마다)
                if len(self.active_messages) > 0:
                    logger.info(f"현재 처리 중인 메시지: {len(self.active_messages)}개")
                
            except Exception as e:
                logger.error(f"가시성 타임아웃 모니터링 오류: {e}")
            
            # 60초마다 체크
            self._stop_event.wait(60)
        
        logger.info("가시성 타임아웃 모니터링 스레드 종료")