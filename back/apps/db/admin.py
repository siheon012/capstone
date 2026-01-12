from django.contrib import admin
from apps.db.models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData

@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ['video_id', 'name', 'duration', 'file_size', 'upload_date', 'data_tier', 'analysis_status']
    list_filter = ['upload_date', 'data_tier', 'analysis_status']
    search_fields = ['name', 'filename', 'description']
    readonly_fields = ['upload_date', 'created_at', 'updated_at', 'last_accessed']

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['video', 'timestamp', 'event_type', 'age_group', 'gender', 'action']
    list_filter = ['event_type', 'gender', 'age_group', 'video']
    search_fields = ['event_type', 'action', 'interaction_target']
    raw_id_fields = ['video']

@admin.register(PromptSession)
class PromptSessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'user_id', 'total_interactions', 'status', 'created_at', 'updated_at']
    list_filter = ['status', 'created_at', 'updated_at', 'data_tier']
    search_fields = ['session_id', 'user_id', 'session_name', 'session_summary']
    raw_id_fields = ['main_event']
    readonly_fields = ['created_at', 'updated_at', 'last_interaction']

@admin.register(PromptInteraction)
class PromptInteractionAdmin(admin.ModelAdmin):
    list_display = ['interaction_id', 'session', 'sequence_number', 'user_intent', 'created_at']
    list_filter = ['user_intent', 'analysis_type', 'created_at']
    search_fields = ['interaction_id', 'user_prompt', 'ai_response']
    raw_id_fields = ['session']
    readonly_fields = ['created_at']

@admin.register(DepthData)
class DepthDataAdmin(admin.ModelAdmin):
    list_display = ['video', 'frame_name', 'mask_id', 'avg_depth', 'area', 'created_at']
    list_filter = ['video', 'created_at']
    search_fields = ['frame_name']
    raw_id_fields = ['video']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('video', 'frame_name', 'frame_width', 'frame_height', 'created_at')
        }),
        ('마스크 정보', {
            'fields': ('mask_id', 'bbox_x1', 'bbox_y1', 'bbox_x2', 'bbox_y2', 'area')
        }),
        ('깊이 정보', {
            'fields': ('avg_depth', 'min_depth', 'max_depth')
        })
    )

@admin.register(DisplayData)
class DisplayDataAdmin(admin.ModelAdmin):
    list_display = ['video', 'image_name', 'mask_key', 'description', 'avg_depth', 'timestamp']
    list_filter = ['video', 'description', 'timestamp']
    search_fields = ['image_name', 'description']
    raw_id_fields = ['video']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('video', 'image_index', 'image_name', 'timestamp', 'created_at')
        }),
        ('좌표 변환', {
            'fields': ('original_width', 'original_height', 'new_width', 'new_height', 'width_ratio', 'height_ratio')
        }),
        ('마스크 정보', {
            'fields': ('mask_key', 'avg_depth', 'description')
        }),
        ('바운딩 박스', {
            'fields': ('min_x', 'max_x', 'min_y', 'max_y', 'width', 'height')
        })
    )
