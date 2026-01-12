"""
Video 모델
비디오 파일 메타데이터 및 S3 스토리지 관리
"""
import boto3
import logging
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


class Video(models.Model):
    """비디오 파일 모델 - S3 스토리지 및 티어링 지원"""
    
    # Primary Key
    video_id = models.AutoField(primary_key=True)
    
    # 기본 정보
    name = models.CharField(max_length=255)
    filename = models.CharField(max_length=255, help_text="Display filename")
    original_filename = models.CharField(max_length=255, help_text="Original uploaded filename")
    description = models.TextField(blank=True)
    
    # 시간 정보
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    upload_date = models.DateTimeField(auto_now_add=True)
    recorded_at = models.DateTimeField(null=True, blank=True, help_text="When video was recorded")
    
    # 파일 메타데이터 (기존 필드 유지 - DB 호환성)
    file_size = models.BigIntegerField(null=True, blank=True, help_text="File size in bytes")
    duration = models.FloatField(null=True, blank=True, help_text="Video duration in seconds")
    frame_rate = models.FloatField(null=True, blank=True, help_text="Frames per second")
    fps = models.FloatField(null=True, blank=True, help_text="Frames per second (duplicate)")
    resolution_width = models.IntegerField(null=True, blank=True, help_text="Video width in pixels")
    resolution_height = models.IntegerField(null=True, blank=True, help_text="Video height in pixels")
    width = models.IntegerField(null=True, blank=True, help_text="Video width (duplicate)")
    height = models.IntegerField(null=True, blank=True, help_text="Video height (duplicate)")
    
    # S3 스토리지 (원본 필드명 유지 - DB 스키마 변경 없음)
    s3_bucket = models.CharField(max_length=63, default='capstone-video-bucket')
    s3_key = models.CharField(max_length=1024, help_text="Primary S3 object key")
    s3_raw_key = models.CharField(max_length=500, help_text="S3 raw video key")
    s3_result_key = models.CharField(max_length=500, null=True, blank=True, help_text="S3 analysis result key")
    thumbnail_s3_key = models.CharField(max_length=1024, blank=True)
    s3_thumbnail_key = models.CharField(max_length=500, null=True, blank=True, help_text="S3 thumbnail key")
    
    # 메타데이터 추출 상태
    metadata_extracted = models.BooleanField(default=False)
    metadata_extraction_job_id = models.CharField(max_length=255, blank=True)
    
    # 분석 상태
    analysis_status = models.CharField(max_length=20, default='pending', choices=[
        ('pending', '대기중'),
        ('processing', '분석중'), 
        ('completed', '완료'),
        ('failed', '실패')
    ])
    analysis_progress = models.IntegerField(default=0, help_text="Analysis progress 0-100")
    
    # AI 영상 요약 (VLM)
    summary = models.TextField(blank=True, null=True, help_text="AI generated video summary")
    summary_status = models.CharField(max_length=20, default='pending', choices=[
        ('pending', '대기중'),
        ('generating', '생성중'),
        ('completed', '완료'),
        ('failed', '실패')
    ], help_text="Summary generation status")
    
    # AWS Batch Job 추적
    job_id = models.CharField(max_length=100, null=True, blank=True, help_text="AWS Batch job ID")
    
    # 검색 및 접근 통계
    search_count = models.IntegerField(default=0)
    total_searches = models.IntegerField(default=0, help_text="Total times searched")
    last_accessed = models.DateTimeField(auto_now_add=True)
    last_searched = models.DateTimeField(null=True, blank=True)
    hotness_score = models.FloatField(default=0.0, help_text="0-100 hotness score")
    
    # 데이터 티어링 (Hot/Warm/Cold)
    data_tier = models.CharField(max_length=10, choices=[
        ('hot', 'Hot - Frequently accessed'),
        ('warm', 'Warm - Occasionally accessed'),
        ('cold', 'Cold - Rarely accessed')
    ], default='hot')
    warm_s3_key = models.CharField(max_length=1024, blank=True, help_text="Warm tier S3 key")
    cold_s3_key = models.CharField(max_length=1024, blank=True, help_text="Cold tier S3 key")
    
    class Meta:
        db_table = 'db_video'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['data_tier', 'hotness_score']),
            models.Index(fields=['search_count', 'last_accessed']),
            models.Index(fields=['metadata_extracted']),
            models.Index(fields=['analysis_status']),
        ]
    
    def increment_search_count(self):
        """검색 횟수 증가 및 hotness 점수 업데이트"""
        from apps.api.services.tier_manager import TierManager
        self.search_count += 1
        self.total_searches += 1
        self.last_accessed = timezone.now()
        self.last_searched = timezone.now()
        self.hotness_score = TierManager.calculate_hotness_score(self)
        self.save(update_fields=['search_count', 'total_searches', 'last_accessed', 'last_searched', 'hotness_score'])
    
    def update_search_stats(self):
        """Alias for increment_search_count (backward compatibility)"""
        self.increment_search_count()
    
    def get_current_s3_key(self):
        """현재 티어에 맞는 S3 키 반환"""
        if self.data_tier == 'warm' and self.warm_s3_key:
            return self.warm_s3_key
        elif self.data_tier == 'cold' and self.cold_s3_key:
            return self.cold_s3_key
        return self.s3_key or self.s3_raw_key
    
    @property
    def file_path(self):
        """비디오 파일 경로 - S3 Presigned URL"""
        s3_key = self.get_current_s3_key()
        if not s3_key:
            return f"/uploads/videos/{self.name or self.filename}"
        
        try:
            s3_client = boto3.client(
                's3',
                region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'ap-northeast-2'),
                aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
                aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
            )
            
            bucket_name = self.s3_bucket or getattr(settings, 'AWS_STORAGE_BUCKET_NAME', 'capstone-dev-raw')
            
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_name, 'Key': s3_key},
                ExpiresIn=3600
            )
            return presigned_url
        except Exception as e:
            logger.warning(f"S3 presigned URL generation failed: {e}")
            return f"/uploads/videos/{self.name or self.filename}"
    
    @property
    def computed_thumbnail_path(self):
        """썸네일 경로 - S3 Presigned URL"""
        if self.s3_thumbnail_key:
            try:
                s3_client = boto3.client('s3', region_name='ap-northeast-2')
                return s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': getattr(settings, 'AWS_THUMBNAILS_BUCKET_NAME', 'capstone-dev-thumbnails'),
                        'Key': self.s3_thumbnail_key
                    },
                    ExpiresIn=3600
                )
            except Exception as e:
                logger.warning(f"Thumbnail URL generation failed: {e}")
        
        # Fallback
        thumbnail_name = self.name or self.filename
        if thumbnail_name:
            base_name = thumbnail_name.rsplit('.', 1)[0] if '.' in thumbnail_name else thumbnail_name
            return f"/uploads/thumbnails/{base_name}.png"
        return None
    
    def delete(self, *args, **kwargs):
        """비디오 삭제 시 S3 파일 및 관련 데이터 삭제"""
        logger.info(f"Deleting video: {self.name} (ID: {self.video_id})")
        
        # S3 클라이언트 초기화
        try:
            s3_client = boto3.client(
                's3',
                region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'ap-northeast-2'),
                aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
                aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
            )
        except Exception as e:
            logger.error(f"S3 client initialization failed: {e}")
            s3_client = None
        
        if s3_client:
            # 1. Raw 비디오 삭제
            if self.s3_raw_key:
                try:
                    bucket = getattr(settings, 'AWS_RAW_BUCKET_NAME', 'capstone-dev-raw')
                    s3_client.delete_object(Bucket=bucket, Key=self.s3_raw_key)
                    logger.info(f"Deleted raw video: s3://{bucket}/{self.s3_raw_key}")
                except Exception as e:
                    logger.error(f"Failed to delete raw video: {e}")
            
            # 2. 썸네일 삭제
            if self.s3_thumbnail_key:
                try:
                    thumbnail_bucket = getattr(settings, 'AWS_THUMBNAILS_BUCKET_NAME', 'capstone-dev-thumbnails')
                    s3_client.delete_object(Bucket=thumbnail_bucket, Key=self.s3_thumbnail_key)
                    logger.info(f"Deleted thumbnail: s3://{thumbnail_bucket}/{self.s3_thumbnail_key}")
                except Exception as e:
                    logger.error(f"Failed to delete thumbnail: {e}")
            
            # 3. 하이라이트 삭제
            try:
                highlights_bucket = getattr(settings, 'AWS_HIGHLIGHTS_BUCKET_NAME', 'capstone-dev-highlights')
                video_prefix = f"highlights/{self.video_id}/"
                response = s3_client.list_objects_v2(Bucket=highlights_bucket, Prefix=video_prefix)
                if 'Contents' in response:
                    for obj in response['Contents']:
                        s3_client.delete_object(Bucket=highlights_bucket, Key=obj['Key'])
                        logger.info(f"Deleted highlight: {obj['Key']}")
            except Exception as e:
                logger.error(f"Failed to delete highlights: {e}")
            
            # 4. Warm/Cold 티어 파일 삭제
            bucket = getattr(settings, 'AWS_RAW_BUCKET_NAME', 'capstone-dev-raw')
            for tier_key in [self.warm_s3_key, self.cold_s3_key]:
                if tier_key:
                    try:
                        s3_client.delete_object(Bucket=bucket, Key=tier_key)
                        logger.info(f"Deleted tier file: {tier_key}")
                    except Exception as e:
                        logger.error(f"Failed to delete tier file: {e}")
        
        # DB에서 삭제 (CASCADE로 관련 데이터 자동 삭제)
        try:
            session_count = self.prompt_sessions.count()
            event_count = self.events.count()
            logger.info(f"Deleting: {session_count} sessions, {event_count} events")
            self.prompt_sessions.clear()
        except Exception as e:
            logger.error(f"Failed to clear relations: {e}")
        
        super().delete(*args, **kwargs)
        logger.info(f"Video deleted: {self.name} (ID: {self.video_id})")
    
    def __str__(self):
        return f"{self.name or self.filename} ({self.data_tier})"
