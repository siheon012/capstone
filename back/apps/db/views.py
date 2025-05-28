from rest_framework import viewsets
from .models import Event, PromptHistory, PromptInteraction, Timeline
from .serializers import EventSerializer, PromptHistorySerializer, PromptInteractionSerializer, TimelineSerializer

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer

class PromptHistoryViewSet(viewsets.ModelViewSet):
    queryset = PromptHistory.objects.all()
    serializer_class = PromptHistorySerializer
    
class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer

class TimelineViewSet(viewsets.ModelViewSet):
    queryset = Timeline.objects.all()
    serializer_class = TimelineSerializer