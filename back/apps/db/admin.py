from django.contrib import admin
from .models import Event, PromptHistory, PromptInteraction, Timeline

admin.site.register(Event)
admin.site.register(PromptHistory)
admin.site.register(PromptInteraction)
admin.site.register(Timeline)
