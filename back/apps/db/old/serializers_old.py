from rest_framework import serializers
from django.conf import settings
import boto3
from botocore.exceptions import ClientError
from apps.db.models import (
    Video,
    Event,
    PromptSession,
    PromptInteraction,
    DepthData,
    DisplayData,
    VideoAnalysis,
    AnalysisJob,
)


class VideoSerializer(serializers.ModelSerializer):
    # 기존 호환성 필드들
    file_path = serializers.ReadOnlyField()
    computed_thumbnail_path = serializers.ReadOnlyField()
    chat_count = serializers.SerializerMethodField()

    # 새로운 클라우드 필드들
    current_s3_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    tier_status = serializers.SerializerMethodField()
    search_stats = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = "__all__"

    def get_chat_count(self, obj):
        """실제 PromptSession 수를 계산하여 반환 (기존 호환성)"""
        if hasattr(obj, "prompt_sessions"):
            return obj.prompt_sessions.count()
        return 0

    def get_current_s3_url(self, obj):
        """현재 티어에 맞는 S3 URL 생성"""
        try:
            if hasattr(obj, "get_current_s3_key") and obj.get_current_s3_key():
                s3_url = self._generate_s3_url(obj.get_current_s3_key())
                if s3_url:
                    return s3_url
            # Fallback: S3 공개 URL (presigned URL 실패 시)
            s3_key = getattr(obj, "s3_key", None) or getattr(obj, "s3_raw_key", None)
            if s3_key:
                bucket_name = getattr(
                    settings, "AWS_STORAGE_BUCKET_NAME", "capstone-dev-raw"
                )
                region = getattr(settings, "AWS_S3_REGION_NAME", "ap-northeast-2")
                return f"https://{bucket_name}.s3.{region}.amazonaws.com/{s3_key}"
        except Exception as e:
            print(f"⚠️ current_s3_url 생성 실패: {e}")
        return None

    def get_thumbnail_url(self, obj):
        """썸네일 S3 URL 생성"""
        try:
            thumbnail_key = getattr(obj, "thumbnail_s3_key", None) or getattr(
                obj, "s3_thumbnail_key", None
            )
            if thumbnail_key:
                s3_url = self._generate_s3_url(thumbnail_key, is_thumbnail=True)
                if s3_url:
                    return s3_url
                # Fallback: S3 공개 URL
                bucket_name = "capstone-dev-thumbnails"
                region = getattr(settings, "AWS_S3_REGION_NAME", "ap-northeast-2")
                return (
                    f"https://{bucket_name}.s3.{region}.amazonaws.com/{thumbnail_key}"
                )
        except Exception as e:
            print(f"⚠️ thumbnail_url 생성 실패: {e}")
        return None

    def get_tier_status(self, obj):
        """데이터 티어 상태 정보"""
        return {
            "tier": getattr(obj, "data_tier", "hot"),
            "hotness_score": getattr(obj, "hotness_score", 0.0),
            "search_count": getattr(obj, "search_count", 0),
        }

    def get_search_stats(self, obj):
        """검색 통계 정보"""
        return {
            "total_searches": getattr(obj, "search_count", 0)
            or getattr(obj, "total_searches", 0),
            "last_accessed": getattr(obj, "last_accessed", None)
            or getattr(obj, "last_searched", None),
            "hotness_score": getattr(obj, "hotness_score", 0.0),
        }

    def _generate_s3_url(self, s3_key, is_thumbnail=False):
        """S3 pre-signed URL 생성"""
        if not s3_key:
            return None

        try:
            # AWS credentials와 region 명시적으로 설정
            s3_client = boto3.client(
                "s3",
                region_name=getattr(settings, "AWS_S3_REGION_NAME", "ap-northeast-2"),
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
            )

            # 썸네일은 별도 버킷 사용
            bucket_name = (
                "capstone-dev-thumbnails"
                if is_thumbnail
                else getattr(settings, "AWS_STORAGE_BUCKET_NAME", "capstone-dev-raw")
            )

            presigned_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": s3_key},
                ExpiresIn=3600,  # 1시간
            )
            return presigned_url
        except ClientError as e:
            print(f"❌ S3 presigned URL 생성 실패: {e}")
            return None
        except Exception as e:
            print(f"❌ 예상치 못한 에러: {e}")
            return None

    def create(self, validated_data):
        """비디오 생성 시 클라우드 필드 초기화"""
        print(f"🏗️ [VideoSerializer CREATE] 시작")
        print(f"📋 [VideoSerializer CREATE] Validated data: {validated_data}")

        try:
            # 기본 생성
            instance = super().create(validated_data)

            # 클라우드 필드 초기화
            if hasattr(instance, "data_tier") and not instance.data_tier:
                instance.data_tier = "hot"
            if hasattr(instance, "hotness_score") and not instance.hotness_score:
                instance.hotness_score = 100.0  # 새 비디오는 hot

            instance.save()

            print(
                f"✅ [VideoSerializer CREATE] 생성 성공: video_id={instance.video_id}"
            )
            return instance

        except Exception as e:
            print(f"❌ [VideoSerializer CREATE] 오류 발생: {str(e)}")
            import traceback

            print(f"📚 [VideoSerializer CREATE] Traceback: {traceback.format_exc()}")
            raise


