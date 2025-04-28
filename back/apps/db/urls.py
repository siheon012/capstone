from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EventViewSet, PromptInteractionViewSet, TimelineViewSet

router = DefaultRouter()
router.register(r'events', EventViewSet)
router.register(r'prompt-interactions', PromptInteractionViewSet)
router.register(r'timelines', TimelineViewSet)

urlpatterns = [
    path('', include(router.urls)),
]