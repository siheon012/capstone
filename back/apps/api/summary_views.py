"""
Summary API View
비디오 요약 생성 (이벤트 기반 또는 전체 영상)
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from apps.db.models import Video, Event
from apps.api.vlm_service import get_vlm_service


@api_view(['POST'])
def generate_video_summary(request, video_id):
    """
    비디오 요약 생성 API
    
    POST /api/videos/{video_id}/summary/
    
    Body:
    {
        "summary_type": "events"  // "events" (이벤트 기반) 또는 "full" (전체)
    }
    
    Response:
    {
        "summary": "요약 텍스트",
        "video_id": 1,
        "video_name": "매장 CCTV",
        "events_count": 5,
        "processing_time": 2.5
    }
    """
    import time
    start_time = time.time()
    
    try:
        # 비디오 조회
        try:
            video = Video.objects.get(video_id=video_id)
        except Video.DoesNotExist:
            return Response(
                {"error": "비디오를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 요약 타입 (기본값: events)
        summary_type = request.data.get('summary_type', 'events')
        
        if summary_type not in ['events', 'full']:
            return Response(
                {"error": "summary_type은 'events' 또는 'full'이어야 합니다."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 이벤트 조회
        events = Event.objects.filter(video=video).order_by('timestamp')
        
        if summary_type == 'events' and not events.exists():
            return Response(
                {"error": "분석된 이벤트가 없습니다. 먼저 영상 분석을 진행해주세요."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        print(f"📊 요약 생성 시작: video={video.name}, type={summary_type}, events={events.count()}개")
        
        # VLM 서비스로 요약 생성
        vlm_service = get_vlm_service()
        summary = vlm_service.generate_video_summary(
            video=video,
            events=list(events),
            summary_type=summary_type
        )
        
        # DB에 저장
        video.summary = summary
        video.save(update_fields=['summary'])
        print(f"💾 Summary DB 저장 완료: video_id={video.video_id}")
        
        processing_time = time.time() - start_time
        
        print(f"✅ 요약 생성 완료: {processing_time:.2f}초")
        
        return Response({
            "success": True,
            "summary": summary,
            "video_id": video.video_id,
            "video_name": video.name,
            "events_count": events.count(),
            "summary_type": summary_type,
            "processing_time": round(processing_time, 2)
        })
        
    except Exception as e:
        print(f"❌ 요약 생성 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return Response(
            {"error": f"요약 생성 중 오류가 발생했습니다: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
