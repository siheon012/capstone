# Generated by Django 5.2 on 2025-06-07 10:47

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0010_rename_last_response_promptsession_first_response'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='promptsession',
            options={'ordering': ['created_at']},
        ),
        migrations.RemoveIndex(
            model_name='promptsession',
            name='db_promptse_video_i_2451f8_idx',
        ),
        migrations.RemoveIndex(
            model_name='promptsession',
            name='db_promptse_created_965c2e_idx',
        ),
        migrations.AddIndex(
            model_name='promptsession',
            index=models.Index(fields=['video', 'created_at'], name='db_promptse_video_i_3db6c6_idx'),
        ),
        migrations.AddIndex(
            model_name='promptsession',
            index=models.Index(fields=['created_at'], name='db_promptse_created_15a479_idx'),
        ),
    ]
