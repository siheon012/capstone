from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .summary_views import generate_video_summary, check_summary_status
from . import views_s3

# DRF Router 설정
router = DefaultRouter()
router.register(r'prompt-sessions', views.PromptSessionViewSet)

urlpatterns = [
    # 헬스체크 엔드포인트 (최상단에 위치)
    path('health/', views.health_check, name='health_check'),
    
    # DRF ViewSet URLs
    path('', include(router.urls)),
    
    # 기존 프롬프트 API
    path('prompt/', views.process_prompt, name='process_prompt'),
    path('prompt/history/', views.get_prompt_history, name='get_prompt_history'),
    path('prompt/history/<str:session_id>/', views.get_session_detail, name='get_session_detail'),
    
    # VLM 채팅 API (새로 추가)
    path('vlm-chat/', views.process_vlm_chat, name='process_vlm_chat'),
    
    # 비디오 API
    path('videos/', views.video_list_create, name='video_list_create'),
    path('videos/<str:video_id>/', views.video_detail, name='video_detail'),
    path('videos/<str:video_id>/summary/', generate_video_summary, name='generate_video_summary'),
    path('videos/<str:video_id>/summary/status/', check_summary_status, name='check_summary_status'),
    path('videos/check-duplicate/', views.check_duplicate_video, name='check_duplicate_video'),
    
    # S3 업로드 API
    path('s3/upload/request/', views_s3.request_upload_url, name='request_upload_url'),
    path('s3/upload/confirm/', views_s3.confirm_upload, name='confirm_upload'),
    path('s3/video/<int:video_id>/download/', views_s3.get_video_download_url, name='get_video_download_url'),
    path('s3/video/<int:video_id>/', views_s3.delete_video, name='delete_video_s3'),
    path('upload-thumbnail', views_s3.upload_thumbnail, name='upload_thumbnail'),
]
