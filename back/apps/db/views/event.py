from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
import logging

from apps.db.models import Event
from apps.api.services import get_event_service
from ..serializers import EventSerializer

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = Event.objects.all()
        video = self.request.query_params.get("video", None)
        event_type = self.request.query_params.get("event_type", None)

        if video is not None:
            queryset = queryset.filter(video_id=video)
        if event_type is not None:
            queryset = queryset.filter(event_type__icontains=event_type)

        return queryset.order_by("timestamp")

    @action(detail=False, methods=["get"], url_path="video-stats")
    def video_stats(self, request):
        """비디오별 이벤트 타입 통계 - EventService 사용"""
        video_id = request.query_params.get("video_id")
        if not video_id:
            return Response(
                {"error": "video_id 파라미터가 필요합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            event_service = get_event_service()
            stats = event_service.get_video_event_stats(video_id)
            return Response(stats)

        except Exception as e:
            logger.error(f"통계 조회 실패: {str(e)}")
            return Response(
                {"error": f"통계 조회 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="generate-embeddings")
    def generate_embeddings(self, request):
        """
        이벤트들의 embedding 일괄 생성 - EventService 사용

        POST /db/events/generate-embeddings/
        Body: {
            "video_id": 103,  // optional
            "limit": 100,     // optional
            "force": false    // optional - 기존 embedding도 재생성
        }
        """
        video_id = request.data.get("video_id")
        limit = request.data.get("limit")
        force = request.data.get("force", False)

        try:
            event_service = get_event_service()
            result = event_service.generate_embeddings(
                video_id=video_id, limit=limit, force=force
            )

            if result["total"] == 0:
                message = "처리할 이벤트가 없습니다."
            else:
                message = "Embedding 생성 완료"

            return Response({"message": message, **result})

        except Exception as e:
            logger.error(f"Embedding 생성 실패: {str(e)}")
            return Response(
                {"error": f"Embedding 생성 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
