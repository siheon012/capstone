from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.conf import settings
import logging

from apps.db.models import Video, Event
from apps.api.services import get_video_service
from ..serializers import VideoSerializer

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def destroy(self, request, *args, **kwargs):
        """비디오 삭제 - VideoService 사용"""
        try:
            video = self.get_object()
            video_id = video.video_id
            video_name = video.name
            
            # VideoService를 통한 삭제 (S3 파일 포함)
            video_service = get_video_service()
            video_service.delete_video(video_id)
            
            logger.info(f"✅ Video deleted: video_id={video_id}, name={video_name}")
            
            return Response(
                {'success': True, 'message': '비디오가 성공적으로 삭제되었습니다.'},
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Video.DoesNotExist:
            return Response(
                {'error': '존재하지 않는 비디오입니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"❌ Video deletion failed: {e}", exc_info=True)
            return Response(
                {'error': f'비디오 삭제 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def create(self, request, *args, **kwargs):
        """비디오 생성"""
        try:
            if not request.data:
                return Response(
                    {'error': '요청 데이터가 비어있습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            response = super().create(request, *args, **kwargs)
            
            if response.status_code == status.HTTP_201_CREATED:
                video_id = response.data.get('video_id')
                if video_id:
                    video = Video.objects.get(video_id=video_id)
                    video.data_tier = 'hot'
                    video.hotness_score = 100.0
                    video.save(update_fields=['data_tier', 'hotness_score'])
            
            return response
            
        except Exception as e:
            logger.error(f"Video creation failed: {e}", exc_info=True)
            return Response(
                {'error': f'비디오 생성 중 오류가 발생했습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='upload')
    def upload_video(self, request):
        """비디오 파일 업로드 - VideoService 사용"""
        from ..utils import extract_video_metadata
        
        try:
            video_file = request.FILES.get('video')
            if not video_file:
                return Response({'error': '비디오 파일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
            
            if not video_file.content_type.startswith('video/'):
                return Response({'error': '비디오 파일만 업로드 가능합니다.'}, status=status.HTTP_400_BAD_REQUEST)
            
            max_size = 10 * 1024 * 1024 * 1024  # 10GB
            if video_file.size > max_size:
                return Response({'error': '파일 크기는 10GB를 초과할 수 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)
            
            logger.info(f"Uploading video: {video_file.name}")
            
            # 메타데이터 추출
            metadata = extract_video_metadata(video_file)
            logger.info(f"Metadata: duration={metadata['duration']}s, fps={metadata['fps']}")
            
            # Video 객체 생성
            video = Video.objects.create(
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
            
            logger.info(f"Video created: video_id={video.video_id}")
            
            # S3 업로드 (VideoService 사용)
            video_service = get_video_service()
            s3_key = video_service._upload_to_s3(video, video_file)
            
            if s3_key:
                video.s3_key = s3_key
                video.s3_raw_key = s3_key
                video.s3_bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', 'capstone-video-bucket')
                video.save(update_fields=['s3_key', 's3_raw_key', 's3_bucket'])
                logger.info(f"S3 upload complete: s3://{video.s3_bucket}/{s3_key}")
            
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
            logger.error(f"Video upload failed: {e}", exc_info=True)
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
            
            # 분석 완료 시 자동으로 Summary 생성
            if analysis_status == 'completed' and progress == 100:
                try:
                    from apps.api.vlm_service import get_vlm_service
                    
                    events = Event.objects.filter(video=video).order_by('timestamp')
                    
                    if events.exists():
                        logger.info(f"🤖 [Auto-Summary] 자동 요약 생성 시작: video_id={video.video_id}, events={events.count()}개")
                        
                        vlm_service = get_vlm_service()
                        summary = vlm_service.generate_video_summary(
                            video=video,
                            events=list(events),
                            summary_type='events'
                        )
                        
                        # DB에 저장
                        video.summary = summary
                        video.save(update_fields=['summary'])
                        
                        logger.info(f"✅ [Auto-Summary] 자동 요약 생성 완료: video_id={video.video_id}")
                    else:
                        logger.warning(f"⚠️ [Auto-Summary] 이벤트가 없어 요약 생성 생략: video_id={video.video_id}")
                        
                except Exception as e:
                    logger.error(f"❌ [Auto-Summary] 자동 요약 생성 실패: {str(e)}")
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
