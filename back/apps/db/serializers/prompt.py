from rest_framework import serializers
from apps.db.models import PromptSession, PromptInteraction


class PromptSessionSerializer(serializers.ModelSerializer):
    # 프론트엔드 호환성을 위한 id 필드 (session_id를 id로 매핑)
    id = serializers.CharField(source="session_id", read_only=True)

    # 기존 호환성 필드들
    display_title = serializers.ReadOnlyField()
    session_number = serializers.ReadOnlyField()  # 비디오별 세션 번호
    timeline_summary = serializers.ReadOnlyField()
    main_event_display = serializers.ReadOnlyField()

    # Forward reference로 순환 import 해결
    main_event = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()
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

    def get_main_event(self, obj):
        """main_event 직렬화"""
        if obj.main_event:
            from .event import EventSerializer

            return EventSerializer(obj.main_event).data
        return None

    def get_video(self, obj):
        """related_videos 비디오 반환"""
        if obj.related_videos:
            from .video import VideoSerializer

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
