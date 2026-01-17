import boto3
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime, timedelta
from pgvector.django import VectorField
import logging
import uuid

logger = logging.getLogger(__name__)


class Video(models.Model):
    """클라우드 네이티브 비디오 모델 (기존 Video + 클라우드 기능)"""

    # 기본 정보
    video_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    filename = models.CharField(max_length=255, help_text="Original filename")
    description = models.TextField(blank=True)

    # 시간 정보
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    upload_date = models.DateTimeField(auto_now_add=True)
    recorded_at = models.DateTimeField(
        null=True, blank=True, help_text="When video was recorded"
    )

    # 파일 정보
    original_filename = models.CharField(max_length=255)
    file_size = models.BigIntegerField(
        null=True, blank=True, help_text="File size in bytes"
    )
    duration = models.FloatField(
        null=True, blank=True, help_text="Video duration in seconds"
    )
    frame_rate = models.FloatField(null=True, blank=True, help_text="Frames per second")
    fps = models.FloatField(null=True, blank=True, help_text="Frames per second")
    resolution_width = models.IntegerField(
        null=True, blank=True, help_text="Video width in pixels"
    )
    resolution_height = models.IntegerField(
        null=True, blank=True, help_text="Video height in pixels"
    )
    width = models.IntegerField(
        null=True, blank=True, help_text="Video width in pixels"
    )
    height = models.IntegerField(
        null=True, blank=True, help_text="Video height in pixels"
    )

    # S3 저장 경로
    s3_bucket = models.CharField(max_length=63, default="capstone-video-bucket")
    s3_key = models.CharField(max_length=1024, help_text="Primary S3 object key")
    s3_raw_key = models.CharField(max_length=500, help_text="S3 raw video key")
    s3_result_key = models.CharField(
        max_length=500, null=True, blank=True, help_text="S3 analysis result key"
    )
    thumbnail_s3_key = models.CharField(max_length=1024, blank=True)
    s3_thumbnail_key = models.CharField(
        max_length=500, null=True, blank=True, help_text="S3 thumbnail key"
    )

    # 메타데이터 추출 정보
    metadata_extracted = models.BooleanField(default=False)
    metadata_extraction_job_id = models.CharField(max_length=255, blank=True)

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

    # AI 영상 요약 (VLM으로 생성)
    summary = models.TextField(
        blank=True,
        null=True,
        help_text="AI 영상 분석 요약 (이모지, 특수기호 포함 가능)",
    )
    summary_status = models.CharField(
        max_length=20,
        default="pending",
        choices=[
            ("pending", "대기중"),
            ("generating", "생성중"),
            ("completed", "완료"),
            ("failed", "실패"),
        ],
        help_text="Summary generation status",
    )

    # SQS Job 추적
    job_id = models.CharField(
        max_length=100, null=True, blank=True, help_text="AWS Batch job ID"
    )

    # 검색 및 접근 빈도 추적
    search_count = models.IntegerField(default=0)
    total_searches = models.IntegerField(
        default=0, help_text="Total times this video was searched"
    )
    last_accessed = models.DateTimeField(auto_now_add=True)
    last_searched = models.DateTimeField(null=True, blank=True)
    hotness_score = models.FloatField(default=0.0)  # 0-100 점수

    # 데이터 티어링 (Hot/Warm/Cold)
    data_tier = models.CharField(
        max_length=10,
        choices=[
            ("hot", "Hot - 자주 접근"),
            ("warm", "Warm - 가끔 접근"),
            ("cold", "Cold - 거의 접근 안함"),
        ],
        default="hot",
    )

    # Warm/Cold 티어의 S3 경로 (다른 스토리지 클래스)
    warm_s3_key = models.CharField(max_length=1024, blank=True)
    cold_s3_key = models.CharField(max_length=1024, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["data_tier", "hotness_score"]),
            models.Index(fields=["search_count", "last_accessed"]),
            models.Index(fields=["metadata_extracted"]),
            models.Index(fields=["analysis_status"]),
        ]

    def increment_search_count(self):
        """검색 횟수 증가 및 hotness 점수 업데이트"""
        from .tier_manager import TierManager

        self.search_count += 1
        self.total_searches += 1
        self.last_accessed = timezone.now()
        self.last_searched = timezone.now()
        self.hotness_score = TierManager.calculate_hotness_score(self)
        self.save(
            update_fields=[
                "search_count",
                "total_searches",
                "last_accessed",
                "last_searched",
                "hotness_score",
            ]
        )

    def update_search_stats(self):
        """기존 코드 호환성을 위한 메서드"""
        self.increment_search_count()

    def get_current_s3_key(self):
        """현재 티어에 맞는 S3 키 반환"""
        if self.data_tier == "warm" and self.warm_s3_key:
            return self.warm_s3_key
        elif self.data_tier == "cold" and self.cold_s3_key:
            return self.cold_s3_key
        return self.s3_key or self.s3_raw_key

    @property
    def file_path(self):
        """
        비디오 파일 경로 반환 - current_s3_url과 동일한 로직 사용
        프론트엔드 호환성을 위한 property
        """
        # Serializer의 _generate_s3_url과 동일한 방식 사용
        s3_key = self.get_current_s3_key()
        if not s3_key:
            # S3 키가 없으면 로컬 경로 반환
            return f"/uploads/videos/{self.name or self.filename}"

        try:
            from django.conf import settings
            from botocore.exceptions import ClientError

            # Serializer와 동일한 방식으로 boto3 클라이언트 생성
            s3_client = boto3.client(
                "s3",
                region_name=getattr(settings, "AWS_S3_REGION_NAME", "ap-northeast-2"),
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
            )

            bucket_name = self.s3_bucket or getattr(
                settings, "AWS_STORAGE_BUCKET_NAME", "capstone-dev-raw"
            )

            presigned_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": s3_key},
                ExpiresIn=3600,  # 1시간
            )
            return presigned_url
        except Exception as e:
            logger.warning(f"S3 presigned URL 생성 실패: {e}")
            # 예외 발생 시 로컬 경로 반환
            return f"/uploads/videos/{self.name or self.filename}"

    @property
    def computed_thumbnail_path(self):
        """
        썸네일 경로 반환 - S3 Presigned URL 우선
        프론트엔드 호환성을 위한 property
        """
        # S3 썸네일이 있으면 presigned URL 반환
        thumbnail_key = self.thumbnail_s3_key or self.s3_thumbnail_key
        if thumbnail_key:
            try:
                # region 명시적으로 설정
                s3_client = boto3.client("s3", region_name="ap-northeast-2")
                return s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": "capstone-dev-thumbnails", "Key": thumbnail_key},
                    ExpiresIn=3600,  # 1시간 유효
                )
            except Exception as e:
                logger.warning(f"썸네일 URL 생성 실패: {e}")

        # Fallback: 로컬 경로 반환 (기존 호환성)
        thumbnail_name = self.name or self.filename
        if thumbnail_name:
            # 확장자를 .png로 변경
            base_name = (
                thumbnail_name.rsplit(".", 1)[0]
                if "." in thumbnail_name
                else thumbnail_name
            )
            return f"/uploads/thumbnails/{base_name}.png"

        return None

    def delete(self, *args, **kwargs):
        """비디오 삭제 시 S3 파일 및 모든 관련 데이터 삭제"""
        logger.info(f"비디오 삭제 시작: {self.name} (ID: {self.video_id})")

        # S3 클라이언트 초기화
        try:
            s3_client = boto3.client(
                "s3",
                region_name=getattr(settings, "AWS_S3_REGION_NAME", "ap-northeast-2"),
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
            )
        except Exception as e:
            logger.error(f"S3 클라이언트 초기화 실패: {e}")
            s3_client = None

        # 1. S3 Raw 비디오 파일 삭제
        if s3_client and self.s3_raw_key:
            try:
                # s3_bucket 필드가 잘못된 경우를 대비해 settings에서 직접 가져오기
                bucket = getattr(settings, "AWS_RAW_BUCKET_NAME", "capstone-dev-raw")
                s3_client.delete_object(Bucket=bucket, Key=self.s3_raw_key)
                logger.info(
                    f"✅ S3 raw 비디오 삭제 완료: s3://{bucket}/{self.s3_raw_key}"
                )
            except Exception as e:
                logger.error(f"❌ S3 raw 비디오 삭제 실패: {e}")

        # 2. S3 썸네일 파일 삭제
        thumbnail_key = self.thumbnail_s3_key or self.s3_thumbnail_key
        if s3_client and thumbnail_key:
            try:
                thumbnail_bucket = getattr(
                    settings, "AWS_THUMBNAILS_BUCKET_NAME", "capstone-dev-thumbnails"
                )
                s3_client.delete_object(Bucket=thumbnail_bucket, Key=thumbnail_key)
                logger.info(
                    f"✅ S3 썸네일 삭제 완료: s3://{thumbnail_bucket}/{thumbnail_key}"
                )
            except Exception as e:
                logger.error(f"❌ S3 썸네일 삭제 실패: {e}")

        # 3. S3 하이라이트 이미지들 삭제 (관련 세션의 하이라이트들)
        if s3_client:
            try:
                highlights_bucket = getattr(
                    settings, "AWS_HIGHLIGHTS_BUCKET_NAME", "capstone-dev-highlights"
                )
                # 이 비디오와 관련된 하이라이트 prefix로 검색
                video_prefix = f"highlights/{self.video_id}/"

                response = s3_client.list_objects_v2(
                    Bucket=highlights_bucket, Prefix=video_prefix
                )
                if "Contents" in response:
                    for obj in response["Contents"]:
                        s3_client.delete_object(
                            Bucket=highlights_bucket, Key=obj["Key"]
                        )
                        logger.info(f"✅ S3 하이라이트 삭제: {obj['Key']}")
            except Exception as e:
                logger.error(f"❌ S3 하이라이트 삭제 실패: {e}")

        # 4. Warm/Cold 티어 S3 파일 삭제
        if s3_client:
            bucket = getattr(settings, "AWS_RAW_BUCKET_NAME", "capstone-dev-raw")
            if self.warm_s3_key:
                try:
                    s3_client.delete_object(Bucket=bucket, Key=self.warm_s3_key)
                    logger.info(f"✅ Warm 티어 파일 삭제 완료: {self.warm_s3_key}")
                except Exception as e:
                    logger.error(f"❌ Warm 티어 파일 삭제 실패: {e}")

            if self.cold_s3_key:
                try:
                    s3_client.delete_object(Bucket=bucket, Key=self.cold_s3_key)
                    logger.info(f"✅ Cold 티어 파일 삭제 완료: {self.cold_s3_key}")
                except Exception as e:
                    logger.error(f"❌ Cold 티어 파일 삭제 실패: {e}")

        # 5. 데이터베이스에서 삭제 (CASCADE로 관련 데이터 자동 삭제)
        # - Event, PromptInteraction, DepthData, DisplayData 등
        # - PromptSession은 ManyToMany이므로 직접 삭제 필요
        try:
            session_count = self.promptsession_set.count()
            event_count = self.events.count()

            logger.info(
                f"🗑️ DB 삭제: {session_count}개 세션 연결, {event_count}개 이벤트"
            )

            # ManyToMany 관계의 세션들 연결 해제
            self.promptsession_set.clear()

        except Exception as e:
            logger.error(f"관련 데이터 카운트/삭제 실패: {e}")

        super().delete(*args, **kwargs)

        logger.info(f"✅ 비디오 삭제 완료: {self.name} (ID: {self.video_id})")

    def __str__(self):
        return f"{self.name or self.filename} ({self.data_tier})"


