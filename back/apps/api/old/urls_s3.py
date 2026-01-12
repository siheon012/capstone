"""
S3 업로드 관련 URL 패턴
"""

from django.urls import path
from .views import s3

app_name = 'api_s3'

urlpatterns = [
    # S3 업로드 관련 엔드포인트
    path('upload/request/', s3.request_upload_url, name='request_upload_url'),
    path('upload/confirm/', s3.confirm_upload, name='confirm_upload'),
    path('video/<int:video_id>/download/', s3.get_video_download_url, name='get_video_download_url'),
    path('video/<int:video_id>/delete/', s3.delete_video, name='delete_video'),
]
