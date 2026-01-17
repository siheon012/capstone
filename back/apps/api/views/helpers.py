"""
Helper Functions
분석 결과 생성 및 포맷팅 유틸리티
"""

from apps.db.models import Video
import re


def _generate_timeline_response(prompt: str, events, video: Video) -> str:
    """타임라인 추출 및 응답 생성"""
    if not events:
        return "해당 영상에서 감지된 이벤트가 없습니다."

    time_keywords = re.findall(r"(\d+)\s*분", prompt)

    response_parts = [f"📹 {video.name} 영상의 타임라인:\n"]

    if time_keywords:
        target_minutes = [int(m) for m in time_keywords]
        filtered_events = [
            e for e in events if int(e.timestamp // 60) in target_minutes
        ]

        if filtered_events:
            for event in filtered_events:
                minutes = int(event.timestamp // 60)
                seconds = int(event.timestamp % 60)
                event_type_kr = {
                    "theft": "도난",
                    "collapse": "쓰러짐",
                    "sitting": "점거",
                    "violence": "폭행",
                }.get(event.event_type, event.event_type)

                response_parts.append(
                    f"⏰ {minutes}분 {seconds}초: {event_type_kr} - {event.action_detected or '행동 감지'} ({event.location or '위치 미상'})"
                )
        else:
            response_parts.append(
                f"해당 시간대({', '.join([f'{m}분' for m in target_minutes])})에는 이벤트가 감지되지 않았습니다."
            )
    else:
        for event in events[:10]:
            minutes = int(event.timestamp // 60)
            seconds = int(event.timestamp % 60)
            event_type_kr = {
                "theft": "도난",
                "collapse": "쓰러짐",
                "sitting": "점거",
                "violence": "폭행",
            }.get(event.event_type, event.event_type)

            response_parts.append(
                f"⏰ {minutes}분 {seconds}초: {event_type_kr} - {event.action_detected or '행동 감지'}"
            )

    return "\n".join(response_parts)


def _analyze_location_patterns(events, video: Video) -> str:
    """위치별 행동 패턴 분석"""
    if not events:
        return "분석할 이벤트가 없습니다."

    location_counts = {"left": 0, "center": 0, "right": 0, "unknown": 0}

    location_events = {"left": [], "center": [], "right": [], "unknown": []}

    for event in events:
        location = event.location or ""
        location_lower = location.lower()

        if "left" in location_lower or "왼쪽" in location_lower:
            location_counts["left"] += 1
            location_events["left"].append(event)
        elif (
            "center" in location_lower
            or "중앙" in location_lower
            or "중간" in location_lower
        ):
            location_counts["center"] += 1
            location_events["center"].append(event)
        elif "right" in location_lower or "오른쪽" in location_lower:
            location_counts["right"] += 1
            location_events["right"].append(event)
        else:
            location_counts["unknown"] += 1
            location_events["unknown"].append(event)

    response_parts = [f"📍 {video.name} 영상의 위치별 분석:\n"]

    total = sum(location_counts.values())
    if total == 0:
        return "위치 정보가 없는 이벤트입니다."

    response_parts.append("📊 위치별 이벤트 분포:")
    response_parts.append(
        f"- 왼쪽: {location_counts['left']}건 ({location_counts['left']/total*100:.1f}%)"
    )
    response_parts.append(
        f"- 중앙: {location_counts['center']}건 ({location_counts['center']/total*100:.1f}%)"
    )
    response_parts.append(
        f"- 오른쪽: {location_counts['right']}건 ({location_counts['right']/total*100:.1f}%)"
    )

    max_location = max(location_counts.items(), key=lambda x: x[1])
    location_kr = {
        "left": "왼쪽",
        "center": "중앙",
        "right": "오른쪽",
        "unknown": "미상",
    }.get(max_location[0], max_location[0])

    response_parts.append(f"\n✅ 가장 많은 활동: {location_kr} ({max_location[1]}건)")

    return "\n".join(response_parts)


def _analyze_behaviors(events, video: Video) -> str:
    """행동 패턴 분석"""
    if not events:
        return "분석할 이벤트가 없습니다."

    behavior_counts = {}
    for event in events:
        event_type = event.event_type
        behavior_counts[event_type] = behavior_counts.get(event_type, 0) + 1

    response_parts = [f"🏃 {video.name} 영상의 행동 분석:\n"]

    for event_type, count in behavior_counts.items():
        event_type_kr = {
            "theft": "도난",
            "collapse": "쓰러짐",
            "sitting": "점거",
            "violence": "폭행",
        }.get(event_type, event_type)

        response_parts.append(f"- {event_type_kr}: {count}건")

    response_parts.append("\n📝 주요 행동 예시:")
    for event in events[:3]:
        minutes = int(event.timestamp // 60)
        seconds = int(event.timestamp % 60)
        response_parts.append(
            f"- {minutes}분 {seconds}초: {event.action_detected or '행동 감지'}"
        )

    return "\n".join(response_parts)
