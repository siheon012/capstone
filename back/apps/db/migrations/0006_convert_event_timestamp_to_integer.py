# Generated by Django 5.2 on 2025-06-05 17:23

from django.db import migrations, models


def convert_timestamp_to_seconds(apps, schema_editor):
    """
    DateTimeField timestamp를 IntegerField로 변환
    기존 데이터가 있다면 각 비디오의 첫 번째 이벤트 시간을 기준점으로 하여 
    상대적인 초 단위 시간으로 변환
    """
    Event = apps.get_model('db', 'Event')
    Video = apps.get_model('db', 'Video')
    
    # 각 비디오별로 처리
    for video in Video.objects.all():
        events = Event.objects.filter(video=video).order_by('timestamp')
        
        if events.exists():
            # 첫 번째 이벤트 시간을 기준점으로 설정
            first_event_time = events.first().timestamp
            print(f"Video {video.name}: 첫 번째 이벤트 시간 {first_event_time}")
            
            # 각 이벤트를 상대 시간(초)으로 변환
            for i, event in enumerate(events):
                if hasattr(event.timestamp, 'timestamp'):
                    # datetime 객체인 경우
                    relative_seconds = int((event.timestamp - first_event_time).total_seconds())
                else:
                    # 이미 숫자인 경우 (혹시 모를 경우를 대비)
                    relative_seconds = i * 10  # 임시로 10초 간격으로 설정
                
                # 음수 방지
                relative_seconds = max(0, relative_seconds)
                
                # SQL로 직접 업데이트 (모델 제약 우회)
                schema_editor.execute(
                    "UPDATE db_event SET timestamp = %s WHERE id = %s",
                    [relative_seconds, event.id]
                )
                print(f"Event {event.id}: {relative_seconds}초로 변환")


def reverse_conversion(apps, schema_editor):
    """
    역변환은 정확한 복원이 어려우므로 경고만 출력
    """
    print("경고: timestamp 역변환은 정확한 데이터 복원이 어렵습니다.")
    print("필요시 데이터베이스 백업에서 복원하세요.")


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0005_add_time_in_video_field'),
    ]

    operations = [
        # 1단계: 임시 컬럼 추가
        migrations.AddField(
            model_name='event',
            name='timestamp_temp',
            field=models.IntegerField(null=True),
        ),
        
        # 2단계: 데이터 변환
        migrations.RunPython(
            convert_timestamp_to_seconds,
            reverse_conversion,
        ),
        
        # 3단계: 기존 컬럼 삭제
        migrations.RemoveField(
            model_name='event',
            name='timestamp',
        ),
        
        # 4단계: 임시 컬럼을 원래 이름으로 변경
        migrations.RenameField(
            model_name='event',
            old_name='timestamp_temp',
            new_name='timestamp',
        ),
    ]
