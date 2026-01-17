"""
Summary API View
비디오 요약 생성 (이벤트 기반 또는 전체 영상)
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from apps.db.models import Video, Event
from apps.api.services import get_vlm_service
import threading
import logging

logger = logging.getLogger(__name__)


def generate_summary_async(video_id, summary_type="events"):
    """
    백그라운드에서 요약 생성
    영상 분석 완료 시 자동 호출
    """
    try:
        video = Video.objects.get(video_id=video_id)
        video.summary_status = "generating"
        video.save(update_fields=["summary_status"])

        logger.info(f"🔄 [ASYNC] 요약 생성 시작: video={video.name}")

        # 이벤트 조회
        events = Event.objects.filter(video=video).order_by("timestamp")

        if not events.exists():
            video.summary_status = "failed"
            video.summary = "분석된 이벤트가 없습니다."
            video.save(update_fields=["summary_status", "summary"])
            logger.warning(f"⚠️ [ASYNC] 이벤트 없음: video_id={video_id}")
            return

        # VLM 서비스로 요약 생성
        vlm_service = get_vlm_service()
        summary = vlm_service.generate_video_summary(
            video=video, events=list(events), summary_type=summary_type
        )

        # DB에 저장
        video.summary = summary
        video.summary_status = "completed"
        video.save(update_fields=["summary", "summary_status"])
        logger.info(f"✅ [ASYNC] 요약 생성 완료: video_id={video_id}")

    except Exception as e:
        logger.error(f"❌ [ASYNC] 요약 생성 오류: {str(e)}", exc_info=True)
        try:
            video = Video.objects.get(video_id=video_id)
            video.summary_status = "failed"
            video.save(update_fields=["summary_status"])
        except:
            pass


@api_view(["POST"])
def generate_video_summary(request, video_id):
    """
    비디오 요약 생성 API

    POST /api/videos/{video_id}/summary/

    Body:
    {
        "summary_type": "events",  // "events" (이벤트 기반) 또는 "full" (전체)
        "async": true  // 비동기 처리 여부 (기본값: true)
    }

    Response:
    {
        "success": true,
        "message": "요약 생성이 시작되었습니다.",
        "video_id": 1,
        "summary_status": "generating"
    }
    """
    try:
        # 비디오 조회
        try:
            video = Video.objects.get(video_id=video_id)
        except Video.DoesNotExist:
            return Response(
                {"error": "비디오를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 요약 타입 (기본값: events)
        summary_type = request.data.get("summary_type", "events")
        is_async = request.data.get("async", True)

        if summary_type not in ["events", "full"]:
            return Response(
                {"error": "summary_type은 'events' 또는 'full'이어야 합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 비동기 처리
        if is_async:
            # 이미 생성 중이면 중복 방지
            if video.summary_status == "generating":
                return Response(
                    {
                        "success": True,
                        "message": "요약이 이미 생성 중입니다.",
                        "video_id": video.video_id,
                        "summary_status": video.summary_status,
                    }
                )

            # 백그라운드 스레드로 실행
            thread = threading.Thread(
                target=generate_summary_async, args=(video_id, summary_type)
            )
            thread.daemon = True
            thread.start()

            return Response(
                {
                    "success": True,
                    "message": "요약 생성이 시작되었습니다.",
                    "video_id": video.video_id,
                    "summary_status": "generating",
                }
            )

        # 동기 처리 (즉시 반환)
        import time

        start_time = time.time()

        # 이벤트 조회
        events = Event.objects.filter(video=video).order_by("timestamp")

        logger.info(
            f"📊 이벤트 조회 결과: video_id={video_id}, events_count={events.count()}"
        )

        if summary_type == "events" and not events.exists():
            logger.warning(f"⚠️ 이벤트가 없어 요약 생성 불가")
            return Response(
                {"error": "분석된 이벤트가 없습니다. 먼저 영상 분석을 진행해주세요."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            f"📊 요약 생성 시작: video={video.name}, type={summary_type}, events={events.count()}개"
        )

        video.summary_status = "generating"
        video.save(update_fields=["summary_status"])

        # VLM 서비스로 요약 생성
        vlm_service = get_vlm_service()
        summary = vlm_service.generate_video_summary(
            video=video, events=list(events), summary_type=summary_type
        )

        # DB에 저장
        video.summary = summary
        video.summary_status = "completed"
        video.save(update_fields=["summary", "summary_status"])
        logger.info(f"💾 Summary DB 저장 완료: video_id={video.video_id}")

        processing_time = time.time() - start_time

        logger.info(f"✅ 요약 생성 완료: {processing_time:.2f}초")

        return Response(
            {
                "success": True,
                "summary": summary,
                "video_id": video.video_id,
                "video_name": video.name,
                "events_count": events.count(),
                "summary_type": summary_type,
                "summary_status": "completed",
                "processing_time": round(processing_time, 2),
            }
        )

    except Exception as e:
        logger.error(f"❌ 요약 생성 오류: {str(e)}", exc_info=True)

        # 실패 상태로 업데이트
        try:
            video = Video.objects.get(video_id=video_id)
            video.summary_status = "failed"
            video.save(update_fields=["summary_status"])
        except:
            pass

        return Response(
            {"error": f"요약 생성 중 오류가 발생했습니다: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
def check_summary_status(request, video_id):
    """
    요약 생성 상태 확인 API

    GET /api/videos/{video_id}/summary/status/

    Response:
    {
        "video_id": 1,
        "summary_status": "generating",  // pending, generating, completed, failed
        "has_summary": false,
        "summary": null  // completed인 경우에만 반환
    }
    """
    try:
        try:
            video = Video.objects.get(video_id=video_id)
        except Video.DoesNotExist:
            return Response(
                {"error": "비디오를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        response_data = {
            "video_id": video.video_id,
            "summary_status": video.summary_status,
            "has_summary": bool(video.summary),
        }

        # 완료된 경우에만 summary 포함
        if video.summary_status == "completed" and video.summary:
            response_data["summary"] = video.summary

        return Response(response_data)

    except Exception as e:
        logger.error(f"❌ 요약 상태 확인 오류: {str(e)}", exc_info=True)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
