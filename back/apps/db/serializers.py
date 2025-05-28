from rest_framework import serializers
from .models import Event, PromptHistory, PromptInteraction, Timeline

class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'

class PromptHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PromptHistory
        fields = '__all__'

class PromptInteractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromptInteraction
        fields = '__all__'

class TimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Timeline
        fields = '__all__'