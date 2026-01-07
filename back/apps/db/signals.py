"""
Django signals for Event and Video models
- Video 분석 완료 시 자동 embedding 생성 (Video Analysis 데이터용)
- Event 생성/수정 시 자동 embedding 생성 (Django ORM 사용 시)
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Event, Video
import logging

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Event)
def generate_event_embedding(sender, instance, **kwargs):
    """
    Event 저장 전 embedding 자동 생성 (Django ORM 사용 시만 작동)
    
    주의: 
    - Video Analysis는 직접 SQL INSERT를 사용하므로 이 signal이 발동하지 않습니다.
    - Video Analysis 데이터는 Video post_save signal에서 일괄 처리합니다.
    - pre_save이므로 무한루프 위험 없음 (save() 호출 전에 embedding 세팅)
    """
    # embedding이 이미 있으면 스킵 (중복 생성 방지)
    if instance.embedding:
        return
    
    # searchable_text가 없으면 스킵
    if not instance.searchable_text:
        return
    
    try:
        # Bedrock 서비스로 embedding 생성
        from apps.api.bedrock_service import get_bedrock_service
        
        bedrock = get_bedrock_service()
        embedding = bedrock.generate_embedding(instance.searchable_text)
        
        if embedding:
            instance.embedding = embedding
            logger.info(f"✅ Event {instance.id} embedding 생성 완료")
        else:
            logger.warning(f"⚠️ Event {instance.id} embedding 생성 실패")
            
    except Exception as e:
        logger.error(f"❌ Event {instance.id} embedding 생성 중 오류: {str(e)}")
        # 에러가 나도 저장은 계속 진행
        pass


@receiver(post_save, sender=Video)
def generate_embeddings_on_video_completed(sender, instance, **kwargs):
    """
    Video 분석 완료 시 모든 이벤트의 embedding 자동 생성
    
    Video Analysis가 직접 SQL INSERT로 이벤트를 저장하면 Event signal이 발동하지 않으므로,
    Video의 analysis_status가 'completed'로 변경될 때 일괄 처리합니다.
    """
    # analysis_status가 'completed'로 변경되었는지 확인
    if instance.analysis_status != 'completed':
        return
    
    # 이미 처리된 경우 스킵 (무한 루프 방지)
    if hasattr(instance, '_embeddings_generated'):
        return
    
    try:
        # 이 비디오의 embedding이 없는 이벤트 찾기
        events_without_embedding = Event.objects.filter(
            video=instance,
            embedding__isnull=True,
            searchable_text__isnull=False
        ).exclude(searchable_text='')
        
        count = events_without_embedding.count()
        
        if count == 0:
            logger.info(f"Video {instance.video_id}: embedding 생성할 이벤트 없음")
            return
        
        logger.info(f"🧠 Video {instance.video_id}: {count}개 이벤트의 embedding 생성 시작...")
        
        # Bedrock 서비스 초기화
        from apps.api.bedrock_service import get_bedrock_service
        import time
        
        bedrock = get_bedrock_service()
        
        success_count = 0
        fail_count = 0
        
        for event in events_without_embedding[:100]:  # 한 번에 최대 100개
            try:
                embedding = bedrock.generate_embedding(event.searchable_text)
                
                if embedding:
                    # 직접 UPDATE (signal 재발동 방지)
                    Event.objects.filter(pk=event.pk).update(embedding=embedding)
                    success_count += 1
                else:
                    fail_count += 1
                
                # API Rate limit 방지
                time.sleep(0.1)
                
            except Exception as e:
                fail_count += 1
                logger.error(f"Event {event.id} embedding 생성 실패: {str(e)}")
        
        logger.info(f"✅ Video {instance.video_id} embedding 생성 완료: 성공 {success_count}, 실패 {fail_count}")
        
        # 무한 루프 방지 플래그
        instance._embeddings_generated = True
        
    except Exception as e:
        logger.error(f"❌ Video {instance.video_id} embedding 일괄 생성 실패: {str(e)}")
        import traceback
        traceback.print_exc()
