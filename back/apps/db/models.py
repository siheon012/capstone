from django.db import models
from django.utils import timezone
import os

class Video(models.Model):
    """비디오 모델 - 모든 다른 데이터의 중심이 되는 모델"""
    video_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    duration = models.IntegerField()  # 분 단위
    size = models.BigIntegerField()  # 바이트
    upload_date = models.DateTimeField(auto_now_add=True)
    thumbnail_path = models.CharField(max_length=500, null= False, blank=False)
    chat_count = models.IntegerField(default=0)
    major_event = models.CharField(max_length=100, null=True, blank=True)
    video_file = models.FileField(upload_to='videos/%Y/%m/%d/', blank=True, null=True)  # 임시로 nullable로 설정
    
    @property
    def file_path(self):
        """비디오 파일의 웹 접근 경로를 동적으로 생성"""
        if self.video_file:
            return f"/uploads/{self.video_file.name}"
        # 레거시 파일들을 위한 fallback (name 기반)
        return f"/uploads/videos/{self.name}"
    
    @property
    def computed_thumbnail_path(self):
        """썸네일 경로를 동적으로 계산 (저장된 경로가 없을 때)"""
        if self.thumbnail_path:
            return self.thumbnail_path
        # name에서 확장자 제거하고 .png 추가
        name_without_ext = os.path.splitext(self.name)[0]
        return f"/uploads/thumbnails/{name_without_ext}.png"
    
    # Meta 클래스 추가 권장
    class Meta:
        ordering = ['-upload_date']  # 최신 업로드 순
        indexes = [
            models.Index(fields=['upload_date']),
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return f"Video: {self.name}"

class Event(models.Model):
    """비디오 내에서 발생한 이벤트"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='events', db_column='video_id')
    timestamp = models.DateTimeField()  # FloatField → DateTimeField로 변경
    obj_id = models.IntegerField()
    age = models.FloatField()  # null=True, blank=True 제거 (DB에서 not null)
    gender = models.CharField(max_length=10)  # null=True, blank=True 제거
    gender_score = models.FloatField()  # null=True, blank=True 제거
    location = models.CharField(max_length=255)
    area_of_interest = models.IntegerField()
    action_detected = models.CharField(max_length=255)
    event_type = models.CharField(max_length=255)
    scene_analysis = models.CharField(max_length=255, null=True, blank=True)  # 분석 결과 (예: VLM 요약)
    orientataion= models.CharField(max_length=50, null=True, blank=True)  # 객체 방향 (예: left, right)

    
    @property
    def timestamp_display(self):
        """사용자 친화적 시간 표시"""
        return self.timestamp.strftime("%H:%M:%S")
    
    class Meta:
        ordering = ['video', 'timestamp']
        indexes = [
            models.Index(fields=['video', 'timestamp']),
            models.Index(fields=['event_type']),
            models.Index(fields=['timestamp']),
        ]
    
    def __str__(self):
        return f"{self.event_type} at {self.timestamp}s in {self.video.name}"

class PromptSession(models.Model):
    """프롬프트 세션 - 사용자의 검색 세션"""
    session_id = models.AutoField(primary_key=True)
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='prompt_sessions')
    
    # 주요 이벤트 - 나중에 설정 가능하도록 null=True 추가
    main_event = models.ForeignKey(
        Event, 
        on_delete=models.CASCADE, 
        related_name='prompt_sessions', 
        db_column='event_id',
        null=True, 
        blank=True
    )
    
    # 세션 요약 정보 (성능 최적화용)
    first_prompt = models.TextField(blank=True)  # 첫 번째 프롬프트 (미리보기용)
    last_response = models.TextField(blank=True)  # 마지막 응답 (미리보기용)
    interaction_count = models.IntegerField(default=0)  # 대화 횟수
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-updated_at']  # 최근 업데이트 순
        indexes = [
            models.Index(fields=['video', '-updated_at']),  # 비디오별 최신 세션 조회
            models.Index(fields=['-created_at']),           # 전체 최신 세션 조회
        ]
        
    def get_session_number(self):  # ← 누락된 메서드 추가
        """해당 비디오에서 몇 번째 세션인지 계산"""
        earlier_sessions = PromptSession.objects.filter(
            video=self.video,
            created_at__lt=self.created_at
        ).count()
        return earlier_sessions + 1
        
    def __str__(self):
        # 동적으로 세션 번호 계산해서 표시
        session_number = self.get_session_number()
        return f"{self.video.name}의 {session_number}번째 세션"
    
    @property
    def display_title(self):
        """UI에서 표시할 제목"""
        session_number = self.get_session_number()
        return f"{self.video.name}의 {session_number}번째 채팅"  # "채팅팅" → "채팅" 수정
        
    @property
    def timeline_summary(self):
        """세션 카드에 표시할 타임라인 정보 (메인 이벤트 기반)"""
        if self.main_event:
            # 메인 이벤트의 timestamp를 MM:SS 형식으로 변환
            timestamp = self.main_event.timestamp
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_str = f"{minutes:02d}:{seconds:02d}"
            
            # 단일 시점 이벤트이므로 시작/끝 시간이 같음
            return f"1개 타임라인 ({time_str} ~ {time_str})"
        else:
            return "타임라인 없음"
    
    @property
    def main_event_display(self):
        """세션 카드에서 표시할 주요 이벤트 정보"""
        if self.main_event:
            return f"{self.main_event.event_type} ({self.main_event.timestamp}초)"
        return "이벤트 미지정"

class PromptInteraction(models.Model):
    """각 프롬프트 세션 내의 상호작용"""
    session = models.ForeignKey(PromptSession, on_delete=models.CASCADE, related_name='interactions')
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='prompt_interactions', db_column='video_id', null=True, blank=True)  # 임시로 nullable로 설정
    
    # 프롬프트 내용
    input_prompt = models.TextField()  # 사용자 입력 프롬프트
    output_response = models.TextField()  # 최종 응답 (VLM 분석 결과)
    
    # AI 처리 과정
    generated_sql = models.TextField(null=True, blank=True)  # Text2SQL로 생성된 SQL
    highlight_thumbnail_path = models.CharField(max_length=500, blank=True)  # 타임라인 하이라이트 썸네일
    thumbnail_extracted_at = models.DateTimeField(null=True, blank=True)     # 썸네일 추출 시간    

    # 처리 상태
    PROCESSING_STATUS = [
        ('pending', '대기중'),
        ('processing', '처리중'),
        ('completed', '완료'),
        ('failed', '실패'),
    ]

    processing_status = models.CharField(max_length=20, choices=PROCESSING_STATUS, default='pending')
    error_message = models.TextField(blank=True)  # 오류 발생 시 메시지

    # 검색 결과 관련 필드
    found_events_count = models.IntegerField(default=0)  # 찾은 이벤트 수
    timeline_points = models.JSONField(null=True, blank=True)  # 추출된 정확한 시간 지점들 [{"time": "10:30", "event_type": "person_detected"}, ...]
    
    # 메타데이터
    timestamp = models.DateTimeField(auto_now_add=True)  # 프롬프트 입력 시간
    processed_at = models.DateTimeField(null=True, blank=True)  # 처리 완료 시간
    
    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['session', 'timestamp']),  # 세션별 시간순 조회
            models.Index(fields=['video', 'timestamp']),    # 비디오별 시간순 조회
            models.Index(fields=['processing_status']),     # 처리 상태별 조회
        ]
    
    def __str__(self):
        return f"Interaction #{self.interaction_number} in Session #{self.session.session_id} at {self.timestamp}"
        
    def save(self, *args, **kwargs):
        # 데이터 일관성 보장: video 자동 설정
        if self.session and not self.video_id:
            self.video = self.session.video
    
    @property
    def interaction_number(self):
        """해당 세션에서 몇 번째 상호작용인지 계산"""
        earlier_interactions = PromptInteraction.objects.filter(
            session=self.session,
            timestamp__lt=self.timestamp
        ).count()
        return earlier_interactions + 1
    
    @property
    def is_first_in_session(self):
        """세션의 첫 번째 상호작용인지 확인"""
        return self.interaction_number == 1
    
    @property
    def timeline_display(self):
        """UI용 타임라인 표시"""
        if not self.timeline_points:
            return "타임라인 없음"
        
        count = len(self.timeline_points)
        if count == 1:
            point_info = self.timeline_points[0]
            return f"1개 타임라인 ({point_info['time']})"
        else:
            return f"{count}개 타임라인"
    
    @property
    def processing_time_display(self):
        """처리 시간을 사용자 친화적으로 표시"""
        if self.processed_at and self.timestamp:
            diff = (self.processed_at - self.timestamp).total_seconds()
            if diff < 1:
                return f"{int(diff * 1000)}ms"
            else:
                return f"{diff:.1f}초"
        return "측정 안됨"
    
    def save(self, *args, **kwargs):
        # 데이터 일관성 보장: video 자동 설정
        if self.session and not self.video_id:
            self.video = self.session.video
        
        # 첫 번째 저장인지 확인 (새로운 레코드)
        is_new = self.pk is None
        
        super().save(*args, **kwargs)
        
        # 세션 요약 정보 업데이트
        self._update_session_summary(is_new)
    
    def _update_session_summary(self, is_new_interaction):
        """세션 요약 정보 업데이트 (성능 최적화)"""
        session = self.session
        
        # 첫 번째 interaction인 경우
        if is_new_interaction:
            interactions_count = session.interactions.count()
            
            if interactions_count == 1:  # 진짜 첫 번째
                session.first_prompt = self.input_prompt
            
            # 항상 마지막 응답과 카운트 업데이트
            session.last_response = self.output_response
            session.interaction_count = interactions_count
            session.save(update_fields=['first_prompt', 'last_response', 'interaction_count'])
        else:
            # 기존 interaction 수정인 경우 마지막 응답만 업데이트 (마지막 것이라면)
            latest_interaction = session.interactions.order_by('-timestamp').first()
            if latest_interaction == self:
                session.last_response = self.output_response
                session.save(update_fields=['last_response'])
    
    def mark_completed(self, thumbnail_path="", vlm_summary=""):
        """처리 완료 표시"""
        self.highlight_thumbnail_path = thumbnail_path
        if vlm_summary:
            self.output_response = vlm_summary
        self.processing_status = 'completed'
        self.processed_at = timezone.now()
        self.save(update_fields=['highlight_thumbnail_path', 'output_response', 'processing_status', 'processed_at'])
    
    def mark_failed(self, error_message):
        """처리 실패 표시"""
        self.processing_status = 'failed'
        self.error_message = error_message
        self.processed_at = timezone.now()
        self.save(update_fields=['processing_status', 'error_message', 'processed_at'])
    
    def update_processing_status(self, status):
        """처리 상태 업데이트"""
        self.processing_status = status
        self.save(update_fields=['processing_status'])

'''
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


'''