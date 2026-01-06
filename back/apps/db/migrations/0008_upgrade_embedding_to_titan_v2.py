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
        
        # Session 모델 context_embedding 차원 변경
        migrations.AlterField(
            model_name='session',
            name='context_embedding',
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                null=True
            ),
        ),
        
        # SearchQuery 모델 query_embedding 차원 변경
        migrations.AlterField(
            model_name='searchquery',
            name='query_embedding',
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                null=True
            ),
        ),
        
        # SearchQuery 모델 response_embedding 차원 변경
        migrations.AlterField(
            model_name='searchquery',
            name='response_embedding',
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
                UPDATE db_session SET context_embedding = NULL WHERE context_embedding IS NOT NULL;
                UPDATE db_searchquery SET query_embedding = NULL WHERE query_embedding IS NOT NULL;
                UPDATE db_searchquery SET response_embedding = NULL WHERE response_embedding IS NOT NULL;
                UPDATE db_videoanalysis SET embedding = NULL WHERE embedding IS NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
