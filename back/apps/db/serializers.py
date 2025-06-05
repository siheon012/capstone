from rest_framework import serializers
from .models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData

class VideoSerializer(serializers.ModelSerializer):
    file_path = serializers.ReadOnlyField()
    computed_thumbnail_path = serializers.ReadOnlyField()
    
    class Meta:
        model = Video
        fields = '__all__'

class EventSerializer(serializers.ModelSerializer):
    timestamp_display = serializers.ReadOnlyField()
    absolute_time = serializers.ReadOnlyField()
    absolute_time_display = serializers.ReadOnlyField()
    
    class Meta:
        model = Event
        fields = '__all__'

class PromptSessionSerializer(serializers.ModelSerializer):
    display_title = serializers.ReadOnlyField()
    timeline_summary = serializers.ReadOnlyField()
    main_event_display = serializers.ReadOnlyField()
    
    class Meta:
        model = PromptSession
        fields = '__all__'

class PromptInteractionSerializer(serializers.ModelSerializer):
    interaction_number = serializers.ReadOnlyField()
    is_first_in_session = serializers.ReadOnlyField()
    timeline_display = serializers.ReadOnlyField()
    processing_time_display = serializers.ReadOnlyField()
    
    class Meta:
        model = PromptInteraction
        fields = '__all__'

class DepthDataSerializer(serializers.ModelSerializer):
    bbox_array = serializers.ReadOnlyField()
    bbox_width = serializers.ReadOnlyField()
    bbox_height = serializers.ReadOnlyField()
    depth_range = serializers.ReadOnlyField()
    frame_timestamp = serializers.ReadOnlyField()
    
    class Meta:
        model = DepthData
        fields = '__all__'

class DisplayDataSerializer(serializers.ModelSerializer):
    bbox_array = serializers.ReadOnlyField()
    center_x = serializers.ReadOnlyField()
    center_y = serializers.ReadOnlyField()
    area = serializers.ReadOnlyField()
    
    class Meta:
        model = DisplayData
        fields = '__all__'

# 일괄 처리를 위한 시리얼라이저들
class DepthDataBulkCreateSerializer(serializers.Serializer):
    """DepthData 일괄 생성용 시리얼라이저"""
    video_id = serializers.IntegerField()
    frame_data = serializers.DictField()
    
    def create(self, validated_data):
        video_id = validated_data['video_id']
        frame_data = validated_data['frame_data']
        
        depth_data_objects = []
        
        for frame_name, frame_info in frame_data.items():
            for mask in frame_info['masks']:
                depth_data_objects.append(DepthData(
                    video_id=video_id,
                    frame_name=frame_info['image_name'],
                    frame_width=frame_info['width'],
                    frame_height=frame_info['height'],
                    mask_id=mask['mask_id'],
                    bbox_x1=mask['bbox'][0],
                    bbox_y1=mask['bbox'][1],
                    bbox_x2=mask['bbox'][2],
                    bbox_y2=mask['bbox'][3],
                    area=mask['area'],
                    avg_depth=mask['avg_depth'],
                    min_depth=mask['min_depth'],
                    max_depth=mask['max_depth']
                ))
        
        return DepthData.objects.bulk_create(depth_data_objects)

class DisplayDataBulkCreateSerializer(serializers.Serializer):
    """DisplayData 일괄 생성용 시리얼라이저"""
    video_id = serializers.IntegerField()
    display_info = serializers.DictField()
    
    def create(self, validated_data):
        video_id = validated_data['video_id']
        display_info = validated_data['display_info']
        
        display_data_objects = []
        coord_conversion = display_info['coordinate_conversion']
        
        for mask in display_info['masks']:
            display_data_objects.append(DisplayData(
                video_id=video_id,
                image_index=display_info['image_index'],
                image_name=display_info['image_name'],
                timestamp=display_info['timestamp'],
                original_width=coord_conversion['original_width'],
                original_height=coord_conversion['original_height'],
                new_width=coord_conversion['new_width'],
                new_height=coord_conversion['new_height'],
                width_ratio=coord_conversion['width_ratio'],
                height_ratio=coord_conversion['height_ratio'],
                mask_key=mask['mask_key'],
                avg_depth=mask['avg_depth'],
                description=mask['description'],
                min_x=mask['min_x'],
                max_x=mask['max_x'],
                min_y=mask['min_y'],
                max_y=mask['max_y'],
                width=mask['width'],
                height=mask['height']
            ))
        
        return DisplayData.objects.bulk_create(display_data_objects)