class EventSerializer(serializers.ModelSerializer):
    # 기존 호환성 필드들
    timestamp_display = serializers.ReadOnlyField()
    absolute_time = serializers.ReadOnlyField()
    absolute_time_display = serializers.ReadOnlyField()

    # attributes JSON에서 가져오는 필드들 (ReadOnlyField로 @property 사용)
    age = serializers.ReadOnlyField()
    location = serializers.ReadOnlyField()
    action_detected = serializers.ReadOnlyField()
    obj_id = serializers.ReadOnlyField()
    area_of_interest = serializers.ReadOnlyField()
    gender_score = serializers.ReadOnlyField()
    scene_analysis = serializers.ReadOnlyField()
    orientataion = serializers.ReadOnlyField()

    # confidence는 모델 필드 (JSONField가 아님)
    # confidence = serializers.FloatField(read_only=True)  # 이미 Meta의 fields='__all__'에 포함됨

    # 새로운 클라우드 필드들
    searchable_content = serializers.SerializerMethodField()
    similarity_score = serializers.SerializerMethodField()
    tier_info = serializers.SerializerMethodField()

    # 썸네일 URL (Presigned URL 자동 생성)
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = "__all__"

    def get_thumbnail_url(self, obj):
        """썸네일 Presigned URL 생성"""
        return obj.thumbnail_url  # @property 메서드 사용

    def get_searchable_content(self, obj):
        """검색 가능한 내용 생성"""
        if hasattr(obj, "searchable_text") and obj.searchable_text:
            return obj.searchable_text
        # 기존 필드들로 검색 텍스트 생성
        parts = [
            getattr(obj, "event_type", ""),
            getattr(obj, "age_group", ""),
            getattr(obj, "gender", ""),
            getattr(obj, "action", ""),
            getattr(obj, "emotion", ""),
        ]
        return " | ".join(filter(None, parts))

    def get_similarity_score(self, obj):
        """벡터 검색 결과의 유사도 점수 (context에서 주입)"""
        return getattr(obj, "_similarity_score", None)

    def get_tier_info(self, obj):
        """데이터 티어 정보"""
        return {
            "tier": getattr(obj, "data_tier", "hot"),
            "search_count": getattr(obj, "search_count", 0),
            "last_accessed": getattr(obj, "last_accessed", None),
        }


