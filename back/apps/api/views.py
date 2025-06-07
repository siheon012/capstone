from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.db.serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer
import json
import requests
import re
from django.db import connection

@api_view(['POST'])
def process_prompt(request):
    """프롬프트를 처리하고 응답을 반환하는 API 뷰"""
    print(f"🔥 API 호출 받음: {request.method} {request.path}")
    print(f"📦 Request headers: {dict(request.headers)}")
    print(f"📝 Request data: {request.data}")
    
    try:
        prompt_text = request.data.get('prompt')
        session_id = request.data.get('session_id')
        video_id = request.data.get('video_id')  # 비디오 ID 추가
        
        print(f"💭 프롬프트: {prompt_text}")
        print(f"🆔 세션 ID: {session_id}")
        print(f"🎥 비디오 ID: {video_id}")
        
        if not prompt_text:
            print("❌ 프롬프트가 비어있음")
            return Response({"error": "프롬프트가 비어있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        # 1. 세션 생성 또는 조회
        if session_id:
            try:
                history = PromptSession.objects.get(session_id=session_id)
            except PromptSession.DoesNotExist:
                return Response({"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # 새 세션 생성 - 전달받은 video_id 사용
            if not video_id:
                return Response({"error": "새 세션 생성을 위해서는 video_id가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                video = Video.objects.get(video_id=video_id)
            except Video.DoesNotExist:
                return Response({"error": "존재하지 않는 비디오입니다."}, status=status.HTTP_404_NOT_FOUND)
            
            # PromptSession 생성 - main_event는 초기에 None으로 설정
            history = PromptSession.objects.create(
                video=video,
                main_event=None,  # 초기에는 None, 나중에 relevant_event로 설정
                first_prompt=prompt_text[:200] if prompt_text else ""
            )
        
        # 2. 프롬프트 처리 및 관련 이벤트 검색 (해당 비디오의 이벤트만)
        response_text, relevant_event = process_prompt_logic(prompt_text, history.video)
        
        # 3. 세션의 main_event 설정 (첫 프롬프트인 경우)
        if not session_id and relevant_event and not history.main_event:
            # 해당 비디오의 이벤트인지 다시 한 번 확인
            if relevant_event.video == history.video:
                history.main_event = relevant_event
                history.save()
            else:
                print(f"⚠️ 경고: 다른 비디오의 이벤트가 반환됨. 세션 비디오: {history.video.name}, 이벤트 비디오: {relevant_event.video.name}")
                relevant_event = None  # 잘못된 이벤트는 무시
        
        # 4. 상호작용 저장 (찾은 이벤트 포함)
        interaction = PromptInteraction.objects.create(
            session=history,
            video=history.video,  # video 필드 추가
            input_prompt=prompt_text,
            output_response=response_text,
            detected_event=relevant_event  # 찾은 이벤트 저장
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
                "timestamp": relevant_event.timestamp,  # 숫자 그대로 반환 (초 단위)
                "action_detected": relevant_event.action_detected,
                "location": relevant_event.location
            }
        
        print(f"✅ API 응답 성공: {result}")
        return Response(result)
        
    except Exception as e:
        print(f"❌ API 처리 오류: {str(e)}")
        import traceback
        print(f"🔍 오류 스택: {traceback.format_exc()}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def get_prompt_history(request):
    """모든 프롬프트 세션 목록을 반환하는 API 뷰"""
    try:
        histories = PromptSession.objects.all().order_by('created_at')
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
                        'timestamp': history.main_event.timestamp,  # 숫자 그대로 반환 (초 단위)
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
                'timeline_points': interaction.timeline_points,  # 타임라인 포인트 추가
                'found_events_count': interaction.found_events_count,
                'processing_status': interaction.processing_status,
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

def process_prompt_logic(prompt_text, video=None):
    """
    프롬프트 처리 로직 - FastAPI text2sql 호출
    
    1. FastAPI에 프롬프트 전송하여 SQL 생성
    2. 생성된 SQL로 타임스탬프 추출
    3. DB 쿼리 실행 (특정 비디오로 제한)
    4. 타임라인 추출 → 영상 캡쳐
    5. VLM에 캡쳐 이미지 + 프롬프트 전송
    6. 응답 생성
    
    Args:
        prompt_text: 사용자 프롬프트
        video: 대상 비디오 객체 (None이면 전체 검색)
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
        # FastAPI 응답 구조에 맞춰 'result' 키 사용
        if 'result' not in text2sql_result:
            return "SQL 쿼리가 생성되지 않았습니다.", None
            
        sql_query = text2sql_result['result']
        print(f"생성된 SQL: {sql_query}")
        
        # Django 테이블 이름으로 변환
        sql_query = sql_query.replace('events', 'db_event')
        sql_query = sql_query.replace('videos', 'db_video')
        
        # 특정 비디오로 제한하는 WHERE 조건 추가
        if video:
            # 기존 WHERE 절이 있는지 확인
            if 'WHERE' in sql_query.upper():
                # 기존 WHERE 절에 AND 조건 추가
                sql_query = sql_query.replace('WHERE', f'WHERE db_event.video_id = {video.video_id} AND')
            else:
                # WHERE 절이 없으면 추가
                # FROM 절 다음에 WHERE 절 추가
                sql_query = re.sub(r'(FROM\s+\w+)', r'\1 WHERE db_event.video_id = ' + str(video.video_id), sql_query, flags=re.IGNORECASE)
            
            print(f"비디오 필터링 적용됨: video_id = {video.video_id}")
            print(f"필터링된 SQL: {sql_query}")
        
        # PostgreSQL TIME 타입을 초 단위 정수로 변환
        # 예: TIME '10:00:00' -> 36000 (10시간 * 3600초)
        # 예: TIME '13:00:00' -> 46800 (13시간 * 3600초)
        import re
        
        def time_to_seconds(time_str):
            """TIME '10:00:00' -> 36000초 변환"""
            time_match = re.search(r"TIME '(\d{2}):(\d{2}):(\d{2})'", time_str)
            if time_match:
                hours, minutes, seconds = map(int, time_match.groups())
                total_seconds = hours * 3600 + minutes * 60 + seconds
                return str(total_seconds)
            return time_str
        
        # timestamp::time 패턴을 timestamp로 변경
        sql_query = re.sub(r'timestamp::time', 'timestamp', sql_query)
        
        # TIME '시:분:초' 패턴을 초 단위로 변환
        time_pattern = r"TIME '(\d{2}):(\d{2}):(\d{2})'"
        def replace_time(match):
            hours, minutes, seconds = map(int, match.groups())
            total_seconds = hours * 3600 + minutes * 60 + seconds
            return str(total_seconds)
        
        sql_query = re.sub(time_pattern, replace_time, sql_query)
        
        print(f"Django 테이블명으로 변환된 SQL: {sql_query}")
        
        # 3. DB에서 쿼리 실행
        with connection.cursor() as cursor:
            cursor.execute(sql_query)
            query_results = cursor.fetchall()
            
        if not query_results:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다.", None
            
        print(f"쿼리 결과: {query_results}")
        
        # 4. 실제 이벤트 데이터 조회하여 상세 응답 생성
        found_events = []
        relevant_event = None
        
        for result in query_results:
            try:
                event_id = result[0]
                # 해당 비디오의 이벤트만 검색
                if video:
                    events = Event.objects.filter(id=event_id, video=video)
                else:
                    events = Event.objects.filter(id=event_id)
                    
                if events.exists():
                    event = events.first()
                    found_events.append(event)
                    
                    # 첫 번째 이벤트를 relevant_event로 설정
                    if relevant_event is None:
                        relevant_event = event
                        print(f"✅ 주요 이벤트 매핑: ID={relevant_event.id}, 비디오={relevant_event.video.name}, 타입={relevant_event.event_type}")
                else:
                    print(f"⚠️ 해당 비디오에서 이벤트 ID {event_id}를 찾을 수 없음")
            except Exception as e:
                print(f"이벤트 매핑 오류: {e}")
        
        # 5. 상세한 응답 텍스트 생성
        if not found_events:
            response_text = "데이터베이스에서 해당 이벤트 정보를 찾을 수 없습니다."
        else:
            response_parts = [f"총 {len(found_events)}개의 이벤트를 찾았습니다:\n"]
            
            for i, event in enumerate(found_events, 1):
                # 타임스탬프를 시:분:초 형식으로 변환
                hours = event.timestamp // 3600
                minutes = (event.timestamp % 3600) // 60
                seconds = event.timestamp % 60
                time_str = f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}"
                
                # 이벤트 타입 한국어 변환
                event_type_kr = {
                    'theft': '도난',
                    'collapse': '쓰러짐', 
                    'violence': '폭행'
                }.get(event.event_type, event.event_type)
                
                event_info = f"{i}. [{time_str}] {event_type_kr}"
                if event.location:
                    event_info += f" - 위치: {event.location}"
                if event.action_detected:
                    event_info += f" - 상세: {event.action_detected}"
                
                response_parts.append(event_info)
            
            response_text = "\n".join(response_parts)
        
        return response_text, relevant_event
        
    except requests.exceptions.RequestException as e:
        return f"FastAPI 연결 오류: {str(e)}", None
    except Exception as e:
        return f"처리 중 오류 발생: {str(e)}", None


class PromptSessionViewSet(viewsets.ModelViewSet):
    """PromptSession ViewSet - 세션 CRUD 작업용"""
    queryset = PromptSession.objects.all().order_by('created_at')
    serializer_class = PromptSessionSerializer
    
    def get_queryset(self):
        """쿼리셋 필터링"""
        queryset = super().get_queryset()
        
        # 비디오 ID로 필터링
        video_id = self.request.query_params.get('video', None)
        if video_id:
            queryset = queryset.filter(video_id=video_id)
            
        return queryset
