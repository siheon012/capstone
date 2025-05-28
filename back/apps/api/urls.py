from django.urls import path
from . import views

urlpatterns = [
    path('prompt/', views.process_prompt, name='process_prompt'),
    path('prompt/history/', views.get_prompt_history, name='get_prompt_history'),
    path('prompt/history/<int:session_id>/', views.get_session_detail, name='get_session_detail'),
]
