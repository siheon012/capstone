# Generated by Django 5.2 on 2025-05-28 07:09

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField()),
                ('obj_id', models.IntegerField()),
                ('age', models.FloatField()),
                ('gender', models.CharField(max_length=10)),
                ('gender_score', models.FloatField()),
                ('location', models.CharField(max_length=255)),
                ('area_of_interest', models.IntegerField()),
                ('action_detected', models.CharField(max_length=255)),
                ('event_type', models.CharField(max_length=255)),
            ],
        ),
        migrations.CreateModel(
            name='Video',
            fields=[
                ('video_id', models.AutoField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('upload_time', models.DateTimeField(auto_now_add=True)),
                ('duration', models.FloatField()),
                ('file_path', models.CharField(max_length=500)),
            ],
        ),
        migrations.CreateModel(
            name='PromptHistory',
            fields=[
                ('session_id', models.AutoField(primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('main_event', models.ForeignKey(db_column='event_id', on_delete=django.db.models.deletion.CASCADE, related_name='prompt_histories', to='db.event')),
                ('video', models.ForeignKey(db_column='video_id', on_delete=django.db.models.deletion.CASCADE, related_name='prompt_histories', to='db.video')),
            ],
        ),
        migrations.CreateModel(
            name='PromptInteraction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('input_prompt', models.TextField()),
                ('output_response', models.TextField()),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='prompt_interactions', to='db.event')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='interactions', to='db.prompthistory')),
            ],
            options={
                'ordering': ['timestamp'],
            },
        ),
        migrations.CreateModel(
            name='Timeline',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_time', models.DateTimeField()),
                ('end_time', models.DateTimeField()),
                ('action_sequence', models.TextField()),
                ('event', models.ForeignKey(db_column='event_id', on_delete=django.db.models.deletion.CASCADE, related_name='timelines', to='db.event')),
                ('video', models.ForeignKey(db_column='video_id', on_delete=django.db.models.deletion.CASCADE, related_name='timelines', to='db.video')),
            ],
        ),
        migrations.AddField(
            model_name='event',
            name='video',
            field=models.ForeignKey(db_column='video_id', on_delete=django.db.models.deletion.CASCADE, related_name='events', to='db.video'),
        ),
    ]
