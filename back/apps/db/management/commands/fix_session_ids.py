"""
세션 ID 수정 관리 명령어
기존 PromptSession 레코드 중 session_id가 없는 것들을 UUID로 채워줍니다.
"""
import uuid
from django.core.management.base import BaseCommand
from apps.db.models import PromptSession


class Command(BaseCommand):
    help = 'session_id가 없는 PromptSession 레코드들에 UUID를 할당합니다'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('🔍 session_id가 없는 세션들을 찾는 중...'))
        
        # session_id가 비어있는 세션들 찾기
        sessions_without_id = PromptSession.objects.filter(session_id='') | PromptSession.objects.filter(session_id__isnull=True)
        count = sessions_without_id.count()
        
        if count == 0:
            self.stdout.write(self.style.SUCCESS('✅ 모든 세션이 session_id를 가지고 있습니다.'))
            return
        
        self.stdout.write(self.style.WARNING(f'⚠️  {count}개의 세션에 session_id가 없습니다.'))
        self.stdout.write(self.style.WARNING('🔧 UUID를 할당하는 중...'))
        
        updated_count = 0
        for session in sessions_without_id:
            session.session_id = str(uuid.uuid4())
            session.save(update_fields=['session_id'])
            updated_count += 1
            
            if updated_count % 10 == 0:
                self.stdout.write(f'  {updated_count}/{count} 처리됨...')
        
        self.stdout.write(self.style.SUCCESS(f'✅ {updated_count}개의 세션 ID를 성공적으로 업데이트했습니다!'))
        
        # 검증
        remaining = PromptSession.objects.filter(session_id='').count()
        if remaining > 0:
            self.stdout.write(self.style.ERROR(f'❌ 여전히 {remaining}개의 세션에 session_id가 없습니다.'))
        else:
            self.stdout.write(self.style.SUCCESS('✅ 모든 세션이 이제 session_id를 가지고 있습니다!'))
