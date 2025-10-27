from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from django.http import JsonResponse
from django.db import connection
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.db.serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer
import json
import requests
import re

# 헬스체크 엔드포인트
@api_view(['GET'])
def health_check(request):
    """
    헬스체크 엔드포인트 - 서버 상태 확인
    ALB Target Group Health Check용
    """
    health_status = {
        'status': 'healthy',
        'timestamp': None,
        'checks': {
            'database': 'unknown',
            'pgvector': 'unknown',
            's3': 'unknown'
        },
        'details': {}
    }
    
    try:
        from django.utils import timezone
        health_status['timestamp'] = timezone.now().isoformat()
        
        # 1. 데이터베이스 연결 확인
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                health_status['checks']['database'] = 'connected'
        except Exception as e:
            health_status['checks']['database'] = 'disconnected'
            health_status['details']['database_error'] = str(e)
            health_status['status'] = 'unhealthy'
        
        # 2. pgvector 확장 확인
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
                result = cursor.fetchone()
                if result:
                    health_status['checks']['pgvector'] = 'enabled'
                else:
                    health_status['checks']['pgvector'] = 'disabled'
        except Exception as e:
            health_status['checks']['pgvector'] = 'error'
            health_status['details']['pgvector_error'] = str(e)
        
        # 3. S3 연결 확인 (선택사항)
        try:
            import os
            if os.environ.get('USE_S3', 'false').lower() == 'true':
                import boto3
                from botocore.exceptions import ClientError
                
                s3_client = boto3.client('s3')
                bucket_name = os.environ.get('AWS_STORAGE_BUCKET_NAME')
                
                if bucket_name:
                    try:
                        s3_client.head_bucket(Bucket=bucket_name)
                        health_status['checks']['s3'] = 'connected'
                    except ClientError:
                        health_status['checks']['s3'] = 'bucket_not_found'
                else:
                    health_status['checks']['s3'] = 'not_configured'
            else:
                health_status['checks']['s3'] = 'disabled'
        except Exception as e:
            health_status['checks']['s3'] = 'error'
            health_status['details']['s3_error'] = str(e)
        
        # 최종 상태 결정
        if health_status['checks']['database'] != 'connected':
            return JsonResponse(health_status, status=503)
        
        return JsonResponse(health_status, status=200)
    
    except Exception as e:
        return JsonResponse({
            'status': 'unhealthy',
            'error': str(e),
            'message': 'Unexpected error occurred'
        }, status=503)

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
    print(f"🎬 [API video_list_create] ===== 요청 수신 =====")
    print(f"🎬 [API video_list_create] 요청: {request.method}")
    print(f"📦 [API video_list_create] Headers: {dict(request.headers)}")
    print(f"📝 [API video_list_create] Data: {request.data}")
    print(f"🔍 [API video_list_create] Content type: {request.content_type}")
    print(f"📏 [API video_list_create] Content length: {request.META.get('CONTENT_LENGTH', 'Unknown')}")
    print(f"🌐 [API video_list_create] Remote addr: {request.META.get('REMOTE_ADDR', 'Unknown')}")
    print(f"🎬 [API video_list_create] =============================")
    
    if request.method == 'GET':
        videos = Video.objects.all().order_by('-upload_date')
        serializer = VideoSerializer(videos, many=True)
        print(f"✅ [API video_list_create] GET 성공: {len(videos)}개 비디오 반환")
        return Response(serializer.data)
    
    elif request.method == 'POST':
        print(f"🏗️ [API video_list_create] POST 시작")
        try:
            serializer = VideoSerializer(data=request.data)
            print(f"📋 [API video_list_create] Serializer created")
            
            if serializer.is_valid():
                print(f"✅ [API video_list_create] Serializer valid")
                instance = serializer.save()
                print(f"🎯 [API video_list_create] 저장 성공: video_id={instance.video_id}")
                print(f"📄 [API video_list_create] Response data: {serializer.data}")
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            else:
                print(f"❌ [API video_list_create] Serializer invalid: {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            print(f"❌ [API video_list_create] 예외 발생: {str(e)}")
            import traceback
            print(f"📚 [API video_list_create] Traceback: {traceback.format_exc()}")
            return Response({"error": f"서버 오류: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
        
        # 3. 질문 분류 (SQL 및 프롬프트 기반)
        question_type = classify_question_type(prompt_text, sql_query)
        print(f"🔍 질문 분류: {question_type}")
        
        # 4. DB에서 쿼리 실행
        with connection.cursor() as cursor:
            cursor.execute(sql_query)
            query_results = cursor.fetchall()
            
        if not query_results:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다.", None
            
        print(f"쿼리 결과: {query_results}")
        
        # 5. 실제 이벤트 데이터 조회하여 상세 응답 생성
        found_events = []
        relevant_event = None
        
        for result in query_results:
            try:
                # SQL 쿼리 결과는 timestamp 값이므로 timestamp로 검색
                timestamp_value = result[0]
                print(f"🔍 SQL 결과에서 timestamp 값: {timestamp_value}")
                
                # 해당 비디오의 해당 timestamp 이벤트 검색
                if video:
                    events = Event.objects.filter(timestamp=timestamp_value, video=video)
                else:
                    events = Event.objects.filter(timestamp=timestamp_value)
                    
                if events.exists():
                    event = events.first()
                    found_events.append(event)
                    print(f"✅ timestamp {timestamp_value}로 이벤트 발견: ID={event.id}, 타입={event.event_type}")
                    
                    # 첫 번째 이벤트를 relevant_event로 설정
                    if relevant_event is None:
                        relevant_event = event
                        print(f"✅ 주요 이벤트 매핑: ID={relevant_event.id}, timestamp={relevant_event.timestamp}, 비디오={relevant_event.video.name}, 타입={relevant_event.event_type}")
                else:
                    print(f"⚠️ 해당 비디오에서 timestamp {timestamp_value}에 해당하는 이벤트를 찾을 수 없음")
            except Exception as e:
                print(f"이벤트 매핑 오류: {e}")
        
        # 5. 질문 타입별 처리 및 응답 생성
        if question_type == 'ABNORMAL_BEHAVIOR':
            # 이상행동 질문: 같은 시나리오 그룹화 후 첫 번째 timestamp 반환
            response_text, relevant_event = process_abnormal_behavior_query(found_events)
        else:
            # 마케팅 질문: 개별 이벤트 나열
            response_text, relevant_event = process_marketing_query(found_events)
        
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

def classify_question_type(prompt_text, sql_query):
    """
    프롬프트와 SQL을 분석하여 질문 유형을 분류
    
    Args:
        prompt_text: 사용자 프롬프트
        sql_query: 생성된 SQL 쿼리
    
    Returns:
        str: 'ABNORMAL_BEHAVIOR' 또는 'MARKETING'
    """
    # 이상행동 관련 키워드
    abnormal_keywords = ['사건', '이상행동', '쓰러짐', '점거', '도난', 'theft', 'collapse', 'sitting']
    
    prompt_lower = prompt_text.lower()
    sql_lower = sql_query.lower()
    
    # 프롬프트에서 이상행동 키워드 검색
    for keyword in abnormal_keywords:
        if keyword in prompt_lower or keyword in sql_lower:
            return 'ABNORMAL_BEHAVIOR'
    
    # SQL에서 event_type 조건 검색
    if any(event_type in sql_lower for event_type in ['theft', 'collapse', 'sitting']):
        return 'ABNORMAL_BEHAVIOR'
    
    # 기본적으로는 마케팅 질문으로 분류
    return 'MARKETING'

def process_abnormal_behavior_query(found_events):
    """
    이상행동 질문 처리: 개인별 그룹화 후 시나리오별 그룹화 → 첫 번째 timestamp 반환
    
    Args:
        found_events: Event 객체 리스트
    
    Returns:
        tuple: (response_text, relevant_event)
    """
    if not found_events:
        return "해당하는 이상행동을 찾을 수 없습니다.", None
    
    print(f"🚨 이상행동 질문 처리: {len(found_events)}개 이벤트")
    
    # 1단계: 시간순 정렬
    found_events.sort(key=lambda x: x.timestamp)
    
    # 2단계: 개인별 그룹화 (성별, 나이, 위치 기준)
    person_groups = group_events_by_person_abnormal(found_events)
    print(f"👥 개인별 그룹화: {len(person_groups)}명")
    
    # 3단계: 각 개인별로 시나리오 그룹화 (event_type + 시간 연속성)
    scenario_groups = []
    for person_group in person_groups:
        person_scenarios = group_events_by_scenario(person_group['events'])
        for scenario in person_scenarios:
            # 개인 정보를 시나리오에 추가
            scenario['person_info'] = {
                'gender': person_group['gender'],
                'age': person_group['age'],
                'location': person_group['location']
            }
            scenario_groups.append(scenario)
    
    print(f"🎬 그룹화된 시나리오: {len(scenario_groups)}개")
    
    response_parts = []
    relevant_event = None
    
    if len(scenario_groups) == 1:
        # 단일 시나리오인 경우
        group = scenario_groups[0]
        start_event = group['events'][0]  # 첫 번째 이벤트
        relevant_event = start_event
        
        # 타임스탬프를 분:초 형식으로 변환
        minutes = start_event.timestamp // 60
        seconds = start_event.timestamp % 60
        time_str = f"{int(minutes):02d}:{int(seconds):02d}"
        
        # 이벤트 타입 한국어 변환
        event_type_kr = {
            'theft': '도난',
            'collapse': '쓰러짐', 
            'sitting': '점거'
        }.get(start_event.event_type, start_event.event_type)
        
        duration = group['end_time'] - group['start_time']
        duration_str = f"{duration}초" if duration > 0 else ""
        
        response_text = f"{event_type_kr} 시나리오가 {time_str}에 시작되었습니다"
        if duration_str:
            response_text += f" (지속시간: {duration_str})"
        if start_event.location:
            response_text += f" - 위치: {start_event.location}"
        
    else:
        # 여러 시나리오인 경우
        response_parts.append(f"총 {len(scenario_groups)}개의 시나리오를 찾았습니다:\n")
        
        for i, group in enumerate(scenario_groups, 1):
            start_event = group['events'][0]
            if relevant_event is None:
                relevant_event = start_event
            
            minutes = start_event.timestamp // 60
            seconds = start_event.timestamp % 60
            time_str = f"{int(minutes):02d}:{int(seconds):02d}"
            
            event_type_kr = {
                'theft': '도난',
                'collapse': '쓰러짐', 
                'sitting': '점거'
            }.get(start_event.event_type, start_event.event_type)
            
            duration = group['end_time'] - group['start_time']
            duration_str = f" ({duration}초 지속)" if duration > 0 else ""
            
            scenario_info = f"{i}. [{time_str}] {event_type_kr} 시나리오 시작{duration_str}"
            if start_event.location:
                scenario_info += f" - 위치: {start_event.location}"
            
            response_parts.append(scenario_info)
        
        response_text = "\n".join(response_parts)
    
    return response_text, relevant_event

def process_marketing_query(found_events):
    """
    마케팅 질문 처리: 개인별 그룹화 (성별, 위치, 비슷한 나이 기준)
    
    Args:
        found_events: Event 객체 리스트
    
    Returns:
        tuple: (response_text, relevant_event)
    """
    if not found_events:
        return "해당하는 정보를 찾을 수 없습니다.", None
    
    print(f"📊 마케팅 질문 처리: {len(found_events)}개 이벤트")
    
    # 시간순 정렬 (오름차순 - 빠른 시간 순)
    found_events.sort(key=lambda x: x.timestamp)
    
    # 개인별 그룹화 (성별, 위치, 비슷한 나이)
    person_groups = group_events_by_person(found_events)
    
    print(f"👥 그룹화된 개인: {len(person_groups)}명")
    
    relevant_event = found_events[0]
    
    # 개인별 방문 시간대 응답 생성
    if len(person_groups) == 1:
        # 단일 개인인 경우
        group = person_groups[0]
        person_events = group['events']
        first_event = person_events[0]
        last_event = person_events[-1]
        
        # 시간 범위 계산
        start_minutes = first_event.timestamp // 60
        start_seconds = first_event.timestamp % 60
        start_time_str = f"{int(start_minutes):02d}:{int(start_seconds):02d}"
        
        if len(person_events) > 1:
            end_minutes = last_event.timestamp // 60
            end_seconds = last_event.timestamp % 60
            end_time_str = f"{int(end_minutes):02d}:{int(end_seconds):02d}"
            time_range = f"{start_time_str} ~ {end_time_str}"
        else:
            time_range = start_time_str
        
        gender_kr = "남성" if first_event.gender == "male" else "여성"
        response_text = f"{int(first_event.age)}세 {gender_kr}이 {time_range}에 방문했습니다"
        if first_event.location:
            response_text += f" (위치: {first_event.location})"
        
    else:
        # 여러 개인인 경우
        response_parts = [f"총 {len(person_groups)}명의 방문자를 찾았습니다:\n"]
        
        for i, group in enumerate(person_groups, 1):
            person_events = group['events']
            first_event = person_events[0]
            last_event = person_events[-1]
            
            # 시간 범위 계산
            start_minutes = first_event.timestamp // 60
            start_seconds = first_event.timestamp % 60
            start_time_str = f"{int(start_minutes):02d}:{int(start_seconds):02d}"
            
            if len(person_events) > 1:
                end_minutes = last_event.timestamp // 60
                end_seconds = last_event.timestamp % 60
                end_time_str = f"{int(end_minutes):02d}:{int(end_seconds):02d}"
                time_range = f"{start_time_str} ~ {end_time_str}"
            else:
                time_range = start_time_str
            
            gender_kr = "남성" if first_event.gender == "male" else "여성"
            person_info = f"{i}. [{time_range}] {int(first_event.age)}세 {gender_kr}"
            if first_event.location:
                person_info += f" - 위치: {first_event.location}"
            
            response_parts.append(person_info)
        
        response_text = "\n".join(response_parts)
    
    return response_text, relevant_event

def group_events_by_scenario(events):
    """
    이벤트들을 시나리오별로 그룹화
    같은 event_type이고 시간적으로 연속된 이벤트들을 하나의 시나리오로 묶음
    
    Args:
        events: Event 객체 리스트 (시간순 정렬됨)
    
    Returns:
        list: 시나리오 그룹 리스트
    """
    if not events:
        return []
    
    groups = []
    current_group = None
    
    for event in events:
        if current_group is None:
            # 첫 번째 그룹 생성
            current_group = {
                'event_type': event.event_type,
                'start_time': event.timestamp,
                'end_time': event.timestamp,
                'events': [event],
                'location': event.location
            }
        elif (event.event_type == current_group['event_type'] and 
              event.timestamp - current_group['end_time'] <= 10):  # 10초 이내면 같은 시나리오
            # 기존 그룹에 추가
            current_group['end_time'] = event.timestamp
            current_group['events'].append(event)
        else:
            # 새로운 그룹 시작
            groups.append(current_group)
            current_group = {
                'event_type': event.event_type,
                'start_time': event.timestamp,
                'end_time': event.timestamp,
                'events': [event],
                'location': event.location
            }
    
    # 마지막 그룹 추가
    if current_group:
        groups.append(current_group)
    
    return groups

def group_events_by_person(events):
    """
    이벤트들을 개인별로 그룹화
    성별, 위치, 비슷한 나이(±3세)를 기준으로 같은 사람으로 판단
    
    Args:
        events: Event 객체 리스트 (시간순 정렬됨)
    
    Returns:
        list: 개인별 그룹 리스트
    """
    if not events:
        return []
    
    groups = []
    
    for event in events:
        matched_group = None
        
        # 기존 그룹 중에서 같은 사람인지 확인
        for group in groups:
            representative_event = group['events'][0]
            
            # 같은 사람 판단 기준:
            # 1. 성별이 같고
            # 2. 나이가 비슷하고 (±3세)
            # 3. 위치가 같거나 인접하고
            # 4. 시간이 연속적이거나 가까움 (30초 이내)
            if (event.gender == representative_event.gender and
                abs(event.age - representative_event.age) <= 3 and
                str(event.location) == str(representative_event.location) and
                abs(event.timestamp - group['end_time']) <= 30):  # 30초 이내
                
                matched_group = group
                break
        
        if matched_group:
            # 기존 그룹에 추가
            matched_group['events'].append(event)
            matched_group['end_time'] = event.timestamp
        else:
            # 새로운 그룹 생성
            new_group = {
                'gender': event.gender,
                'age': event.age,
                'location': event.location,
                'start_time': event.timestamp,
                'end_time': event.timestamp,
                'events': [event]
            }
            groups.append(new_group)
    
    return groups

def group_events_by_person_abnormal(events):
    """
    이상행동 이벤트들을 개인별로 그룹화
    성별, 위치, 비슷한 나이(±3세)를 기준으로 같은 사람으로 판단
    이상행동의 경우 시간 간격을 더 짧게 설정 (15초 이내)
    
    Args:
        events: Event 객체 리스트 (시간순 정렬됨)
    
    Returns:
        list: 개인별 그룹 리스트
    """
    if not events:
        return []
    
    groups = []
    
    for event in events:
        matched_group = None
        
        # 기존 그룹 중에서 같은 사람인지 확인
        for group in groups:
            representative_event = group['events'][0]
            
            # 같은 사람 판단 기준:
            # 1. 성별이 같고
            # 2. 나이가 비슷하고 (±3세)
            # 3. 위치가 같고
            # 4. 시간이 연속적이거나 가까움 (15초 이내) - 이상행동은 더 짧은 간격
            if (event.gender == representative_event.gender and
                abs(event.age - representative_event.age) <= 3 and
                str(event.location) == str(representative_event.location) and
                abs(event.timestamp - group['end_time']) <= 15):  # 15초 이내
                
                matched_group = group
                break
        
        if matched_group:
            # 기존 그룹에 추가
            matched_group['events'].append(event)
            matched_group['end_time'] = event.timestamp
        else:
            # 새로운 그룹 생성
            new_group = {
                'gender': event.gender,
                'age': event.age,
                'location': event.location,
                'start_time': event.timestamp,
                'end_time': event.timestamp,
                'events': [event]
            }
            groups.append(new_group)
    
    return groups
