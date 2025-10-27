"""
S3 비디오 업로드 API 뷰
JWT 인증 및 Pre-signed URL 기반 업로드
"""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.http import JsonResponse
import json
import logging

from .services.s3_service import s3_service
# from .services.auth_service import jwt_required  # TODO: 임시 비활성화 (개발용)
from .services.sqs_service import sqs_service
from apps.db.models import Video
from apps.db.serializers import VideoSerializer

logger = logging.getLogger(__name__)


@api_view(['POST'])
# @jwt_required  # TODO: 임시 비활성화 (개발용)
def request_upload_url(request):
    """
    Step 1: 업로드 토큰 및 Pre-signed URL 요청

    Request Body:
    {
        "file_name": "video.mp4",
        "file_size": 1048576,
        "content_type": "video/mp4"
    }

    Response:
    {
        "upload_token": "jwt_token",
        "presigned_url": "https://s3.amazonaws.com/...",
        "s3_key": "videos/2024/01/15/uuid_video.mp4",
        "expires_in": 900
    }
    """
    try:
        data = request.data
        file_name = data.get('file_name')
        file_size = data.get('file_size')
        content_type = data.get('content_type', 'video/mp4')

        # 입력 검증
        if not file_name or not file_size:
            return Response(
                {'error': 'file_name과 file_size가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 파일 크기 제한 (5GB)
        max_size = 5 * 1024 * 1024 * 1024
        if file_size > max_size:
            return Response(
                {'error': '파일 크기는 5GB를 초과할 수 없습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 비디오 파일 타입 검증
        allowed_types = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv']
        if content_type not in allowed_types:
            return Response(
                {'error': f'지원되지 않는 파일 타입입니다. 허용된 타입: {allowed_types}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # JWT에서 사용자 ID 추출 (임시: 하드코딩)
        # user_id = request.user_payload['user_id']  # JWT 사용 시
        user_id = 'demo_user'  # TODO: 임시 사용자 ID
        
        # 업로드 토큰 생성
        upload_token = s3_service.generate_upload_token(
            user_id=user_id,
            file_name=file_name,
            file_size=file_size
        )
        
        # Pre-signed URL 생성
        presigned_url, s3_key = s3_service.generate_presigned_upload_url(
            token=upload_token,
            content_type=content_type
        )
        
        logger.info(f"📡 업로드 URL 요청 성공: user_id={user_id}, s3_key={s3_key}")
        
        return Response({
            'upload_token': upload_token,
            'presigned_url': presigned_url,
            's3_key': s3_key,
            'expires_in': 900  # 15분
        }, status=status.HTTP_200_OK)
        
    except ValueError as e:
        logger.error(f"❌ 업로드 URL 요청 실패: {e}")
        return Response(
            {'error': str(e)}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"❌ 서버 오류: {e}")
        return Response(
            {'error': '서버 내부 오류가 발생했습니다.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
# @jwt_required  # TODO: 임시 비활성화 (개발용)
def confirm_upload(request):
    """
    Step 2: 업로드 완료 확인 및 비디오 메타데이터 저장
    
    Request Body:
    {
        "upload_token": "jwt_token",
        "s3_key": "videos/2024/01/15/uuid_video.mp4",
        "duration": 120.5,
        "thumbnail_url": "optional_thumbnail_url"
    }
    
    Response:
    {
        "video_id": 123,
        "message": "업로드가 완료되었습니다.",
        "video": { ... }
    }
    """
    try:
        data = request.data
        upload_token = data.get('upload_token')
        s3_key = data.get('s3_key')
        duration = data.get('duration', 0)
        thumbnail_url = data.get('thumbnail_url')
        
        # 입력 검증
        if not upload_token or not s3_key:
            return Response(
                {'error': 'upload_token과 s3_key가 필요합니다.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 업로드 토큰 검증
        token_payload = s3_service.validate_upload_token(upload_token)
        
        # S3에 파일이 실제로 업로드되었는지 확인
        if not s3_service.check_file_exists(s3_key):
            return Response(
                {'error': 'S3에서 파일을 찾을 수 없습니다. 업로드를 다시 시도해주세요.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 비디오 메타데이터 DB 저장
        video_data = {
            'name': token_payload['file_name'],
            'video_file': s3_key,  # S3 키를 파일 경로로 저장
            'size': token_payload['file_size'],
            'duration': duration,
            'thumbnail_path': thumbnail_url or '',
            'chat_count': 0,
            'major_event': None
        }
        
        video = Video.objects.create(**video_data)
        serializer = VideoSerializer(video)
        
        # 🚀 SQS 메시지 발행: 비디오 처리 요청
        sqs_result = sqs_service.send_video_processing_message(
            s3_bucket=s3_service.bucket_name,
            s3_key=s3_key,
            video_id=str(video.video_id),
            additional_data={
                'video_name': token_payload['file_name'],
                'file_size': token_payload['file_size'],
                'duration': duration
            }
        )
        
        if sqs_result['success']:
            logger.info(f"SQS 메시지 발송 성공: video_id={video.video_id}, message_id={sqs_result['message_id']}")
        else:
            logger.error(f"SQS 메시지 발송 실패: video_id={video.video_id}, error={sqs_result['error']}")
            # SQS 실패해도 업로드는 성공으로 처리 (비동기 처리이므로)
        
        logger.info(f"비디오 업로드 완료: video_id={video.video_id}, s3_key={s3_key}")
        
        return Response({
            'success': True,
            'video_id': video.video_id,
            'message': '업로드가 완료되었습니다.',
            'video': serializer.data,
            'processing_queued': sqs_result['success']
        }, status=status.HTTP_201_CREATED)
        
    except ValueError as e:
        logger.error(f"❌ 업로드 확인 실패: {e}")
        return Response(
            {'error': str(e)}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"❌ 서버 오류: {e}")
        return Response(
            {'error': '서버 내부 오류가 발생했습니다.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
# @jwt_required  # TODO: 임시 비활성화 (개발용)
def get_video_download_url(request, video_id):
    """
    비디오 다운로드/스트리밍 URL 생성
    
    Response:
    {
        "download_url": "https://s3.amazonaws.com/...",
        "expires_in": 3600
    }
    """
    try:
        video = Video.objects.get(video_id=video_id)
        
        # S3 키에서 다운로드 URL 생성
        download_url = s3_service.generate_download_url(video.video_file)
        
        logger.info(f"📥 다운로드 URL 생성: video_id={video_id}")
        
        return Response({
            'download_url': download_url,
            'expires_in': 3600  # 1시간
        }, status=status.HTTP_200_OK)
        
    except Video.DoesNotExist:
        return Response(
            {'error': '존재하지 않는 비디오입니다.'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"❌ 다운로드 URL 생성 실패: {e}")
        return Response(
            {'error': '다운로드 URL 생성에 실패했습니다.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
# @jwt_required  # TODO: 임시 비활성화 (개발용)
def delete_video(request, video_id):
    """
    비디오 삭제 (DB + S3)
    """
    try:
        video = Video.objects.get(video_id=video_id)
        s3_key = video.video_file
        
        # S3에서 파일 삭제
        s3_deleted = s3_service.delete_video(s3_key)
        
        # DB에서 비디오 삭제
        video.delete()
        
        logger.info(f"🗑️ 비디오 삭제 완료: video_id={video_id}, s3_deleted={s3_deleted}")
        
        return Response({
            'message': '비디오가 삭제되었습니다.',
            's3_deleted': s3_deleted
        }, status=status.HTTP_200_OK)
        
    except Video.DoesNotExist:
        return Response(
            {'error': '존재하지 않는 비디오입니다.'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"❌ 비디오 삭제 실패: {e}")
        return Response(
            {'error': '비디오 삭제에 실패했습니다.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
