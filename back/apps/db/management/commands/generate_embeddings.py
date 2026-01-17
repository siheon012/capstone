"""
기존 Event들의 embedding을 일괄 생성하는 Django management command

사용법:
    python manage.py generate_embeddings
    python manage.py generate_embeddings --video-id 103
    python manage.py generate_embeddings --limit 100
"""

from django.core.management.base import BaseCommand
from apps.db.models import Event
from apps.api.services import get_bedrock_service
import time


class Command(BaseCommand):
    help = "Generate embeddings for existing events"

    def add_arguments(self, parser):
        parser.add_argument("--video-id", type=int, help="특정 비디오의 이벤트만 처리")
        parser.add_argument(
            "--limit", type=int, default=None, help="처리할 최대 이벤트 수"
        )
        parser.add_argument(
            "--force", action="store_true", help="이미 embedding이 있는 이벤트도 재생성"
        )

    def handle(self, *args, **options):
        video_id = options.get("video_id")
        limit = options.get("limit")
        force = options.get("force")

        # 처리할 이벤트 쿼리
        queryset = Event.objects.all()

        if video_id:
            queryset = queryset.filter(video_id=video_id)
            self.stdout.write(f"🎯 Video ID {video_id}의 이벤트만 처리")

        if not force:
            queryset = queryset.filter(embedding__isnull=True)
            self.stdout.write("📌 embedding이 없는 이벤트만 처리")
        else:
            self.stdout.write("⚠️ 모든 이벤트의 embedding 재생성")

        # searchable_text가 있는 것만
        queryset = queryset.exclude(searchable_text="")

        if limit:
            queryset = queryset[:limit]
            self.stdout.write(f"📊 최대 {limit}개 처리")

        total = queryset.count()
        self.stdout.write(self.style.SUCCESS(f"\n🚀 총 {total}개 이벤트 처리 시작\n"))

        if total == 0:
            self.stdout.write(self.style.WARNING("처리할 이벤트가 없습니다."))
            return

        # Bedrock 서비스 초기화
        bedrock = get_bedrock_service()

        # 진행 상황
        success = 0
        failed = 0
        skipped = 0

        for idx, event in enumerate(queryset, 1):
            try:
                # 진행률 표시
                if idx % 10 == 0 or idx == 1:
                    self.stdout.write(f"진행: {idx}/{total} ({idx*100//total}%)")

                # searchable_text 확인
                if not event.searchable_text:
                    skipped += 1
                    continue

                # Embedding 생성
                embedding = bedrock.generate_embedding(event.searchable_text)

                if embedding:
                    event.embedding = embedding
                    event.save(update_fields=["embedding"])
                    success += 1

                    if idx % 10 == 0:
                        self.stdout.write(
                            self.style.SUCCESS(f"  ✅ Event {event.id} 완료")
                        )
                else:
                    failed += 1
                    self.stdout.write(self.style.ERROR(f"  ❌ Event {event.id} 실패"))

                # API 호출 제한 방지 (1초에 10개)
                if idx % 10 == 0:
                    time.sleep(1)

            except Exception as e:
                failed += 1
                self.stdout.write(
                    self.style.ERROR(f"  ❌ Event {event.id} 오류: {str(e)}")
                )

        # 최종 결과
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.SUCCESS(f"✅ 성공: {success}개"))
        if failed > 0:
            self.stdout.write(self.style.ERROR(f"❌ 실패: {failed}개"))
        if skipped > 0:
            self.stdout.write(self.style.WARNING(f"⏭️  스킵: {skipped}개"))
        self.stdout.write("=" * 50 + "\n")

        self.stdout.write(self.style.SUCCESS(f"\n🎉 Embedding 생성 완료!\n"))
