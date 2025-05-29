from rest_framework import viewsets
from .models import Video, Event, PromptSession, PromptInteraction, Timeline
from .serializers import VideoSerializer, EventSerializer, PromptSessionSerializer, PromptInteractionSerializer, TimelineSerializer

class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer

class PromptSessionViewSet(viewsets.ModelViewSet):
    queryset = PromptSession.objects.all()
    serializer_class = PromptSessionSerializer
    
class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer

class TimelineViewSet(viewsets.ModelViewSet):
    queryset = Timeline.objects.all()
    serializer_class = TimelineSerializer