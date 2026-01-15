from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import health, prompt, vlm, summary, s3

# DRF Router 설정 (현재 비어있음 - 필요시 ViewSet 추가)
router = DefaultRouter()

urlpatterns = [
    # 헬스체크 엔드포인트 (최상단에 위치)
    path('health/', health.health_check, name='health_check'),
    
    # DRF ViewSet URLs
    path('', include(router.urls)),
    
    # 프롬프트 API
    path('prompt/', prompt.process_prompt, name='process_prompt'),
    path('prompt/history/', prompt.get_prompt_history, name='get_prompt_history'),
    path('prompt/history/<str:session_id>/', prompt.get_session_detail, name='get_session_detail'),
    
    # VLM 채팅 API
    path('vlm-chat/', vlm.process_vlm_chat, name='process_vlm_chat'),
    
    # 비디오 Summary API
    path('videos/<int:video_id>/summary/', summary.generate_video_summary, name='generate_video_summary'),
    path('videos/<int:video_id>/summary/status/', summary.check_summary_status, name='check_summary_status'),
    
    # S3 업로드 API (urls_s3.py 통합)
    path('s3/upload/request/', s3.request_upload_url, name='s3_request_upload_url'),
    path('s3/upload/confirm/', s3.confirm_upload, name='s3_confirm_upload'),
    path('s3/upload/thumbnail/', s3.upload_thumbnail, name='s3_upload_thumbnail'),
    path('s3/video/<int:video_id>/download/', s3.get_video_download_url, name='s3_get_video_download_url'),
    path('s3/video/<int:video_id>/delete/', s3.delete_video, name='s3_delete_video'),
]
