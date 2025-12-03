#!/usr/bin/env python3
"""
AWS Batch Memi Video Processor
SQS 메시지를 받아 S3에서 비디오를 다운로드하고 memi AI 분석을 실행
"""

import os
import json
import sys
import logging
import subprocess
import tempfile
from typing import Dict, Any, Optional
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


class MemiVideoProcessorError(Exception):
    """비디오 처리 중 발생하는 커스텀 예외"""
    pass


class MemiVideoProcessor:
    """Memi AI 비디오 분석 처리를 담당하는 메인 클래스"""
    
    def __init__(self):
        """환경 변수에서 설정 로드"""
        self.sqs_queue_url = os.environ.get('SQS_QUEUE_URL')
        self.s3_bucket_raw = os.environ.get('S3_BUCKET_RAW')
        self.aws_region = os.environ.get('AWS_DEFAULT_REGION', 'ap-northeast-2')
        self.environment = os.environ.get('ENVIRONMENT', 'dev')
        
        # Lambda로부터 직접 전달된 S3 정보 (우선순위 높음)
        self.direct_s3_bucket = os.environ.get('S3_BUCKET')
        self.direct_s3_key = os.environ.get('S3_KEY')
        self.message_id = os.environ.get('MESSAGE_ID')
        
        # Memi 모델 경로 (컨테이너 내부)
        self.detector_weights = os.environ.get('DETECTOR_WEIGHTS', '/workspace/models/yolov8x_person_face.pt')
        self.mivolo_checkpoint = os.environ.get('MIVOLO_CHECKPOINT', '/workspace/models/model_imdb_cross_person_4.22_99.46.pth.tar')
        self.mebow_cfg = os.environ.get('MEBOW_CFG', '/workspace/experiments/coco/segm-4_lr1e-3.yaml')
        self.vlm_path = os.environ.get('VLM_PATH', '/workspace/checkpoints/llava-fastvithd_0.5b_stage2')
        self.device = os.environ.get('DEVICE', 'cuda:0')
        
        # PostgreSQL 설정 (memi run.py가 사용)
        self.postgres_host = os.environ.get('POSTGRES_HOST')
        self.postgres_port = os.environ.get('POSTGRES_PORT', '5432')
        self.postgres_db = os.environ.get('POSTGRES_DB')
        self.postgres_user = os.environ.get('POSTGRES_USER')
        self.postgres_password = os.environ.get('POSTGRES_PASSWORD')
        
        # 필수 환경 변수 검증
        self._validate_config()
        
        # AWS 클라이언트 초기화
        self.sqs_client = boto3.client('sqs', region_name=self.aws_region)
        self.s3_client = boto3.client('s3', region_name=self.aws_region)
        
        # 작업 디렉토리 설정
        self.work_dir = Path('/workspace')
        self.videos_dir = self.work_dir / 'videos'
        self.results_dir = self.work_dir / 'results'
        
        # 디렉토리 생성
        self.videos_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"MemiVideoProcessor initialized for environment: {self.environment}")
        logger.info(f"SQS Queue: {self.sqs_queue_url}")
        logger.info(f"S3 Bucket: {self.s3_bucket_raw}")
        logger.info(f"Device: {self.device}")
    
    def _validate_config(self):
        """필수 환경 변수가 설정되었는지 검증"""
        # 직접 S3 정보가 있으면 SQS 불필요
        if self.direct_s3_bucket and self.direct_s3_key:
            required_vars = [
                'POSTGRES_HOST',
                'POSTGRES_DB',
                'POSTGRES_USER'
                # POSTGRES_PASSWORD는 Secrets Manager에서 자동 주입됨 (optional 체크)
            ]
        else:
            # SQS Polling 모드일 때만 SQS_QUEUE_URL 필수
            required_vars = [
                'SQS_QUEUE_URL',
                'S3_BUCKET_RAW',
                'POSTGRES_HOST',
                'POSTGRES_DB',
                'POSTGRES_USER'
                # POSTGRES_PASSWORD는 Secrets Manager에서 자동 주입됨 (optional 체크)
            ]
        
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        
        if missing_vars:
            raise MemiVideoProcessorError(
                f"Missing required environment variables: {', '.join(missing_vars)}"
            )
        
        # POSTGRES_PASSWORD가 없으면 경고만 출력 (Secrets Manager가 주입할 수 있음)
        if not self.postgres_password:
            logger.warning("POSTGRES_PASSWORD not found in environment - will be injected by Secrets Manager")
    
    def receive_message(self) -> Optional[Dict[str, Any]]:
        """SQS에서 메시지 수신 (Long Polling)"""
        try:
            logger.info("Polling SQS for messages...")
            
            response = self.sqs_client.receive_message(
                QueueUrl=self.sqs_queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,  # Long polling
                VisibilityTimeout=3600,  # 60분 (AI 분석은 오래 걸림)
                MessageAttributeNames=['All']
            )
            
            messages = response.get('Messages', [])
            
            if not messages:
                logger.info("No messages in queue")
                return None
            
            message = messages[0]
            logger.info(f"Received message: {message['MessageId']}")
            
            return message
            
        except ClientError as e:
            logger.error(f"Error receiving message from SQS: {e}")
            raise MemiVideoProcessorError(f"SQS receive error: {e}")
    
    def parse_s3_event(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """S3 이벤트 메시지 파싱"""
        try:
            # SQS 메시지 바디 파싱
            body = json.loads(message['Body'])
            
            # S3 이벤트 레코드 추출
            if 'Records' not in body:
                raise MemiVideoProcessorError("Invalid S3 event format: no Records found")
            
            record = body['Records'][0]
            s3_info = record['s3']
            
            bucket = s3_info['bucket']['name']
            key = s3_info['object']['key']
            event_time = record['eventTime']
            
            # video_id 추출 (key에서)
            # 예: videos/123/original.mp4 -> video_id = 123
            video_id = self._extract_video_id(key)
            
            logger.info(f"S3 Event: bucket={bucket}, key={key}, video_id={video_id}")
            
            return {
                'bucket': bucket,
                'key': key,
                'video_id': video_id,
                'event_time': event_time,
                'size': s3_info['object'].get('size', 0)
            }
            
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Error parsing S3 event: {e}")
            raise MemiVideoProcessorError(f"S3 event parsing error: {e}")
    
    def _extract_video_id(self, s3_key: str) -> int:
        """S3 key에서 video_id 추출"""
        try:
            # 예: videos/123/original.mp4 -> 123
            parts = s3_key.split('/')
            if len(parts) >= 2 and parts[0] == 'videos':
                return int(parts[1])
            else:
                raise ValueError(f"Invalid S3 key format: {s3_key}")
        except (ValueError, IndexError) as e:
            logger.error(f"Failed to extract video_id from key: {s3_key}")
            raise MemiVideoProcessorError(f"Video ID extraction error: {e}")
    
    def download_video_from_s3(self, bucket: str, key: str) -> Path:
        """S3에서 비디오 다운로드"""
        try:
            # 로컬 파일 경로 생성
            local_filename = Path(key).name
            local_path = self.videos_dir / local_filename
            
            logger.info(f"Downloading s3://{bucket}/{key} -> {local_path}")
            
            # S3에서 다운로드
            self.s3_client.download_file(bucket, key, str(local_path))
            
            file_size = local_path.stat().st_size / (1024 * 1024)  # MB
            logger.info(f"Downloaded {file_size:.2f} MB")
            
            return local_path
            
        except ClientError as e:
            logger.error(f"Error downloading from S3: {e}")
            raise MemiVideoProcessorError(f"S3 download error: {e}")
    
    def run_memi_analysis(self, video_path: Path, video_id: int, output_dir: Path) -> bool:
        """
        Memi AI 분석 실행
        
        로컬 커맨드:
        python run.py --input "video.mp4" --output "result" 
                      --detector-weights "models/yolov8x_person_face.pt" 
                      --checkpoint "models/model_imdb_cross_person_4.22_99.46.pth.tar" 
                      --mebow-cfg "experiments/coco/segm-4_lr1e-3.yaml" 
                      --vlm-path "checkpoints/llava-fastvithd_0.5b_stage2" 
                      --device "cuda:0" --with-persons --draw
        """
        try:
            logger.info("=" * 80)
            logger.info("Starting Memi AI Video Analysis")
            logger.info("=" * 80)
            
            # run.py 경로
            run_py = self.work_dir / 'memi' / 'run.py'
            if not run_py.exists():
                # Docker 컨테이너에서 실행 중
                run_py = Path('/workspace/memi/run.py')
            
            # 명령어 구성 (--draw 플래그 제거하여 비디오 생성 스킵)
            cmd = [
                'python3', str(run_py),
                '--video-id', str(video_id),
                '--input', str(video_path),
                '--output', str(output_dir),
                '--detector-weights', self.detector_weights,
                '--checkpoint', self.mivolo_checkpoint,
                '--mebow-cfg', self.mebow_cfg,
                '--vlm-path', self.vlm_path,
                '--device', self.device,
                '--with-persons'
                # --draw 플래그 제거: 비디오 생성하지 않음 (데이터만 처리)
            ]
            
            logger.info(f"Executing: {' '.join(cmd)}")
            
            # 환경 변수 설정 (PostgreSQL)
            env = os.environ.copy()
            env.update({
                'POSTGRES_HOST': self.postgres_host,
                'POSTGRES_PORT': self.postgres_port,
                'POSTGRES_DB': self.postgres_db,
                'POSTGRES_USER': self.postgres_user,
                'POSTGRES_PASSWORD': self.postgres_password,
            })
            
            # 서브프로세스 실행
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
                bufsize=1  # Line buffered
            )
            
            # 실시간 로그 출력 (진행률은 memi/run.py에서 직접 DB 업데이트)
            for line in process.stdout:
                logger.info(f"[MEMI] {line.rstrip()}")
            
            # 프로세스 종료 대기
            return_code = process.wait()
            
            if return_code == 0:
                logger.info("=" * 80)
                logger.info("Memi AI Analysis Completed Successfully")
                logger.info("Results saved to PostgreSQL + pgvector")
                logger.info("=" * 80)
                return True
            else:
                logger.error(f"Memi analysis failed with return code: {return_code}")
                return False
            
        except Exception as e:
            logger.error(f"Error running memi analysis: {e}")
            logger.exception("Full traceback:")
            return False
    
    def delete_message(self, message: Dict[str, Any]):
        """처리 완료된 메시지를 SQS에서 삭제"""
        try:
            receipt_handle = message['ReceiptHandle']
            
            logger.info(f"Deleting message: {message['MessageId']}")
            
            self.sqs_client.delete_message(
                QueueUrl=self.sqs_queue_url,
                ReceiptHandle=receipt_handle
            )
            
            logger.info("Message deleted successfully")
            
        except ClientError as e:
            logger.error(f"Error deleting message: {e}")
            raise MemiVideoProcessorError(f"Message deletion error: {e}")
    
    def cleanup(self, video_path: Path):
        """임시 파일 정리"""
        try:
            if video_path.exists():
                video_path.unlink()
                logger.info(f"Cleaned up temporary file: {video_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup {video_path}: {e}")
    
    def process_message(self, message: Dict[str, Any]) -> bool:
        """
        단일 메시지 처리 파이프라인
        1. S3 이벤트 파싱
        2. S3에서 비디오 다운로드
        3. Memi AI 분석 실행 (PostgreSQL + pgvector에 저장)
        4. SQS 메시지 삭제
        5. 임시 파일 정리
        """
        video_path = None
        
        try:
            logger.info("=" * 80)
            logger.info("Starting Video Processing Pipeline")
            logger.info("=" * 80)
            
            # 1. S3 이벤트 파싱
            s3_event = self.parse_s3_event(message)
            video_id = s3_event['video_id']
            
            # 2. S3에서 비디오 다운로드
            video_path = self.download_video_from_s3(
                s3_event['bucket'],
                s3_event['key']
            )
            
            # 3. 출력 디렉토리 생성
            output_dir = self.results_dir / f"video_{video_id}"
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 4. Memi AI 분석 실행
            success = self.run_memi_analysis(video_path, video_id, output_dir)
            
            if not success:
                logger.error("Memi analysis failed")
                return False
            
            # 5. 성공한 메시지 삭제
            self.delete_message(message)
            
            # 6. 임시 파일 정리
            self.cleanup(video_path)
            
            logger.info("=" * 80)
            logger.info("Video Processing Pipeline Completed Successfully")
            logger.info("=" * 80)
            
            return True
            
        except MemiVideoProcessorError as e:
            logger.error(f"Processing failed: {e}")
            return False
        
        except Exception as e:
            logger.error(f"Unexpected error during processing: {e}")
            logger.exception("Full traceback:")
            return False
        
        finally:
            # 실패 시에도 임시 파일 정리
            if video_path and video_path.exists():
                self.cleanup(video_path)
    
    def run(self):
        """메인 실행 루프"""
        logger.info("Memi Video Processor started")
        
        try:
            # Lambda로부터 직접 S3 정보를 받은 경우
            if self.direct_s3_bucket and self.direct_s3_key:
                logger.info(f"Processing direct S3 object: s3://{self.direct_s3_bucket}/{self.direct_s3_key}")
                logger.info(f"Message ID: {self.message_id}")
                
                try:
                    # S3 정보로 가상 메시지 생성
                    from datetime import datetime
                    message = {
                        'MessageId': self.message_id or 'direct-lambda-call',
                        'ReceiptHandle': 'N/A',  # SQS 삭제 불필요
                        'Body': json.dumps({
                            'Records': [{
                                'eventTime': datetime.utcnow().isoformat() + 'Z',
                                's3': {
                                    'bucket': {'name': self.direct_s3_bucket},
                                    'object': {'key': self.direct_s3_key}
                                }
                            }]
                        })
                    }
                    
                    logger.info("Processing message with direct S3 info...")
                    success = self.process_message(message)
                    
                    if success:
                        logger.info("Job completed successfully")
                        sys.exit(0)
                    else:
                        logger.error("Job failed")
                        sys.exit(1)
                except Exception as e:
                    logger.error(f"Error processing direct S3 message: {e}")
                    logger.exception("Full traceback:")
                    sys.exit(1)
            
            # SQS Polling 모드 (기존 방식)
            logger.info("Polling SQS for messages...")
            
            # Batch Job은 단일 메시지만 처리
            message = self.receive_message()
            
            if message:
                success = self.process_message(message)
                
                if success:
                    logger.info("Job completed successfully")
                    sys.exit(0)  # 정상 종료
                else:
                    logger.error("Job failed")
                    sys.exit(1)  # 실패 종료 (재시도 트리거)
            else:
                logger.info("No messages to process")
                sys.exit(0)  # 메시지 없음도 정상 종료
                
        except Exception as e:
            logger.error(f"Fatal error in main loop: {e}")
            logger.exception("Full traceback:")
            sys.exit(1)


def main():
    """진입점"""
    try:
        processor = MemiVideoProcessor()
        processor.run()
    except MemiVideoProcessorError as e:
        logger.error(f"Initialization failed: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        logger.exception("Full traceback:")
        sys.exit(1)


if __name__ == "__main__":
    main()