class Event(models.Model):
    """클라우드 네이티브 이벤트 모델 (기존 Event 모델 확장)"""

    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name="events")

    # 기본 이벤트 정보
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
    timestamp = models.FloatField()  # 비디오 내 시간 (초)
    duration = models.FloatField(default=0.0)  # 이벤트 지속시간
    frame_number = models.IntegerField()

    # 위치 정보
    bbox_x = models.IntegerField(default=0)
    bbox_y = models.IntegerField(default=0)
    bbox_width = models.IntegerField(default=0)
    bbox_height = models.IntegerField(default=0)

    # 인구통계 정보
    age_group = models.CharField(max_length=20, blank=True)  # 'young', 'middle', 'old'
    gender = models.CharField(max_length=10, blank=True)  # 'male', 'female'
    emotion = models.CharField(max_length=20, blank=True)  # 'happy', 'neutral', 'sad'

    # 행동 분석
    action = models.CharField(
        max_length=100, blank=True
    )  # 'walking', 'standing', 'picking'
    interaction_target = models.CharField(max_length=100, blank=True)  # 상호작용 대상
    confidence = models.FloatField(default=0.0)  # 신뢰도 0-1

    # 추가 메타데이터
    attributes = models.JSONField(default=dict, blank=True)  # 추가 속성들

    # S3 썸네일 정보 (FastAPI 영상분석에서 생성)
    s3_thumbnail_bucket = models.CharField(
        max_length=63,
        default="capstone-dev-thumbnails",
        help_text="썸네일 이미지가 저장된 S3 버킷",
    )
    s3_thumbnail_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="썸네일 이미지의 S3 객체 키 (예: events/event_001/frame_1234.jpg)",
    )
    thumbnail_uploaded_at = models.DateTimeField(
        null=True, blank=True, help_text="썸네일이 S3에 업로드된 시각"
    )

    # RAG 검색을 위한 임베딩 (Titan Embed v2 - 1024D Matryoshka)
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

    # attributes JSON에서 필드 노출하는 @property 메서드들
    @property
    def age(self):
        """attributes에서 age 가져오기"""
        return self.attributes.get("age", 0)

    @property
    def location(self):
        """attributes에서 location 가져오기"""
        return self.attributes.get("location", "")

    @property
    def action_detected(self):
        """attributes에서 action_detected 가져오기"""
        return self.attributes.get("action_detected", "")

    @property
    def obj_id(self):
        """attributes에서 obj_id 가져오기"""
        return self.attributes.get("obj_id", 0)

    @property
    def area_of_interest(self):
        """attributes에서 area_of_interest 가져오기"""
        return self.attributes.get("area_of_interest", 0)

    @property
    def gender_score(self):
        """attributes에서 gender_score 가져오기"""
        return self.attributes.get("gender_score", 0.0)

    @property
    def scene_analysis(self):
        """attributes에서 scene_analysis 가져오기"""
        return self.attributes.get("scene_analysis", None)

    @property
    def orientataion(self):
        """attributes에서 orientataion 가져오기 (오타 그대로 유지)"""
        return self.attributes.get("orientataion", None)

    @property
    def timestamp_display(self):
        """MM:SS 형식의 타임스탬프"""
        minutes = int(self.timestamp // 60)
        seconds = int(self.timestamp % 60)
        return f"{minutes:02d}:{seconds:02d}"

    @property
    def absolute_time(self):
        """실제 발생 시각 (ISO 형식)"""
        if not self.video.recorded_at:
            return None
        from datetime import timedelta

        return (self.video.recorded_at + timedelta(seconds=self.timestamp)).isoformat()

    @property
    def absolute_time_display(self):
        """사용자 친화적 절대 시간 표시"""
        if not self.video.recorded_at:
            return "시간 정보 없음"
        from datetime import timedelta

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
        """썸네일 Presigned URL 생성"""
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
                ExpiresIn=3600,  # 1시간 유효
            )
        except Exception as e:
            logger.warning(f"썸네일 URL 생성 실패: {e}")
            return None

    def __str__(self):
        return f"{self.video.name or self.video.filename} - {self.event_type} at {self.timestamp}s"


