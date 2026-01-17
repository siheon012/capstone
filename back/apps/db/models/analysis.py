"""
Analysis 모델
비디오 분석 결과 및 Job 추적
"""

import boto3
import logging
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone
from datetime import datetime
from pgvector.django import VectorField

logger = logging.getLogger(__name__)


class VideoAnalysis(models.Model):
    """비디오 분석 결과"""

    # 연관 비디오
    video = models.ForeignKey(
        "db.Video", on_delete=models.CASCADE, related_name="analyses"
    )

    # 분석 유형
    analysis_type = models.CharField(
        max_length=50,
        choices=[
            ("object_detection", "객체 감지"),
            ("action_recognition", "행동 인식"),
            ("scene_analysis", "장면 분석"),
            ("demographic_analysis", "인구통계 분석"),
            ("anomaly_detection", "이상 감지"),
            ("depth_analysis", "깊이 분석"),
            ("display_analysis", "진열대 분석"),
        ],
    )

    # 분석 결과 메타데이터
    timestamp = models.FloatField(help_text="Video timestamp in seconds")
    confidence = models.FloatField(help_text="Confidence score 0-1")

    # 분석 결과 데이터 (JSON)
    result_data = models.JSONField(help_text="Analysis result data")

    # 벡터 임베딩 (RAG 검색용)
    embedding = VectorField(dimensions=1024, blank=True, null=True)

    # 검색 최적화
    searchable_text = models.TextField(help_text="Searchable text representation")
    keywords = ArrayField(models.CharField(max_length=100), blank=True, default=list)

    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)

    # 데이터 티어링
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )
    search_count = models.IntegerField(default=0)
    last_accessed = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "db_videoanalysis"
        ordering = ["video", "timestamp"]
        indexes = [
            models.Index(fields=["video", "analysis_type"]),
            models.Index(fields=["timestamp"]),
            models.Index(fields=["confidence"]),
            models.Index(fields=["data_tier", "search_count"]),
        ]

    def increment_search_count(self):
        """검색 횟수 증가"""
        self.search_count += 1
        self.last_accessed = timezone.now()
        self.save(update_fields=["search_count", "last_accessed"])

    def __str__(self):
        return f"{self.video.name or self.video.filename} - {self.analysis_type} at {self.timestamp}s"


class AnalysisJob(models.Model):
    """AWS Batch 분석 작업 추적"""

    # 연관 비디오
    video = models.ForeignKey(
        "db.Video", on_delete=models.CASCADE, related_name="analysis_jobs"
    )

    # 작업 정보
    job_id = models.CharField(max_length=255, unique=True, help_text="AWS Batch Job ID")
    job_name = models.CharField(max_length=255)
    job_queue = models.CharField(max_length=255)
    job_definition = models.CharField(max_length=255)

    # 상태 추적
    status = models.CharField(
        max_length=50,
        choices=[
            ("submitted", "제출됨"),
            ("pending", "대기중"),
            ("runnable", "실행가능"),
            ("starting", "시작중"),
            ("running", "실행중"),
            ("succeeded", "성공"),
            ("failed", "실패"),
        ],
        default="submitted",
    )

    # 분석 설정
    analysis_types = ArrayField(
        models.CharField(max_length=50),
        default=list,
        help_text="Analysis types to perform",
    )

    # 결과 및 로그
    result_s3_key = models.CharField(
        max_length=1024, blank=True, help_text="Result S3 key"
    )
    log_s3_key = models.CharField(max_length=1024, blank=True, help_text="Log S3 key")
    error_message = models.TextField(blank=True)

    # 시간 추적
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "db_analysisjob"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["video", "status"]),
        ]

    @property
    def duration(self):
        """작업 실행 시간 (초)"""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    def update_status_from_aws(self):
        """AWS Batch에서 최신 상태 조회 및 업데이트"""
        batch_client = boto3.client("batch")
        try:
            response = batch_client.describe_jobs(jobs=[self.job_id])
            if response["jobs"]:
                job_detail = response["jobs"][0]
                self.status = job_detail["status"].lower()

                if "startedAt" in job_detail and not self.started_at:
                    self.started_at = datetime.fromtimestamp(
                        job_detail["startedAt"] / 1000
                    )

                if "stoppedAt" in job_detail and not self.completed_at:
                    self.completed_at = datetime.fromtimestamp(
                        job_detail["stoppedAt"] / 1000
                    )

                self.save()
        except Exception as e:
            self.error_message = str(e)
            self.save()

    def __str__(self):
        return f"Job {self.job_name} for {self.video.name or self.video.filename} - {self.status}"


