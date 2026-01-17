"""
Prompt Views
프롬프트 처리 및 세션 관리 API
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from apps.db.models import Video, PromptSession, PromptInteraction
import logging

logger = logging.getLogger(__name__)


@api_view(["POST"])
def process_prompt(request):
    """프롬프트를 처리하고 응답을 반환하는 API 뷰"""
    logger.info(f"🔥 API 호출 받음: {request.method} {request.path}")
    logger.debug(f"📦 Request headers: {dict(request.headers)}")
    logger.debug(f"📝 Request data: {request.data}")

    try:
        # process_prompt_logic을 같은 views/ 폴더의 processors.py에서 import
        from .processors import process_prompt_logic

        prompt_text = request.data.get("prompt")
        session_id = request.data.get("session_id")
        video_id = request.data.get("video_id")

        logger.info(f"💭 프롬프트: {prompt_text}")
        logger.info(f"🆔 세션 ID: {session_id}")
        logger.info(f"🎥 비디오 ID: {video_id}")

        if not prompt_text:
            logger.warning("❌ 프롬프트가 비어있음")
            return Response(
                {"error": "프롬프트가 비어있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. 세션 생성 또는 조회
        video = None
        if session_id:
            try:
                history = PromptSession.objects.get(session_id=session_id)
                video = history.related_videos
            except PromptSession.DoesNotExist:
                return Response(
                    {"error": "존재하지 않는 세션입니다."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            if not video_id:
                return Response(
                    {"error": "새 세션 생성을 위해서는 video_id가 필요합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                video = Video.objects.get(video_id=video_id)
            except Video.DoesNotExist:
                return Response(
                    {"error": "존재하지 않는 비디오입니다."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            history = PromptSession.objects.create(
                session_name="",
                user_id=(
                    request.user.id
                    if hasattr(request, "user") and request.user.is_authenticated
                    else ""
                ),
            )
            if not history.related_videos:
                history.related_videos = video
                history.save()

        # 2. 프롬프트 처리
        try:
            response_text, relevant_event = process_prompt_logic(prompt_text, video)
        except Exception as e:
            logger.warning(f"⚠️ process_prompt_logic 에러: {str(e)}")
            response_text = f"죄송합니다. AI 처리 중 오류가 발생했습니다. 다시 시도해 주세요. (에러: {str(e)})"
            relevant_event = None

        # 3. 세션의 main_event 설정
        if not session_id and relevant_event and not history.main_event:
            if video and relevant_event.video == video:
                history.main_event = relevant_event
                history.save()
            else:
                logger.warning(f"⚠️ 다른 비디오의 이벤트가 반환됨")
                relevant_event = None

        # 4. 상호작용 저장
        interaction = PromptInteraction.objects.create(
            session=history,
            interaction_id=f"{history.session_id}_{history.total_interactions + 1}",
            sequence_number=history.total_interactions + 1,
            user_prompt=prompt_text,
            ai_response=response_text,
        )

        if relevant_event:
            interaction.related_events.add(relevant_event)

        history.add_interaction(prompt_text)

        # 5. 응답 반환
        result = {
            "session_id": history.session_id,
            "response": response_text,
            "timestamp": interaction.created_at.isoformat(),
        }

        if relevant_event:
            result["event"] = {
                "id": relevant_event.id,
                "timestamp": relevant_event.timestamp,
                "action_detected": relevant_event.action_detected,
                "location": relevant_event.location,
            }

        logger.info(f"✅ API 응답 성공")
        return Response(result)

    except Exception as e:
        logger.error(f"❌ API 처리 오류: {str(e)}")
        import traceback

        logger.error(f"🔍 오류 스택: {traceback.format_exc()}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def get_prompt_history(request):
    """모든 프롬프트 세션 목록을 반환하는 API 뷰"""
    try:
        histories = PromptSession.objects.all().order_by("created_at")
        result = []

        for history in histories:
            first_interaction = history.interactions.first()

            if first_interaction:
                event_timestamp = (
                    history.main_event.timestamp if history.main_event else None
                )

                history_item = {
                    "session_id": history.session_id,
                    "title": history.session_name,
                    "timestamp": (
                        event_timestamp.strftime("%H:%M")
                        if event_timestamp
                        else history.created_at.strftime("%H:%M")
                    ),
                    "first_question": first_interaction.user_prompt,
                    "first_answer": first_interaction.ai_response,
                    "interaction_count": history.interactions.count(),
                    "created_at": history.created_at.isoformat(),
                    "updated_at": history.updated_at.isoformat(),
                    "main_event": None,
                }

                if history.main_event:
                    history_item["main_event"] = {
                        "id": history.main_event.id,
                        "timestamp": history.main_event.timestamp,
                        "action_detected": history.main_event.action_detected,
                        "location": history.main_event.location,
                    }

                result.append(history_item)

        return Response(result)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def get_session_detail(request, session_id):
    """특정 세션의 모든 상호작용을 반환하는 API 뷰"""
    try:
        try:
            session = PromptSession.objects.get(session_id=session_id)
        except PromptSession.DoesNotExist:
            return Response(
                {"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND
            )

        interactions = session.interactions.all()
        result = []

        for interaction in interactions:
            event_timestamp = None
            event_data = None
            if interaction.related_events.exists():
                first_event = interaction.related_events.first()
                event_timestamp = first_event.timestamp
                event_data = {
                    "id": first_event.id,
                    "timestamp": first_event.timestamp,
                    "event_type": first_event.event_type,
                    "action_detected": first_event.action_detected,
                    "location": first_event.location,
                }

            item = {
                "id": interaction.id,
                "input_prompt": interaction.user_prompt,
                "output_response": interaction.ai_response,
                "timestamp": interaction.created_at.isoformat(),
                "sequence_number": interaction.sequence_number,
                "analysis_type": interaction.analysis_type,
                "event_timestamp": event_timestamp,
                "event": event_data,
            }

            result.append(item)

        return Response(result)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