class PromptSession(models.Model):
    """클라우드 네이티브 프롬프트 세션 모델"""

    # 세션 기본 정보
    session_id = models.CharField(max_length=255, unique=True, blank=True)
    user_id = models.CharField(max_length=255, blank=True)  # 사용자 식별자

    # 주요 이벤트 연결 (RAG 검색의 컨텍스트)
    main_event = models.ForeignKey(
        Event, on_delete=models.SET_NULL, null=True, blank=True
    )
    related_videos = models.ForeignKey(
        Video,
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
        ordering = ["-last_interaction"]
        indexes = [
            models.Index(fields=["session_id"]),
            models.Index(fields=["user_id", "status"]),
            models.Index(fields=["main_event"]),
            models.Index(fields=["data_tier", "access_count"]),
        ]

    def save(self, *args, **kwargs):
        """session_id가 없으면 UUID로 자동 생성"""
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
        interactions = self.interactions.all()[:10]  # 최근 10개
        if interactions:
            summaries = [i.response_summary for i in interactions if i.response_summary]
            self.context_summary = " | ".join(summaries[-3:])  # 최근 3개 요약

    @property
    def display_title(self):
        """세션 제목 표시 - 항상 '{video_name}의 N번째 세션' 형식"""
        # session_name은 무시하고 항상 비디오 기반 제목 생성

        # 관련 비디오 가져오기
        video = self.related_videos
        if not video:
            return f"세션 {self.session_id[:8]}"

        video_name = video.name or video.filename or "비디오"
        session_number = self.session_number  # 프로퍼티 사용

        return f"{video_name}의 {session_number}번째 세션"

    @property
    def session_number(self):
        """비디오별 세션 번호 (created_at 기준 순서)"""
        if not self.related_videos:
            return 1

        try:
            # 같은 비디오의 세션들을 created_at 순으로 정렬
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
    """클라우드 네이티브 프롬프트 상호작용 모델"""

    session = models.ForeignKey(
        PromptSession, on_delete=models.CASCADE, related_name="interactions"
    )

    # 상호작용 기본 정보
    interaction_id = models.CharField(max_length=255)
    sequence_number = models.IntegerField()  # 세션 내 순서

    # 사용자 입력
    user_prompt = models.TextField()
    user_intent = models.CharField(
        max_length=100, blank=True
    )  # 'search', 'analyze', 'compare'

    # AI 응답
    ai_response = models.TextField()
    response_summary = models.CharField(max_length=500, blank=True)

    # 관련 데이터
    related_events = models.ManyToManyField(Event, blank=True)
    related_videos = models.ForeignKey(
        Video,
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
        help_text="생성된 썸네일의 S3 경로들",
    )

    # VLM 분석 결과
    vlm_analysis = models.JSONField(default=dict, blank=True)
    visual_elements = ArrayField(
        models.CharField(max_length=200),
        blank=True,
        default=list,
        help_text="감지된 시각적 요소들",
    )

    # 임베딩 (검색 최적화)
    query_embedding = VectorField(dimensions=1024, blank=True, null=True)
    response_embedding = VectorField(dimensions=1024, blank=True, null=True)

    # 메타데이터
    processing_time = models.FloatField(default=0.0)  # 처리 시간 (초)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
            # Pre-signed URL 생성 로직
            s3_client = boto3.client("s3")
            try:
                url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": s3_key},
                    ExpiresIn=3600,  # 1시간
                )
                urls.append(url)
            except Exception:
                continue
        return urls

    def __str__(self):
        return f"{self.session.session_id} - Interaction #{self.sequence_number}"