class DepthData(models.Model):
    """깊이 데이터"""

    # 연관 비디오
    video = models.ForeignKey(
        "db.Video", on_delete=models.CASCADE, related_name="depth_data"
    )

    # 프레임 정보
    frame_name = models.CharField(max_length=255)
    frame_number = models.IntegerField()
    frame_timestamp = models.FloatField(help_text="Video timestamp in seconds")
    frame_width = models.IntegerField()
    frame_height = models.IntegerField()

    # 마스크 정보
    mask_id = models.IntegerField()
    bbox_x1 = models.IntegerField()
    bbox_y1 = models.IntegerField()
    bbox_x2 = models.IntegerField()
    bbox_y2 = models.IntegerField()
    area = models.IntegerField()

    # 깊이 정보
    avg_depth = models.FloatField()
    min_depth = models.FloatField()
    max_depth = models.FloatField()
    depth_variance = models.FloatField(default=0.0)

    # S3에 저장된 원본 깊이 맵
    depth_map_s3_key = models.CharField(max_length=1024, blank=True)

    # 데이터 티어링
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )

    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "db_depthdata"
        ordering = ["video", "frame_timestamp", "mask_id"]
        indexes = [
            models.Index(fields=["video", "frame_timestamp"]),
            models.Index(fields=["frame_name"]),
            models.Index(fields=["avg_depth"]),
            models.Index(fields=["data_tier"]),
        ]
        unique_together = ["video", "frame_name", "mask_id"]

    @property
    def bbox_array(self):
        return [self.bbox_x1, self.bbox_y1, self.bbox_x2, self.bbox_y2]

    @property
    def bbox_width(self):
        return self.bbox_x2 - self.bbox_x1

    @property
    def bbox_height(self):
        return self.bbox_y2 - self.bbox_y1

    @property
    def depth_range(self):
        return self.max_depth - self.min_depth

    @property
    def frame_timestamp_from_name(self):
        """프레임명에서 타임스탬프 추출"""
        try:
            import re

            match = re.search(r"frame(\d+)", self.frame_name)
            return int(match.group(1)) if match else None
        except:
            return None

    def __str__(self):
        return f"Depth: {self.frame_name} mask#{self.mask_id} in {self.video.name or self.video.filename}"


class DisplayData(models.Model):
    """진열대 데이터"""

    # 연관 비디오
    video = models.ForeignKey(
        "db.Video", on_delete=models.CASCADE, related_name="display_data"
    )

    # 이미지 메타 정보
    image_index = models.IntegerField()
    image_name = models.CharField(max_length=255)
    timestamp = models.DateTimeField()

    # 좌표 변환 정보
    original_width = models.IntegerField()
    original_height = models.IntegerField()
    new_width = models.IntegerField()
    new_height = models.IntegerField()
    width_ratio = models.FloatField()
    height_ratio = models.FloatField()

    # 마스크 정보
    mask_key = models.IntegerField()
    avg_depth = models.FloatField()
    description = models.CharField(max_length=255)

    # 바운딩 박스 정보
    min_x = models.IntegerField()
    max_x = models.IntegerField()
    min_y = models.IntegerField()
    max_y = models.IntegerField()
    width = models.IntegerField()
    height = models.IntegerField()

    # S3에 저장된 마스크 이미지
    mask_image_s3_key = models.CharField(max_length=1024, blank=True)

    # 데이터 티어링
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )

    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "db_displaydata"
        ordering = ["video", "timestamp", "image_index", "mask_key"]
        indexes = [
            models.Index(fields=["video", "timestamp"]),
            models.Index(fields=["image_index"]),
            models.Index(fields=["avg_depth"]),
            models.Index(fields=["description"]),
            models.Index(fields=["data_tier"]),
        ]
        unique_together = ["video", "image_index", "mask_key"]

    @property
    def bbox_array(self):
        return [self.min_x, self.min_y, self.max_x, self.max_y]

    @property
    def center_x(self):
        return (self.min_x + self.max_x) // 2

    @property
    def center_y(self):
        return (self.min_y + self.max_y) // 2

    @property
    def area(self):
        return self.width * self.height

    def __str__(self):
        return f"Display {self.mask_key}: {self.description} in {self.video.name or self.video.filename}"
