# Generated migration for PromptSession and PromptInteraction N:N to 1:N conversion
from django.db import migrations, models
import django.db.models.deletion


def check_and_add_video_field(apps, schema_editor):
    """video 필드가 없으면 추가"""
    from django.db import connection
    
    with connection.cursor() as cursor:
        # PromptSession에 video_id 컬럼 체크
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='db_promptsession' AND column_name='video_id';
        """)
        session_has_video = cursor.fetchone() is not None
        
        # PromptInteraction에 video_id 컬럼 체크
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='db_promptinteraction' AND column_name='video_id';
        """)
        interaction_has_video = cursor.fetchone() is not None
        
        print(f"🔍 DB 상태: PromptSession video_id={'존재' if session_has_video else '없음'}, PromptInteraction video_id={'존재' if interaction_has_video else '없음'}")
        
        return session_has_video, interaction_has_video


def migrate_manytomany_to_foreignkey(apps, schema_editor):
    """
    related_videos ManyToMany 데이터를 video ForeignKey로 복사
    through 테이블이 없으면 skip (이미 제거된 경우)
    """
    from django.db import connection
    
    # through 테이블 존재 확인
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name='db_promptsession_related_videos';
        """)
        session_through_exists = cursor.fetchone() is not None
        
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name='db_promptinteraction_related_videos';
        """)
        interaction_through_exists = cursor.fetchone() is not None
        
        print(f"🔍 Through 테이블 상태: Session={'존재' if session_through_exists else '없음'}, Interaction={'존재' if interaction_through_exists else '없음'}")
        
        if not session_through_exists:
            print("⚠️ ManyToMany through 테이블이 없음 - 데이터 마이그레이션 skip")
            print("   (이미 ForeignKey로 전환되었거나 데이터가 없음)")
            return
    
    PromptSession = apps.get_model('db', 'PromptSession')
    PromptInteraction = apps.get_model('db', 'PromptInteraction')
    
    print("🔄 ManyToMany → ForeignKey 데이터 마이그레이션 시작")
    
    # PromptSession 마이그레이션
    orphan_sessions = 0
    migrated_sessions = 0
    for session in PromptSession.objects.all():
        try:
            first_video = session.related_videos.first()
            if first_video:
                session.video = first_video
                session.save()
                migrated_sessions += 1
                print(f"✅ Session {session.session_id} -> Video {first_video.video_id}")
            else:
                print(f"🗑️ Deleting orphan session {session.session_id}")
                session.delete()
                orphan_sessions += 1
        except Exception as e:
            print(f"⚠️ Session {session.session_id} 마이그레이션 실패: {e}")
            continue
    
    print(f"📊 PromptSession: {migrated_sessions}개 마이그레이션, {orphan_sessions}개 삭제")
    
    # PromptInteraction 마이그레이션
    orphan_interactions = 0
    migrated_interactions = 0
    for interaction in PromptInteraction.objects.all():
        try:
            first_video = interaction.related_videos.first()
            if first_video:
                interaction.video = first_video
                interaction.save()
                migrated_interactions += 1
                print(f"✅ Interaction {interaction.interaction_id} -> Video {first_video.video_id}")
            else:
                print(f"🗑️ Deleting orphan interaction {interaction.interaction_id}")
                interaction.delete()
                orphan_interactions += 1
        except Exception as e:
            print(f"⚠️ Interaction {interaction.interaction_id} 마이그레이션 실패: {e}")
            continue
    
    print(f"📊 PromptInteraction: {migrated_interactions}개 마이그레이션, {orphan_interactions}개 삭제")



class Migration(migrations.Migration):

    dependencies = [
        ('db', '0005_alter_promptsession_related_videos'),
    ]
    
    atomic = False

    operations = [
        # Step 0: video 필드가 없을 때만 추가 (이미 있으면 skip)
        migrations.RunSQL(
            sql=[
                # PromptSession에 video_id가 없으면 추가
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='db_promptsession' AND column_name='video_id'
                    ) THEN
                        ALTER TABLE db_promptsession 
                        ADD COLUMN video_id INTEGER NULL 
                        REFERENCES db_video(video_id) ON DELETE CASCADE;
                        
                        CREATE INDEX IF NOT EXISTS db_promptsession_video_id_idx 
                        ON db_promptsession(video_id);
                        
                        RAISE NOTICE 'PromptSession video_id 컬럼 추가됨';
                    ELSE
                        RAISE NOTICE 'PromptSession video_id 컬럼 이미 존재';
                    END IF;
                END $$;
                """,
                # PromptInteraction에 video_id가 없으면 추가
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='db_promptinteraction' AND column_name='video_id'
                    ) THEN
                        ALTER TABLE db_promptinteraction 
                        ADD COLUMN video_id INTEGER NULL 
                        REFERENCES db_video(video_id) ON DELETE CASCADE;
                        
                        CREATE INDEX IF NOT EXISTS db_promptinteraction_video_id_idx 
                        ON db_promptinteraction(video_id);
                        
                        RAISE NOTICE 'PromptInteraction video_id 컬럼 추가됨';
                    ELSE
                        RAISE NOTICE 'PromptInteraction video_id 컬럼 이미 존재';
                    END IF;
                END $$;
                """,
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
        
        # Step 1: 데이터 마이그레이션 (related_videos → video)
        migrations.RunPython(
            code=migrate_manytomany_to_foreignkey,
            reverse_code=migrations.RunPython.noop,
        ),
        
        # Step 2: 'video_id'를 'related_videos_id'로 rename (RemoveField 전에 실행)
        migrations.RunSQL(
            sql=[
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='db_promptsession' AND column_name='video_id'
                    ) THEN
                        ALTER TABLE db_promptsession RENAME COLUMN video_id TO related_videos_id;
                        RAISE NOTICE 'PromptSession video_id → related_videos_id 변경됨';
                    ELSE
                        RAISE NOTICE 'PromptSession video_id 컬럼 없음 (이미 변경됨)';
                    END IF;
                END $$;
                """,
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='db_promptinteraction' AND column_name='video_id'
                    ) THEN
                        ALTER TABLE db_promptinteraction RENAME COLUMN video_id TO related_videos_id;
                        RAISE NOTICE 'PromptInteraction video_id → related_videos_id 변경됨';
                    ELSE
                        RAISE NOTICE 'PromptInteraction video_id 컬럼 없음 (이미 변경됨)';
                    END IF;
                END $$;
                """,
            ],
            reverse_sql=[
                'ALTER TABLE db_promptsession RENAME COLUMN related_videos_id TO video_id;',
                'ALTER TABLE db_promptinteraction RENAME COLUMN related_videos_id TO video_id;',
            ],
        ),
        
        # Step 3: 기존 ManyToMany 필드 제거 (있으면)
        migrations.RunSQL(
            sql=[
                'DROP TABLE IF EXISTS db_promptsession_related_videos CASCADE;',
                'DROP TABLE IF EXISTS db_promptinteraction_related_videos CASCADE;',
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
