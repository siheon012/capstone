from rest_framework import viewsets
from .models import Event, PromptInteraction, Timeline
from .serializers import EventSerializer, PromptInteractionSerializer, TimelineSerializer

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer

class PromptInteractionViewSet(viewsets.ModelViewSet):
    queryset = PromptInteraction.objects.all()
    serializer_class = PromptInteractionSerializer

class TimelineViewSet(viewsets.ModelViewSet):
    queryset = Timeline.objects.all()
    serializer_class = TimelineSerializer