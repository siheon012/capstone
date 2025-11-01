"""
Bedrock VLM 서비스 - 이벤트 기반 영상 요약
Claude 3 Vision을 활용한 프레임 분석 및 요약 생성
"""
import json
import base64
import boto3
from typing import List, Dict, Optional
from django.conf import settings
from apps.db.models import Event, Video
import cv2
import os


class BedrockVLMService:
    """Bedrock Claude 3 Vision을 활용한 영상 분석 서비스"""
    
    # 편의점 CCTV 분석용 프롬프트 템플릿
    CONVENIENCE_STORE_PROMPTS = {
        "scene_description": """
당신은 편의점 CCTV 영상을 분석하는 보안 전문가입니다.
다음 편의점 CCTV 영상의 장면들을 분석하여 상황을 설명해주세요.

분석 항목:
1. 시간 순서대로 무슨 일이 일어났는지
2. 등장 인물의 행동과 특징
3. 매장 내 위치 (입구/중앙/계산대 등)
4. 주목할 만한 행동이나 이상 징후

요구사항:
- 3-5문장으로 간결하게
- 시간 정보 포함 (X분 Y초)
- 존댓말 사용
- 객관적인 관찰만 기술

장면 설명:""",
        
        "location_analysis": """
당신은 편의점 CCTV 영상을 분석하는 보안 전문가입니다.
다음 영상에서 손님의 매장 내 위치와 동선을 분석해주세요.

분석 항목:
1. 왼쪽/중앙/오른쪽 구역별 활동 빈도
2. 주로 머문 위치와 시간
3. 이동 패턴 및 특이사항
4. 특정 진열대나 상품에 집중한 시간

위치 분석 결과:""",
        
        "behavior_analysis": """
당신은 편의점 CCTV 영상을 분석하는 보안 전문가입니다.
다음 영상에서 손님의 행동 패턴을 분석해주세요.

분석 항목:
1. 주요 행동 (물건 집기, 살펴보기, 계산 등)
2. 행동의 순서와 소요 시간
3. 비정상적이거나 주의가 필요한 행동
4. 전체적인 방문 목적 추정

행동 분석 결과:""",
        
        "timeline_extraction": """
당신은 편의점 CCTV 영상을 분석하는 보안 전문가입니다.
다음 영상의 주요 이벤트를 타임라인 형식으로 정리해주세요.

각 이벤트마다:
- 정확한 시간 (X분 Y초)
- 발생한 행동
- 위치 정보
- 중요도 (높음/보통/낮음)

타임라인:"""
    }
    
    def __init__(self):
        """Bedrock VLM 클라이언트 초기화"""
        self.region = settings.AWS_BEDROCK_REGION
        self.model_id = settings.AWS_BEDROCK_MODEL_ID  # settings에서 가져오기
        
        # Bedrock Runtime 클라이언트
        aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
        aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
        
        client_kwargs = {
            'service_name': 'bedrock-runtime',
            'region_name': self.region
        }
        
        if aws_access_key and aws_secret_key:
            client_kwargs['aws_access_key_id'] = aws_access_key
            client_kwargs['aws_secret_access_key'] = aws_secret_key
        
        self.bedrock_runtime = boto3.client(**client_kwargs)
        print(f"✅ Bedrock VLM 서비스 초기화: region={self.region}")
    
    def extract_event_frames(
        self, 
        video: Video, 
        events: List[Event],
        max_frames: int = 10
    ) -> List[Dict]:
        """
        이벤트 발생 시점의 프레임 추출
        
        Args:
            video: Video 객체
            events: Event 리스트
            max_frames: 최대 프레임 수
            
        Returns:
            [{'timestamp': 750, 'frame': base64_image, 'event': event_obj}, ...]
        """
        frames = []
        
        # 중요도 순으로 이벤트 정렬 (도난 > 쓰러짐 > 기타)
        priority = {'theft': 3, 'collapse': 2, 'sitting': 1}
        sorted_events = sorted(
            events, 
            key=lambda e: priority.get(e.event_type, 0),
            reverse=True
        )[:max_frames]
        
        # S3에서 비디오 다운로드 또는 로컬 경로 사용
        video_path = self._get_video_path(video)
        
        if not video_path or not os.path.exists(video_path):
            print(f"⚠️ 비디오 파일을 찾을 수 없음: {video_path}")
            return frames
        
        # OpenCV로 비디오 열기
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        for event in sorted_events:
            # 이벤트 시점의 프레임 번호 계산
            frame_number = int(event.timestamp * fps)
            
            # 해당 프레임으로 이동
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            
            if ret:
                # 프레임을 JPEG로 인코딩
                _, buffer = cv2.imencode('.jpg', frame)
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                frames.append({
                    'timestamp': event.timestamp,
                    'frame': frame_base64,
                    'event': event,
                    'event_type': event.event_type,
                    'description': getattr(event, 'action_detected', '알 수 없음')
                })
                
                print(f"✅ 프레임 추출: {event.timestamp}초 ({event.event_type})")
        
        cap.release()
        return frames
    
    def extract_frames_by_seconds(
        self,
        video: Video,
        start_seconds: float,
        end_seconds: float,
        interval: float = 1.0
    ) -> List[Dict]:
        """
        특정 시간 범위의 프레임을 초 단위로 추출
        
        Args:
            video: Video 객체
            start_seconds: 시작 시간 (초)
            end_seconds: 종료 시간 (초)
            interval: 프레임 추출 간격 (초, 기본 1초)
            
        Returns:
            [{'timestamp': 12.5, 'frame': base64_image}, ...]
        """
        frames = []
        
        # 비디오 경로 가져오기
        video_path = self._get_video_path(video)
        
        if not video_path or not os.path.exists(video_path):
            print(f"⚠️ 비디오 파일을 찾을 수 없음: {video_path}")
            return frames
        
        # OpenCV로 비디오 열기
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_duration = total_frames / fps
        
        print(f"📹 비디오 정보: FPS={fps}, 총 프레임={total_frames}, 길이={video_duration:.2f}초")
        
        # 유효한 범위 확인
        end_seconds = min(end_seconds, video_duration)
        start_seconds = max(0, start_seconds)
        
        if start_seconds >= end_seconds:
            print(f"⚠️ 유효하지 않은 시간 범위: {start_seconds}~{end_seconds}초")
            cap.release()
            return frames
        
        # 지정된 간격으로 프레임 추출
        current_time = start_seconds
        while current_time <= end_seconds:
            frame_number = int(current_time * fps)
            
            # 프레임 범위 확인
            if frame_number >= total_frames:
                break
            
            # 해당 프레임으로 이동
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            
            if ret:
                # 프레임을 JPEG로 인코딩
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                frames.append({
                    'timestamp': current_time,
                    'frame': frame_base64,
                    'frame_number': frame_number
                })
                
                print(f"✅ 프레임 추출: {current_time:.1f}초 (프레임 #{frame_number})")
            
            current_time += interval
        
        cap.release()
        print(f"✅ 총 {len(frames)}개 프레임 추출 완료 ({start_seconds}~{end_seconds}초)")
        
        return frames
    
    def analyze_time_range(
        self,
        video: Video,
        start_seconds: float,
        end_seconds: float,
        analysis_type: str = "behavior",
        interval: float = 2.0
    ) -> str:
        """
        특정 시간 범위를 분석하여 요약 생성
        
        Args:
            video: Video 객체
            start_seconds: 시작 시간 (초)
            end_seconds: 종료 시간 (초)
            analysis_type: 분석 유형 (behavior, location, scene)
            interval: 프레임 추출 간격 (초)
            
        Returns:
            분석 결과 텍스트
        """
        print(f"🎬 시간 범위 분석 시작: {start_seconds}~{end_seconds}초 ({analysis_type})")
        
        # 프레임 추출
        frames = self.extract_frames_by_seconds(
            video=video,
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            interval=interval
        )
        
        if not frames:
            return f"{start_seconds}~{end_seconds}초 범위에서 프레임을 추출할 수 없습니다."
        
        # 프롬프트 선택
        prompt_template = self.CONVENIENCE_STORE_PROMPTS.get(
            f"{analysis_type}_analysis",
            self.CONVENIENCE_STORE_PROMPTS["scene_description"]
        )
        
        # 시간 정보 추가
        time_info = f"\n\n분석 대상 시간: {int(start_seconds//60)}분 {int(start_seconds%60)}초 ~ {int(end_seconds//60)}분 {int(end_seconds%60)}초\n"
        time_info += f"총 {len(frames)}개 프레임 ({interval}초 간격)\n\n"
        
        # Claude 3 Vision 컨텐츠 구성
        content = [
            {
                "type": "text",
                "text": prompt_template + time_info
            }
        ]
        
        # 이미지 추가 (최대 10개)
        for frame_data in frames[:10]:
            minutes = int(frame_data['timestamp'] // 60)
            seconds = int(frame_data['timestamp'] % 60)
            
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame_data['frame']
                }
            })
            content.append({
                "type": "text",
                "text": f"[{minutes}분 {seconds}초]"
            })
        
        # Bedrock API 호출
        try:
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                "temperature": 0.5
            }
            
            print(f"🤖 Bedrock VLM 호출 중... (이미지 {min(len(frames), 10)}개)")
            
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps(body)
            )
            
            response_body = json.loads(response['body'].read())
            analysis_result = response_body['content'][0]['text']
            
            print(f"✅ Bedrock VLM 분석 완료")
            return analysis_result
            
        except Exception as e:
            print(f"❌ VLM 분석 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # 폴백: 기본 정보 반환
            return self._generate_fallback_time_range_summary(frames, start_seconds, end_seconds)
    
    def generate_video_summary(
        self,
        video: Video,
        events: List[Event],
        summary_type: str = "events"  # "events" 또는 "full"
    ) -> str:
        """
        영상 요약 생성
        
        Args:
            video: Video 객체
            events: Event 리스트
            summary_type: "events" (이벤트 기반) 또는 "full" (전체)
            
        Returns:
            요약 텍스트
        """
        if summary_type == "events":
            return self._generate_event_based_summary(video, events)
        else:
            # 전체 영상 요약 (비추천, 시간/비용 높음)
            return self._generate_full_video_summary(video)
    
    def _generate_event_based_summary(
        self,
        video: Video,
        events: List[Event]
    ) -> str:
        """
        이벤트 기반 요약 (추천 ✅)
        주요 이벤트 프레임만 추출하여 분석
        """
        # 1. 주요 이벤트 프레임 추출
        frames = self.extract_event_frames(video, events, max_frames=10)
        
        if not frames:
            return "분석할 이벤트가 없습니다."
        
        # 2. 프레임 정보를 텍스트로 구성
        events_text = ""
        for i, frame_data in enumerate(frames, 1):
            timestamp = frame_data['timestamp']
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            event_type = frame_data['event_type']
            
            events_text += f"{i}. {minutes}분 {seconds}초: {event_type}\n"
        
        # 3. Claude 3 Vision에 프롬프트 + 이미지 전송
        content = [
            {
                "type": "text",
                "text": f"""다음은 CCTV 영상 '{video.name}'의 주요 이벤트 장면들입니다.
각 장면을 분석하여 전체적인 요약을 작성해주세요.

주요 이벤트:
{events_text}

요구사항:
1. 시간 순서대로 무슨 일이 일어났는지 설명
2. 주요 이벤트의 상황과 인물 묘사
3. 전체적인 상황 요약
4. 3-5문장으로 간결하게
5. 존댓말 사용

요약:"""
            }
        ]
        
        # 이미지 추가 (최대 10개)
        for frame_data in frames[:10]:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame_data['frame']
                }
            })
        
        # 4. Bedrock API 호출
        try:
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                "temperature": 0.5
            }
            
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps(body)
            )
            
            response_body = json.loads(response['body'].read())
            summary = response_body['content'][0]['text']
            
            return summary
            
        except Exception as e:
            print(f"❌ VLM 요약 생성 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._generate_fallback_summary(events)
    
    def _generate_full_video_summary(self, video: Video) -> str:
        """
        전체 영상 요약 (비추천 ❌)
        시간과 비용이 많이 소요됨
        """
        # 구현 생략 (필요시 추가)
        return "전체 영상 요약은 구현되지 않았습니다. 이벤트 기반 요약을 사용하세요."
    
    def _generate_fallback_summary(self, events: List[Event]) -> str:
        """
        VLM 실패 시 폴백 요약 (텍스트만)
        """
        if not events:
            return "감지된 이벤트가 없습니다."
        
        summary_parts = []
        summary_parts.append(f"총 {len(events)}개의 이벤트가 감지되었습니다.\n")
        
        # 이벤트 타입별 카운트
        event_counts = {}
        for event in events:
            event_type = event.event_type
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        for event_type, count in event_counts.items():
            event_type_kr = {
                'theft': '도난',
                'collapse': '쓰러짐',
                'sitting': '점거'
            }.get(event_type, event_type)
            summary_parts.append(f"- {event_type_kr}: {count}건")
        
        # 첫 번째와 마지막 이벤트
        first_event = events[0]
        last_event = events[-1]
        
        first_min = int(first_event.timestamp // 60)
        first_sec = int(first_event.timestamp % 60)
        last_min = int(last_event.timestamp // 60)
        last_sec = int(last_event.timestamp % 60)
        
        summary_parts.append(
            f"\n첫 이벤트: {first_min}분 {first_sec}초"
        )
        summary_parts.append(
            f"마지막 이벤트: {last_min}분 {last_sec}초"
        )
        
        return "\n".join(summary_parts)
    
    def _generate_fallback_time_range_summary(
        self,
        frames: List[Dict],
        start_seconds: float,
        end_seconds: float
    ) -> str:
        """
        VLM 실패 시 시간 범위 폴백 요약
        """
        start_min = int(start_seconds // 60)
        start_sec = int(start_seconds % 60)
        end_min = int(end_seconds // 60)
        end_sec = int(end_seconds % 60)
        
        summary = f"📹 {start_min}분 {start_sec}초 ~ {end_min}분 {end_sec}초 구간 분석\n\n"
        summary += f"총 {len(frames)}개 프레임이 추출되었습니다.\n"
        summary += "VLM 분석을 사용할 수 없어 기본 정보만 제공됩니다.\n\n"
        summary += "상세 분석을 위해서는 AWS Bedrock 설정을 확인해주세요."
        
        return summary
    
    def _get_video_path(self, video: Video) -> Optional[str]:
        """
        비디오 파일 경로 가져오기 (S3 또는 로컬)
        """
        # S3에서 다운로드 (필요시)
        if hasattr(video, 's3_key') and video.s3_key:
            # TODO: S3에서 다운로드 구현
            # return self._download_from_s3(video)
            pass
        
        # 로컬 경로
        if hasattr(video, 'filename'):
            local_path = os.path.join(
                settings.MEDIA_ROOT,
                'videos',
                video.filename
            )
            if os.path.exists(local_path):
                return local_path
        
        return None


# 싱글톤 인스턴스
_vlm_service = None

def get_vlm_service() -> BedrockVLMService:
    """VLM 서비스 싱글톤 인스턴스"""
    global _vlm_service
    
    if _vlm_service is None:
        _vlm_service = BedrockVLMService()
    
    return _vlm_service
