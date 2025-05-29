from rest_framework import serializers
from .models import Video, Event, PromptSession, PromptInteraction, Timeline

class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = '__all__'

class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'

class PromptSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromptSession
        fields = '__all__'

class PromptInteractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromptInteraction
        fields = '__all__'

class TimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Timeline
        fields = '__all__'