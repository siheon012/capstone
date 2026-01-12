"""
이벤트 윈도잉 및 요약 서비스
- 슬라이딩 윈도우: 앞뒤 이벤트를 묶어서 컨텍스트 강화
- 이벤트 시퀀스 요약: 연속된 이벤트들을 하나의 스토리로 통합
"""
from typing import List, Dict, Optional
from django.db.models import Q
from apps.db.models import Event
import logging

logger = logging.getLogger(__name__)


class EventWindowingService:
    """이벤트 윈도잉 및 컨텍스트 강화 서비스"""
    
    def __init__(self, window_size: int = 2):
        """
        Args:
            window_size: 현재 이벤트 기준 앞뒤로 포함할 이벤트 개수
        """
        self.window_size = window_size
    
    def create_windowed_text(self, event: Event) -> str:
        """
        슬라이딩 윈도우로 이벤트의 컨텍스트를 강화한 텍스트 생성
        
        Args:
            event: 대상 이벤트
            
        Returns:
            앞뒤 이벤트를 포함한 통합 텍스트
        """
        try:
            # 같은 비디오의 앞뒤 이벤트 가져오기
            video_events = Event.objects.filter(
                video=event.video
            ).order_by('timestamp')
            
            # 현재 이벤트의 인덱스 찾기
            event_list = list(video_events)
            try:
                current_index = event_list.index(event)
            except ValueError:
                # 현재 이벤트를 찾지 못하면 기본 텍스트 반환
                return event.searchable_text or ''
            
            # 윈도우 범위 계산
            start_idx = max(0, current_index - self.window_size)
            end_idx = min(len(event_list), current_index + self.window_size + 1)
            
            # 윈도우 내 이벤트들 추출
            window_events = event_list[start_idx:end_idx]
            
            # 통합 텍스트 생성
            context_parts = []
            
            for i, e in enumerate(window_events):
                # 현재 이벤트는 강조
                if e.id == event.id:
                    prefix = "[현재 이벤트]"
                elif i < current_index - start_idx:
                    prefix = "[이전]"
                else:
                    prefix = "[이후]"
                
                # 이벤트 정보 추가
                event_text = f"{prefix} {e.timestamp:.1f}초: {e.searchable_text or e.description or ''}"
                context_parts.append(event_text)
            
            # 전체 컨텍스트 통합
            windowed_text = "\n".join(context_parts)
            
            logger.debug(f"✅ 윈도잉 완료: Event {event.id}, 윈도우 크기: {len(window_events)}")
            return windowed_text
            
        except Exception as e:
            logger.error(f"❌ 윈도잉 실패: {str(e)}")
            return event.searchable_text or ''
    
    def create_event_sequence_summary(
        self, 
        events: List[Event], 
        max_events: int = 10
    ) -> str:
        """
        연속된 이벤트들을 시간 순으로 요약
        
        Args:
            events: 이벤트 리스트
            max_events: 최대 포함 이벤트 수
            
        Returns:
            시간 순 스토리 형식의 요약 텍스트
        """
        if not events:
            return ""
        
        # 시간 순 정렬
        sorted_events = sorted(events, key=lambda e: e.timestamp)[:max_events]
        
        # 스토리 형식으로 통합
        story_parts = []
        story_parts.append(f"영상 분석 요약 ({len(sorted_events)}개 주요 이벤트):\n")
        
        for i, event in enumerate(sorted_events, 1):
            timestamp = event.timestamp
            event_type = getattr(event, 'event_type', '알 수 없음')
            description = event.searchable_text or event.description or ''
            
            # 시간대 표현
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_str = f"{minutes}분 {seconds}초" if minutes > 0 else f"{seconds}초"
            
            story_parts.append(f"{i}. [{time_str}] {event_type}: {description}")
        
        return "\n".join(story_parts)
    
    def group_by_temporal_proximity(
        self,
        events: List[Event],
        time_gap_threshold: float = 5.0
    ) -> List[List[Event]]:
        """
        시간적으로 가까운 이벤트들을 그룹화
        
        Args:
            events: 이벤트 리스트
            time_gap_threshold: 그룹을 나누는 시간 간격 (초)
            
        Returns:
            이벤트 그룹 리스트
        """
        if not events:
            return []
        
        # 시간 순 정렬
        sorted_events = sorted(events, key=lambda e: e.timestamp)
        
        # 그룹화
        groups = []
        current_group = [sorted_events[0]]
        
        for event in sorted_events[1:]:
            # 이전 이벤트와의 시간 간격 계산
            time_gap = event.timestamp - current_group[-1].timestamp
            
            if time_gap <= time_gap_threshold:
                # 같은 그룹에 추가
                current_group.append(event)
            else:
                # 새 그룹 시작
                groups.append(current_group)
                current_group = [event]
        
        # 마지막 그룹 추가
        if current_group:
            groups.append(current_group)
        
        logger.info(f"✅ 이벤트 그룹화 완료: {len(events)}개 → {len(groups)}개 그룹")
        return groups
    
    def create_summarized_events(
        self,
        events: List[Event],
        bedrock_service=None
    ) -> List[Dict]:
        """
        이벤트 그룹을 요약하여 더 나은 컨텍스트 제공
        
        Args:
            events: 이벤트 리스트
            bedrock_service: Bedrock 서비스 (Claude로 요약 생성용)
            
        Returns:
            요약된 이벤트 정보 리스트
        """
        # 시간적으로 가까운 이벤트들을 그룹화
        event_groups = self.group_by_temporal_proximity(events)
        
        summarized_events = []
        
        for group in event_groups:
            if len(group) == 1:
                # 단일 이벤트는 그대로 사용
                event = group[0]
                summarized_events.append({
                    'timestamp': event.timestamp,
                    'type': 'single',
                    'text': event.searchable_text or event.description or '',
                    'event_count': 1
                })
            else:
                # 여러 이벤트는 통합 요약
                start_time = group[0].timestamp
                end_time = group[-1].timestamp
                
                # 간단한 통합 텍스트 (Claude 없이)
                combined_text = f"({start_time:.1f}초~{end_time:.1f}초) "
                combined_text += " → ".join([
                    e.searchable_text or e.description or '' 
                    for e in group[:5]  # 최대 5개만
                ])
                
                summarized_events.append({
                    'timestamp': start_time,
                    'type': 'sequence',
                    'text': combined_text,
                    'event_count': len(group)
                })
        
        logger.info(f"✅ 이벤트 요약 완료: {len(events)}개 → {len(summarized_events)}개 요약")
        return summarized_events


# 싱글톤 인스턴스
_windowing_service = None

def get_windowing_service(window_size: int = 2) -> EventWindowingService:
    """윈도잉 서비스 싱글톤 인스턴스 반환"""
    global _windowing_service
    
    if _windowing_service is None:
        _windowing_service = EventWindowingService(window_size=window_size)
    
    return _windowing_service
