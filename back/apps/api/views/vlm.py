"""
VLM (Vision Language Model) Views
영상 프레임 분석 및 장면 묘사 API
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.api.services import get_vlm_service, get_hybrid_search_service
import re
import logging

logger = logging.getLogger(__name__)


@api_view(['POST'])
def process_vlm_chat(request):
    """
    VLM(Vision Language Model) 기반 채팅 처리
    - 영상 프레임 분석
    - 장면 묘사
    - 특정 타임라인 추출
    - 위치별 행동 분석 (왼쪽/중간/오른쪽)
    """
    logger.info(f"🎥 VLM 채팅 API 호출: {request.method}")
    
    try:
        # helpers에서 import
        from ..helpers import (_generate_timeline_response, 
                               _analyze_location_patterns,
                               _analyze_behaviors)
        
        prompt_text = request.data.get('prompt')
        session_id = request.data.get('session_id')
        video_id = request.data.get('video_id')
        
        logger.info(f"💭 프롬프트: {prompt_text}")
        logger.info(f"🆔 세션 ID: {session_id}")
        logger.info(f"🎥 비디오 ID: {video_id}")
        
        if not prompt_text:
            return Response({"error": "프롬프트가 비어있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        if not video_id:
            return Response({"error": "비디오 ID가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        # 1. 비디오 조회
        try:
            video = Video.objects.get(video_id=video_id)
        except Video.DoesNotExist:
            return Response({"error": "존재하지 않는 비디오입니다."}, status=status.HTTP_404_NOT_FOUND)
        
        # 2. 세션 생성 또는 조회
        if session_id:
            try:
                session = PromptSession.objects.get(session_id=session_id)
                if session.related_videos and session.related_videos.video_id != video.video_id:
                    session = PromptSession.objects.create(
                        session_name="",
                        video=video,
                        user_id=request.user.id if hasattr(request, 'user') and request.user.is_authenticated else ""
                    )
            except PromptSession.DoesNotExist:
                return Response({"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND)
        else:
            session = PromptSession.objects.create(
                session_name="",
                video=video,
                user_id=request.user.id if hasattr(request, 'user') and request.user.is_authenticated else ""
            )
        
        # 3. 해당 비디오의 이벤트 조회
        events = Event.objects.filter(video=video).order_by('timestamp')
        
        # 4. VLM 서비스
        vlm_service = get_vlm_service()
        
        # 5. 프롬프트 분석
        response_text = ""
        analysis_type = "general"
        
        # 시간 범위 추출
        time_pattern = r'(\d+)\s*분(?:\s*(\d+)\s*초)?'
        time_matches = re.findall(time_pattern, prompt_text)
        
        start_seconds = None
        end_seconds = None
        
        if len(time_matches) >= 2:
            start_min = int(time_matches[0][0])
            start_sec = int(time_matches[0][1]) if time_matches[0][1] else 0
            start_seconds = start_min * 60 + start_sec
            
            end_min = int(time_matches[1][0])
            end_sec = int(time_matches[1][1]) if time_matches[1][1] else 0
            end_seconds = end_min * 60 + end_sec
            
            logger.info(f"⏰ 시간 범위 감지: {start_seconds}초 ~ {end_seconds}초")
        
        # 장면 묘사
        if any(keyword in prompt_text.lower() for keyword in ['장면', '묘사', '무슨 일', '설명', '상황']):
            logger.info("📸 장면 묘사 요청")
            analysis_type = "scene_description"
            
            if start_seconds is not None and end_seconds is not None:
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="scene",
                    interval=2.0
                )
            else:
                response_text = vlm_service.generate_video_summary(
                    video=video,
                    events=list(events),
                    summary_type="events"
                )
        
        # 타임라인
        elif any(keyword in prompt_text.lower() for keyword in ['타임라인', '시간', '언제', '몇 분', '몇 초']):
            logger.info("⏰ 타임라인 추출")
            analysis_type = "timeline"
            response_text = _generate_timeline_response(prompt_text, events, video)
        
        # 위치 분석
        elif any(keyword in prompt_text.lower() for keyword in ['위치', '어디', '왼쪽', '중간', '오른쪽', '장소']):
            logger.info("📍 위치별 분석")
            analysis_type = "location_analysis"
            
            if start_seconds is not None and end_seconds is not None:
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="location",
                    interval=1.5
                )
            else:
                response_text = _analyze_location_patterns(events, video)
        
        # 행동 분석
        elif any(keyword in prompt_text.lower() for keyword in ['행동', '무엇을', '어떤', '활동']):
            logger.info("🏃 행동 분석")
            analysis_type = "behavior_analysis"
            
            if start_seconds is not None and end_seconds is not None:
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="behavior",
                    interval=1.5
                )
            else:
                response_text = _analyze_behaviors(events, video)
        
        # 일반 질문 - 하이브리드 RAG
        else:
            logger.info("💬 일반 질문")
            analysis_type = "general"
            hybrid_search = get_hybrid_search_service()
            response_text = hybrid_search.search_and_generate(
                query=prompt_text,
                video_id=video_id
            )
        
        # 6. 상호작용 저장
        interaction = PromptInteraction.objects.create(
            session=session,
            interaction_id=f"{session.session_id}_{session.total_interactions + 1}",
            sequence_number=session.total_interactions + 1,
            user_prompt=prompt_text,
            ai_response=response_text,
            analysis_type=analysis_type
        )
        
        if events.exists():
            for event in events[:5]:
                interaction.related_events.add(event)
        
        if not interaction.related_videos:
            interaction.related_videos = video
            interaction.save()
        
        session.add_interaction(prompt_text)
        
        # 7. 응답 반환
        result = {
            "session_id": session.session_id,
            "response": response_text,
            "timestamp": interaction.created_at.isoformat(),
            "analysis_type": analysis_type,
            "event_count": events.count()
        }
        
        if events.exists():
            result["events"] = [
                {
                    "id": event.id,
                    "timestamp": event.timestamp,
                    "event_type": event.event_type,
                    "action_detected": event.action_detected,
                    "location": event.location
                }
                for event in events[:5]
            ]
        
        logger.info(f"✅ VLM 채팅 완료: {analysis_type}")
        return Response(result)
        
    except Exception as e:
        logger.error(f"❌ VLM 채팅 오류: {str(e)}")
        import traceback
        logger.error(f"🔍 오류 스택: {traceback.format_exc()}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
