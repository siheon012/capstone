from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from datetime import datetime
import logging

from apps.db.models import DepthData, DisplayData, VideoAnalysis, AnalysisJob
from ..serializers import (
    DepthDataSerializer,
    DisplayDataSerializer,
    DepthDataBulkCreateSerializer,
    DisplayDataBulkCreateSerializer,
    VideoAnalysisSerializer,
    AnalysisJobSerializer,
)

logger = logging.getLogger(__name__)


class DepthDataViewSet(viewsets.ModelViewSet):
    queryset = DepthData.objects.all()
    serializer_class = DepthDataSerializer

    def get_queryset(self):
        queryset = DepthData.objects.all()
        video_id = self.request.query_params.get("video_id", None)
        frame_name = self.request.query_params.get("frame_name", None)

        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if frame_name is not None:
            queryset = queryset.filter(frame_name__icontains=frame_name)

        return queryset.order_by("frame_name", "mask_id")

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """공간 정보 데이터 일괄 생성"""
        try:
            serializer = DepthDataBulkCreateSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    depth_data_objects = serializer.save()
                    return Response(
                        {
                            "success": True,
                            "message": f"{len(depth_data_objects)}개의 공간 정보가 저장되었습니다.",
                            "count": len(depth_data_objects),
                        },
                        status=status.HTTP_201_CREATED,
                    )
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"공간 정보 저장 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DisplayDataViewSet(viewsets.ModelViewSet):
    queryset = DisplayData.objects.all()
    serializer_class = DisplayDataSerializer

    def get_queryset(self):
        queryset = DisplayData.objects.all()
        video_id = self.request.query_params.get("video_id", None)
        description = self.request.query_params.get("description", None)

        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if description is not None:
            queryset = queryset.filter(description__icontains=description)

        return queryset.order_by("timestamp", "image_index", "mask_key")

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """진열대 정보 데이터 일괄 생성"""
        try:
            serializer = DisplayDataBulkCreateSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    display_data_objects = serializer.save()
                    return Response(
                        {
                            "success": True,
                            "message": f"{len(display_data_objects)}개의 진열대 정보가 저장되었습니다.",
                            "count": len(display_data_objects),
                        },
                        status=status.HTTP_201_CREATED,
                    )
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"진열대 정보 저장 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"], url_path="by-depth")
    def by_depth(self, request):
        """깊이별 진열대 정보 조회"""
        video_id = request.query_params.get("video_id")
        if not video_id:
            return Response(
                {"error": "video_id 파라미터가 필요합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        displays = DisplayData.objects.filter(video_id=video_id).order_by("avg_depth")
        serializer = self.get_serializer(displays, many=True)

        # 깊이별로 그룹화
        depth_groups = {}
        for display in serializer.data:
            depth = display["description"]
            if depth not in depth_groups:
                depth_groups[depth] = []
            depth_groups[depth].append(display)

        return Response(
            {
                "video_id": video_id,
                "depth_groups": depth_groups,
                "total_count": len(serializer.data),
            }
        )


class VideoAnalysisViewSet(viewsets.ModelViewSet):
    """비디오 분석 결과 ViewSet"""

    queryset = VideoAnalysis.objects.all()
    serializer_class = VideoAnalysisSerializer

    def get_queryset(self):
        queryset = VideoAnalysis.objects.all()
        video_id = self.request.query_params.get("video_id", None)
        analysis_type = self.request.query_params.get("analysis_type", None)
        tier = self.request.query_params.get("tier", None)

        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if analysis_type is not None:
            queryset = queryset.filter(analysis_type=analysis_type)
        if tier is not None:
            queryset = queryset.filter(data_tier=tier)

        return queryset.order_by("-created_at")

    @action(detail=False, methods=["post"], url_path="vector-search")
    def vector_search(self, request):
        """벡터 유사도 검색"""
        try:
            from ..search_service import RAGSearchService

            query = request.data.get("query", "")
            video_id = request.data.get("video_id", None)
            limit = request.data.get("limit", 10)

            if not query:
                return Response(
                    {"error": "검색 쿼리가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # RAG 검색 서비스 사용
            search_service = RAGSearchService()
            results = search_service.search_similar_events(
                query=query, video_id=video_id, limit=limit
            )

            return Response({"query": query, "results": results, "count": len(results)})

        except Exception as e:
            return Response(
                {"error": f"벡터 검색 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="generate-embedding")
    def generate_embedding(self, request):
        """텍스트 임베딩 생성"""
        try:
            text = request.data.get("text", "")
            if not text:
                return Response(
                    {"error": "임베딩할 텍스트가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from ..search_service import RAGSearchService

            search_service = RAGSearchService()
            embedding = search_service.generate_embedding(text)

            return Response(
                {
                    "text": text,
                    "embedding": embedding,
                    "dimension": len(embedding) if embedding else 0,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"임베딩 생성 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class AnalysisJobViewSet(viewsets.ModelViewSet):
    """AWS Batch 분석 작업 ViewSet"""

    queryset = AnalysisJob.objects.all()
    serializer_class = AnalysisJobSerializer

    def get_queryset(self):
        queryset = AnalysisJob.objects.all()
        video_id = self.request.query_params.get("video_id", None)
        status_filter = self.request.query_params.get("status", None)

        if video_id is not None:
            queryset = queryset.filter(video_id=video_id)
        if status_filter is not None:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """AWS Batch에서 작업 상태 업데이트"""
        try:
            job = self.get_object()
            old_status = job.status

            # AWS에서 최신 상태 조회
            job.update_status_from_aws()

            if job.status != old_status:
                return Response(
                    {
                        "job_id": job.job_id,
                        "old_status": old_status,
                        "new_status": job.status,
                        "updated": True,
                    }
                )
            else:
                return Response(
                    {"job_id": job.job_id, "status": job.status, "updated": False}
                )

        except Exception as e:
            return Response(
                {"error": f"상태 업데이트 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="submit-analysis")
    def submit_analysis(self, request):
        """새로운 분석 작업 제출"""
        try:
            video_id = request.data.get("video_id")
            analysis_types = request.data.get("analysis_types", [])

            if not video_id:
                return Response(
                    {"error": "video_id가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not analysis_types:
                return Response(
                    {"error": "analysis_types가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # AWS Batch 작업 제출 로직 (실제 구현 필요)
            job_name = (
                f"video-analysis-{video_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            )
            job_id = f"batch-job-{video_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

            # AnalysisJob 생성
            analysis_job = AnalysisJob.objects.create(
                video_id=video_id,
                job_id=job_id,
                job_name=job_name,
                job_queue="video-analysis-queue",
                job_definition="video-analysis-job-def",
                analysis_types=analysis_types,
                status="submitted",
            )

            serializer = self.get_serializer(analysis_job)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {"error": f"분석 작업 제출 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TierManagementViewSet(viewsets.GenericViewSet):
    """데이터 티어링 관리 API"""

    @action(detail=False, methods=["post"], url_path="promote-to-hot")
    def promote_to_hot(self, request):
        """Hot 티어로 승격"""
        try:
            video_id = request.data.get("video_id")
            if not video_id:
                return Response(
                    {"error": "video_id가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from ..tier_manager import TierManager

            tier_manager = TierManager()
            result = tier_manager.promote_to_hot(video_id)

            return Response(
                {
                    "success": True,
                    "video_id": video_id,
                    "message": f"비디오가 Hot 티어로 승격되었습니다.",
                    "result": result,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"티어 승격 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="run-tier-management")
    def run_tier_management(self, request):
        """티어 관리 실행"""
        try:
            from ..tier_manager import TierManager

            tier_manager = TierManager()

            results = tier_manager.run_daily_tier_management()

            return Response(
                {
                    "success": True,
                    "message": "티어 관리가 완료되었습니다.",
                    "results": results,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"티어 관리 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
