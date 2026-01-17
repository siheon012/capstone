from django.db import models
from django.utils import timezone
from datetime import timedelta
import json


class Video(models.Model):
    """비디오 메타데이터 모델 - 프론트에서 업로드된 비디오 정보"""

    video_id = models.AutoField(primary_key=True)

    # 기본 정보 (프론트에서 제공)
    filename = models.CharField(max_length=255, help_text="Original filename")

    # S3 경로들 (업로드 시 생성)
    s3_raw_key = models.CharField(max_length=500, help_text="S3 raw video key")
    s3_result_key = models.CharField(
        max_length=500, null=True, blank=True, help_text="S3 analysis result key"
    )
    s3_thumbnail_key = models.CharField(
        max_length=500, null=True, blank=True, help_text="S3 thumbnail key"
    )

    # 메타데이터 (프론트에서 추출 후 업데이트)
    duration = models.FloatField(
        null=True, blank=True, help_text="Video duration in seconds"
    )
    file_size = models.BigIntegerField(
        null=True, blank=True, help_text="File size in bytes"
    )
    width = models.IntegerField(
        null=True, blank=True, help_text="Video width in pixels"
    )
    height = models.IntegerField(
        null=True, blank=True, help_text="Video height in pixels"
    )
    fps = models.FloatField(null=True, blank=True, help_text="Frames per second")

    # 시간 정보
    upload_date = models.DateTimeField(auto_now_add=True)
    recorded_at = models.DateTimeField(
        null=True, blank=True, help_text="When video was recorded"
    )

    # 분석 상태
    analysis_status = models.CharField(
        max_length=20,
        default="pending",
        choices=[
            ("pending", "대기중"),
            ("processing", "분석중"),
            ("completed", "완료"),
            ("failed", "실패"),
        ],
    )
    analysis_progress = models.IntegerField(
        default=0, help_text="Analysis progress 0-100"
    )

    # SQS Job 추적
    job_id = models.CharField(
        max_length=100, null=True, blank=True, help_text="AWS Batch job ID"
    )

    # 사용 빈도 추적 (Hot/Warm/Cold 결정용)
    total_searches = models.IntegerField(
        default=0, help_text="Total times this video was searched"
    )
    last_searched = models.DateTimeField(null=True, blank=True)

    def update_search_stats(self):
        """검색할 때마다 호출하여 통계 업데이트"""
        self.total_searches += 1
        self.last_searched = timezone.now()
        self.save(update_fields=["total_searches", "last_searched"])

    @property
    def search_frequency_score(self):
        """검색 빈도 점수 계산 (Hot/Warm/Cold 판정용)"""
        if not self.last_searched:
            return 0

        days_since_search = (timezone.now() - self.last_searched).days

        # 최근성 가중치 (최근일수록 높은 점수)
        recency_weight = max(0, 100 - days_since_search)

        # 총 검색 횟수 가중치
        frequency_weight = min(self.total_searches * 10, 100)

        return (recency_weight * 0.7) + (frequency_weight * 0.3)

    def __str__(self):
        return f"Video {self.video_id}: {self.filename}"

    class Meta:
        db_table = "videos"
        indexes = [
            models.Index(fields=["analysis_status"]),
            models.Index(fields=["last_searched"]),
            models.Index(fields=["upload_date"]),
        ]


class VideoAnalysis(models.Model):
    """비디오 분석 결과 - AI 모델이 생성하는 분석 데이터"""

    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name="analyses")

    # 분석 위치
    frame_timestamp = models.FloatField(help_text="Frame time in seconds")
    frame_number = models.IntegerField(null=True, blank=True, help_text="Frame number")

    # 분석 결과 (JSON 구조)
    detected_people = models.JSONField(
        default=list, help_text="[{'gender': 'male', 'age': 25, 'confidence': 0.9}]"
    )
    detected_actions = models.JSONField(
        default=list, help_text="[{'action': 'walking', 'confidence': 0.8}]"
    )
    detected_objects = models.JSONField(
        default=list, help_text="[{'object': 'bag', 'confidence': 0.7}]"
    )
    scene_description = models.TextField(
        help_text="Human-readable scene description for RAG"
    )

    # Bedrock 임베딩 (pgvector 설치 전까지 JSON으로 저장)
    embedding_json = models.JSONField(
        null=True, blank=True, help_text="Bedrock embedding vector as JSON"
    )
    embedding_model = models.CharField(
        max_length=100, default="amazon.titan-embed-text-v1"
    )

    # Hot/Warm/Cold 계층 관리
    storage_tier = models.CharField(
        max_length=10,
        default="hot",
        choices=[
            ("hot", "Hot - PostgreSQL에서 즉시 검색"),
            ("warm", "Warm - S3에서 로드 후 검색"),
            ("cold", "Cold - Glacier에서 복원 후 검색"),
        ],
    )

    # 사용 빈도 추적
    search_count = models.IntegerField(default=0)
    last_accessed = models.DateTimeField(null=True, blank=True)

    # 분석 메타데이터
    model_version = models.CharField(max_length=50, default="v1.0")
    confidence_score = models.FloatField(
        default=0.0, help_text="Overall confidence of this analysis"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def update_access_stats(self):
        """검색/접근할 때마다 호출"""
        self.search_count += 1
        self.last_accessed = timezone.now()
        self.save(update_fields=["search_count", "last_accessed"])

        # 부모 Video의 검색 통계도 업데이트
        self.video.update_search_stats()

    @property
    def hotness_score(self):
        """Hot/Warm/Cold 판정을 위한 점수 계산"""
        if not self.last_accessed:
            return 0

        days_since_access = (timezone.now() - self.last_accessed).days

        # 최근성 점수 (30일 기준)
        recency_score = max(0, (30 - days_since_access) / 30 * 100)

        # 빈도 점수 (로그 스케일)
        import math

        frequency_score = min(math.log(self.search_count + 1) * 20, 100)

        return (recency_score * 0.6) + (frequency_score * 0.4)

    def __str__(self):
        return f"Analysis {self.id}: {self.video.filename} at {self.frame_timestamp}s"

    class Meta:
        db_table = "video_analyses"
        indexes = [
            models.Index(fields=["video", "frame_timestamp"]),
            models.Index(fields=["storage_tier"]),
            models.Index(fields=["last_accessed"]),
            models.Index(fields=["created_at"]),
        ]


class AnalysisJob(models.Model):
    """AWS Batch 작업 추적"""

    job_id = models.CharField(max_length=100, primary_key=True)
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name="jobs")

    # AWS Batch 정보
    batch_job_id = models.CharField(max_length=200, null=True, blank=True)
    batch_job_queue = models.CharField(max_length=100, default="video-analysis")

    # 상태 추적
    status = models.CharField(
        max_length=20,
        default="submitted",
        choices=[
            ("submitted", "제출됨"),
            ("pending", "대기중"),
            ("runnable", "실행가능"),
            ("running", "실행중"),
            ("succeeded", "성공"),
            ("failed", "실패"),
        ],
    )

    # 시간 추적
    submitted_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    # 에러 정보
    error_message = models.TextField(null=True, blank=True)
    retry_count = models.IntegerField(default=0)

    @property
    def duration(self):
        """작업 수행 시간 계산"""
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at).total_seconds()
        return None

    def __str__(self):
        return f"Job {self.job_id}: {self.video.filename} - {self.status}"

    class Meta:
        db_table = "analysis_jobs"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["submitted_at"]),
            models.Index(fields=["video"]),
        ]
