from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
import os
import json
from datetime import datetime
from .models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData
from .serializers import (
    VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer,
    DepthDataSerializer, DisplayDataSerializer, DepthDataBulkCreateSerializer, DisplayDataBulkCreateSerializer
)

@method_decorator(csrf_exempt, name='dispatch')
class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
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
            max_size = 5 * 1024 * 1024 * 1024
            if video_file.size > max_size:
                return Response(
                    {'error': '파일 크기는 5GB를 초과할 수 없습니다.'},
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
    
    @action(detail=True, methods=['patch'], url_path='update-progress')
    def update_analysis_progress(self, request, pk=None):
        """분석 모델에서 진행률 업데이트를 위한 API"""
        try:
            video = self.get_object()
            progress = request.data.get('progress')
            analysis_status = request.data.get('status', 'processing')
            
            # 진행률 유효성 검사
            if progress is None:
                return Response(
                    {'error': 'progress 값이 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                progress = int(progress)
                if not (0 <= progress <= 100):
                    raise ValueError("진행률은 0-100 사이여야 합니다.")
            except (ValueError, TypeError):
                return Response(
                    {'error': '진행률은 0-100 사이의 정수여야 합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # 분석 상태 유효성 검사
            valid_statuses = ['pending', 'processing', 'completed', 'failed']
            if analysis_status not in valid_statuses:
                return Response(
                    {'error': f'유효하지 않은 상태입니다. 가능한 값: {valid_statuses}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # 진행률과 상태 업데이트
            video.analysis_progress = progress
            video.analysis_status = analysis_status
            
            # 완료 시 자동으로 진행률을 100으로 설정
            if analysis_status == 'completed':
                video.analysis_progress = 100
            
            video.save(update_fields=['analysis_progress', 'analysis_status'])
            
            return Response({
                'success': True,
                'message': f'진행률이 {progress}%로 업데이트되었습니다.',
                'video_id': video.video_id,
                'progress': video.analysis_progress,
                'status': video.analysis_status
            }, status=status.HTTP_200_OK)
            
        except Video.DoesNotExist:
            return Response(
                {'error': '존재하지 않는 비디오입니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'진행률 업데이트 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='progress')
    def get_analysis_progress(self, request, pk=None):
        """분석 진행률 조회 API"""
        try:
            video = self.get_object()
            
            return Response({
                'video_id': video.video_id,
                'progress': video.analysis_progress,
                'status': video.analysis_status,
                'is_completed': video.analysis_status == 'completed',
                'is_failed': video.analysis_status == 'failed'
            }, status=status.HTTP_200_OK)
            
        except Video.DoesNotExist:
            return Response(
                {'error': '존재하지 않는 비디오입니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'진행률 조회 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

@method_decorator(csrf_exempt, name='dispatch')
class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
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