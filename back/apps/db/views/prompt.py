from rest_framework import viewsets, status
from rest_framework.response import Response
import logging
import uuid

from apps.db.models import PromptSession, PromptInteraction, Video
from ..serializers import PromptSessionSerializer, PromptInteractionSerializer

logger = logging.getLogger(__name__)


class PromptSessionViewSet(viewsets.ModelViewSet):
    queryset = PromptSession.objects.all()
    serializer_class = PromptSessionSerializer
    lookup_field = 'session_id'  # UUID 문자열로 조회
    lookup_value_regex = '[^/]+'  # UUID 패턴 허용
    
    def get_queryset(self):
        """쿼리셋 필터링 - 비디오별 세션"""
        queryset = PromptSession.objects.all()
        
        # orphan 세션 제외 (related_videos가 없는 세션)
        queryset = queryset.filter(related_videos__isnull=False)
        
        # 비디오 ID로 필터링
        video_id = self.request.query_params.get('video', None)
        if video_id:
            queryset = queryset.filter(related_videos__video_id=video_id)
        
        return queryset.order_by('-created_at')
    
    def list(self, request, *args, **kwargs):
        """세션 목록 조회 - session_id가 없는 세션 자동 수정"""
        # 1. session_id가 없는 세션들 찾아서 UUID 할당
        sessions_without_id = PromptSession.objects.filter(session_id='') | PromptSession.objects.filter(session_id__isnull=True)
        if sessions_without_id.exists():
            count = sessions_without_id.count()
            logger.warning(f"⚠️ [AUTO-FIX] {count}개의 세션에 session_id가 없습니다. 자동으로 UUID를 할당합니다...")
            
            for session in sessions_without_id:
                session.session_id = str(uuid.uuid4())
                session.save(update_fields=['session_id'])
            
            logger.info(f"✅ [AUTO-FIX] {count}개의 세션 ID를 성공적으로 업데이트했습니다!")
        
        # 2. related_videos가 비어있지만 상호작용이 있는 세션 수정
        # video 필터가 있는 경우에만 처리
        video_id = request.query_params.get('video')
        if video_id:
            try:
                video = Video.objects.get(video_id=video_id)
                # 해당 비디오와 관련된 세션들 중 related_videos가 비어있는 것 찾기
                all_sessions = PromptSession.objects.all()
                fixed_count = 0
                
                for session in all_sessions:
                    if not session.related_videos:
                        # 상호작용의 관련 이벤트를 통해 비디오 찾기
                        interactions = session.interactions.all()
                        for interaction in interactions:
                            related_events = interaction.related_events.all()
                            for event in related_events:
                                if event.video == video and not session.related_videos:
                                    session.related_videos = video
                                    session.save()
                                    fixed_count += 1
                                    logger.info(f"✅ [AUTO-FIX] 세션 {session.session_id[:8]}에 비디오 {video.name} 연결")
                                    break
                            if session.related_videos:
                                break
                
                if fixed_count > 0:
                    logger.info(f"✅ [AUTO-FIX] {fixed_count}개의 세션에 related_videos를 연결했습니다!")
            except Video.DoesNotExist:
                pass
        
        return super().list(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """세션 삭제 (명시적 구현)"""
        try:
            instance = self.get_object()
            session_id = instance.session_id
            
            # 비디오 찾기: 우선순위 1) related_videos, 2) 인터랙션의 이벤트
            video = instance.related_videos
            
            if not video:
                # related_videos가 없으면 상호작용의 관련 이벤트를 통해 비디오 찾기
                first_interaction = instance.interactions.first()
                if first_interaction:
                    first_event = first_interaction.related_events.first()
                    if first_event and first_event.video:
                        video = first_event.video
                        logger.info(f"ℹ️ [DELETE] related_videos 없음, 인터랙션 이벤트에서 비디오 찾음")
            
            if video:
                video_name = video.name or video.filename or f"Video-{video.video_id}"
                logger.info(f"🔥 [DELETE] 세션 삭제 요청: session_id={session_id}, video={video_name} (ID: {video.video_id})")
            else:
                logger.info(f"🔥 [DELETE] 세션 삭제 요청: session_id={session_id}, video=연결된 비디오 없음")
                logger.warning(f"⚠️ [DELETE] 경고: 세션에 비디오 정보를 찾을 수 없습니다.")
            
            logger.info(f"📊 [DELETE] 세션 상호작용 수: {instance.interactions.count()}")
            
            # 삭제 수행
            self.perform_destroy(instance)
            
            logger.info(f"✅ [DELETE] 세션 삭제 완료: session_id={session_id}")
            
            return Response(
                {
                    "success": True,
                    "message": "세션이 성공적으로 삭제되었습니다.",
                    "session_id": session_id
                },
                status=status.HTTP_204_NO_CONTENT
            )
        except Exception as e:
            logger.error(f"❌ [DELETE] 세션 삭제 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {"error": f"세션 삭제 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer
