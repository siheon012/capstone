"""
Services module for apps.api
모든 서비스 클래스를 중앙에서 관리

구조:
- business/ : 비즈니스 로직 (video, event)
- infrastructure/ : AWS 인프라 (s3, sqs, auth)
- ai/ : AI/ML 서비스 (bedrock, vlm, search)
"""

# Business services
from .business import (
    VideoService,
    get_video_service,
    EventService,
    get_event_service,
)

# Infrastructure services
from .infrastructure import (
    S3VideoUploadService,
    s3_service,
    SQSVideoProcessingService,
    sqs_service,
    jwt_required,
)

# AI services
from .ai import (
    BedrockService,
    get_bedrock_service,
    BedrockVLMService,
    get_vlm_service,
    BedrockReranker,
    get_reranker_service,
    HybridSearchService,
    get_hybrid_search_service,
    EventWindowingService,
    get_windowing_service,
    TierManager,
    get_tier_manager,
    RAGSearchService,
)

__all__ = [
    # Business
    "VideoService",
    "get_video_service",
    "EventService",
    "get_event_service",
    # Infrastructure
    "S3VideoUploadService",
    "s3_service",
    "SQSVideoProcessingService",
    "sqs_service",
    "jwt_required",
    # AI
    "BedrockService",
    "get_bedrock_service",
    "BedrockVLMService",
    "get_vlm_service",
    "BedrockReranker",
    "get_reranker_service",
    "HybridSearchService",
    "get_hybrid_search_service",
    "EventWindowingService",
    "get_windowing_service",
    "TierManager",
    "get_tier_manager",
    "RAGSearchService",
]
