from django.db import models

class Video(models.Model):
    """비디오 모델 - 모든 다른 데이터의 중심이 되는 모델"""
    video_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)  # 비디오 파일명
    video_file = models.FileField(upload_to='videos/%Y/%m/%d/')  # 실제 비디오 파일
    upload_time = models.DateTimeField(auto_now_add=True)  # 업로드 시간
    duration = models.FloatField(null=True, blank=True)  # 비디오 길이(초) - 업로드 후 분석으로 채움
    file_size = models.BigIntegerField(null=True, blank=True)  # 파일 크기 (bytes)
    
    # 분석 상태 관련 필드 추가
    is_analyzed = models.BooleanField(default=False)  # 분석 완료 여부
    analysis_started_at = models.DateTimeField(null=True, blank=True)  # 분석 시작 시간
    analysis_completed_at = models.DateTimeField(null=True, blank=True)  # 분석 완료 시간
    analysis_status = models.CharField(
        max_length=20,
        choices=[
            ('pending', '대기중'),
            ('processing', '분석중'),
            ('completed', '완료'),
            ('failed', '실패')
        ],
        default='pending'
    )
    
    def __str__(self):
        return f"Video: {self.name}"

class Event(models.Model):
    """비디오 내에서 발생한 이벤트"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='events', db_column='video_id')
    timestamp = models.DateTimeField()
    obj_id = models.IntegerField()
    age = models.FloatField()
    gender = models.CharField(max_length=10)
    gender_score = models.FloatField()
    location = models.CharField(max_length=255)
    area_of_interest = models.IntegerField()
    action_detected = models.CharField(max_length=255)
    event_type = models.CharField(max_length=255)

    def __str__(self):
        video_name = self.video.name if self.video else "Unknown Video"
        return f"Event at {self.timestamp} - {self.action_detected} in {video_name}"

class PromptSession(models.Model):
    """프롬프트 세션 - 사용자의 검색 세션"""
    session_id = models.AutoField(primary_key=True)
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='prompt_sessions')
    title = models.CharField(max_length=255)  # 세션 제목
    main_event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='prompt_sessions', db_column='event_id')  # 사용자가 찾고 싶어하는 주요 이벤트/행동
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Prompt Session #{self.session_id}: {self.title} for {self.video.name}"

class PromptInteraction(models.Model):
    """각 프롬프트 세션 내의 상호작용"""
    session = models.ForeignKey(PromptSession, on_delete=models.CASCADE, related_name='interactions')
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='prompt_interactions', db_column='video_id')  # 성능 최적화를 위한 직접 참조
    input_prompt = models.TextField()  # 사용자 입력 프롬프트
    generated_sql = models.TextField(null=True, blank=True)  # Text2SQL로 생성된 SQL
    output_response = models.TextField()  # 최종 응답 (추출된 시간대)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # 검색 결과 관련 필드
    found_events_count = models.IntegerField(default=0)  # 찾은 이벤트 수
    time_ranges = models.JSONField(null=True, blank=True)  # 추출된 시간대들 [{"start": "10:30", "end": "10:45"}, ...]
    
    class Meta:
        ordering = ['timestamp']
    
    def __str__(self):
        return f"Interaction in Session #{self.session.session_id} at {self.timestamp}"

class Timeline(models.Model):
    """사용자가 저장한 특정 이벤트 타임라인"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='timelines', db_column='video_id')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='timelines')  # Event 참조로 event_type 접근
    start_time = models.DateTimeField()  # 이벤트 시작 시간
    end_time = models.DateTimeField()    # 이벤트 종료 시간
    
    # 어떤 프롬프트로 찾았는지 - 이것만 있으면 input_prompt도 접근 가능
    source_interaction = models.ForeignKey(PromptInteraction, on_delete=models.CASCADE, related_name='saved_timelines')
    
    # 사용자 저장 정보
    user_note = models.TextField(blank=True)  # 사용자 메모
    priority = models.CharField(
        max_length=10,
        choices=[
            ('low', '낮음'),
            ('medium', '보통'), 
            ('high', '높음')
        ],
        default='medium'
    )
    saved_at = models.DateTimeField(auto_now_add=True)  # 저장한 시점
    
    # 추가 메타데이터
    confidence_score = models.FloatField(null=True, blank=True)  # AI 신뢰도 점수
    action_sequence = models.TextField(blank=True)  # 상세 행동 시퀀스

    def __str__(self):
        return f"Timeline: {self.event.event_type} in {self.video.name} ({self.start_time} - {self.end_time})"