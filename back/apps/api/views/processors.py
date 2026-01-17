"""
Prompt Processing Logic
프롬프트 처리 및 이벤트 그룹화 로직
"""

from django.db import connection
from django.conf import settings
from apps.db.models import Event
from apps.api.services import get_bedrock_service, get_hybrid_search_service
import logging

logger = logging.getLogger(__name__)


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
    use_bedrock = getattr(settings, "USE_BEDROCK", True)
    use_hybrid_search = getattr(settings, "USE_HYBRID_SEARCH", True)

    try:
        # 하이브리드 RAG: Text2SQL + pgvector
        if use_bedrock and use_hybrid_search:
            logger.info(f"🚀 하이브리드 RAG 검색 사용")
            hybrid_service = get_hybrid_search_service()

            found_events, response_text = hybrid_service.hybrid_search(
                prompt=prompt_text,
                video=video,
                use_vector_search=True,
                use_text2sql=True,
            )

            relevant_event = found_events[0] if found_events else None
            return response_text, relevant_event

        # Bedrock Text2SQL Only
        elif use_bedrock:
            logger.info(f"🤖 Bedrock Text2SQL 사용")
            bedrock_service = get_bedrock_service()

            video_id = video.video_id if video else None
            text2sql_result = bedrock_service.text_to_sql(
                prompt=prompt_text, video_id=video_id
            )

            if text2sql_result.get("error"):
                return f"SQL 생성 오류: {text2sql_result['error']}", None

            sql_query = text2sql_result.get("sql")
            logger.info(f"✅ SQL: {sql_query}")

        else:
            return "Bedrock이 비활성화되어 있습니다.", None

        # SQL 실행
        if not sql_query:
            return "SQL 쿼리를 생성하지 못했습니다.", None

        try:
            with connection.cursor() as cursor:
                cursor.execute(sql_query)
                query_results = cursor.fetchall()
        except Exception as sql_error:
            logger.error(f"❌ SQL 실행 오류: {sql_error}")
            return "SQL 실행 오류가 발생했습니다.", None

        if not query_results:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다.", None

        logger.info(f"✅ 쿼리 결과: {len(query_results)}개")

        # 이벤트 객체 조회
        found_events = []
        relevant_event = None
        query_results_data = []

        column_names = (
            [desc[0] for desc in cursor.description] if cursor.description else []
        )

        for result in query_results:
            try:
                result_dict = dict(zip(column_names, result))
                query_results_data.append(result_dict)

                event_id = result_dict.get("id")
                if event_id:
                    try:
                        event = Event.objects.get(id=event_id)
                        found_events.append(event)

                        if relevant_event is None:
                            relevant_event = event
                    except Event.DoesNotExist:
                        logger.warning(f"⚠️ Event ID {event_id} not found")

            except Exception as e:
                logger.warning(f"⚠️ 이벤트 매핑 오류: {e}")

        if not found_events and not query_results_data:
            return "요청하신 조건에 해당하는 이벤트를 찾을 수 없습니다.", None

        # Bedrock RAG: 자연어 응답 생성
        if use_bedrock:
            logger.info(f"🤖 Bedrock RAG 응답 생성")
            bedrock_service = get_bedrock_service()

            events_data = []
            for i, event in enumerate(found_events):
                event_dict = {
                    "id": event.id,
                    "timestamp": event.timestamp,
                    "event_type": event.event_type,
                    "action": event.action,
                    "gender": event.gender,
                    "age_group": event.age_group,
                    "emotion": event.emotion,
                    "confidence": event.confidence,
                    "bbox_x": event.bbox_x,
                    "bbox_y": event.bbox_y,
                    "bbox_width": event.bbox_width,
                    "bbox_height": event.bbox_height,
                }

                if i < len(query_results_data):
                    event_dict.update(query_results_data[i])

                events_data.append(event_dict)

            if not events_data and query_results_data:
                events_data = query_results_data

            video_name = video.name if video else "알 수 없음"

            response_text = bedrock_service.format_timeline_response(
                prompt=prompt_text, events=events_data, video_name=video_name
            )

        else:
            # 폴백: 질문 타입별 처리
            logger.info(f"🔄 기존 질문 분류 방식 사용")
            question_type = classify_question_type(prompt_text, sql_query)

            if question_type == "ABNORMAL_BEHAVIOR":
                response_text, relevant_event = process_abnormal_behavior_query(
                    found_events
                )
            else:
                response_text, relevant_event = process_marketing_query(found_events)

        return response_text, relevant_event

    except Exception as e:
        logger.error(f"❌ 처리 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        return f"처리 중 오류 발생: {str(e)}", None


def classify_question_type(prompt_text, sql_query):
    """질문 유형 분류"""
    abnormal_keywords = [
        "사건",
        "이상행동",
        "쓰러짐",
        "점거",
        "도난",
        "theft",
        "collapse",
        "sitting",
    ]

    prompt_lower = prompt_text.lower()
    sql_lower = sql_query.lower()

    for keyword in abnormal_keywords:
        if keyword in prompt_lower or keyword in sql_lower:
            return "ABNORMAL_BEHAVIOR"

    if any(event_type in sql_lower for event_type in ["theft", "collapse", "sitting"]):
        return "ABNORMAL_BEHAVIOR"

    return "MARKETING"


def process_abnormal_behavior_query(found_events):
    """이상행동 질문 처리"""
    if not found_events:
        return "해당하는 이상행동을 찾을 수 없습니다.", None

    logger.info(f"🚨 이상행동 처리: {len(found_events)}개")

    found_events.sort(key=lambda x: x.timestamp)

    person_groups = group_events_by_person_abnormal(found_events)
    logger.info(f"👥 개인: {len(person_groups)}명")

    scenario_groups = []
    for person_group in person_groups:
        person_scenarios = group_events_by_scenario(person_group["events"])
        for scenario in person_scenarios:
            scenario["person_info"] = {
                "gender": person_group["gender"],
                "age": person_group["age"],
                "location": person_group["location"],
            }
            scenario_groups.append(scenario)

    logger.info(f"🎬 시나리오: {len(scenario_groups)}개")

    response_parts = []
    relevant_event = None

    if len(scenario_groups) == 1:
        group = scenario_groups[0]
        start_event = group["events"][0]
        relevant_event = start_event

        minutes = start_event.timestamp // 60
        seconds = start_event.timestamp % 60
        time_str = f"{int(minutes):02d}:{int(seconds):02d}"

        event_type_kr = {"theft": "도난", "collapse": "쓰러짐", "sitting": "점거"}.get(
            start_event.event_type, start_event.event_type
        )

        duration = group["end_time"] - group["start_time"]
        duration_str = f"{duration}초" if duration > 0 else ""

        response_text = f"{event_type_kr} 시나리오가 {time_str}에 시작되었습니다"
        if duration_str:
            response_text += f" (지속시간: {duration_str})"
        if start_event.location:
            response_text += f" - 위치: {start_event.location}"

    else:
        response_parts.append(f"총 {len(scenario_groups)}개의 시나리오를 찾았습니다:\n")

        for i, group in enumerate(scenario_groups, 1):
            start_event = group["events"][0]
            if relevant_event is None:
                relevant_event = start_event

            minutes = start_event.timestamp // 60
            seconds = start_event.timestamp % 60
            time_str = f"{int(minutes):02d}:{int(seconds):02d}"

            event_type_kr = {
                "theft": "도난",
                "collapse": "쓰러짐",
                "sitting": "점거",
            }.get(start_event.event_type, start_event.event_type)

            duration = group["end_time"] - group["start_time"]
            duration_str = f" ({duration}초 지속)" if duration > 0 else ""

            scenario_info = (
                f"{i}. [{time_str}] {event_type_kr} 시나리오 시작{duration_str}"
            )
            if start_event.location:
                scenario_info += f" - 위치: {start_event.location}"

            response_parts.append(scenario_info)

        response_text = "\n".join(response_parts)

    return response_text, relevant_event


def process_marketing_query(found_events):
    """마케팅 질문 처리"""
    if not found_events:
        return "해당하는 정보를 찾을 수 없습니다.", None

    logger.info(f"📊 마케팅 처리: {len(found_events)}개")

    found_events.sort(key=lambda x: x.timestamp)
    person_groups = group_events_by_person(found_events)

    logger.info(f"👥 개인: {len(person_groups)}명")

    relevant_event = found_events[0]

    if len(person_groups) == 1:
        group = person_groups[0]
        person_events = group["events"]
        first_event = person_events[0]
        last_event = person_events[-1]

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
        response_text = (
            f"{int(first_event.age)}세 {gender_kr}이 {time_range}에 방문했습니다"
        )
        if first_event.location:
            response_text += f" (위치: {first_event.location})"

    else:
        response_parts = [f"총 {len(person_groups)}명의 방문자를 찾았습니다:\n"]

        for i, group in enumerate(person_groups, 1):
            person_events = group["events"]
            first_event = person_events[0]
            last_event = person_events[-1]

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
    """이벤트를 시나리오별로 그룹화"""
    if not events:
        return []

    groups = []
    current_group = None

    for event in events:
        if current_group is None:
            current_group = {
                "event_type": event.event_type,
                "start_time": event.timestamp,
                "end_time": event.timestamp,
                "events": [event],
                "location": event.location,
            }
        elif (
            event.event_type == current_group["event_type"]
            and event.timestamp - current_group["end_time"] <= 10
        ):
            current_group["end_time"] = event.timestamp
            current_group["events"].append(event)
        else:
            groups.append(current_group)
            current_group = {
                "event_type": event.event_type,
                "start_time": event.timestamp,
                "end_time": event.timestamp,
                "events": [event],
                "location": event.location,
            }

    if current_group:
        groups.append(current_group)

    return groups


def group_events_by_person(events):
    """이벤트를 개인별로 그룹화"""
    if not events:
        return []

    groups = []

    for event in events:
        matched_group = None

        for group in groups:
            representative_event = group["events"][0]

            if (
                event.gender == representative_event.gender
                and abs(event.age - representative_event.age) <= 3
                and str(event.location) == str(representative_event.location)
                and abs(event.timestamp - group["end_time"]) <= 30
            ):

                matched_group = group
                break

        if matched_group:
            matched_group["events"].append(event)
            matched_group["end_time"] = event.timestamp
        else:
            new_group = {
                "gender": event.gender,
                "age": event.age,
                "location": event.location,
                "start_time": event.timestamp,
                "end_time": event.timestamp,
                "events": [event],
            }
            groups.append(new_group)

    return groups


def group_events_by_person_abnormal(events):
    """이상행동 이벤트를 개인별로 그룹화 (더 짧은 간격)"""
    if not events:
        return []

    groups = []

    for event in events:
        matched_group = None

        for group in groups:
            representative_event = group["events"][0]

            if (
                event.gender == representative_event.gender
                and abs(event.age - representative_event.age) <= 3
                and str(event.location) == str(representative_event.location)
                and abs(event.timestamp - group["end_time"]) <= 15
            ):

                matched_group = group
                break

        if matched_group:
            matched_group["events"].append(event)
            matched_group["end_time"] = event.timestamp
        else:
            new_group = {
                "gender": event.gender,
                "age": event.age,
                "location": event.location,
                "start_time": event.timestamp,
                "end_time": event.timestamp,
                "events": [event],
            }
            groups.append(new_group)

    return groups
