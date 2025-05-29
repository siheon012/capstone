from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoViewSet, EventViewSet, PromptSessionViewSet, PromptInteractionViewSet, TimelineViewSet

router = DefaultRouter()
router.register(r'videos', VideoViewSet)
router.register(r'events', EventViewSet)
router.register(r'prompt-sessions', PromptSessionViewSet)
router.register(r'prompt-interactions', PromptInteractionViewSet)
router.register(r'timelines', TimelineViewSet)

urlpatterns = [
    path('', include(router.urls)),
]