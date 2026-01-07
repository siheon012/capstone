# Generated migration for Titan Embed v2 upgrade

from django.db import migrations
import pgvector.django.vector


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0007_session_video_1n_relationship'),
    ]

    operations = [
        # Event 모델 embedding 차원 변경: 1536 → 1024
        migrations.AlterField(
            model_name='event',
            name='embedding',
            field=pgvector.django.vector.VectorField(
                blank=True, 
                dimensions=1024,  # Titan v2
                null=True
            ),
        ),
        
        # PromptSession 모델 context_embedding 차원 변경
        migrations.AlterField(
            model_name='promptsession',
            name='context_embedding',
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                null=True
            ),
        ),
        
        # VideoAnalysis 모델 embedding 차원 변경
        migrations.AlterField(
            model_name='videoanalysis',
            name='embedding',
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                null=True
            ),
        ),
        
        # 기존 1536차원 embedding 데이터 삭제 (재생성 필요)
        migrations.RunSQL(
            sql="""
                UPDATE db_event SET embedding = NULL WHERE embedding IS NOT NULL;
                UPDATE db_promptsession SET context_embedding = NULL WHERE context