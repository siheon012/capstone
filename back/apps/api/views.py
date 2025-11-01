from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from django.http import JsonResponse
from django.db import connection
from django.conf import settings
from apps.db.models import Video, Event, PromptSession, PromptInteraction
from apps.db.serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer
from apps.api.bedrock_service import get_bedrock_service
from apps.api.hybrid_search_service import get_hybrid_search_service
from apps.api.vlm_service import get_vlm_service
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
        video = None  # video 변수 초기화
        if session_id:
            try:
                history = PromptSession.objects.get(session_id=session_id)
                # 세션의 첫 번째 관련 비디오 가져오기
                video = history.related_videos.first()
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
                session_name=prompt_text[:50] if prompt_text else "New Session",
                user_id=request.user.id if hasattr(request, 'user') and request.user.is_authenticated else ""
            )
            # ManyToMany 필드는 create 후에 추가
            history.related_videos.add(video)
        
        # 2. 프롬프트 처리 및 관련 이벤트 검색 (해당 비디오의 이벤트만)
        response_text, relevant_event = process_prompt_logic(prompt_text, video)
        
        # 3. 세션의 main_event 설정 (첫 프롬프트인 경우)
        if not session_id and relevant_event and not history.main_event:
            # 해당 비디오의 이벤트인지 다시 한 번 확인
            if video and relevant_event.video == video:
                history.main_event = relevant_event
                history.save()
            else:
                print(f"⚠️ 경고: 다른 비디오의 이벤트가 반환됨. 세션 비디오: {video.name if video else 'None'}, 이벤트 비디오: {relevant_event.video.name}")
                relevant_event = None  # 잘못된 이벤트는 무시
        
        # 4. 상호작용 저장 (찾은 이벤트 포함)
        interaction = PromptInteraction.objects.create(
            session=history,
            interaction_id=f"{history.session_id}_{history.total_interactions + 1}",
            sequence_number=history.total_interactions + 1,
            user_prompt=prompt_text,
            ai_response=response_text
        )
        
        # ManyToMany 관계는 create 후에 추가
        if relevant_event:
            interaction.related_events.add(relevant_event)
        
        # 세션 통계 업데이트
        history.add_interaction(prompt_text)
        
        # 5. 응답 반환
        result = {
            "session_id": history.session_id,
            "response": response_text,
            "timestamp": interaction.created_at.isoformat()
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


@api_view(['POST'])
def process_vlm_chat(request):
    """
    VLM(Vision Language Model) 기반 채팅 처리
    - 영상 프레임 분석
    - 장면 묘사
    - 특정 타임라인 추출
    - 위치별 행동 분석 (왼쪽/중간/오른쪽)
    """
    print(f"🎥 VLM 채팅 API 호출: {request.method}")
    
    try:
        prompt_text = request.data.get('prompt')
        session_id = request.data.get('session_id')
        video_id = request.data.get('video_id')
        
        print(f"💭 프롬프트: {prompt_text}")
        print(f"🆔 세션 ID: {session_id}")
        print(f"🎥 비디오 ID: {video_id}")
        
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
            except PromptSession.DoesNotExist:
                return Response({"error": "존재하지 않는 세션입니다."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # 새 세션 생성
            session = PromptSession.objects.create(
                session_name=prompt_text[:50] if prompt_text else "VLM Chat",
                user_id=request.user.id if hasattr(request, 'user') and request.user.is_authenticated else ""
            )
            # ManyToMany 필드는 create 후에 추가
            session.related_videos.add(video)
        
        # 3. 해당 비디오의 이벤트 조회
        events = Event.objects.filter(video=video).order_by('timestamp')
        
        # 4. VLM 서비스로 프롬프트 분석
        vlm_service = get_vlm_service()
        
        # 5. 프롬프트 유형 분석 및 처리
        response_text = ""
        analysis_type = "general"
        frame_data = None
        
        # 시간 범위 추출 (예: "10분에서 15분", "1분 30초부터 2분")
        time_pattern = r'(\d+)\s*분(?:\s*(\d+)\s*초)?'
        time_matches = re.findall(time_pattern, prompt_text)
        
        start_seconds = None
        end_seconds = None
        
        if len(time_matches) >= 2:
            # 시작 시간
            start_min = int(time_matches[0][0])
            start_sec = int(time_matches[0][1]) if time_matches[0][1] else 0
            start_seconds = start_min * 60 + start_sec
            
            # 종료 시간
            end_min = int(time_matches[1][0])
            end_sec = int(time_matches[1][1]) if time_matches[1][1] else 0
            end_seconds = end_min * 60 + end_sec
            
            print(f"⏰ 시간 범위 감지: {start_seconds}초 ~ {end_seconds}초")
        
        # 장면 묘사 요청
        if any(keyword in prompt_text.lower() for keyword in ['장면', '묘사', '무슨 일', '설명', '상황']):
            print("📸 장면 묘사 요청 감지")
            analysis_type = "scene_description"
            
            if start_seconds is not None and end_seconds is not None:
                # 특정 시간 범위 분석
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="scene",
                    interval=2.0
                )
            else:
                # 전체 이벤트 기반 요약
                response_text = vlm_service.generate_video_summary(
                    video=video,
                    events=list(events),
                    summary_type="events"
                )
        
        # 타임라인 추출 요청
        elif any(keyword in prompt_text.lower() for keyword in ['타임라인', '시간', '언제', '몇 분', '몇 초']):
            print("⏰ 타임라인 추출 요청 감지")
            analysis_type = "timeline"
            response_text = _generate_timeline_response(prompt_text, events, video)
        
        # 위치별 분석 요청
        elif any(keyword in prompt_text.lower() for keyword in ['위치', '어디', '왼쪽', '중간', '오른쪽', '장소']):
            print("📍 위치별 분석 요청 감지")
            analysis_type = "location_analysis"
            
            if start_seconds is not None and end_seconds is not None:
                # 특정 시간 범위의 위치 분석
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="location",
                    interval=1.5
                )
            else:
                # 전체 위치 패턴 분석
                response_text = _analyze_location_patterns(events, video)
        
        # 행동 분석 요청
        elif any(keyword in prompt_text.lower() for keyword in ['행동', '무엇을', '어떤', '활동']):
            print("🏃 행동 분석 요청 감지")
            analysis_type = "behavior_analysis"
            
            if start_seconds is not None and end_seconds is not None:
                # 특정 시간 범위의 행동 분석
                response_text = vlm_service.analyze_time_range(
                    video=video,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                    analysis_type="behavior",
                    interval=1.5
                )
            else:
                # 전체 행동 패턴 분석
                response_text = _analyze_behaviors(events, video)
        
        # 일반 질문 - 하이브리드 RAG 사용
        else:
            print("💬 일반 질문 처리")
            analysis_type = "general"
            hybrid_search = get_hybrid_search_service()
            response_text = hybrid_search.search_and_generate(
                query=prompt_text,
                video_id=video_id
            )
        
        # 6. 상호작용 저장
        interaction = PromptInteraction.objects.create(
            session=session,
            video=video,
            input_prompt=prompt_text,
            output_response=response_text,
            detected_event=events.first() if events.exists() else None,
            analysis_type=analysis_type
        )
        
        # 7. 응답 반환
        result = {
            "session_id": session.session_id,
            "response": response_text,
            "timestamp": interaction.timestamp.isoformat(),
            "analysis_type": analysis_type,
            "event_count": events.count()
        }
        
        # 관련 이벤트 정보 추가
        if events.exists():
            result["events"] = [
                {
                    "id": event.id,
                    "timestamp": event.timestamp,
                    "event_type": event.event_type,
                    "action_detected": event.action_detected,
                    "location": event.location
                }
                for event in events[:5]  # 최대 5개
            ]
        
        print(f"✅ VLM 채팅 처리 완료: {analysis_type}")
        return Response(result)
        
    except Exception as e:
        print(f"❌ VLM 채팅 오류: {str(e)}")
        import traceback
        print(f"🔍 오류 스택: {traceback.format_exc()}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _generate_timeline_response(prompt: str, events, video: Video) -> str:
    """타임라인 추출 및 응답 생성"""
    if not events:
        return "해당 영상에서 감지된 이벤트가 없습니다."
    
    # 시간 관련 키워드 추출
    time_keywords = re.findall(r'(\d+)\s*분', prompt)
    
    response_parts = [f"📹 {video.name} 영상의 타임라인:\n"]
    
    if time_keywords:
        # 특정 시간대 필터링
        target_minutes = [int(m) for m in time_keywords]
        filtered_events = [
            e for e in events 
            if int(e.timestamp // 60) in target_minutes
        ]
        
        if filtered_events:
            for event in filtered_events:
                minutes = int(event.timestamp // 60)
                seconds = int(event.timestamp % 60)
                event_type_kr = {
                    'theft': '도난',
                    'collapse': '쓰러짐',
                    'sitting': '점거',
                    'violence': '폭력'
                }.get(event.event_type, event.event_type)
                
                response_parts.append(
                    f"⏰ {minutes}분 {seconds}초: {event_type_kr} - {event.action_detected or '행동 감지'} ({event.location or '위치 미상'})"
                )
        else:
            response_parts.append(f"해당 시간대({', '.join([f'{m}분' for m in target_minutes])})에는 이벤트가 감지되지 않았습니다.")
    else:
        # 전체 타임라인
        for event in events[:10]:  # 최대 10개
            minutes = int(event.timestamp // 60)
            seconds = int(event.timestamp % 60)
            event_type_kr = {
                'theft': '도난',
                'collapse': '쓰러짐',
                'sitting': '점거',
                'violence': '폭력'
            }.get(event.event_type, event.event_type)
            
            response_parts.append(
                f"⏰ {minutes}분 {seconds}초: {event_type_kr} - {event.action_detected or '행동 감지'}"
            )
    
    return "\n".join(response_parts)


def _analyze_location_patterns(events, video: Video) -> str:
    """위치별 행동 패턴 분석"""
    if not events:
        return "분석할 이벤트가 없습니다."
    
    # 위치별 집계
    location_counts = {
        'left': 0,
        'center': 0,
        'right': 0,
        'unknown': 0
    }
    
    location_events = {
        'left': [],
        'center': [],
        'right': [],
        'unknown': []
    }
    
    for event in events:
        location = event.location or ''
        location_lower = location.lower()
        
        if 'left' in location_lower or '왼쪽' in location_lower:
            location_counts['left'] += 1
            location_events['left'].append(event)
        elif 'center' in location_lower or '중앙' in location_lower or '중간' in location_lower:
            location_counts['center'] += 1
            location_events['center'].append(event)
        elif 'right' in location_lower or '오른쪽' in location_lower:
            location_counts['right'] += 1
            location_events['right'].append(event)
        else:
            location_counts['unknown'] += 1
            location_events['unknown'].append(event)
    
    # 응답 생성
    response_parts = [f"📍 {video.name} 영상의 위치별 분석:\n"]
    
    total = sum(location_counts.values())
    if total == 0:
        return "위치 정보가 없는 이벤트입니다."
    
    # 위치별 통계
    response_parts.append("📊 위치별 이벤트 분포:")
    response_parts.append(f"- 왼쪽: {location_counts['left']}건 ({location_counts['left']/total*100:.1f}%)")
    response_parts.append(f"- 중앙: {location_counts['center']}건 ({location_counts['center']/total*100:.1f}%)")
    response_parts.append(f"- 오른쪽: {location_counts['right']}건 ({location_counts['right']/total*100:.1f}%)")
    
    # 가장 많이 발생한 위치
    max_location = max(location_counts.items(), key=lambda x: x[1])
    location_kr = {
        'left': '왼쪽',
        'center': '중앙',
        'right': '오른쪽',
        'unknown': '미상'
    }.get(max_location[0], max_location[0])
    
    response_parts.append(f"\n✅ 가장 많은 활동: {location_kr} ({max_location[1]}건)")
    
    return "\n".join(response_parts)


def _analyze_behaviors(events, video: Video) -> str:
    """행동 패턴 분석"""
    if not events:
        return "분석할 이벤트가 없습니다."
    
    # 행동 타입별 집계
    behavior_counts = {}
    for event in events:
        event_type = event.event_type
        behavior_counts[event_type] = behavior_counts.get(event_type, 0) + 1
    
    # 응답 생성
    response_parts = [f"🏃 {video.name} 영상의 행동 분석:\n"]
    
    for event_type, count in behavior_counts.items():
        event_type_kr = {
            'theft': '도난',
            'collapse': '쓰러짐',
            'sitting': '점거',
            'violence': '폭력'
        }.get(event_type, event_type)
        
        response_parts.append(f"- {event_type_kr}: {count}건")
    
    # 대표 행동 예시
    response_parts.append("\n📝 주요 행동 예시:")
    for event in events[:3]:
        minutes = int(event.timestamp // 60)
        seconds = int(event.timestamp % 60)
        response_parts.append(
            f"- {minutes}분 {seconds}초: {event.action_detected or '행동 감지'}"
        )
    
    return "\n".join(response_parts)


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
    프롬프트 처리 로직 - AWS Bedrock 하이브리드 RAG
    
    1. Text2SQL: 정확한 조건 검색 (timestamp, event_type 등)
    2. pgvector: 의미 기반 유사도 검색 (임베딩)
    3. 결과 병합 및 중복 제거
    4. Bedrock RAG: 자연어 응답 생성
    
    Args:
        prompt_text: 사용자 프롬프트
        video: 대상 비디오 객체 (None이면 전체 검색)
    """
    use_bedrock = getattr(settings, 'USE_BEDROCK', True)
    use_hybrid_search = getattr(settings, 'USE_HYBRID_SEARCH', True)
    
    try:
        # ============================================
        # 하이브리드 RAG: Text2SQL + pgvector
        # ============================================
        if use_bedrock and use_hybrid_search:
            print(f"🚀 하이브리드 RAG 검색 사용 (Text2SQL + pgvector)")
            hybrid_service = get_hybrid_search_service()
            
            found_events, response_text = hybrid_service.hybrid_search(
                prompt=prompt_text,
                video=video,
                use_vector_search=True,  # pgvector 검색 활성화
                use_text2sql=True         # Text2SQL 검색 활성화
            )
            
            relevant_event = found_events[0] if found_events else None
            return response_text, relevant_event
        
        # ============================================
        # 1. Text2SQL: 프롬프트 → SQL 변환 (Bedrock Only)
        # ============================================
        elif use_bedrock:
            print(f"🤖 Bedrock Text2SQL 사용")
            bedrock_service = get_bedrock_service()
            
            video_id = video.video_id if video else None
            text2sql_result = bedrock_service.text_to_sql(
                prompt=prompt_text,
                video_id=video_id
            )
            
            if text2sql_result.get('error'):
                return f"SQL 생성 오류: {text2sql_result['error']}", None
            
            sql_query = text2sql_result.get('sql')
            print(f"✅ Bedrock이 생성한 SQL: {sql_query}")
            
        else:
            # Bedrock이 비활성화된 경우 에러 반환
            return "Bedrock이 비활성화되어 있습니다. USE_BEDROCK=true로 설정하세요.", None
        
        # ============================================
        # 2. SQL 실행 및 데이터 검색
        # ============================================
        if not sql_query:
            return "SQL 쿼리를 생성하지 못했습니다.", None
        
        # DB에서 쿼리 실행
        with connection.cursor() as cursor:
            cursor.execute(sql_query)
            query_results = cursor.fetchall()
            
        if not query_results:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다.", None
            
        print(f"✅ 쿼리 결과: {len(query_results)}개 발견")
        
        # ============================================
        # 3. 이벤트 객체 조회 및 정리
        # ============================================
        found_events = []
        relevant_event = None
        
        for result in query_results:
            try:
                # timestamp 값 추출 (첫 번째 컬럼 가정)
                timestamp_value = result[0]
                
                # Event 객체 조회
                if video:
                    events = Event.objects.filter(timestamp=timestamp_value, video=video)
                else:
                    events = Event.objects.filter(timestamp=timestamp_value)
                    
                if events.exists():
                    event = events.first()
                    found_events.append(event)
                    
                    # 첫 번째 이벤트를 relevant_event로 설정
                    if relevant_event is None:
                        relevant_event = event
                        
            except Exception as e:
                print(f"⚠️ 이벤트 매핑 오류: {e}")
        
        if not found_events:
            return "이벤트를 찾았으나 상세 정보를 조회할 수 없습니다.", None
        
        # ============================================
        # 4. Bedrock RAG: 자연어 응답 생성
        # ============================================
        if use_bedrock:
            print(f"🤖 Bedrock RAG를 통해 응답 생성")
            bedrock_service = get_bedrock_service()
            
            # Event 객체를 딕셔너리로 변환
            events_data = []
            for event in found_events:
                events_data.append({
                    'timestamp': event.timestamp,
                    'event_type': event.event_type,
                    'action_detected': event.action_detected,
                    'location': event.location,
                    'age': event.age,
                    'gender': event.gender,
                    'scene_analysis': event.scene_analysis,
                })
            
            video_name = video.name if video else "알 수 없음"
            
            response_text = bedrock_service.format_timeline_response(
                prompt=prompt_text,
                events=events_data,
                video_name=video_name
            )
            
        else:
            # 기존 질문 타입별 처리 (폴백)
            print(f"🔄 기존 질문 분류 방식 사용 (폴백)")
            question_type = classify_question_type(prompt_text, sql_query)
            
            if question_type == 'ABNORMAL_BEHAVIOR':
                response_text, relevant_event = process_abnormal_behavior_query(found_events)
            else:
                response_text, relevant_event = process_marketing_query(found_events)
        
        return response_text, relevant_event
        
    except Exception as e:
        print(f"❌ 처리 중 오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
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
