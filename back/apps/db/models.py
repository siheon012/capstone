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
    time_in_video = models.DateTimeField(null=True, blank=True)  # 동영상 촬영 시점 (년월일시분)
    thumbnail_path = models.CharField(max_length=500, null= False, blank=False)
    chat_count = models.IntegerField(default=0)
    major_event = models.CharField(max_length=100, null=True, blank=True)
    video_file = models.CharField(max_length=500, null=True, blank=True)  # 비디오 파일 경로 저장
    
    @property
    def file_path(self):
        """비디오 파일의 웹 접근 경로를 동적으로 생성"""
        if self.video_file:
            return self.video_file
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
    
    def delete(self, *args, **kwargs):
        """비디오 삭제 시 연관된 파일들과 모든 관련 데이터들도 함께 삭제"""
        from django.conf import settings
        
        # 삭제될 데이터 수 카운트 (로깅용)
        session_count = self.prompt_sessions.count()
        total_interactions = sum(session.interactions.count() for session in self.prompt_sessions.all())
        event_count = self.events.count()
        depth_data_count = self.spatial_data.count()  # DepthData 수
        display_data_count = self.display_data.count()  # DisplayData 수
        
        print(f"비디오 삭제 시작: {self.name}")
        print(f"삭제될 세션 수: {session_count}개")
        print(f"삭제될 총 프롬프트 수: {total_interactions}개")
        print(f"삭제될 이벤트 수: {event_count}개")
        print(f"삭제될 공간 정보 데이터 수: {depth_data_count}개")
        print(f"삭제될 진열대 정보 데이터 수: {display_data_count}개")
        
        # 1. 비디오 파일 삭제
        if self.video_file and os.path.exists(self.video_file):
            try:
                os.remove(self.video_file)
                print(f"비디오 파일 삭제됨: {self.video_file}")
            except OSError as e:
                print(f"비디오 파일 삭제 실패: {e}")
        
        # 2. 썸네일 파일 삭제
        # thumbnail_path 필드가 있으면 해당 파일 삭제
        if self.thumbnail_path and os.path.exists(self.thumbnail_path):
            try:
                os.remove(self.thumbnail_path)
                print(f"썸네일 파일 삭제됨: {self.thumbnail_path}")
            except OSError as e:
                print(f"썸네일 파일 삭제 실패: {e}")
        
        # 기본 썸네일 PNG 파일도 삭제 (파일명 기반)
        name_without_ext = os.path.splitext(self.name)[0]
        thumbnail_file_path = os.path.join(settings.THUMBNAIL_DIR, f"{name_without_ext}.png")
        if os.path.exists(thumbnail_file_path):
            try:
                os.remove(thumbnail_file_path)
                print(f"기본 썸네일 파일 삭제됨: {thumbnail_file_path}")
            except OSError as e:
                print(f"기본 썸네일 파일 삭제 실패: {e}")
        
        # 4. 세션별 하이라이트 썸네일 파일들 정리 (필요시)
        if session_count > 0:
            for session in self.prompt_sessions.all():
                for interaction in session.interactions.all():
                    if interaction.highlight_thumbnail_path:
                        print(f"프롬프트 하이라이트 썸네일: {interaction.highlight_thumbnail_path}")
        
        # 5. 데이터베이스에서 비디오 레코드 삭제 (CASCADE로 모든 연관 데이터들이 함께 삭제됨)
        super().delete(*args, **kwargs)
        
        print(f"비디오 삭제 완료: {self.name}")
        print(f"└─ 총 {session_count}개 세션, {total_interactions}개 프롬프트 삭제")
        print(f"└─ 총 {event_count}개 이벤트 삭제")
        print(f"└─ 총 {depth_data_count}개 공간 정보, {display_data_count}개 진열대 정보 삭제")
    
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
    timestamp = models.IntegerField()  # 영상 시작점부터 몇 초에 이벤트 발생했는지 (초 단위)
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
        """사용자 친화적 시간 표시 (MM:SS 형식)"""
        minutes = int(self.timestamp // 60)
        seconds = int(self.timestamp % 60)
        return f"{minutes:02d}:{seconds:02d}"
    
    @property
    def absolute_time(self):
        """이벤트가 발생한 절대 시간 계산"""
        if self.video.time_in_video:
            from datetime import timedelta
            return self.video.time_in_video + timedelta(seconds=self.timestamp)
        return None
    
    @property
    def absolute_time_display(self):
        """절대 시간을 사용자 친화적으로 표시"""
        abs_time = self.absolute_time
        if abs_time:
            return abs_time.strftime("%Y-%m-%d %H:%M:%S")
        return "시간 정보 없음"
    
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
    
    def delete(self, *args, **kwargs):
        """세션 삭제 시 관련 정보 정리 및 로깅"""
        # 삭제될 상호작용 수 카운트 (로깅용)
        interaction_count = self.interactions.count()
        session_info = f"Session #{self.session_id} ({self.video.name})"
        
        print(f"세션 삭제 시작: {session_info}")
        print(f"삭제될 상호작용 수: {interaction_count}개")
        
        # Django의 CASCADE로 자동 삭제되지만, 명시적으로 정리 작업 수행
        if interaction_count > 0:
            # 각 상호작용의 썸네일 파일들 정리 (필요시)
            for interaction in self.interactions.all():
                if interaction.highlight_thumbnail_path:
                    # 썸네일 파일이 있다면 정리 로직 추가 가능
                    print(f"상호작용 #{interaction.id}의 썸네일: {interaction.highlight_thumbnail_path}")
        
        # 데이터베이스에서 세션 삭제 (CASCADE로 상호작용들도 함께 삭제됨)
        super().delete(*args, **kwargs)
        print(f"세션 삭제 완료: {session_info} (총 {interaction_count}개 상호작용 함께 삭제됨)")

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

class DepthData(models.Model):
    """동영상의 공간 구조 정보를 저장하는 모델"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='spatial_data')
    
    # 프레임 정보
    frame_name = models.CharField(max_length=255)  # 예: "20250526_182739_3fps_frame78.jpg"
    frame_width = models.IntegerField()  # 프레임 너비
    frame_height = models.IntegerField()  # 프레임 높이
    
    # 마스크 정보
    mask_id = models.IntegerField()  # 해당 프레임 내에서의 마스크 ID
    bbox_x1 = models.IntegerField()  # 바운딩 박스 좌상단 x
    bbox_y1 = models.IntegerField()  # 바운딩 박스 좌상단 y
    bbox_x2 = models.IntegerField()  # 바운딩 박스 우하단 x
    bbox_y2 = models.IntegerField()  # 바운딩 박스 우하단 y
    area = models.IntegerField()     # 픽셀 면적
    
    # 깊이 정보
    avg_depth = models.FloatField()  # 평균 깊이
    min_depth = models.FloatField()  # 최소 깊이
    max_depth = models.FloatField()  # 최대 깊이
    
    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['video', 'frame_name', 'mask_id']
        indexes = [
            models.Index(fields=['video', 'frame_name']),  # 비디오별 프레임 조회
            models.Index(fields=['frame_name']),           # 프레임명으로 조회
            models.Index(fields=['video', 'mask_id']),     # 비디오별 마스크 조회
        ]
        # 같은 프레임에서 같은 mask_id 중복 방지
        unique_together = ['frame_name', 'mask_id']
    
    @property
    def bbox_array(self):
        """바운딩 박스를 [x1, y1, x2, y2] 배열로 반환"""
        return [self.bbox_x1, self.bbox_y1, self.bbox_x2, self.bbox_y2]
    
    @property
    def bbox_width(self):
        """바운딩 박스 너비"""
        return self.bbox_x2 - self.bbox_x1
    
    @property
    def bbox_height(self):
        """바운딩 박스 높이"""
        return self.bbox_y2 - self.bbox_y1
    
    @property
    def depth_range(self):
        """깊이 범위"""
        return self.max_depth - self.min_depth
    
    @property
    def frame_timestamp(self):
        """프레임명에서 타임스탬프 추출 (frame78 -> 78)"""
        try:
            # "20250526_182739_3fps_frame78.jpg" -> 78
            import re
            match = re.search(r'frame(\d+)', self.frame_name)
            return int(match.group(1)) if match else None
        except:
            return None
    
    def __str__(self):
        return f"SpatialData: {self.frame_name} mask#{self.mask_id} in {self.video.name}"

class DisplayData(models.Model):
    """진열대 마스크 정보를 저장하는 모델"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='display_data')
    
    # 이미지 메타 정보
    image_index = models.IntegerField()  # 이미지 인덱스
    image_name = models.CharField(max_length=255)  # 예: "test1.png"
    timestamp = models.DateTimeField()  # 2025-06-05 01:00:55.590351
    
    # 좌표 변환 정보
    original_width = models.IntegerField()  # 원본 이미지 너비
    original_height = models.IntegerField()  # 원본 이미지 높이
    new_width = models.IntegerField()  # 변환된 이미지 너비
    new_height = models.IntegerField()  # 변환된 이미지 높이
    width_ratio = models.FloatField()  # 너비 변환 비율
    height_ratio = models.FloatField()  # 높이 변환 비율
    
    # 마스크 정보
    mask_key = models.IntegerField()  # 마스크 키
    avg_depth = models.FloatField()  # 평균 깊이
    description = models.CharField(max_length=255)  # 예: "Farthest display", "Left side display"
    
    # 바운딩 박스 정보 (변환된 좌표)
    min_x = models.IntegerField()
    max_x = models.IntegerField()
    min_y = models.IntegerField()
    max_y = models.IntegerField()
    width = models.IntegerField()   # 너비
    height = models.IntegerField()  # 높이
    
    # 메타데이터
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['video', 'timestamp', 'image_index', 'mask_key']
        indexes = [
            models.Index(fields=['video', 'timestamp']),    # 비디오별 시간순 조회
            models.Index(fields=['image_index']),           # 이미지 인덱스로 조회
            models.Index(fields=['avg_depth']),             # 깊이별 조회
            models.Index(fields=['description']),           # 설명별 조회
        ]
        # 같은 이미지에서 같은 mask_key 중복 방지
        unique_together = ['video', 'image_index', 'mask_key']
    
    @property
    def bbox_array(self):
        """바운딩 박스를 [min_x, min_y, max_x, max_y] 배열로 반환"""
        return [self.min_x, self.min_y, self.max_x, self.max_y]
    
    @property
    def center_x(self):
        """마스크 중심점 X 좌표"""
        return (self.min_x + self.max_x) // 2
    
    @property
    def center_y(self):
        """마스크 중심점 Y 좌표"""
        return (self.min_y + self.max_y) // 2
    
    @property
    def area(self):
        """마스크 면적"""
        return self.width * self.height
    
    def __str__(self):
        return f"Display Mask {self.mask_key}: {self.description} in {self.video.name} (depth:{self.avg_depth})"