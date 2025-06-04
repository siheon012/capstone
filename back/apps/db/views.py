from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
from .models import Video, Event, PromptSession, PromptInteraction
from .serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer

class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    parser_classes = [MultiPartParser, FormParser]
    
    @action(detail=False, methods=['post'], url_path='upload')
    def upload_video(self, request):
        """비디오 파일 업로드"""
        try:
            video_file = request.FILES.get('video')
            if not video_file:
                return Response(
                    {'error': '비디오 파일이 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # 파일 타입 검증
            if not video_file.content_type.startswith('video/'):
                return Response(
                    {'error': '비디오 파일만 업로드 가능합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # 파일 크기 제한
            max_size = 2 * 1024 * 1024 * 1024
            if video_file.size > max_size:
                return Response(
                    {'error': '파일 크기는 2GB를 초과할 수 없습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Video 객체 생성 및 저장
            video = Video.objects.create(
                name=video_file.name,
                video_file=video_file,
                size=video_file.size,  # file_size -> size로 변경
                duration=0,  # 초기값 설정 (추후 분석으로 업데이트)
                thumbnail_path=""  # 초기값 설정 (추후 썸네일 생성으로 업데이트)
            )
            
            # 시리얼라이저로 응답 데이터 생성
            serializer = self.get_serializer(video)
            
            return Response({
                'success': True,
                'message': '비디오가 성공적으로 업로드되었습니다.',
                'video': serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'업로드 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer

class PromptSessionViewSet(viewsets.ModelViewSet):
    queryset = PromptSession.objects.all()
    serializer_class = PromptSessionSerializer
    
class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer

# Timeline 모델이 주석처리되어 있어 ViewSet 제외
# class TimelineViewSet(viewsets.ModelViewSet):
#     queryset = Timeline.objects.all()
#     serializer_class = TimelineSerializer