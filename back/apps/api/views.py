from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.db.serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer
import json
import requests
from django.db import connection

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

# Video API Views
@api_view(['GET', 'POST'])
def video_list_create(request):
    """비디오 목록 조회 및 생성"""
    if request.method == 'GET':
        videos = Video.objects.all().order_by('-upload_date')
        serializer = VideoSerializer(videos, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = VideoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def video_detail(request, video_id):
    """비디오 상세 조회, 수정, 삭제"""
    try:
        video = Video.objects.get(video_id=video_id)
    except Video.DoesNotExist:
        return Response({"error": "비디오를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = VideoSerializer(video)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = VideoSerializer(video, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        video.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
def check_duplicate_video(request):
    """비디오 중복 체크"""
    name = request.GET.get('name')
    size = request.GET.get('size')
    
    if not name or not size:
        return Response({"error": "name과 size 파라미터가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        size = int(size)
        exists = Video.objects.filter(name=name, size=size).exists()
        return Response({"exists": exists})
    except ValueError:
        return Response({"error": "size는 숫자여야 합니다."}, status=status.HTTP_400_BAD_REQUEST)

def process_prompt_logic(prompt_text):
    """
    프롬프트 처리 로직 - FastAPI text2sql 호출
    
    1. FastAPI에 프롬프트 전송하여 SQL 생성
    2. 생성된 SQL로 타임스탬프 추출
    3. DB 쿼리 실행
    4. 타임라인 추출 → 영상 캡쳐
    5. VLM에 캡쳐 이미지 + 프롬프트 전송
    6. 응답 생성
    """
    try:
        # 1. FastAPI text2sql 호출
        fastapi_url = "http://localhost:8087/api/process"
        fastapi_payload = {"prompt": prompt_text}
        
        print(f"FastAPI 호출: {fastapi_url}")
        print(f"Payload: {fastapi_payload}")
        
        response = requests.post(
            fastapi_url,
            json=fastapi_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            return f"FastAPI 호출 실패: {response.status_code}", None
            
        text2sql_result = response.json()
        print(f"FastAPI 응답: {text2sql_result}")
        
        # 2. SQL 쿼리 추출 및 실행
        if 'sql' not in text2sql_result:
            return "SQL 쿼리가 생성되지 않았습니다.", None
            
        sql_query = text2sql_result['sql']
        print(f"생성된 SQL: {sql_query}")
        
        # 3. DB에서 쿼리 실행
        with connection.cursor() as cursor:
            cursor.execute(sql_query)
            query_results = cursor.fetchall()
            
        if not query_results:
            return "쿼리 결과가 없습니다.", None
            
        print(f"쿼리 결과: {query_results}")
        
        # 4. 타임라인 추출 (첫 번째 결과 사용)
        # TODO: 영상 캡쳐 로직 구현
        # TODO: VLM 호출 로직 구현
        
        # 임시 응답 생성
        response_text = f"FastAPI text2sql 처리 완료. {len(query_results)}개의 결과를 찾았습니다."
        
        # 관련 이벤트 반환 (첫 번째 결과)
        relevant_event = None
        if query_results:
            # Event 모델의 필드 순서에 맞춰 결과 매핑
            # 실제 구현에서는 쿼리 결과의 구조에 따라 조정 필요
            try:
                first_result = query_results[0]
                events = Event.objects.filter(id=first_result[0])
                if events.exists():
                    relevant_event = events.first()
            except Exception as e:
                print(f"이벤트 매핑 오류: {e}")
        
        return response_text, relevant_event
        
    except requests.exceptions.RequestException as e:
        return f"FastAPI 연결 오류: {str(e)}", None
    except Exception as e:
        return f"처리 중 오류 발생: {str(e)}", None
