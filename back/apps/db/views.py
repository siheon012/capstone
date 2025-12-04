from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.conf import settings
import os
import json
import boto3
from datetime import datetime
from .models import Video, Event, PromptSession, PromptInteraction, DepthData, DisplayData, VideoAnalysis, AnalysisJob
from .serializers import (
    VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer,
    DepthDataSerializer, DisplayDataSerializer, DepthDataBulkCreateSerializer, DisplayDataBulkCreateSerializer,
    VideoAnalysisSerializer, AnalysisJobSerializer
)

@method_decorator(csrf_exempt, name='dispatch')
class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def create(self, request, *args, **kwargs):
        """비디오 생성 - 클라우드 지원 추가"""
        print(f"🎬 [VideoViewSet CREATE] 요청 시작")
        print(f"📦 [VideoViewSet CREATE] Request method: {request.method}")
        print(f"📂 [VideoViewSet CREATE] Request headers: {dict(request.headers)}")
        print(f"📝 [VideoViewSet CREATE] Request data: {request.data}")
        print(f"📁 [VideoViewSet CREATE] Request FILES: {request.FILES}")
        print(f"🔍 [VideoViewSet CREATE] Content type: {request.content_type}")
        
        try:
            # 요청 데이터 유효성 검사
            if not request.data:
                print("❌ [VideoViewSet CREATE] 요청 데이터가 비어있음")
                return Response(
                    {'error': '요청 데이터가 비어있습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # 기본 create 메서드 호출
            response = super().create(request, *args, **kwargs)
            
            # 생성된 비디오에 대해 검색 통계 초기화
            if response.status_code == status.HTTP_201_CREATED:
                video_id = response.data.get('video_id')
                if video_id:
                    video = Video.objects.get(video_id=video_id)
                    # 클라우드 필드 초기화
                    if hasattr(video, 'increment_search_count'):
                        # 새 비디오는 hot 티어로 시작
                        video.data_tier = 'hot'
                        video.hotness_score = 100.0
                        video.save()
            
            print(f"✅ [VideoViewSet CREATE] 생성 성공")
            print(f"📋 [VideoViewSet CREATE] Response status: {response.status_code}")
            print(f"📄 [VideoViewSet CREATE] Response data: {response.data}")
            
            return response
            
        except Exception as e:
            print(f"❌ [VideoViewSet CREATE] 오류 발생: {str(e)}")
            print(f"🔥 [VideoViewSet CREATE] Exception type: {type(e).__name__}")
            import traceback
            print(f"📚 [VideoViewSet CREATE] Traceback: {traceback.format_exc()}")
            
            return Response(
                {'error': f'비디오 생성 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='upload')
    def upload_video(self, request):
        """비디오 파일 업로드 - S3 지원 + 메타데이터 추출 + 분석 트리거"""
        from .utils import extract_video_metadata
        
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
            
            # 파일 크기 제한 (10GB)
            max_size = 10 * 1024 * 1024 * 1024
            if video_file.size > max_size:
                return Response(
                    {'error': '파일 크기는 10GB를 초과할 수 없습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            print(f"📹 [Video Upload] 1단계: 메타데이터 추출 시작 - {video_file.name}")
            
            # ✨ 1단계: 메타데이터 추출
            metadata = extract_video_metadata(video_file)
            
            print(f"✅ [Video Upload] 메타데이터 추출 완료: duration={metadata['duration']}s, fps={metadata['fps']}")
            
            # ✨ 2단계: 임시 Video 객체 생성 (video_id 획득용)
            temp_video = Video.objects.create(
                name=video_file.name,
                filename=video_file.name,
                original_filename=video_file.name,
                file_size=video_file.size,
                duration=metadata['duration'],
                fps=metadata['fps'],
                frame_rate=metadata['fps'],
                width=metadata['width'],
                height=metadata['height'],
                resolution_width=metadata['width'],
                resolution_height=metadata['height'],
                data_tier='hot',
                hotness_score=100.0,
                metadata_extracted=True,
                analysis_status='pending',
                analysis_progress=0,
            )
            
            print(f"✅ [Video Upload] 임시 Video 객체 생성: video_id={temp_video.video_id}")
            
            # ✨ 3단계: S3 업로드 (video_id를 경로에 포함)
            s3_key = None
            s3_bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', 'capstone-video-bucket')
            
            if getattr(settings, 'USE_S3', False):
                try:
                    print(f"☁️ [Video Upload] S3 업로드 시작 - {s3_bucket}")
                    
                    s3_client = boto3.client('s3')
                    # video_id를 경로에 포함: videos/{video_id}/{filename}
                    s3_key = f"videos/{temp_video.video_id}/{video_file.name}"
                    
                    s3_client.upload_fileobj(
                        video_file,
                        s3_bucket,
                        s3_key,
                        ExtraArgs={'ContentType': video_file.content_type}
                    )
                    print(f"✅ [Video Upload] S3 업로드 성공: s3://{s3_bucket}/{s3_key}")
                except Exception as e:
                    print(f"❌ [Video Upload] S3 업로드 실패: {str(e)}")
                    # S3 실패시 로컬 저장으로 폴백
                    s3_key = None
            
            # ✨ 4단계: S3 키로 Video 객체 업데이트
            print(f"💾 [Video Upload] Video 객체 업데이트: S3 경로 설정")
            
            # S3 또는 로컬 경로 설정
            if s3_key:
                temp_video.s3_key = s3_key
                temp_video.s3_raw_key = s3_key
                temp_video.s3_bucket = s3_bucket
                temp_video.save(update_fields=['s3_key', 's3_raw_key', 's3_bucket'])
            else:
                # 로컬 저장
                temp_video.video_file = video_file
                temp_video.save(update_fields=['video_file'])
            
            video = temp_video
            print(f"✅ [Video Upload] Video 객체 업데이트 완료: video_id={video.video_id}")
            
            # ✨ 5단계: S3 Event Notification이 자동으로 SQS → Lambda → Batch 트리거
            # S3 업로드 완료 후 자동으로 분석이 시작됨 (추가 API 호출 불필요)
            if s3_key:
                print(f"✅ [Video Upload] S3 업로드 완료. S3 Event Notification이 자동으로 분석을 시작합니다.")
            
            # 시리얼라이저로 응답 데이터 생성
            serializer = self.get_serializer(video)
            
            return Response({
                'success': True,
                'videoId': video.video_id,
                'message': '비디오가 성공적으로 업로드되었습니다.',
                'video': serializer.data,
                'metadata': metadata,
                's3_key': s3_key,
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import traceback
            print(f"❌ [Video Upload] 오류 발생: {str(e)}")
            print(f"📚 [Video Upload] Traceback: {traceback.format_exc()}")
            
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
            
            # ✨ 분석 완료 시 자동으로 Summary 생성
            if analysis_status == 'completed' and progress == 100:
                try:
                    from apps.db.models import Event
                    from apps.api.vlm_service import get_vlm_service
                    
                    events = Event.objects.filter(video=video).order_by('timestamp')
                    
                    if events.exists():
                        print(f"🤖 [Auto-Summary] 자동 요약 생성 시작: video_id={video.video_id}, events={events.count()}개")
                        
                        vlm_service = get_vlm_service()
                        summary = vlm_service.generate_video_summary(
                            video=video,
                            events=list(events),
                            summary_type='events'
                        )
                        
                        # DB에 저장
                        video.summary = summary
                        video.save(update_fields=['summary'])
                        
                        print(f"✅ [Auto-Summary] 자동 요약 생성 완료: video_id={video.video_id}")
                    else:
                        print(f"⚠️ [Auto-Summary] 이벤트가 없어 요약 생성 생략: video_id={video.video_id}")
                        
                except Exception as e:
                    print(f"❌ [Auto-Summary] 자동 요약 생성 실패: {str(e)}")
                    # 요약 생성 실패해도 진행률 업데이트는 성공으로 처리
            
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


# 새로운 클라우드 모델을 위한 ViewSet들
class VideoAnalysisViewSet(viewsets.ModelViewSet):
    """비디오 분석 결과 ViewSet"""
    queryset = VideoAnalysis.objects.all()
    serializer_class = VideoAnalysisSerializer
    
    def get_queryset(self):
        queryset = VideoAnalysis.objects.all()
        video_id = self.request.query_params.get('video_id', None)
        analysis_type = self.request.query_params.get('analysis_type', None)
        tier = self.request.query_params.get('tier', None)
        
        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if analysis_type is not None:
            queryset = queryset.filter(analysis_type=analysis_type)
        if tier is not None:
            queryset = queryset.filter(data_tier=tier)
            
        return queryset.order_by('-created_at')
    
    @action(detail=False, methods=['post'], url_path='vector-search')
    def vector_search(self, request):
        """벡터 유사도 검색"""
        try:
            from .search_service import RAGSearchService
            
            query = request.data.get('query', '')
            video_id = request.data.get('video_id', None)
            limit = request.data.get('limit', 10)
            
            if not query:
                return Response(
                    {'error': '검색 쿼리가 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # RAG 검색 서비스 사용
            search_service = RAGSearchService()
            results = search_service.search_similar_events(
                query=query,
                video_id=video_id,
                limit=limit
            )
            
            return Response({
                'query': query,
                'results': results,
                'count': len(results)
            })
            
        except Exception as e:
            return Response(
                {'error': f'벡터 검색 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='generate-embedding')
    def generate_embedding(self, request):
        """텍스트 임베딩 생성"""
        try:
            text = request.data.get('text', '')
            if not text:
                return Response(
                    {'error': '임베딩할 텍스트가 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            from .search_service import RAGSearchService
            search_service = RAGSearchService()
            embedding = search_service.generate_embedding(text)
            
            return Response({
                'text': text,
                'embedding': embedding,
                'dimension': len(embedding) if embedding else 0
            })
            
        except Exception as e:
            return Response(
                {'error': f'임베딩 생성 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AnalysisJobViewSet(viewsets.ModelViewSet):
    """AWS Batch 분석 작업 ViewSet"""
    queryset = AnalysisJob.objects.all()
    serializer_class = AnalysisJobSerializer
    
    def get_queryset(self):
        queryset = AnalysisJob.objects.all()
        video_id = self.request.query_params.get('video_id', None)
        status_filter = self.request.query_params.get('status', None)
        
        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if status_filter is not None:
            queryset = queryset.filter(status=status_filter)
            
        return queryset.order_by('-created_at')
    
    @action(detail=True, methods=['post'], url_path='update-status')
    def update_status(self, request, pk=None):
        """AWS Batch에서 작업 상태 업데이트"""
        try:
            job = self.get_object()
            old_status = job.status
            
            # AWS에서 최신 상태 조회
            job.update_status_from_aws()
            
            if job.status != old_status:
                return Response({
                    'job_id': job.job_id,
                    'old_status': old_status,
                    'new_status': job.status,
                    'updated': True
                })
            else:
                return Response({
                    'job_id': job.job_id,
                    'status': job.status,
                    'updated': False
                })
                
        except Exception as e:
            return Response(
                {'error': f'상태 업데이트 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='submit-analysis')
    def submit_analysis(self, request):
        """새로운 분석 작업 제출"""
        try:
            video_id = request.data.get('video_id')
            analysis_types = request.data.get('analysis_types', [])
            
            if not video_id:
                return Response(
                    {'error': 'video_id가 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not analysis_types:
                return Response(
                    {'error': 'analysis_types가 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # AWS Batch 작업 제출 로직 (실제 구현 필요)
            job_name = f"video-analysis-{video_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            job_id = f"batch-job-{video_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # AnalysisJob 생성
            analysis_job = AnalysisJob.objects.create(
                video_id=video_id,
                job_id=job_id,
                job_name=job_name,
                job_queue='video-analysis-queue',
                job_definition='video-analysis-job-def',
                analysis_types=analysis_types,
                status='submitted'
            )
            
            serializer = self.get_serializer(analysis_job)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'분석 작업 제출 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# 데이터 티어링 관리 ViewSet
class TierManagementViewSet(viewsets.GenericViewSet):
    """데이터 티어링 관리 API"""
    
    @action(detail=False, methods=['post'], url_path='promote-to-hot')
    def promote_to_hot(self, request):
        """Hot 티어로 승격"""
        try:
            video_id = request.data.get('video_id')
            if not video_id:
                return Response(
                    {'error': 'video_id가 필요합니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            from .tier_manager import TierManager
            tier_manager = TierManager()
            result = tier_manager.promote_to_hot(video_id)
            
            return Response({
                'success': True,
                'video_id': video_id,
                'message': f'비디오가 Hot 티어로 승격되었습니다.',
                'result': result
            })
            
        except Exception as e:
            return Response(
                {'error': f'티어 승격 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='run-tier-management')
    def run_tier_management(self, request):
        """티어 관리 실행"""
        try:
            from .tier_manager import TierManager
            tier_manager = TierManager()
            
            results = tier_manager.run_daily_tier_management()
            
            return Response({
                'success': True,
                'message': '티어 관리가 완료되었습니다.',
                'results': results
            })
            
        except Exception as e:
            return Response(
                {'error': f'티어 관리 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )