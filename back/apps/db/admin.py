from django.contrib import admin
from .models import Event, PromptInteraction, Timeline

admin.site.register(Event)
admin.site.register(PromptInteraction)
admin.site.register(Timeline)
