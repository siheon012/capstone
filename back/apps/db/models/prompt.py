"""
Prompt 모델
사용자 프롬프트 세션 및 상호작용
"""

import boto3
import logging
import uuid
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.conf import settings
from django.utils import timezone
from pgvector.django import VectorField

logger = logging.getLogger(__name__)


class PromptSession(models.Model):
    """프롬프트 세션 - 사용자와의 대화 세션"""

    # 세션 식별자
    session_id = models.CharField(max_length=255, unique=True, blank=True)
    user_id = models.CharField(max_length=255, blank=True)

    # 연관 데이터
    main_event = models.ForeignKey(
        "db.Event", on_delete=models.SET_NULL, null=True, blank=True
    )
    related_videos = models.ForeignKey(
        "db.Video",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="prompt_sessions",
    )

    # 세션 메타데이터
    session_name = models.CharField(max_length=255, blank=True)
    session_summary = models.TextField(blank=True)

    # 검색 및 상호작용 통계
    total_interactions = models.IntegerField(default=0)
    search_queries = ArrayField(models.TextField(), blank=True, default=list)

    # 세션 컨텍스트 (RAG)
    context_summary = models.TextField(blank=True)
    context_embedding = VectorField(dimensions=1024, blank=True, null=True)

    # 상태 관리
    status = models.CharField(
        max_length=20,
        choices=[
            ("active", "진행중"),
            ("completed", "완료"),
            ("abandoned", "중단됨"),
        ],
        default="active",
    )

    # 시간 추적
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_interaction = models.DateTimeField(auto_now=True)

    # 데이터 티어링
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )
    access_count = models.IntegerField(default=0)

    class Meta:
        db_table = "db_promptsession"
        ordering = ["-last_interaction"]
        indexes = [
            models.Index(fields=["session_id"]),
            models.Index(fields=["user_id", "status"]),
            models.Index(fields=["main_event"]),
            models.Index(fields=["data_tier", "access_count"]),
        ]

    def save(self, *args, **kwargs):
        """session_id 자동 생성"""
        if not self.session_id:
            self.session_id = str(uuid.uuid4())
        super().save(*args, **kwargs)

    def add_interaction(self, query_text):
        """새로운 상호작용 추가"""
        self.total_interactions += 1
        self.search_queries.append(query_text)
        self.last_interaction = timezone.now()
        self.save(
            update_fields=["total_interactions", "search_queries", "last_interaction"]
        )

    def update_context_summary(self):
        """세션 컨텍스트 요약 업데이트"""
        interactions = self.interactions.all()[:10]
        if interactions:
            summaries = [i.response_summary for i in interactions if i.response_summary]
            self.context_summary = " | ".join(summaries[-3:])

    @property
    def display_title(self):
        """세션 제목 표시"""
        video = self.related_videos
        if not video:
            return f"세션 {self.session_id[:8]}"

        video_name = video.name or video.filename or "비디오"
        session_number = self.session_number

        return f"{video_name}의 {session_number}번째 세션"

    @property
    def session_number(self):
        """비디오별 세션 번호"""
        if not self.related_videos:
            return 1

        try:
            sessions = PromptSession.objects.filter(
                related_videos=self.related_videos
            ).order_by("created_at")
            session_ids = list(sessions.values_list("pk", flat=True))
            return session_ids.index(self.pk) + 1
        except (ValueError, Exception):
            return 1

    @property
    def timeline_summary(self):
        """타임라인 요약"""
        if self.main_event:
            return f"{self.main_event.timestamp:.1f}초"
        return "N/A"

    @property
    def main_event_display(self):
        """메인 이벤트 표시"""
        if self.main_event:
            return f"{self.main_event.event_type} @ {self.main_event.timestamp:.1f}s"
        return "No event"

    @property
    def first_prompt(self):
        """첫 번째 프롬프트"""
        first = self.interactions.first()
        return first.user_prompt if first else None

    @property
    def first_response(self):
        """첫 번째 응답"""
        first = self.interactions.first()
        return first.ai_response if first else None

    @property
    def interaction_count(self):
        """인터랙션 개수"""
        return self.interactions.count()

    def __str__(self):
        return f"Session {self.session_id} - {self.total_interactions} interactions"


class PromptInteraction(models.Model):
    """프롬프트 상호작용 - 사용자 질문과 AI 응답"""

    # 세션 연결
    session = models.ForeignKey(
        PromptSession, on_delete=models.CASCADE, related_name="interactions"
    )

    # 상호작용 식별자
    interaction_id = models.CharField(max_length=255)
    sequence_number = models.IntegerField()

    # 사용자 입력
    user_prompt = models.TextField()
    user_intent = models.CharField(
        max_length=100, blank=True, help_text="search, analyze, compare"
    )

    # AI 응답
    ai_response = models.TextField()
    response_summary = models.CharField(max_length=500, blank=True)

    # 관련 데이터
    related_events = models.ManyToManyField("db.Event", blank=True)
    related_videos = models.ForeignKey(
        "db.Video",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="prompt_interactions",
    )

    # 분석 결과
    analysis_type = models.CharField(max_length=50, blank=True)
    analysis_results = models.JSONField(default=dict, blank=True)
    confidence_score = models.FloatField(default=0.0)

    # 생성된 썸네일/이미지
    thumbnail_s3_keys = ArrayField(
        models.CharField(max_length=1024),
        blank=True,
        default=list,
        help_text="Generated thumbnail S3 keys",
    )

    # VLM 분석 결과
    vlm_analysis = models.JSONField(default=dict, blank=True)
    visual_elements = ArrayField(
        models.CharField(max_length=200),
        blank=True,
        default=list,
        help_text="Detected visual elements",
    )

    # 임베딩 (검색 최적화)
    query_embedding = VectorField(dimensions=1024, blank=True, null=True)
    response_embedding = VectorField(dimensions=1024, blank=True, null=True)

    # 메타데이터
    processing_time = models.FloatField(
        default=0.0, help_text="Processing time in seconds"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "db_promptinteraction"
        ordering = ["session", "sequence_number"]
        indexes = [
            models.Index(fields=["session", "sequence_number"]),
            models.Index(fields=["user_intent"]),
            models.Index(fields=["analysis_type"]),
            models.Index(fields=["confidence_score"]),
        ]
        unique_together = ["session", "sequence_number"]

    def generate_thumbnail_urls(self):
        """썸네일 S3 URL 생성"""
        urls = []
        for s3_key in self.thumbnail_s3_keys:
            try:
                s3_client = boto3.client("s3")
                url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": s3_key},
                    ExpiresIn=3600,
                )
                urls.append(url)
            except Exception:
                continue
        return urls

    def __str__(self):
        return f"{self.session.session_id} - Interaction #{self.sequence_number}"
