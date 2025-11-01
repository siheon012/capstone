# 프레임 이미지 저장 아키텍처

## 최종 결정: Container에서 직접 S3 저장 ✅

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                         영상 분석 파이프라인                          │
└─────────────────────────────────────────────────────────────────────┘

1️⃣ 사용자 업로드
   Django Upload API
        ↓
   S3 raw-videos bucket
   (capstone-dev-raw/videos/xxx.mp4)
        ↓
   S3 Event → SQS → Lambda → Batch Job 시작

2️⃣ 영상 분석 (Batch Container / FastAPI)
   ┌──────────────────────────────────────┐
   │  AWS Batch / FastAPI Container       │
   │                                      │
   │  ① 영상 다운로드 (S3 raw-videos)     │
   │  ② AI 분석 (VLM, 장면 인식)          │
   │  ③ 타임라인 추출 (이벤트 분리)        │
   │  ④ 핵심 프레임 추출 (OpenCV)         │
   │  ⑤ 프레임 이미지 → S3 thumbnails 저장 │  ← 여기서 직접 저장!
   │  ⑥ 메타데이터 → PostgreSQL 저장      │
   └──────────────────────────────────────┘
        ↓ (⑤)
   S3 thumbnails bucket
   (capstone-dev-thumbnails/events/{event_id}/frame_{timestamp}.jpg)
        ↓ (⑥)
   PostgreSQL + pgvector
   (Event 테이블: s3_thumbnail_key, timestamp, description)

3️⃣ 프론트엔드 표시
   Django API 조회
        ↓
   Event 메타데이터 + S3 presigned URL
        ↓
   Next.js Frontend 렌더링
```

## S3 버킷 구조

### 1. raw-videos (입력 - 원본 영상)

```
capstone-dev-raw/
  └── videos/
      ├── session_123/
      │   └── video_456.mp4          (원본 영상)
      └── session_789/
          └── video_101.mp4
```

### 2. thumbnails (출력 - 프레임 이미지) ✨ 신규

```
capstone-dev-thumbnails/
  └── events/
      ├── event_001/
      │   ├── frame_00001.jpg        (이벤트 대표 이미지)
      │   ├── frame_00045.jpg        (핵심 장면들)
      │   └── frame_00123.jpg
      ├── event_002/
      │   └── frame_00234.jpg
      └── sessions/
          └── session_123/
              └── timeline_overview.jpg  (타임라인 전체 미리보기)
```

### 3. video_storage ❌ 삭제 예정

- raw-videos로 통합

## 데이터베이스 스키마 (Event 테이블 확장)

```python
class Event(models.Model):
    # 기존 필드
    video = models.ForeignKey(Video, on_delete=models.CASCADE)
    start_time = models.FloatField()
    end_time = models.FloatField()
    event_type = models.CharField(max_length=50)
    description = models.TextField()

    # 신규 필드 - 썸네일 관련
    s3_thumbnail_key = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="S3 key for event thumbnail image"
    )
    thumbnail_timestamp = models.FloatField(
        null=True,
        help_text="Video timestamp of the thumbnail frame"
    )
    has_thumbnail = models.BooleanField(default=False)

    @property
    def thumbnail_url(self):
        """S3 presigned URL 생성"""
        if not self.s3_thumbnail_key:
            return None
        return generate_presigned_url(
            bucket='capstone-dev-thumbnails',
            key=self.s3_thumbnail_key,
            expiration=3600  # 1시간
        )
```

## FastAPI 영상 분석 API 구현 예시

```python
# fastapi/video_analysis.py

import boto3
import cv2
from typing import List
from datetime import datetime

s3_client = boto3.client('s3')

async def analyze_video_and_save_frames(
    video_id: int,
    s3_bucket_raw: str,
    s3_key_raw: str,
    s3_bucket_thumbnails: str = "capstone-dev-thumbnails"
):
    """
    영상 분석 및 프레임 이미지 S3 저장

    Args:
        video_id: Video 테이블 ID
        s3_bucket_raw: 원본 영상이 있는 버킷
        s3_key_raw: 원본 영상의 S3 key
        s3_bucket_thumbnails: 썸네일 저장 버킷

    Returns:
        분석 결과 (events, frame_urls)
    """

    # 1. S3에서 영상 다운로드
    video_path = f"/tmp/{video_id}.mp4"
    s3_client.download_file(s3_bucket_raw, s3_key_raw, video_path)

    # 2. OpenCV로 영상 열기
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)

    # 3. AI 분석으로 이벤트 추출
    events = await analyze_video_with_bedrock(video_path)

    # 4. 각 이벤트의 핵심 프레임 추출 및 S3 저장
    for event in events:
        # 이벤트 중간 시점의 프레임 추출
        timestamp = (event['start_time'] + event['end_time']) / 2
        frame_number = int(timestamp * fps)

        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()

        if ret:
            # 프레임을 JPEG로 인코딩
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

            # S3 key 생성
            s3_key = f"events/event_{event['id']}/frame_{int(timestamp*1000)}.jpg"

            # S3에 직접 업로드 ✨
            s3_client.put_object(
                Bucket=s3_bucket_thumbnails,
                Key=s3_key,
                Body=buffer.tobytes(),
                ContentType='image/jpeg',
                Metadata={
                    'video_id': str(video_id),
                    'event_id': str(event['id']),
                    'timestamp': str(timestamp)
                }
            )

            # 이벤트에 썸네일 정보 추가
            event['s3_thumbnail_key'] = s3_key
            event['thumbnail_timestamp'] = timestamp
            event['has_thumbnail'] = True

    cap.release()

    # 5. PostgreSQL에 이벤트 + 썸네일 메타데이터 저장
    await save_events_to_db(video_id, events)

    return events


