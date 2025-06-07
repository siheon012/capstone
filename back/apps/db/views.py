from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db import transaction
import os
import json
from datetime import datetime
from .models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData
from .serializers import (
    VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer,
    DepthDataSerializer, DisplayDataSerializer, DepthDataBulkCreateSerializer, DisplayDataBulkCreateSerializer
)

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
            max_size = 2 * 1024 * 1024 * 1024 * 512
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
    
    def get_queryset(self):
        queryset = Event.objects.all()
        video = self.request.query_params.get('video', None)
        event_type = self.request.query_params.get('event_type', None)
        
        if video is not None:
            queryset = queryset.filter(video_id=video)
        if event_type is not None:
            queryset = queryset.filter(event_type__icontains=event_type)
            
        return queryset.order_by('timestamp')
    
    @action(detail=False, methods=['get'], url_path='video-stats')
    def video_stats(self, request):
        """비디오별 이벤트 타입 통계"""
        video_id = request.query_params.get('video_id')
        if not video_id:
            return Response(
                {'error': 'video_id 파라미터가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # 해당 비디오의 이벤트들을 이벤트 타입별로 그룹화하여 카운트
            from django.db.models import Count
            
            event_stats = (
                Event.objects
                .filter(video_id=video_id)
                .values('event_type')
                .annotate(count=Count('event_type'))
                .order_by('-count')
            )
            
            if not event_stats:
                return Response({
                    'video_id': video_id,
                    'most_frequent_event': None,
                    'stats': []
                })
            
            # 가장 많이 발생한 이벤트 타입
            most_frequent = event_stats[0]
            
            return Response({
                'video_id': video_id,
                'most_frequent_event': {
                    'event_type': most_frequent['event_type'],
                    'count': most_frequent['count']
                },
                'stats': list(event_stats)
            })
            
        except Exception as e:
            return Response(
                {'error': f'통계 조회 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class PromptSessionViewSet(viewsets.ModelViewSet):
    queryset = PromptSession.objects.all()
    serializer_class = PromptSessionSerializer
    
class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer

class DepthDataViewSet(viewsets.ModelViewSet):
    queryset = DepthData.objects.all()
    serializer_class = DepthDataSerializer
    
    def get_queryset(self):
        queryset = DepthData.objects.all()
        video_id = self.request.query_params.get('video_id', None)
        frame_name = self.request.query_params.get('frame_name', None)
        
        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if frame_name is not None:
            queryset = queryset.filter(frame_name__icontains=frame_name)
            
        return queryset.order_by('frame_name', 'mask_id')
    
    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """공간 정보 데이터 일괄 생성"""
        try:
            serializer = DepthDataBulkCreateSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    depth_data_objects = serializer.save()
                    return Response({
                        'success': True,
                        'message': f'{len(depth_data_objects)}개의 공간 정보가 저장되었습니다.',
                        'count': len(depth_data_objects)
                    }, status=status.HTTP_201_CREATED)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'공간 정보 저장 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class DisplayDataViewSet(viewsets.ModelViewSet):
    queryset = DisplayData.objects.all()
    serializer_class = DisplayDataSerializer
    
    def get_queryset(self):
        queryset = DisplayData.objects.all()
        video_id = self.request.query_params.get('video_id', None)
        description = self.request.query_params.get('description', None)
        
        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if description is not None:
            queryset = queryset.filter(description__icontains=description)
            
        return queryset.order_by('timestamp', 'image_index', 'mask_key')
    
    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """진열대 정보 데이터 일괄 생성"""
        try:
            serializer = DisplayDataBulkCreateSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    display_data_objects = serializer.save()
                    return Response({
                        'success': True,
                        'message': f'{len(display_data_objects)}개의 진열대 정보가 저장되었습니다.',
                        'count': len(display_data_objects)
                    }, status=status.HTTP_201_CREATED)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'진열대 정보 저장 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='by-depth')
    def by_depth(self, request):
        """깊이별 진열대 정보 조회"""
        video_id = request.query_params.get('video_id')
        if not video_id:
            return Response(
                {'error': 'video_id 파라미터가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        displays = DisplayData.objects.filter(video_id=video_id).order_by('avg_depth')
        serializer = self.get_serializer(displays, many=True)
        
        # 깊이별로 그룹화
        depth_groups = {}
        for display in serializer.data:
            depth = display['description']
            if depth not in depth_groups:
                depth_groups[depth] = []
            depth_groups[depth].append(display)
        
        return Response({
            'video_id': video_id,
            'depth_groups': depth_groups,
            'total_count': len(serializer.data)
        })