class PromptSessionSerializer(serializers.ModelSerializer):
    # 프론트엔드 호환성을 위한 id 필드 (session_id를 id로 매핑)
    id = serializers.CharField(source="session_id", read_only=True)

    # 기존 호환성 필드들
    display_title = serializers.ReadOnlyField()
    session_number = serializers.ReadOnlyField()  # 비디오별 세션 번호
    timeline_summary = serializers.ReadOnlyField()
    main_event_display = serializers.ReadOnlyField()
    main_event = EventSerializer(read_only=True)
    video = serializers.SerializerMethodField()  # related_videos의 첫 번째 비디오
    detected_events = serializers.SerializerMethodField()

    # 프론트엔드 호환성 필드들 (모델 프로퍼티 사용)
    first_prompt = serializers.ReadOnlyField()
    first_response = serializers.ReadOnlyField()

    # 히스토리 창에서 필요한 필드들
    interactionCount = serializers.SerializerMethodField()
    videoInfo = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()

    # 새로운 클라우드 필드들
    context_summary = serializers.SerializerMethodField()
    session_stats = serializers.SerializerMethodField()
    related_videos_info = serializers.SerializerMethodField()

    class Meta:
        model = PromptSession
        fields = "__all__"

    def get_video(self, obj):
        """related_videos 비디오 반환"""
        if obj.related_videos:
            return VideoSerializer(obj.related_videos).data
        return None

    def get_detected_events(self, obj):
        """세션의 모든 프롬프트 인터랙션에서 찾은 이벤트들을 반환 (기존 호환성)"""
        detected_events = []
        interactions = obj.interactions.all()

        for interaction in interactions:
            # 관련 이벤트들 가져오기 (새로운 ManyToMany 관계)
            related_events = getattr(interaction, "related_events", None)
            if related_events:
                for event in related_events.all()[:3]:  # 최대 3개
                    event_info = {
                        "event_type": getattr(event, "event_type", ""),
                        "action_detected": getattr(event, "action", ""),
                        "timestamp": getattr(event, "timestamp", 0),
                        "location": f"{getattr(event, 'bbox_x', 0)},{getattr(event, 'bbox_y', 0)}",
                        "prompt": (
                            interaction.user_prompt[:100] + "..."
                            if len(interaction.user_prompt) > 100
                            else interaction.user_prompt
                        ),
                    }
                    detected_events.append(event_info)

        return detected_events

    def get_interactionCount(self, obj):
        """세션의 상호작용 개수 (히스토리 창용)"""
        return obj.interaction_count  # 모델의 @property 사용

    def get_videoInfo(self, obj):
        """비디오 정보 (히스토리 창용)"""
        video = obj.related_videos
        if video:
            return {
                "name": video.name or video.filename,
                "duration": video.duration or 0,
                "url": video.s3_raw_key if hasattr(video, "s3_raw_key") else "",
            }
        return None

    def get_messages(self, obj):
        """세션의 메시지들 (히스토리 창용)"""
        interactions = obj.interactions.order_by("sequence_number").all()
        messages = []

        for interaction in interactions:
            # 사용자 메시지
            messages.append(
                {
                    "role": "user",
                    "content": interaction.user_prompt,
                    "timestamp": (
                        interaction.created_at.timestamp()
                        if interaction.created_at
                        else 0
                    ),
                }
            )
            # AI 응답
            messages.append(
                {
                    "role": "assistant",
                    "content": interaction.ai_response,
                    "timestamp": (
                        interaction.created_at.timestamp()
                        if interaction.created_at
                        else 0
                    ),
                }
            )

        return messages

    def get_context_summary(self, obj):
        """세션 컨텍스트 요약"""
        return getattr(obj, "context_summary", "") or getattr(
            obj, "session_summary", ""
        )

    def get_session_stats(self, obj):
        """세션 통계"""
        return {
            "total_interactions": getattr(obj, "total_interactions", 0),
            "status": getattr(obj, "status", "active"),
            "last_interaction": getattr(obj, "last_interaction", None),
        }

    def get_related_videos_info(self, obj):
        """관련 비디오 정보"""
        if not obj.related_videos:
            return []

        try:
            return [
                {
                    "video_id": obj.related_videos.video_id,
                    "name": getattr(obj.related_videos, "name", "")
                    or getattr(obj.related_videos, "filename", ""),
                    "duration": getattr(obj.related_videos, "duration", 0),
                }
            ]
        except Exception:
            return []


class PromptInteractionSerializer(serializers.ModelSerializer):
    # 기존 호환성 필드들
    interaction_number = serializers.ReadOnlyField(source="sequence_number")
    is_first_in_session = serializers.ReadOnlyField()
    timeline_display = serializers.ReadOnlyField()
    processing_time_display = serializers.ReadOnlyField()

    # 새로운 클라우드 필드들
    thumbnail_urls = serializers.SerializerMethodField()
    analysis_results = serializers.SerializerMethodField()
    visual_elements = serializers.SerializerMethodField()

    class Meta:
        model = PromptInteraction
        fields = "__all__"

    def get_thumbnail_urls(self, obj):
        """생성된 썸네일 URL들"""
        if hasattr(obj, "thumbnail_s3_keys") and obj.thumbnail_s3_keys:
            return obj.generate_thumbnail_urls()
        return []

    def get_analysis_results(self, obj):
        """분석 결과 정보"""
        return {
            "analysis_type": getattr(obj, "analysis_type", ""),
            "confidence_score": getattr(obj, "confidence_score", 0.0),
            "processing_time": getattr(obj, "processing_time", 0.0),
            "results": getattr(obj, "analysis_results", {}),
        }

    def get_visual_elements(self, obj):
        """감지된 시각적 요소들"""
        return getattr(obj, "visual_elements", [])


class DepthDataSerializer(serializers.ModelSerializer):
    bbox_array = serializers.ReadOnlyField()
    bbox_width = serializers.ReadOnlyField()
    bbox_height = serializers.ReadOnlyField()
    depth_range = serializers.ReadOnlyField()
    frame_timestamp = serializers.ReadOnlyField()

    # 새로운 클라우드 필드들
    depth_map_url = serializers.SerializerMethodField()
    tier_info = serializers.SerializerMethodField()

    class Meta:
        model = DepthData
        fields = "__all__"

    def get_depth_map_url(self, obj):
        """깊이 맵 S3 URL"""
        if hasattr(obj, "depth_map_s3_key") and obj.depth_map_s3_key:
            return VideoSerializer()._generate_s3_url(obj.depth_map_s3_key)
        return None

    def get_tier_info(self, obj):
        """데이터 티어 정보"""
        return {"tier": getattr(obj, "data_tier", "hot")}


