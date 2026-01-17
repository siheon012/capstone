"""
API Views
프롬프트 처리, VLM 채팅, 헬스체크, S3 업로드, 요약 등 API 엔드포인트
"""

# Sub-modules (각각 독립적으로 import 가능)
from . import health
from . import prompt
from . import vlm
from . import helpers
from . import processors
from . import s3
from . import summary

# Health Check
from .health import health_check

# Prompt Processing
from .prompt import (
    process_prompt,
    get_prompt_history,
    get_session_detail,
)

# VLM Chat
from .vlm import process_vlm_chat

# S3 Upload (새로 추가)
from .s3 import (
    request_upload_url,
    confirm_upload,
    get_video_download_url,
    delete_video,
    upload_thumbnail,
)

# Summary (새로 추가)
from .summary import (
    generate_video_summary,
    check_summary_status,
    generate_summary_async,
)

# Helper Functions
from .helpers import (
    _generate_timeline_response,
    _analyze_location_patterns,
    _analyze_behaviors,
)

# Processors
from .processors import (
    process_prompt_logic,
    classify_question_type,
    process_abnormal_behavior_query,
    process_marketing_query,
    group_events_by_scenario,
    group_events_by_person,
    group_events_by_person_abnormal,
)

__all__ = [
    # Sub-modules
    "health",
    "prompt",
    "vlm",
    "helpers",
    "processors",
    "s3",
    "summary",
    # Health
    "health_check",
    # Prompt
    "process_prompt",
    "get_prompt_history",
    "get_session_detail",
    # VLM
    "process_vlm_chat",
    # S3
    "request_upload_url",
    "confirm_upload",
    "get_video_download_url",
    "delete_video",
    "upload_thumbnail",
    # Summary
    "generate_video_summary",
    "check_summary_status",
    "generate_summary_async",
    # Helpers
    "_generate_timeline_response",
    "_analyze_location_patterns",
    "_analyze_behaviors",
    # Processors
    "process_prompt_logic",
    "classify_question_type",
    "process_abnormal_behavior_query",
    "process_marketing_query",
    "group_events_by_scenario",
    "group_events_by_person",
    "group_events_by_person_abnormal",
]
