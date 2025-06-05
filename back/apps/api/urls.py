from django.urls import path
from . import views

urlpatterns = [
    # 기존 프롬프트 API
    path('prompt/', views.process_prompt, name='process_prompt'),
    path('prompt/history/', views.get_prompt_history, name='get_prompt_history'),
    path('prompt/history/<int:session_id>/', views.get_session_detail, name='get_session_detail'),
    
    # 비디오 API
    path('videos/', views.video_list_create, name='video_list_create'),
    path('videos/<str:video_id>/', views.video_detail, name='video_detail'),
    path('videos/check-duplicate/', views.check_duplicate_video, name='check_duplicate_video'),
]
