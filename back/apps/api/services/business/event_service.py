"""
Event 비즈니스 로직 서비스
"""

import logging
from typing import List, Dict, Optional, Any
from django.db.models import Count
from apps.db.models import Event, Video

logger = logging.getLogger(__name__)


class EventService:
    """Event 관련 비즈니스 로직을 처리하는 서비스"""

    def get_events_by_video(
        self, video_id: str, event_type: Optional[str] = None
    ) -> List[Event]:
        """
        비디오별 이벤트 조회

        Args:
            video_id: 비디오 ID
            event_type: 이벤트 타입 필터 (선택)

        Returns:
            Event 쿼리셋
        """
        queryset = Event.objects.filter(video_id=video_id)

        if event_type:
            queryset = queryset.filter(event_type__icontains=event_type)

        return queryset.order_by("timestamp")

    def get_video_event_stats(self, video_id: str) -> Dict[str, Any]:
        """
        비디오별 이벤트 타입 통계

        Args:
            video_id: 비디오 ID

        Returns:
            통계 정보 딕셔너리
        """
        event_stats = (
            Event.objects.filter(video_id=video_id)
            .values("event_type")
            .annotate(count=Count("event_type"))
            .order_by("-count")
        )

        if not event_stats:
            return {"video_id": video_id, "most_frequent_event": None, "stats": []}

        # 가장 많이 발생한 이벤트 타입
        most_frequent = event_stats[0]

        return {
            "video_id": video_id,
            "most_frequent_event": {
                "event_type": most_frequent["event_type"],
                "count": most_frequent["count"],
            },
            "stats": list(event_stats),
        }

    def generate_embeddings(
        self,
        video_id: Optional[str] = None,
        limit: Optional[int] = None,
        force: bool = False,
    ) -> Dict[str, int]:
        """
        이벤트들의 embedding 일괄 생성

        Args:
            video_id: 비디오 ID (선택)
            limit: 처리할 최대 개수 (선택)
            force: 기존 embedding도 재생성 여부

        Returns:
            처리 결과 통계
        """
        from apps.api.services import get_bedrock_service
        import time

        # 처리할 이벤트 쿼리
        queryset = Event.objects.all()

        if video_id:
            queryset = queryset.filter(video_id=video_id)

        if not force:
            queryset = queryset.filter(embedding__isnull=True)

        if limit:
            queryset = queryset[:limit]

        total_count = queryset.count()

        if total_count == 0:
            return {"total": 0, "success": 0, "failed": 0, "skipped": 0}

        bedrock = get_bedrock_service()

        success_count = 0
        fail_count = 0
        skip_count = 0

        for event in queryset:
            # searchable_text가 없으면 생성
            if not event.searchable_text:
                event.generate_searchable_text()
                event.save(update_fields=["searchable_text", "keywords"])

            # searchable_text가 여전히 비어있으면 건너뛰기
            if not event.searchable_text or not event.searchable_text.strip():
                skip_count += 1
                continue

            try:
                # Embedding 생성
                embedding = bedrock.generate_embedding(event.searchable_text)

                if embedding:
                    event.embedding = embedding
                    event.save(update_fields=["embedding"])
                    success_count += 1
                else:
                    fail_count += 1

                # API Rate limit 방지
                time.sleep(0.1)

            except Exception as e:
                fail_count += 1
                logger.error(f"❌ Event {event.id} embedding 생성 실패: {str(e)}")

        return {
            "total": total_count,
            "success": success_count,
            "failed": fail_count,
            "skipped": skip_count,
        }

    def get_event_by_id(self, event_id: int) -> Optional[Event]:
        """
        ID로 이벤트 조회

        Args:
            event_id: 이벤트 ID

        Returns:
            Event 객체 또는 None
        """
        try:
            return Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return None

    def create_event(self, event_data: Dict[str, Any]) -> Event:
        """
        이벤트 생성

        Args:
            event_data: 이벤트 데이터

        Returns:
            생성된 Event 객체
        """
        event = Event.objects.create(**event_data)
        logger.info(f"✅ Event 생성 완료: id={event.id}, type={event.event_type}")
        return event

    def update_event(
        self, event_id: int, update_data: Dict[str, Any]
    ) -> Optional[Event]:
        """
        이벤트 업데이트

        Args:
            event_id: 이벤트 ID
            update_data: 업데이트할 데이터

        Returns:
            업데이트된 Event 객체 또는 None
        """
        event = self.get_event_by_id(event_id)
        if not event:
            return None

        for key, value in update_data.items():
            setattr(event, key, value)

        event.save()
        logger.info(f"✅ Event 업데이트 완료: id={event.id}")
        return event

    def delete_event(self, event_id: int) -> bool:
        """
        이벤트 삭제

        Args:
            event_id: 이벤트 ID

        Returns:
            삭제 성공 여부
        """
        event = self.get_event_by_id(event_id)
        if not event:
            return False

        event.delete()
        logger.info(f"✅ Event 삭제 완료: id={event_id}")
        return True


# 싱글톤 인스턴스
_event_service_instance = None


def get_event_service() -> EventService:
    """EventService 싱글톤 인스턴스 반환"""
    global _event_service_instance
    if _event_service_instance is None:
        _event_service_instance = EventService()
    return _event_service_instance
