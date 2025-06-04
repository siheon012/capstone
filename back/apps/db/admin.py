from django.contrib import admin
from .models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData

@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ['video_id', 'name', 'duration', 'size', 'upload_date', 'chat_count']
    list_filter = ['upload_date', 'major_event']
    search_fields = ['name', 'major_event']
    readonly_fields = ['upload_date']

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['video', 'timestamp', 'event_type', 'obj_id', 'age', 'gender', 'action_detected']
    list_filter = ['event_type', 'gender', 'video']
    search_fields = ['event_type', 'action_detected', 'location']
    raw_id_fields = ['video']

@admin.register(PromptSession)
class PromptSessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'video', 'interaction_count', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['first_prompt', 'last_response']
    raw_id_fields = ['video', 'main_event']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(PromptInteraction)
class PromptInteractionAdmin(admin.ModelAdmin):
    list_display = ['session', 'video', 'processing_status', 'found_events_count', 'timestamp']
    list_filter = ['processing_status', 'timestamp']
    search_fields = ['input_prompt', 'output_response']
    raw_id_fields = ['session', 'video']
    readonly_fields = ['timestamp', 'processed_at']

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