class DisplayDataSerializer(serializers.ModelSerializer):
    bbox_array = serializers.ReadOnlyField()
    center_x = serializers.ReadOnlyField()
    center_y = serializers.ReadOnlyField()
    area = serializers.ReadOnlyField()

    # 새로운 클라우드 필드들
    mask_image_url = serializers.SerializerMethodField()
    tier_info = serializers.SerializerMethodField()

    class Meta:
        model = DisplayData
        fields = "__all__"

    def get_mask_image_url(self, obj):
        """마스크 이미지 S3 URL"""
        if hasattr(obj, "mask_image_s3_key") and obj.mask_image_s3_key:
            return VideoSerializer()._generate_s3_url(obj.mask_image_s3_key)
        return None

    def get_tier_info(self, obj):
        """데이터 티어 정보"""
        return {"tier": getattr(obj, "data_tier", "hot")}


# 새로운 클라우드 전용 시리얼라이저들
class VideoAnalysisSerializer(serializers.ModelSerializer):
    searchable_content = serializers.ReadOnlyField(source="searchable_text")
    keywords_list = serializers.ReadOnlyField(source="keywords")
    tier_status = serializers.SerializerMethodField()

    class Meta:
        model = VideoAnalysis
        fields = "__all__"

    def get_tier_status(self, obj):
        return {
            "tier": obj.data_tier,
            "search_count": obj.search_count,
            "last_accessed": obj.last_accessed,
        }


class AnalysisJobSerializer(serializers.ModelSerializer):
    duration_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisJob
        fields = "__all__"

    def get_duration_display(self, obj):
        duration = obj.duration
        if duration:
            return f"{duration:.2f}초"
        return "처리중"

    def get_status_display(self, obj):
        status_map = {
            "submitted": "제출됨",
            "pending": "대기중",
            "runnable": "실행가능",
            "starting": "시작중",
            "running": "실행중",
            "succeeded": "성공",
            "failed": "실패",
        }
        return status_map.get(obj.status, obj.status)

    area = serializers.ReadOnlyField()

    class Meta:
        model = DisplayData
        fields = "__all__"


# 일괄 처리를 위한 시리얼라이저들
class DepthDataBulkCreateSerializer(serializers.Serializer):
    """DepthData 일괄 생성용 시리얼라이저"""

    video_id = serializers.IntegerField()
    frame_data = serializers.DictField()

    def create(self, validated_data):
        video_id = validated_data["video_id"]
        frame_data = validated_data["frame_data"]

        depth_data_objects = []

        for frame_name, frame_info in frame_data.items():
            for mask in frame_info["masks"]:
                depth_data_objects.append(
                    DepthData(
                        video_id=video_id,
                        frame_name=frame_info["image_name"],
                        frame_width=frame_info["width"],
                        frame_height=frame_info["height"],
                        mask_id=mask["mask_id"],
                        bbox_x1=mask["bbox"][0],
                        bbox_y1=mask["bbox"][1],
                        bbox_x2=mask["bbox"][2],
                        bbox_y2=mask["bbox"][3],
                        area=mask["area"],
                        avg_depth=mask["avg_depth"],
                        min_depth=mask["min_depth"],
                        max_depth=mask["max_depth"],
                    )
                )

        return DepthData.objects.bulk_create(depth_data_objects)


class DisplayDataBulkCreateSerializer(serializers.Serializer):
    """DisplayData 일괄 생성용 시리얼라이저"""

    video_id = serializers.IntegerField()
    display_info = serializers.DictField()

    def create(self, validated_data):
        video_id = validated_data["video_id"]
        display_info = validated_data["display_info"]

        display_data_objects = []
        coord_conversion = display_info["coordinate_conversion"]

        for mask in display_info["masks"]:
            display_data_objects.append(
                DisplayData(
                    video_id=video_id,
                    image_index=display_info["image_index"],
                    image_name=display_info["image_name"],
                    timestamp=display_info["timestamp"],
                    original_width=coord_conversion["original_width"],
                    original_height=coord_conversion["original_height"],
                    new_width=coord_conversion["new_width"],
                    new_height=coord_conversion["new_height"],
                    width_ratio=coord_conversion["width_ratio"],
                    height_ratio=coord_conversion["height_ratio"],
                    mask_key=mask["mask_key"],
                    avg_depth=mask["avg_depth"],
                    description=mask["description"],
                    min_x=mask["min_x"],
                    max_x=mask["max_x"],
                    min_y=mask["min_y"],
                    max_y=mask["max_y"],
                    width=mask["width"],
                    height=mask["height"],
                )
            )

        return DisplayData.objects.bulk_create(display_data_objects)
