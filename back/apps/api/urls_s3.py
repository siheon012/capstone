"""
S3 업로드 관련 URL 패턴
"""

from django.urls import path
from . import views_s3

app_name = 'api_s3'

urlpatterns = [
    # S3 업로드 관련 엔드포인트
    path('upload/request/', views_s3.request_upload_url, name='request_upload_url'),
    path('upload/confirm/', views_s3.confirm_upload, name='confirm_upload'),
    path('video/<int:video_id>/download/', views_s3.get_video_download_url, name='get_video_download_url'),
    path('video/<int:video_id>/delete/', views_s3.delete_video, name='delete_video'),
]
