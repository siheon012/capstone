from django.db import models

class Event(models.Model):
    timestamp = models.DateTimeField()
    obj_id = models.IntegerField()
    age = models.FloatField()
    gender = models.CharField(max_length=10, null=True)
    gender_score = models.FloatField(null=True)
    location = models.CharField(max_length=255)
    area_of_interest = models.IntegerField()
    action_detected = models.CharField(max_length=255, null=True, blank=True)
    event_type = models.CharField(max_length=255)

    def __str__(self):
        return f"Event at {self.timestamp} - {self.action_detected}"

class PromptHistory(models.Model):
    """프롬프트 세션 (히스토리 항목)"""
    session_id = models.AutoField(primary_key=True)  # 자동 증가하는 ID
    title = models.CharField(max_length=255)  # 히스토리 제목
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    main_event = models.ForeignKey(Event, on_delete=models.SET_NULL, null=True, blank=True, related_name='prompt_histories')  # 주요 이벤트 참조
    
    def __str__(self):
        return f"Prompt Session #{self.session_id}: {self.title}"

class PromptInteraction(models.Model):
    """각 프롬프트 세션 내의 상호작용"""
    session = models.ForeignKey(PromptHistory, on_delete=models.CASCADE, related_name='interactions')
    input_prompt = models.TextField()
    output_response = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='prompt_interactions', null=True, blank=True)  # 필드 이름을 main_event에서 event로 변경
    
    class Meta:
        ordering = ['timestamp']
    
    def __str__(self):
        return f"Interaction in Session #{self.session.session_id} at {self.timestamp}"

class Timeline(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='timelines')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    action_sequence = models.TextField()

    def __str__(self):
        return f"Timeline for event {self.event.id} from {self.start_time} to {self.end_time}"