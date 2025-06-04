from django.contrib import admin
from .models import Video, Event, PromptSession, PromptInteraction

admin.site.register(Video)
admin.site.register(Event)
admin.site.register(PromptSession)
admin.site.register(PromptInteraction)
# Timeline 모델이 주석처리되어 있어 admin 등록 제외
# admin.site.register(Timeline)
