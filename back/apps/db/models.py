from django.db import models

class Event(models.Model):
    timestamp = models.DateTimeField()
    obj_id = models.IntegerField()
    age = models.FloatField()
    gender = models.CharField(max_length=10, null=True)
    gender_score = models.FloatField(null=True)
    location = models.CharField(max_length=255)
    area_of_interest = models.IntegerField()
    action_detected = models.CharField(max_length=255)
    event_type = models.CharField(max_length=255)

    def __str__(self):
        return f"Event at {self.timestamp} - {self.action_detected}"

class PromptInteraction(models.Model):
    input_prompt = models.TextField()
    output_response = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    user_id = models.IntegerField()

    def __str__(self):
        return f"Prompt interaction at {self.timestamp}"

class Timeline(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    action_sequence = models.TextField()

    def __str__(self):
        return f"Timeline for event {self.event.id} from {self.start_time} to {self.end_time}"
