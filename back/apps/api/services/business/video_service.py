"""
VideoService - 비디오 관리 비즈니스 로직
- 비디오 업로드/다운로드
- S3 스토리지 관리
- 메타데이터 추출
- 티어링 관리
"""

import boto3
import logging
from typing import Optional, Dict, Any, Tuple
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from botocore.exceptions import ClientError

from apps.db.models import Video

logger = logging.getLogger(__name__)


class VideoService:
    """비디오 관리 서비스"""

    def __init__(self):
        """S3 클라이언트 초기화"""
        self.s3_client = None
        self._init_s3_client()

    def _init_s3_client(self):
        """S3 클라이언트 초기화"""
        try:
            self.s3_client = boto3.client(
                "s3",
                region_name=settings.AWS_S3_REGION_NAME,
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
            )
            logger.info("S3 client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    def create_video(
        self,
        video_file: UploadedFile,
        name: str,
        description: str = "",
        recorded_at: Optional[str] = None,
    ) -> Tuple[Video, Dict[str, Any]]:
        """
        비디오 생성 및 S3 업로드

        Args:
            video_file: 업로드된 비디오 파일
            name: 비디오 이름
            description: 비디오 설명
            recorded_at: 촬영 시간

        Returns:
            (Video 객체, 메타데이터 dict)
        """
        logger.info(f"Creating video: {name}")

        # 1. Video 객체 생성 (임시)
        video = Video.objects.create(
            name=name,
            filename=video_file.name,
            original_filename=video_file.name,
            description=description,
            file_size=video_file.size,
            recorded_at=recorded_at,
        )

        # 2. S3 업로드
        s3_key = None
        if self.s3_client:
            s3_key = self._upload_to_s3(video, video_file)

        # 3. Video 객체 업데이트
        if s3_key:
            video.s3_key = s3_key
            video.s3_raw_key = s3_key
            video.s3_bucket = settings.AWS_STORAGE_BUCKET_NAME
            video.save(update_fields=["s3_key", "s3_raw_key", "s3_bucket"])
            logger.info(f"Video uploaded to S3: s3://{video.s3_bucket}/{s3_key}")

        # 4. 메타데이터 추출 (비동기로 처리 가능)
        metadata = self._extract_metadata(video_file)

        return video, metadata

    def _upload_to_s3(self, video: Video, video_file: UploadedFile) -> Optional[str]:
        """
        S3에 비디오 업로드

        Args:
            video: Video 객체
            video_file: 업로드할 파일

        Returns:
            S3 키 또는 None
        """
        try:
            bucket_name = settings.AWS_STORAGE_BUCKET_NAME
            s3_key = f"videos/{video.video_id}/{video_file.name}"

            self.s3_client.upload_fileobj(
                video_file,
                bucket_name,
                s3_key,
                ExtraArgs={"ContentType": video_file.content_type},
            )

            logger.info(f"Uploaded to S3: s3://{bucket_name}/{s3_key}")
            return s3_key

        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return None

    def _extract_metadata(self, video_file: UploadedFile) -> Dict[str, Any]:
        """
        비디오 메타데이터 추출

        Args:
            video_file: 비디오 파일

        Returns:
            메타데이터 dict
        """
        metadata = {
            "file_size": video_file.size,
            "content_type": video_file.content_type,
            "filename": video_file.name,
        }

        # TODO: ffprobe 등을 사용한 상세 메타데이터 추출
        # - duration, fps, resolution 등

        return metadata

    def get_video(self, video_id: int) -> Optional[Video]:
        """
        비디오 조회

        Args:
            video_id: 비디오 ID

        Returns:
            Video 객체 또는 None
        """
        try:
            video = Video.objects.get(video_id=video_id)
            # 검색 카운트 증가
            video.increment_search_count()
            return video
        except Video.DoesNotExist:
            logger.warning(f"Video not found: {video_id}")
            return None

    def delete_video(self, video_id: int) -> bool:
        """
        비디오 삭제 (S3 파일 포함)

        Args:
            video_id: 비디오 ID

        Returns:
            성공 여부
        """
        try:
            video = Video.objects.get(video_id=video_id)
            video.delete()  # Model의 delete() 메서드가 S3 파일도 삭제
            logger.info(f"Video deleted: {video_id}")
            return True
        except Video.DoesNotExist:
            logger.warning(f"Video not found: {video_id}")
            return False
        except Exception as e:
            logger.error(f"Failed to delete video: {e}")
            return False

    def generate_presigned_url(
        self, video: Video, expires_in: int = 3600
    ) -> Optional[str]:
        """
        S3 Presigned URL 생성

        Args:
            video: Video 객체
            expires_in: URL 유효 시간 (초)

        Returns:
            Presigned URL 또는 None
        """
        if not self.s3_client:
            return None

        s3_key = video.get_current_s3_key()
        if not s3_key:
            return None

        try:
            bucket_name = video.s3_bucket or settings.AWS_STORAGE_BUCKET_NAME
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": s3_key},
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None

    def update_tier(self, video: Video, new_tier: str) -> bool:
        """
        비디오 티어 변경

        Args:
            video: Video 객체
            new_tier: 새로운 티어 ('hot', 'warm', 'cold')

        Returns:
            성공 여부
        """
        if new_tier not in ["hot", "warm", "cold"]:
            logger.error(f"Invalid tier: {new_tier}")
            return False

        try:
            # TODO: S3 스토리지 클래스 변경 (STANDARD -> STANDARD_IA -> GLACIER)
            video.data_tier = new_tier
            video.save(update_fields=["data_tier"])
            logger.info(f"Video tier updated: {video.video_id} -> {new_tier}")
            return True
        except Exception as e:
            logger.error(f"Failed to update tier: {e}")
            return False

    def get_videos_by_tier(self, tier: str) -> list:
        """
        티어별 비디오 조회

        Args:
            tier: 티어 ('hot', 'warm', 'cold')

        Returns:
            Video 객체 리스트
        """
        return list(Video.objects.filter(data_tier=tier).order_by("-hotness_score"))

    def get_video_statistics(self, video: Video) -> Dict[str, Any]:
        """
        비디오 통계 정보

        Args:
            video: Video 객체

        Returns:
            통계 dict
        """
        return {
            "video_id": video.video_id,
            "name": video.name,
            "search_count": video.search_count,
            "total_searches": video.total_searches,
            "hotness_score": video.hotness_score,
            "data_tier": video.data_tier,
            "last_accessed": video.last_accessed,
            "event_count": video.events.count(),
            "session_count": video.prompt_sessions.count(),
            "analysis_status": video.analysis_status,
        }


# Singleton 인스턴스
_video_service = None


def get_video_service() -> VideoService:
    """VideoService 싱글톤 인스턴스 반환"""
    global _video_service
    if _video_service is None:
        _video_service = VideoService()
    return _video_service
