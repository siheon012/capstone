"""
Event 모델
비디오 내 이벤트 감지 및 분석 결과
"""

import boto3
import logging
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone
from datetime import timedelta
from pgvector.django import VectorField

logger = logging.getLogger(__name__)


class Event(models.Model):
    """비디오 이벤트 모델 - 객체 감지, 행동 인식 등"""

    # 연관 비디오
    video = models.ForeignKey(
        "db.Video", on_delete=models.CASCADE, related_name="events"
    )

    # 이벤트 유형
    event_type = models.CharField(
        max_length=50,
        choices=[
            ("person_enter", "사람 입장"),
            ("person_exit", "사람 퇴장"),
            ("interaction", "상호작용"),
            ("anomaly", "이상행동"),
            ("demographic_change", "인구통계 변화"),
            ("picking", "물건 집기"),
            ("walking", "걷기"),
            ("standing", "서있기"),
            ("theft", "도난"),
            ("collapse", "쓰러짐"),
            ("sitting", "점거"),
        ],
    )

    # 시간 정보
    timestamp = models.FloatField(help_text="Video timestamp in seconds")
    duration = models.FloatField(default=0.0, help_text="Event duration in seconds")
    frame_number = models.IntegerField()

    # 위치 정보 (Bounding Box)
    bbox_x = models.IntegerField(default=0)
    bbox_y = models.IntegerField(default=0)
    bbox_width = models.IntegerField(default=0)
    bbox_height = models.IntegerField(default=0)

    # 인구통계 정보
    age_group = models.CharField(
        max_length=20, blank=True, help_text="young, middle, old"
    )
    gender = models.CharField(max_length=10, blank=True, help_text="male, female")
    emotion = models.CharField(
        max_length=20, blank=True, help_text="happy, neutral, sad"
    )

    # 행동 분석
    action = models.CharField(
        max_length=100, blank=True, help_text="walking, standing, picking"
    )
    interaction_target = models.CharField(
        max_length=100, blank=True, help_text="Interaction target"
    )
    confidence = models.FloatField(default=0.0, help_text="Confidence score 0-1")

    # 추가 메타데이터
    attributes = models.JSONField(
        default=dict, blank=True, help_text="Additional attributes"
    )

    # S3 썸네일
    s3_thumbnail_bucket = models.CharField(
        max_length=63,
        default="capstone-dev-thumbnails",
        help_text="Thumbnail S3 bucket",
    )
    s3_thumbnail_key = models.CharField(
        max_length=500, null=True, blank=True, help_text="Thumbnail S3 key"
    )
    thumbnail_uploaded_at = models.DateTimeField(null=True, blank=True)

    # RAG 검색을 위한 임베딩 (Titan Embed v2 - 1024D)
    embedding = VectorField(dimensions=1024, blank=True, null=True)
    searchable_text = models.TextField(blank=True)
    keywords = ArrayField(models.CharField(max_length=100), blank=True, default=list)

    # 데이터 티어링
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )
    search_count = models.IntegerField(default=0)
    last_accessed = models.DateTimeField(auto_now_add=True)

    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "db_event"
        ordering = ["video", "timestamp"]
        indexes = [
            models.Index(fields=["video", "event_type"]),
            models.Index(fields=["timestamp"]),
            models.Index(fields=["age_group", "gender"]),
            models.Index(fields=["data_tier", "search_count"]),
        ]

    def increment_search_count(self):
        """검색 횟수 증가"""
        self.search_count += 1
        self.last_accessed = timezone.now()
        self.save(update_fields=["search_count", "last_accessed"])

    # Attributes JSON 필드 접근 프로퍼티
    @property
    def age(self):
        return self.attributes.get("age", 0)

    @property
    def location(self):
        return self.attributes.get("location", "")

    @property
    def action_detected(self):
        return self.attributes.get("action_detected", "")

    @property
    def obj_id(self):
        return self.attributes.get("obj_id", 0)

    @property
    def area_of_interest(self):
        return self.attributes.get("area_of_interest", 0)

    @property
    def gender_score(self):
        return self.attributes.get("gender_score", 0.0)

    @property
    def scene_analysis(self):
        return self.attributes.get("scene_analysis", None)

    @property
    def orientataion(self):
        """오타 그대로 유지 (하위 호환성)"""
        return self.attributes.get("orientataion", None)

    @property
    def timestamp_display(self):
        """MM:SS 형식"""
        minutes = int(self.timestamp // 60)
        seconds = int(self.timestamp % 60)
        return f"{minutes:02d}:{seconds:02d}"

    @property
    def absolute_time(self):
        """실제 발생 시각 (ISO)"""
        if not self.video.recorded_at:
            return None
        return (self.video.recorded_at + timedelta(seconds=self.timestamp)).isoformat()

    @property
    def absolute_time_display(self):
        """사용자 친화적 절대 시간"""
        if not self.video.recorded_at:
            return "시간 정보 없음"
        absolute_dt = self.video.recorded_at + timedelta(seconds=self.timestamp)
        return absolute_dt.strftime("%Y-%m-%d %H:%M:%S")

    def generate_searchable_text(self):
        """검색 가능한 텍스트 생성"""
        parts = [
            f"Event: {self.event_type}",
            f"Time: {self.timestamp}s",
            f"Demographics: {self.age_group} {self.gender}",
            f"Action: {self.action}",
            f"Emotion: {self.emotion}",
        ]
        if self.interaction_target:
            parts.append(f"Target: {self.interaction_target}")

        self.searchable_text = " | ".join(filter(None, parts))
        self.keywords = [
            self.event_type,
            self.age_group,
            self.gender,
            self.action,
            self.emotion,
            self.interaction_target,
        ]
        self.keywords = [k for k in self.keywords if k]

    @property
    def thumbnail_url(self):
        """썸네일 Presigned URL"""
        if not self.s3_thumbnail_key:
            return None

        try:
            s3_client = boto3.client("s3")
            return s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.s3_thumbnail_bucket,
                    "Key": self.s3_thumbnail_key,
                },
                ExpiresIn=3600,
            )
        except Exception as e:
            logger.warning(f"Thumbnail URL generation failed: {e}")
            return None

    def __str__(self):
        return f"{self.video.name or self.video.filename} - {self.event_type} at {self.timestamp}s"
