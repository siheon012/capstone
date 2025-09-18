"""
EC2 GPU Video Processing Worker
SQS Long Polling을 통한 비디오 처리 워커
가시성 타임아웃 자동 관리 포함
"""

import os
import sys
import json
import time
import logging
import signal
import boto3
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
from visibility_manager import VisibilityTimeoutManager
from error_handler import retry_manager, error_tracker, retry_on_error, safe_execute


# Django 설정을 위한 경로 추가
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DJANGO_ROOT = PROJECT_ROOT / 'back'

sys.path.insert(0, str(DJANGO_ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

try:
    import django
    django.setup()
    
    from apps.api.services.sqs_service import sqs_service
    from apps.api.services.s3_service import s3_service
    from apps.db.models import Video
    
    print("Django 모듈 로드 완료")
except Exception as e:
    print(f"Django 모듈 로드 실패: {e}")
    sys.exit(1)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(SCRIPT_DIR / 'gpu_worker.log')
    ]
)
logger = logging.getLogger('GPUWorker')


class GPUVideoWorker:
    """
    EC2 GPU 비디오 처리 워커
    가시성 타임아웃 자동 관리 포함
    """
    
    def __init__(self):
        self.running = False
        self.processed_count = 0
        self.error_count = 0
        
        # 가시성 타임아웃 매니저 초기화
        self.visibility_manager = VisibilityTimeoutManager(sqs_service)
        
        # 시그널 핸들러 등록 (Graceful Shutdown)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        logger.info("GPU Video Worker 초기화 완료")
    
    def _signal_handler(self, signum, frame):
        """시그널 핸들러 - Graceful Shutdown"""
        logger.info(f"시그널 {signum} 수신 - 워커 종료 중...")
        self.running = False
        self._print_final_statistics()
    
    def _print_final_statistics(self):
        """최종 통계 및 오류 요약 출력"""
        logger.info("=" * 60)
        logger.info(" GPU Video Worker 최종 통계")
        logger.info("=" * 60)
        
        # 기본 통계
        logger.info(f" 처리 통계:")
        logger.info(f"    성공: {self.processed_count}건")
        logger.info(f"    실패: {self.error_count}건")
        
        total_messages = self.processed_count + self.error_count
        if total_messages > 0:
            success_rate = (self.processed_count / total_messages) * 100
            logger.info(f"   📈 성공률: {success_rate:.1f}%")
        
        # 오류 통계
        error_summary = error_tracker.get_error_summary()
        if error_summary['total_errors'] > 0:
            logger.info(f"   오류 요약:")
            logger.info(f"   전체 오류: {error_summary['total_errors']}건")
            logger.info(f"   오류 타입 수: {error_summary['error_types']}개")
            logger.info(f"   가장 빈번한 오류: {error_summary['most_common_error']}")
            logger.info(f"   오류 발생 함수: {error_summary['functions_with_errors']}개")
        
        # 가시성 타임아웃 통계
        if hasattr(self.visibility_manager, 'get_statistics'):
            visibility_stats = self.visibility_manager.get_statistics()
            logger.info(f"   가시성 타임아웃 통계:")
            logger.info(f"   관리 메시지: {visibility_stats.get('managed_messages', 0)}건")
            logger.info(f"   연장 횟수: {visibility_stats.get('extensions', 0)}회")
        
        logger.info("=" * 60)
    
    def start_worker_loop(self):
        """
        메인 워커 루프 시작
        Long Polling으로 SQS 메시지를 지속적으로 수신하고 처리
        """
        logger.info("GPU Video Worker 시작...")
        logger.info(f"현재 상태: 처리완료={self.processed_count}, 오류={self.error_count}")
        
        # 가시성 타임아웃 모니터링 시작
        self.visibility_manager.start_monitoring()
        
        self.running = True
        consecutive_empty_polls = 0
        max_empty_polls = 3  # 연속으로 빈 폴링 3회시 잠시 대기
        
        try:
            while self.running:
                try:
                    # SQS Long Polling으로 메시지 수신 (20초 대기)
                    logger.debug("SQS 메시지 수신 중... (Long Polling 20초)")
                    messages = sqs_service.receive_messages(
                        max_messages=1,
                        wait_time_seconds=20,
                        visibility_timeout=300  # 5분 기본 가시성 타임아웃
                    )
                    
                    if messages:
                        consecutive_empty_polls = 0
                        for message in messages:
                            if not self.running:
                                break
                            self._process_message_with_visibility_management(message)
                    else:
                        consecutive_empty_polls += 1
                        logger.debug(f"수신된 메시지 없음 ({consecutive_empty_polls}/3)")
                        
                        # 연속으로 빈 메시지가 여러 번 나오면 잠시 대기
                        if consecutive_empty_polls >= max_empty_polls:
                            logger.info("잠시 대기 중... (30초)")
                            time.sleep(30)
                            consecutive_empty_polls = 0
                
                except KeyboardInterrupt:
                    logger.info("사용자에 의한 종료")
                    break
                except Exception as e:
                    logger.error(f"워커 루프 오류: {e}")
                    self.error_count += 1
                    time.sleep(10)  # 오류 시 10초 대기
        
        finally:
            # 가시성 타임아웃 모니터링 중지
            self.visibility_manager.stop_monitoring()
            
            # 최종 통계 출력
            self._print_final_statistics()
            logger.info("🏁 GPU Video Worker 완전 종료")

    def _process_message_with_visibility_management(self, message: Dict[str, Any]):
        """
        SQS 메시지 처리 (가시성 타임아웃 자동 관리 + 오류 처리)
        """
        receipt_handle = message.get('ReceiptHandle')
        message_body = message.get('Body', '{}')
        
        try:
            # 메시지 파싱 (오류 처리 포함)
            success, payload = safe_execute(
                json.loads, 
                message_body,
                context=f"메시지 파싱 (handle={receipt_handle[:10]}...)"
            )
            
            if not success:
                logger.error(f"메시지 파싱 실패: {payload}")
                # 파싱 실패 시 메시지 삭제 (잘못된 형식)
                sqs_service.delete_message(receipt_handle)
                self.error_count += 1
                return
            
            video_id = payload.get('video', {}).get('id')
            s3_bucket = payload.get('s3', {}).get('bucket')
            s3_key = payload.get('s3', {}).get('key')
            
            logger.info(f"메시지 처리 시작: video_id={video_id}, s3_key={s3_key}")
            
            # 필수 정보 검증
            if not all([video_id, s3_bucket, s3_key]):
                error_msg = f"필수 정보 누락: video_id={video_id}, bucket={s3_bucket}, key={s3_key}"
                logger.error(f"{error_msg}")
                error_tracker.record_error(
                    ValueError(error_msg), 
                    context=f"메시지 검증 video_id={video_id}",
                    function_name="_process_message_with_visibility_management"
                )
                # 필수 정보 누락 시 메시지 삭제 (재처리 불가)
                sqs_service.delete_message(receipt_handle)
                self.error_count += 1
                return
            
            # 파일 크기 기반으로 예상 처리 시간 계산
            estimated_time = self._estimate_processing_time_safe(s3_key)
            
            # 가시성 타임아웃 관리 시작
            self.visibility_manager.register_message(
                receipt_handle, 
                video_id, 
                estimated_time
            )
            
            # 비디오 처리 실행 (재시도 로직 포함)
            processing_result = self._process_video_with_retry(video_id, s3_bucket, s3_key)
            
            if processing_result['success']:
                # 처리 완료 - 메시지 삭제
                success, _ = safe_execute(
                    sqs_service.delete_message,
                    receipt_handle,
                    context=f"메시지 삭제 video_id={video_id}"
                )
                
                self.visibility_manager.unregister_message(receipt_handle, 'completed')
                if success:
                    self.processed_count += 1
                    logger.info(f"비디오 처리 완료: video_id={video_id}")
                else:
                    logger.warning(f"⚠️ 처리는 성공했지만 메시지 삭제 실패: video_id={video_id}")
                    
            else:
                # 처리 실패 - 메시지 가시성 복구 (다른 워커가 재처리 가능)
                error_type = processing_result.get('error_type', 'unknown')
                
                if error_type == 'permanent':
                    # 영구적 오류 - 메시지 삭제
                    logger.error(f"영구적 오류로 메시지 삭제: video_id={video_id}")
                    sqs_service.delete_message(receipt_handle)
                else:
                    # 일시적 오류 - 가시성 복구하여 재처리 가능하게 함
                    logger.warning(f"일시적 오류로 재처리 대기: video_id={video_id}")
                    safe_execute(
                        sqs_service.change_message_visibility,
                        receipt_handle, 
                        0,  # 즉시 가시성 복구
                        context=f"가시성 복구 video_id={video_id}"
                    )
                
                self.visibility_manager.unregister_message(receipt_handle, 'failed')
                self.error_count += 1
                
        except Exception as e:
            # 예상치 못한 오류
            logger.error(f"메시지 처리 중 예상치 못한 오류: {e}")
            error_tracker.record_error(
                e, 
                context=f"메시지 처리 handle={receipt_handle[:10]}...",
                function_name="_process_message_with_visibility_management"
            )
            
            # 가시성 복구
            try:
                sqs_service.change_message_visibility(receipt_handle, 0)
                self.visibility_manager.unregister_message(receipt_handle, 'error')
            except:
                pass  # 복구 시도도 실패하면 그냥 넘어감
                
            self.error_count += 1
    
    def _estimate_processing_time_safe(self, s3_key: str) -> int:
        """
        S3 키를 기반으로 예상 처리 시간 계산 (오류 처리 포함)
        
        Args:
            s3_key: S3 객체 키
            
        Returns:
            예상 처리 시간 (초)
        """
        try:
            # S3에서 파일 크기 정보 조회
            success, file_info = safe_execute(
                s3_service.get_file_info,
                s3_key,
                context=f"파일 정보 조회 {s3_key}"
            )
            
            if success and file_info:
                file_size = file_info.get('ContentLength', 0)
                # 파일 크기 기반 예상 시간 (MB당 1초 + 기본 120초)
                size_mb = file_size / (1024 * 1024)
                estimated_time = max(120, int(size_mb * 1.0 + 120))
                logger.debug(f"파일 크기 기반 예상 시간: {size_mb:.1f}MB → {estimated_time}초")
                return estimated_time
        except Exception as e:
            logger.warning(f"파일 크기 조회 실패, 기본값 사용: {e}")
        
        # 파일 확장자 기반 기본 예상 시간
        if s3_key.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            return 600  # 비디오 파일: 10분
        elif s3_key.lower().endswith(('.jpg', '.png', '.jpeg', '.gif')):
            return 120  # 이미지 파일: 2분
        else:
            return 300  # 기본: 5분
    
    def _process_video_with_retry(self, video_id: str, s3_bucket: str, s3_key: str) -> Dict[str, Any]:
        """
        비디오 처리 실행 (재시도 로직 포함)
        
        Args:
            video_id: 비디오 ID
            s3_bucket: S3 버킷명  
            s3_key: S3 객체 키
            
        Returns:
            처리 결과 딕셔너리
        """
        context = f"비디오 처리 video_id={video_id}"
        
        try:
            # 재시도 로직으로 비디오 처리 실행
            result = retry_manager.retry_with_backoff(
                self._process_video,
                video_id,
                s3_bucket,
                s3_key,
                context=context
            )
            return result
            
        except Exception as e:
            error_type = retry_manager.classify_error(e)
            logger.error(f"{context} 최종 실패: {type(e).__name__}: {str(e)}")
            
            return {
                'success': False,
                'error': str(e),
                'error_type': error_type.value
            }
    
    @retry_on_error(max_retries=2, context="S3 파일 다운로드")
    def _download_video_from_s3(self, s3_bucket: str, s3_key: str, local_path: str) -> bool:
        """
        S3에서 비디오 파일 다운로드 (재시도 기능 포함)
        
        Args:
            s3_bucket: S3 버킷명
            s3_key: S3 객체 키  
            local_path: 로컬 저장 경로
            
        Returns:
            다운로드 성공 여부
        """
        logger.info(f"S3 다운로드: s3://{s3_bucket}/{s3_key} → {local_path}")
        
        # S3 다운로드 실행
        s3_service.download_file(s3_bucket, s3_key, local_path)
        
        # 파일 존재 확인
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"다운로드된 파일을 찾을 수 없습니다: {local_path}")
        
        file_size = os.path.getsize(local_path)
        logger.info(f"다운로드 완료: {file_size:,} bytes")
        return True
    
    @retry_on_error(max_retries=2, context="분석 결과 업로드")  
    def _upload_results_to_s3(self, results: Dict, s3_bucket: str, s3_key: str) -> bool:
        """
        분석 결과를 S3에 업로드 (재시도 기능 포함)
        
        Args:
            results: 분석 결과 딕셔너리
            s3_bucket: S3 버킷명
            s3_key: S3 객체 키
            
        Returns:
            업로드 성공 여부
        """
        logger.info(f"분석 결과 업로드: {s3_key}")
        
        # JSON 직렬화
        results_json = json.dumps(results, ensure_ascii=False, indent=2)
        
        # S3 업로드
        s3_service.upload_string_as_file(results_json, s3_bucket, s3_key)
        
        logger.info(f"업로드 완료: s3://{s3_bucket}/{s3_key}")
        return True
    
    def _estimate_processing_time(self, s3_key: str) -> int:
        """
        S3 키를 기반으로 예상 처리 시간 계산
        
        Args:
            s3_key: S3 객체 키
            
        Returns:
            예상 처리 시간 (초)
        """
        # 파일 확장자 기반 기본 예상 시간
        if s3_key.lower().endswith(('.mp4', '.avi', '.mov')):
            return 600  # 비디오 파일: 10분
        elif s3_key.lower().endswith(('.jpg', '.png', '.jpeg')):
            return 120  # 이미지 파일: 2분
        else:
            return 300  # 기본: 5분
    
    def _process_message(self, message: Dict[str, Any]):
        """
        SQS 메시지 처리 (기존 방식 - 호환성 유지)
        """
        receipt_handle = message.get('ReceiptHandle')
        message_body = message.get('Body', '{}')
        
        try:
            # 메시지 파싱
            payload = json.loads(message_body)
            video_id = payload.get('video', {}).get('id')
            s3_bucket = payload.get('s3', {}).get('bucket')
            s3_key = payload.get('s3', {}).get('key')
            
            logger.info(f"메시지 처리 시작: video_id={video_id}, s3_key={s3_key}")
            
            # 필수 정보 검증
            if not all([video_id, s3_bucket, s3_key]):
                raise ValueError(f"필수 정보 누락: video_id={video_id}, s3_bucket={s3_bucket}, s3_key={s3_key}")
            
            # 가시성 타임아웃 연장 (처리 시작 알림)
            sqs_service.change_message_visibility(receipt_handle, 600)  # 10분 연장
            
            # 비디오 처리 실행
            processing_result = self._process_video(video_id, s3_bucket, s3_key)
            
            if processing_result['success']:
                # 처리 완료 - 메시지 삭제
                sqs_service.delete_message(receipt_handle)
                self.processed_count += 1
                logger.info(f"비디오 처리 완료: video_id={video_id}")
            else:
                # 처리 실패 - 메시지 가시성 복구 (다른 워커가 재처리 가능)
                sqs_service.change_message_visibility(receipt_handle, 0)
                self.error_count += 1
                logger.error(f"비디오 처리 실패: video_id={video_id}, error={processing_result['error']}")
        
        except json.JSONDecodeError as e:
            logger.error(f"메시지 파싱 실패: {e}")
            # 잘못된 형식의 메시지는 삭제
            sqs_service.delete_message(receipt_handle)
            self.error_count += 1
        
        except Exception as e:
            logger.error(f"메시지 처리 오류: {e}")
            traceback.print_exc()
            self.error_count += 1
            
            # 처리 실패 시 메시지 가시성 복구
            try:
                sqs_service.change_message_visibility(receipt_handle, 0)
            except:
                pass
    
    def _process_video(self, video_id: str, s3_bucket: str, s3_key: str) -> Dict[str, Any]:
        """
        비디오 GPU 처리 파이프라인 (오류 처리 강화)
        
        1. S3에서 비디오 다운로드
        2. GPU 추론 실행  
        3. 결과 저장
        4. Django API 상태 업데이트
        """
        local_video_path = None
        
        try:
            # Step 1: S3에서 비디오 다운로드 (재시도 포함)
            logger.info(f" S3 비디오 다운로드 시작: {s3_key}")
            local_video_path = self._download_video_safe(video_id, s3_bucket, s3_key)
            
            # Step 2: GPU 추론 실행 (재시도 포함)
            logger.info(f" GPU 추론 시작: {local_video_path}")
            inference_result = self._run_gpu_inference_safe(video_id, local_video_path)
            
            # Step 3: 결과 저장 (재시도 포함)
            logger.info(f" 처리 결과 저장 중...")
            storage_result = self._save_processing_result_safe(video_id, inference_result)
            
            # Step 4: Django DB 상태 업데이트 (재시도 포함)
            logger.info(f" DB 상태 업데이트 중...")
            self._update_video_status_safe(video_id, 'completed', inference_result)
            
            logger.info(f" 비디오 처리 완료: video_id={video_id}")
            
            return {
                'success': True,
                'video_id': video_id,
                'result': inference_result
            }
        
        except Exception as e:
            logger.error(f" 비디오 처리 오류: video_id={video_id}, error={type(e).__name__}: {str(e)}")
            
            # 실패 상태로 DB 업데이트 시도
            success, _ = safe_execute(
                self._update_video_status_safe,
                video_id, 
                'failed', 
                {'error': str(e), 'timestamp': datetime.now(timezone.utc).isoformat()},
                context=f"실패 상태 업데이트 video_id={video_id}"
            )
            
            if not success:
                logger.warning(f"⚠️ 실패 상태 DB 업데이트도 실패: video_id={video_id}")
            
            return {
                'success': False,
                'error': str(e),
                'video_id': video_id
            }
        
        finally:
            # 임시 파일 정리 (항상 실행)
            if local_video_path:
                safe_execute(
                    self._cleanup_temp_files,
                    local_video_path,
                    context=f"임시 파일 정리 video_id={video_id}"
                )
    
    def _download_video_safe(self, video_id: str, s3_bucket: str, s3_key: str) -> str:
        """S3에서 비디오 다운로드 (오류 처리 강화)"""
        # 임시 디렉토리 생성
        temp_dir = SCRIPT_DIR / 'temp'
        temp_dir.mkdir(exist_ok=True)
        
        # 로컬 파일 경로 생성
        file_extension = Path(s3_key).suffix or '.mp4'
        local_filename = f"video_{video_id}_{int(time.time())}{file_extension}"
        local_video_path = temp_dir / local_filename
        
        # 재시도 로직으로 다운로드 실행
        self._download_video_from_s3(s3_bucket, s3_key, str(local_video_path))
        
        return str(local_video_path)
    
    def _run_gpu_inference_safe(self, video_id: str, local_video_path: str) -> Dict[str, Any]:
        """GPU 추론 실행 (오류 처리 강화)"""
        context = f"GPU 추론 video_id={video_id}"
        
        try:
            # GPU 추론 실행 (재시도 포함)
            result = retry_manager.retry_with_backoff(
                self._run_gpu_inference,
                local_video_path,
                context=context
            )
            return result
            
        except Exception as e:
            logger.error(f" {context} 실패: {type(e).__name__}: {str(e)}")
            raise
    
    def _save_processing_result_safe(self, video_id: str, inference_result: Dict) -> bool:
        """처리 결과 저장 (오류 처리 강화)"""
        context = f"결과 저장 video_id={video_id}"
        
        try:
            # 결과 저장 실행 (재시도 포함)
            return retry_manager.retry_with_backoff(
                self._save_processing_result,
                video_id,
                inference_result,
                context=context
            )
            
        except Exception as e:
            logger.error(f" {context} 실패: {type(e).__name__}: {str(e)}")
            raise
    
    def _update_video_status_safe(self, video_id: str, status: str, data: Dict = None) -> bool:
        """비디오 상태 업데이트 (오류 처리 강화)"""
        context = f"상태 업데이트 video_id={video_id} status={status}"
        
        try:
            # 상태 업데이트 실행 (재시도 포함)
            return retry_manager.retry_with_backoff(
                self._update_video_status,
                video_id,
                status,
                data,
                context=context
            )
            
        except Exception as e:
            logger.error(f" {context} 실패: {type(e).__name__}: {str(e)}")
            raise
    
    def _download_video_from_s3(self, s3_bucket: str, s3_key: str) -> str:
        """S3에서 비디오 다운로드"""
        # 임시 디렉토리 생성
        temp_dir = SCRIPT_DIR / 'temp'
        temp_dir.mkdir(exist_ok=True)
        
        # 로컬 파일 경로
        file_name = Path(s3_key).name
        local_path = temp_dir / f"{int(time.time())}_{file_name}"
        
        # S3에서 다운로드 (s3_service 사용)
        try:
            # Pre-signed URL 생성 후 다운로드 방식 사용
            download_url = s3_service.generate_download_url(s3_key)
            
            import requests
            response = requests.get(download_url, stream=True)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            logger.info(f"비디오 다운로드 완료: {local_path}")
            return str(local_path)
            
        except Exception as e:
            logger.error(f"S3 다운로드 실패: {e}")
            raise
    
    def _run_gpu_inference(self, video_path: str) -> Dict[str, Any]:
        """
        GPU 추론 실행 (Mock Implementation)
        실제로는 여기에 GPU 모델 추론 코드를 구현
        """
        logger.info(f"GPU 추론 실행 중: {video_path}")
        
        # TODO: 실제 GPU 추론 로직 구현
        # 예: YOLOv8, MediaPipe, Custom Model 등
        
        # Mock 결과 (실제 구현 시 제거)
        import random
        mock_result = {
            'processing_time': round(random.uniform(10, 60), 2),
            'detected_objects': random.randint(5, 50),
            'confidence_score': round(random.uniform(0.7, 0.95), 3),
            'analysis_summary': f"Mock GPU 분석 완료 - {datetime.now(timezone.utc).isoformat()}",
            'model_version': 'mock-v1.0'
        }
        
        # GPU 처리 시뮬레이션 (5-10초)
        processing_time = random.uniform(5, 10)
        time.sleep(processing_time)
        
        logger.info(f"GPU 추론 완료: {processing_time:.2f}초")
        return mock_result
    
    def _save_processing_result(self, video_id: str, result: Dict[str, Any]) -> bool:
        """처리 결과 저장 (S3 또는 로컬)"""
        try:
            # JSON 결과 파일 생성
            result_data = {
                'video_id': video_id,
                'processed_at': datetime.now(timezone.utc).isoformat(),
                'result': result
            }
            
            # 임시로 로컬에 저장 (추후 S3로 업로드 가능)
            result_dir = SCRIPT_DIR / 'results'
            result_dir.mkdir(exist_ok=True)
            
            result_file = result_dir / f"video_{video_id}_result.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(result_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"처리 결과 저장 완료: {result_file}")
            return True
            
        except Exception as e:
            logger.error(f"결과 저장 실패: {e}")
            return False
    
    def _update_video_status(self, video_id: str, status: str, result: Dict[str, Any]):
        """Django DB에서 비디오 상태 업데이트"""
        try:
            video = Video.objects.get(video_id=video_id)
            
            # 비디오 상태 업데이트 (status 필드가 있다고 가정)
            if hasattr(video, 'processing_status'):
                video.processing_status = status
            
            # major_event 필드에 처리 결과 저장
            video.major_event = json.dumps(result) if result else None
            video.save()
            
            logger.info(f"DB 업데이트 완료: video_id={video_id}, status={status}")
            
        except Video.DoesNotExist:
            logger.error(f"비디오를 찾을 수 없음: video_id={video_id}")
        except Exception as e:
            logger.error(f"DB 업데이트 실패: {e}")
    
    def _cleanup_temp_files(self, *file_paths):
        """임시 파일 정리"""
        for file_path in file_paths:
            try:
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                    logger.debug(f"임시 파일 삭제: {file_path}")
            except Exception as e:
                logger.warning(f"파일 삭제 실패: {file_path}, {e}")


def main():
    """메인 실행 함수"""
    try:
        worker = GPUVideoWorker()
        worker.start_worker_loop()
    except Exception as e:
        logger.error(f"워커 실행 실패: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()