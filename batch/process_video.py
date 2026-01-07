#!/usr/bin/env python3
"""
AWS Batch GPU Video Processor with video-analysis
S3에서 비디오를 다운로드하고 video-analysis run.py를 직접 실행 (GPU 사용)
"""

import os
import json
import logging
import sys
import subprocess
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def download_from_s3(bucket: str, key: str, local_path: str, region: str = 'ap-northeast-2'):
    """S3에서 파일 다운로드"""
    try:
        logger.info(f"📥 Downloading s3://{bucket}/{key} to {local_path}")
        
        s3_client = boto3.client('s3', region_name=region)
        s3_client.download_file(bucket, key, local_path)
        
        logger.info(f"✅ Download complete: {local_path}")
        return True
        
    except ClientError as e:
        logger.error(f"❌ S3 download failed: {e}")
        return False


def run_video_analysis(video_id: int, video_path: str, output_dir: str = '/app/output'):
    """video-analysis run.py 실행"""
    try:
        logger.info("=" * 60)
        logger.info("🚀 Starting video analysis pipeline")
        logger.info("=" * 60)
        logger.info(f"Video ID: {video_id}")
        logger.info(f"Video Path: {video_path}")
        logger.info(f"Output Dir: {output_dir}")
        
        # video-analysis run.py 명령어 구성
        cmd = [
            'python', '/app/video-analysis/run.py',
            '--video-id', str(video_id),
            '--input', video_path,
            '--output', output_dir,
            '--detector-weights', os.getenv('DETECTOR_WEIGHTS', '/app/models/yolov8x_person_face.pt'),
            '--checkpoint', os.getenv('MIVOLO_CHECKPOINT', '/app/models/model_imdb_cross_person_4.24_99.46.pth.tar'),
            '--mebow-cfg', os.getenv('MEBOW_CFG', '/app/config/mebow.yaml'),
            '--vlm-path', os.getenv('VLM_PATH', '/app/checkpoints/llava-fastvithd_0.5b_stage2'),
            '--with-persons',
            '--device', 'cuda'
        ]
        
        logger.info(f"Command: {' '.join(cmd)}")
        
        # 실행
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # 실시간 로그 출력
        for line in process.stdout:
            print(line, end='')
        
        # 프로세스 완료 대기
        return_code = process.wait()
        
        if return_code == 0:
            logger.info("=" * 60)
            logger.info(f"✅ Video analysis completed successfully")
            logger.info("=" * 60)
            return True
        else:
            logger.error(f"❌ Video analysis failed with exit code: {return_code}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error running video analysis: {e}")
        logger.exception("Full traceback:")
        return False


def main():
    """메인 실행 함수"""
    try:
        logger.info("🚀 AWS Batch GPU Video Processor started")
        
        # 환경 변수에서 S3 정보 가져오기
        s3_bucket = os.environ.get('S3_BUCKET')
        s3_key = os.environ.get('S3_KEY')
        video_id = os.environ.get('VIDEO_ID', '1')
        aws_region = os.environ.get('AWS_DEFAULT_REGION', 'ap-northeast-2')
        
        if not s3_bucket or not s3_key:
            logger.error("❌ S3_BUCKET and S3_KEY environment variables are required")
            sys.exit(1)
        
        logger.info(f"S3 Bucket: {s3_bucket}")
        logger.info(f"S3 Key: {s3_key}")
        logger.info(f"Video ID: {video_id}")
        
        # 비디오 파일 다운로드
        video_filename = os.path.basename(s3_key)
        local_video_path = f"/tmp/{video_id}_{video_filename}"
        
        if not download_from_s3(s3_bucket, s3_key, local_video_path, aws_region):
            logger.error("❌ Failed to download video from S3")
            sys.exit(1)
        
        # video analysis 실행
        output_dir = '/app/output'
        os.makedirs(output_dir, exist_ok=True)
        
        success = run_video_analysis(int(video_id), local_video_path, output_dir)
        
        # 임시 파일 정리
        try:
            if os.path.exists(local_video_path):
                os.remove(local_video_path)
                logger.info(f"🗑️ Temporary file deleted: {local_video_path}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to delete temporary file: {e}")
        
        if success:
            logger.info("✅ Job completed successfully")
            sys.exit(0)
        else:
            logger.error("❌ Job failed")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        logger.exception("Full traceback:")
        sys.exit(1)


if __name__ == "__main__":
    main()