async def save_events_to_db(video_id: int, events: List[dict]):
    """PostgreSQL에 이벤트 저장 (썸네일 정보 포함)"""

    for event in events:
        # Django ORM 또는 SQLAlchemy 사용
        Event.objects.create(
            video_id=video_id,
            start_time=event['start_time'],
            end_time=event['end_time'],
            event_type=event['event_type'],
            description=event['description'],
            s3_thumbnail_key=event.get('s3_thumbnail_key'),
            thumbnail_timestamp=event.get('thumbnail_timestamp'),
            has_thumbnail=event.get('has_thumbnail', False)
        )
```

## Django API 응답 예시

```python
# Django views.py

from django.core.signing import TimestampSigner
from datetime import timedelta

def get_event_timeline(request, video_id):
    """이벤트 타임라인 조회 API"""

    events = Event.objects.filter(video_id=video_id).order_by('start_time')

    result = []
    for event in events:
        result.append({
            'id': event.id,
            'start_time': event.start_time,
            'end_time': event.end_time,
            'event_type': event.event_type,
            'description': event.description,
            'thumbnail_url': event.thumbnail_url,  # Presigned URL
            'has_thumbnail': event.has_thumbnail
        })

    return JsonResponse({'events': result})


def generate_presigned_url(bucket: str, key: str, expiration: int = 3600):
    """S3 presigned URL 생성"""
    s3_client = boto3.client('s3')

    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return None
```

## 권한 설정 (IAM Policy)

### Batch Task Role에 추가할 권한

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3RawVideosReadOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::capstone-dev-raw",
        "arn:aws:s3:::capstone-dev-raw/*"
      ]
    },
    {
      "Sid": "S3ThumbnailsWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": ["arn:aws:s3:::capstone-dev-thumbnails/*"]
    }
  ]
}
```

## 장점 요약

### ✅ Container에서 직접 S3 저장 (선택된 방식)

1. **성능 최적화**
   - 프레임 추출 직후 즉시 S3 업로드
   - 네트워크 홉 최소화 (Container → S3 직접)
2. **Django 부하 감소**
   - 대용량 이미지 데이터가 Django 서버를 거치지 않음
   - Django는 메타데이터 조회 + presigned URL 생성만 담당
3. **확장성**
   - Batch Job 병렬 처리 가능
   - S3 Transfer Acceleration 활용 가능
4. **비용 효율**

   - 데이터 전송 비용 절감 (단일 경로)
   - ECS/Fargate 네트워크 비용 감소

5. **보안**
   - 프론트엔드는 presigned URL로 임시 접근만 가능
   - 썸네일 버킷은 public access 차단

## 구현 순서

1. ✅ video_storage 버킷 삭제
2. ✅ S3 thumbnails 버킷 생성 (Terraform)
3. ✅ Batch Task Role에 thumbnails 버킷 write 권한 추가
4. ⏸️ Event 모델에 썸네일 필드 추가 (Django migration)
5. ⏸️ FastAPI 영상 분석 코드 작성 (프레임 추출 + S3 업로드)
6. ⏸️ Django API에 presigned URL 생성 로직 추가
7. ⏸️ 프론트엔드에서 썸네일 이미지 표시

## 비용 예측

### S3 Storage

- 평균 이벤트당 1개 썸네일 (100KB)
- 영상당 평균 20개 이벤트 = 2MB
- 월 1,000개 영상 = 2GB
- **비용: $0.046/month** (매우 저렴)

### S3 GET Requests (Presigned URL)

- 이벤트당 1회 조회
- 월 20,000 이벤트 조회
- **비용: $0.008/month**

**총 예상 비용: ~$0.05/month** 💰
