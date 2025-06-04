from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoViewSet, EventViewSet, PromptSessionViewSet, PromptInteractionViewSet

router = DefaultRouter()
router.register(r'videos', VideoViewSet)
router.register(r'events', EventViewSet)
router.register(r'prompt-sessions', PromptSessionViewSet)
router.register(r'prompt-interactions', PromptInteractionViewSet)
# Timeline 모델이 주석처리되어 있어 URL 제외
# router.register(r'timelines', TimelineViewSet)

urlpatterns = [
    path('', include(router.urls)),
]