class DepthData(models.Model):
    """클라우드 네이티브 깊이 데이터 모델"""

    video = models.ForeignKey(
        Video, on_delete=models.CASCADE, related_name="depth_data"
    )

    # 프레임 정보
    frame_name = models.CharField(max_length=255)
    frame_number = models.IntegerField()
    frame_timestamp = models.FloatField()  # 비디오 내 시간
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
    depth_variance = models.FloatField(default=0.0)  # 깊이 분산

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
        """바운딩 박스 너비"""
        return self.bbox_x2 - self.bbox_x1

    @property
    def bbox_height(self):
        """바운딩 박스 높이"""
        return self.bbox_y2 - self.bbox_y1

    @property
    def depth_range(self):
        return self.max_depth - self.min_depth

    @property
    def frame_timestamp_from_name(self):
        """프레임명에서 타임스탬프 추출 (frame78 -> 78)"""
        try:
            # "20250526_182739_3fps_frame78.jpg" -> 78
            import re

            match = re.search(r"frame(\d+)", self.frame_name)
            return int(match.group(1)) if match else None
        except:
            return None

    def __str__(self):
        return f"Depth: {self.frame_name} mask#{self.mask_id} in {self.video.name or self.video.filename}"


class DisplayData(models.Model):
    """클라우드 네이티브 진열대 데이터 모델"""

    video = models.ForeignKey(
        Video, on_delete=models.CASCADE, related_name="display_data"
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


class VideoAnalysis(models.Model):
    """비디오 분석 결과 저장 (통합된 분석 결과)"""

    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name="analyses")

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
    timestamp = models.FloatField()  # 비디오 내 시간 (초)
    confidence = models.FloatField()  # 신뢰도 0-1

    # 분석 결과 데이터 (JSON)
    result_data = models.JSONField()  # 실제 분석 결과

    # 벡터 임베딩 (RAG 검색용)
    embedding = VectorField(
        dimensions=1024, blank=True, null=True
    )  # Titan Embed v2 (1024D)

    # 검색 최적화
    searchable_text = models.TextField()  # 검색 가능한 텍스트 표현
    keywords = ArrayField(models.CharField(max_length=100), blank=True, default=list)

    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)

    # 데이터 티어링 (분석 결과도 티어링)
    data_tier = models.CharField(
        max_length=10,
        choices=[("hot", "Hot"), ("warm", "Warm"), ("cold", "Cold")],
        default="hot",
    )
    search_count = models.IntegerField(default=0)
    last_accessed = models.DateTimeField(auto_now_add=True)

    class Meta:
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

    video = models.ForeignKey(
        Video, on_delete=models.CASCADE, related_name="analysis_jobs"
    )

    # 작업 정보
    job_id = models.CharField(max_length=255, unique=True)  # AWS Batch Job ID
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
        models.CharField(max_length=50), default=list, help_text="수행할 분석 유형들"
    )

    # 결과 및 로그
    result_s3_key = models.CharField(max_length=1024, blank=True)  # 결과 파일 S3 경로
    log_s3_key = models.CharField(max_length=1024, blank=True)  # 로그 파일 S3 경로
    error_message = models.TextField(blank=True)

    # 시간 추적
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
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
        import boto3

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
