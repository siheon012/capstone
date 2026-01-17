from rest_framework import serializers
from apps.db.models import DepthData, DisplayData, VideoAnalysis, AnalysisJob


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
            from .video import VideoSerializer

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
            from .video import VideoSerializer

            return VideoSerializer()._generate_s3_url(obj.mask_image_s3_key)
        return None

    def get_tier_info(self, obj):
        """데이터 티어 정보"""
        return {"tier": getattr(obj, "data_tier", "hot")}


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
