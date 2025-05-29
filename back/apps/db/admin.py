from django.contrib import admin
from .models import Video, Event, PromptSession, PromptInteraction, Timeline

admin.site.register(Video)
admin.site.register(Event)
admin.site.register(PromptSession)
admin.site.register(PromptInteraction)
admin.site.register(Timeline)
