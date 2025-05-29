from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.db.serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer
import json

@api_view(['POST'])
def process_prompt(request):
    """프롬프트를 처리하고 응답을 반환하는 API 뷰"""
    try:
        prompt_text = request.data.get('prompt')
        session_id = request.data.get('session_id')
        
        if not prompt_text:
            return Response({"error": "프롬프트가 비어있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        # 1. 세션 생성 또는 조회
        if session_id:
            try:
                history = PromptSession.objects.get(session_id=session_id)
            except PromptSession.DoesNotExist:
                return Response({"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # 새 세션 생성 - video와 main_event 필요
            # 임시로 첫 번째 비디오와 이벤트 사용 (실제로는 요청에서 받아야 함)
            video = Video.objects.first()
            main_event = Event.objects.first()
            
            if not video or not main_event:
                return Response({"error": "비디오나 이벤트가 없습니다."}, status=status.HTTP_400_BAD_REQUEST)
            
            title = prompt_text[:50] + "..." if len(prompt_text) > 50 else prompt_text
            history = PromptSession.objects.create(
                title=title,
                video=video,
                main_event=main_event
            )
        
        # 2. 프롬프트 처리 및 관련 이벤트 검색
        response_text, relevant_event = process_prompt_logic(prompt_text)
        
        # 3. 세션의 main_event 설정 (첫 프롬프트인 경우)
        if not session_id and relevant_event and not history.main_event:
            history.main_event = relevant_event
            history.save()
        
        # 4. 상호작용 저장
        interaction = PromptInteraction.objects.create(
            session=history,
            video=history.video,  # video 필드 추가
            input_prompt=prompt_text,
            output_response=response_text
        )
        
        # 5. 응답 반환
        result = {
            "session_id": history.session_id,
            "response": response_text,
            "timestamp": interaction.timestamp.isoformat()
        }
        
        if relevant_event:
            result["event"] = {
                "id": relevant_event.id,
                "timestamp": relevant_event.timestamp.isoformat(),
                "action_detected": relevant_event.action_detected,
                "location": relevant_event.location
            }
        
        return Response(result)
        
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def get_prompt_history(request):
    """모든 프롬프트 세션 목록을 반환하는 API 뷰"""
    try:
        histories = PromptSession.objects.all().order_by('-updated_at')
        result = []
        
        for history in histories:
            # 첫 번째 상호작용 가져오기
            first_interaction = history.interactions.first()
            
            if first_interaction:
                event_timestamp = history.main_event.timestamp if history.main_event else None
                
                history_item = {
                    'session_id': history.session_id,
                    'title': history.title,
                    'timestamp': event_timestamp.strftime('%H:%M') if event_timestamp else history.created_at.strftime('%H:%M'),
                    'first_question': first_interaction.input_prompt,
                    'first_answer': first_interaction.output_response,
                    'interaction_count': history.interactions.count(),
                    'created_at': history.created_at.isoformat(),
                    'updated_at': history.updated_at.isoformat(),
                    'main_event': None
                }
                
                if history.main_event:
                    history_item['main_event'] = {
                        'id': history.main_event.id,
                        'timestamp': history.main_event.timestamp.isoformat(),
                        'action_detected': history.main_event.action_detected,
                        'location': history.main_event.location
                    }
                
                result.append(history_item)
        
        return Response(result)
        
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def get_session_detail(request, session_id):
    """특정 세션의 모든 상호작용을 반환하는 API 뷰"""
    try:
        try:
            session = PromptSession.objects.get(session_id=session_id)
        except PromptSession.DoesNotExist:
            return Response({"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND)
        
        interactions = session.interactions.all()
        result = []
        
        for interaction in interactions:
            item = {
                'id': interaction.id,
                'input_prompt': interaction.input_prompt,
                'output_response': interaction.output_response,
                'timestamp': interaction.timestamp.isoformat(),
                'event': None
            }
            
            if interaction.event:
                item['event'] = {
                    'id': interaction.event.id,
                    'timestamp': interaction.event.timestamp.isoformat(),
                    'action_detected': interaction.event.action_detected,
                    'location': interaction.event.location
                }
            
            result.append(item)
        
        return Response(result)
        
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

def process_prompt_logic(prompt_text):
    """
    프롬프트 처리 로직
    
    이 함수는 프롬프트를 분석하고 관련 이벤트를 찾아 응답을 생성합니다.
    실제 구현에서는 더 복잡한 로직이 필요할 수 있습니다.
    """
    # 예시: 키워드 기반으로 간단한 이벤트 검색
    keywords = {
        "도난": "theft",
        "폭행": "assault",
        "침입": "invasion",
        "배회": "loitering",
        "싸움": "fight",
        "넘어짐": "fall"
    }
    
    # 이벤트 검색
    relevant_event = None
    event_type = None
    
    for keyword, event_type_eng in keywords.items():
        if keyword in prompt_text:
            event_type = event_type_eng
            break
    
    if event_type:
        # 관련 이벤트를 데이터베이스에서 검색
        events = Event.objects.filter(action_detected__icontains=event_type).order_by('-timestamp')
        if events.exists():
            relevant_event = events.first()
    
    # 응답 생성
    if relevant_event:
        response = f"관련 이벤트를 찾았습니다. {relevant_event.timestamp.strftime('%H:%M')}에 {relevant_event.location}에서 {relevant_event.action_detected} 행동이 감지되었습니다."
    else:
        response = "관련 이벤트를 찾을 수 없습니다."
    
    return response, relevant_event
