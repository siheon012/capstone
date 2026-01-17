from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VideoViewSet,
    EventViewSet,
    PromptSessionViewSet,
    PromptInteractionViewSet,
    DepthDataViewSet,
    DisplayDataViewSet,
    VideoAnalysisViewSet,
    AnalysisJobViewSet,
    TierManagementViewSet,
)

router = DefaultRouter()
router.register(r"videos", VideoViewSet)
router.register(r"events", EventViewSet)
router.register(r"prompt-sessions", PromptSessionViewSet)
router.register(r"prompt-interactions", PromptInteractionViewSet)
router.register(r"depth-data", DepthDataViewSet)
router.register(r"display-data", DisplayDataViewSet)

# 새로운 클라우드 네이티브 API 엔드포인트들
router.register(r"video-analysis", VideoAnalysisViewSet)
router.register(r"analysis-jobs", AnalysisJobViewSet)
router.register(r"tier-management", TierManagementViewSet, basename="tier-management")

urlpatterns = [
    path("", include(router.urls)),
]
