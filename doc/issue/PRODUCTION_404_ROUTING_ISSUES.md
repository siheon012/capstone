# Production 404 Routing Issues 해결 가이드

**작성일**: 2026년 1월 3일  
**환경**: AWS ECS Fargate (deepsentinel.cloud)  
**관련 파일**: Terraform ALB 설정, 프론트엔드 API 서비스, Django 백엔드

---

## 📋 목차

1. [문제 요약](#문제-요약)
2. [이슈 #1: `/api/prompt-sessions/` 404 에러](#이슈-1-apiprompt-sessions-404-에러)
3. [이슈 #2: `/api/video-analysis/event-stats/` 404 에러](#이슈-2-apivideo-analysisevent-stats-404-에러)
4. [이슈 #3: 채팅 개수 0으로 표시되는 버그](#이슈-3-채팅-개수-0으로-표시되는-버그)
5. [전체 배포 절차](#전체-배포-절차)
6. [검증 방법](#검증-방법)

---

## 문제 요약

Production 환경에서 여러 API 엔드포인트가 404 Not Found 에러를 반환하는 문제가 발생했습니다.

### 영향받는 기능

- ✅ **세션 관리**: 세션 데이터 로드 실패
- ✅ **이벤트 통계**: 비디오별 이벤트 통계 로드 실패
- ✅ **채팅 개수**: 비디오 카드에 채팅 개수가 0으로 표시

### 에러 로그

```javascript
// 1. 세션 로드 실패
GET https://deepsentinel.cloud/api/prompt-sessions/1336f5b8-cb42-4bac-848f-bdfb8db17086/ 404 (Not Found)
❌ 세션을 찾을 수 없음: 1336f5b8-cb42-4bac-848f-bdfb8db17086

// 2. 이벤트 통계 로드 실패
GET https://deepsentinel.cloud/api/video-analysis/event-stats/?video_id=103 404 (Not Found)
❌ 이벤트 통계 가져오기 오류: Error: API 호출 실패: 404

// 3. 채팅 개수 표시 오류
chat_count: 0 (실제로는 세션이 존재함)
```

---

## 이슈 #1: `/api/prompt-sessions/` 404 에러

### 🔍 문제 분석

**증상**:

```javascript
[LoadSession] Loading session data for: 1336f5b8-cb42-4bac-848f-bdfb8db17086
📡 Session URL: /api/prompt-sessions/1336f5b8-cb42-4bac-848f-bdfb8db17086/
GET https://deepsentinel.cloud/api/prompt-sessions/... 404 (Not Found)
```

**URL 요청 경로**:

```
https://deepsentinel.cloud/uploaded_video/103?sessionId=1336f5b8-cb42-4bac-848f-bdfb8db17086
↓
GET /api/prompt-sessions/1336f5b8-cb42-4bac-848f-bdfb8db17086/
↓
ALB → Frontend (404 발생)
```

### 🎯 원인 파악

ALB 리스너 규칙에 `/prompt-sessions/*` 패턴이 **중복**으로 추가되어 있었습니다:

**Terraform 설정 (수정 전)**:

```terraform
# route53.tf - HTTPS 리스너 규칙
condition {
  path_pattern {
    values = ["/api/*", "/admin/*", "/db/*", "/prompt-sessions/*", "/prompt/*"]
    #                                         ↑ 중복! /api/*에 이미 포함됨
  }
}
```

**문제점**:

- `/api/*` 패턴은 이미 `/api/prompt-sessions/`를 포함함
- 별도로 `/prompt-sessions/*`를 추가하면 **우선순위 충돌** 발생 가능
- `/prompt-sessions/*` 단독 패턴은 `/api/` 접두어 없이 호출될 때만 매칭

### ✅ 해결 방법

중복되는 `/prompt-sessions/*` 패턴을 제거했습니다.

**파일**: `terraform/route53.tf`, `terraform/vpc.tf`

**수정 내용**:

```terraform
# HTTPS 리스너 규칙 (route53.tf)
condition {
  path_pattern {
    values = ["/api/*", "/admin/*", "/db/*", "/prompt/*"]
    # /prompt-sessions/* 제거 (/api/*에 이미 포함됨)
  }
}

# HTTP 리스너 규칙 (vpc.tf)
condition {
  path_pattern {
    values = ["/api/*", "/admin/*", "/db/*", "/prompt/*"]
    # /prompt-sessions/* 제거 (/api/*에 이미 포함됨)
  }
}
```

**적용 명령**:

```powershell
cd E:\capstone\terraform
terraform apply -auto-approve
```

### 📊 라우팅 흐름 (수정 후)

```
Client Request: /api/prompt-sessions/1336f5b8.../
                    ↓
        ALB Listener (HTTPS:443)
                    ↓
        Rule: /api/* 매칭
                    ↓
        Backend Target Group
                    ↓
        Django: /api/prompt-sessions/ ViewSet
                    ↓
        PromptSessionViewSet.retrieve()
                    ↓
        200 OK (세션 데이터 반환)
```

---

## 이슈 #2: `/api/video-analysis/event-stats/` 404 에러

### 🔍 문제 분석

**증상**:

```javascript
GET https://deepsentinel.cloud/api/video-analysis/event-stats/?video_id=103 404 (Not Found)
❌ 이벤트 통계 가져오기 오류: Error: API 호출 실패: 404
```

**프론트엔드 호출 코드**:

```typescript
// front/app/actions/video-service-client.ts (수정 전)
const url = apiBaseUrl
  ? `${apiBaseUrl}/api/video-analysis/event-stats/?video_id=${videoId}`
  : `/api/video-analysis/event-stats/?video_id=${videoId}`;
```

### 🎯 원인 파악

백엔드에 `/api/video-analysis/event-stats/` 엔드포인트가 **존재하지 않습니다**.

**백엔드 실제 구조**:

```python
# back/apps/db/urls.py
router.register(r'video-analysis', VideoAnalysisViewSet)  # /db/video-analysis/
router.register(r'events', EventViewSet)                   # /db/events/

# back/apps/db/views.py
class EventViewSet(viewsets.ModelViewSet):
    @action(detail=False, methods=['get'], url_path='video-stats')
    def video_stats(self, request):
        """비디오별 이벤트 타입 통계"""
        # 실제 경로: /db/events/video-stats/
```

**실제 사용 가능한 엔드포인트**:

- ❌ `/api/video-analysis/event-stats/` (존재하지 않음)
- ✅ `/db/events/video-stats/` (실제 구현됨)

### ✅ 해결 방법

프론트엔드에서 올바른 백엔드 URL로 수정했습니다.

**파일**: `front/app/actions/video-service-client.ts`

**수정 내용**:

```typescript
// 비디오 이벤트 통계 가져오기 (수정 후)
export async function getVideoEventStats(videoId: string): Promise<{
  success: boolean;
  data?: {
    mostFrequentEvent: {
      eventType: string;
      count: number;
    } | null;
    totalEvents: number;
  };
  error?: string;
}> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    const url = apiBaseUrl
      ? `${apiBaseUrl}/db/events/video-stats/?video_id=${videoId}`
      : `/db/events/video-stats/?video_id=${videoId}`;
    //              ↑ /api/video-analysis/event-stats/ → /db/events/video-stats/

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        mostFrequentEvent: data.most_frequent_event
          ? {
              eventType: data.most_frequent_event.event_type,
              count: data.most_frequent_event.count,
            }
          : null,
        totalEvents: data.stats?.length || 0,
      },
    };
  } catch (error) {
    console.error('❌ 이벤트 통계 가져오기 오류:', error);
    return {
      success: false,
      error: '이벤트 통계를 불러오는 중 오류가 발생했습니다.',
    };
  }
}
```

**적용 방법**: 프론트엔드 재배포 필요

### 📊 API 매핑 테이블

| 프론트엔드 요청 경로 (수정 전)     | 백엔드 실제 경로                | 상태      |
| ---------------------------------- | ------------------------------- | --------- |
| `/api/video-analysis/event-stats/` | ❌ 존재하지 않음                | 404 에러  |
| `/db/events/video-stats/`          | ✅ `EventViewSet.video_stats()` | 정상 동작 |

---

## 이슈 #3: 채팅 개수 0으로 표시되는 버그

### 🔍 문제 분석

**증상**:

- 비디오 카드에 "0개 채팅"으로 표시됨
- 실제로는 세션이 존재하지만 카운트되지 않음

**UI 표시 코드**:

```tsx
// front/app/uploaded_video/page.tsx
<div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400">
  <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
  <span className="truncate">{video.chatCount}개 채팅</span>
</div>
```

**백엔드 Serializer**:

```python
# back/apps/db/serializers.py
class VideoSerializer(serializers.ModelSerializer):
    chat_count = serializers.SerializerMethodField()

    def get_chat_count(self, obj):
        """실제 PromptSession 수를 계산하여 반환"""
        if hasattr(obj, 'prompt_sessions'):
            return obj.prompt_sessions.count()
        return 0
```

### 🎯 원인 파악

**Django ORM 역참조 문제**:

`PromptSession` 모델의 `related_videos` 필드에 `related_name`이 설정되지 않아 역참조가 작동하지 않았습니다.

```python
# back/apps/db/models.py (수정 전)
class PromptSession(models.Model):
    # ...
    related_videos = models.ManyToManyField(Video, blank=True)
    # ↑ related_name이 없어서 Video.prompt_sessions 역참조 불가
```

**에러 발생 흐름**:

```
VideoSerializer.get_chat_count(obj)
    ↓
if hasattr(obj, 'prompt_sessions'):  # False 반환
    ↓
return 0  # 항상 0 반환
```

### ✅ 해결 방법

`related_name='prompt_sessions'`를 추가하여 역참조를 활성화했습니다.

**1. 모델 수정**

**파일**: `back/apps/db/models.py`

```python
class PromptSession(models.Model):
    """클라우드 네이티브 프롬프트 세션 모델"""
    # 세션 기본 정보
    session_id = models.CharField(max_length=255, unique=True, blank=True)
    user_id = models.CharField(max_length=255, blank=True)

    # 주요 이벤트 연결 (RAG 검색의 컨텍스트)
    main_event = models.ForeignKey(Event, on_delete=models.SET_NULL, null=True, blank=True)
    related_videos = models.ManyToManyField(
        Video,
        blank=True,
        related_name='prompt_sessions'  # ← 추가!
    )
    # ...
```

**2. 마이그레이션 생성**

**파일**: `back/apps/db/migrations/0005_alter_promptsession_related_videos.py`

```python
# Generated by Django 5.2

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0004_video_summary_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='promptsession',
            field_name='related_videos',
            field=models.ManyToManyField(
                blank=True,
                related_name='prompt_sessions',
                to='db.video'
            ),
        ),
    ]
```

**3. 적용 방법**: 백엔드 재배포 필요

### 📊 ORM 역참조 동작 (수정 후)

```python
# Video 인스턴스에서 PromptSession 접근
video = Video.objects.get(video_id=103)

# 수정 전: AttributeError 발생
# video.prompt_sessions  # ❌ 속성 없음

# 수정 후: 정상 동작
chat_count = video.prompt_sessions.count()  # ✅ 실제 세션 개수 반환
sessions = video.prompt_sessions.all()      # ✅ 관련 세션 쿼리셋
```

---

## 전체 배포 절차

### 1️⃣ Terraform 변경사항 적용

```powershell
# ALB 리스너 규칙 업데이트
cd E:\capstone\terraform
terraform plan
terraform apply -auto-approve

# 확인
aws elbv2 describe-rules --listener-arn <LISTENER_ARN>
```

**예상 결과**:

```json
{
  "Conditions": [
    {
      "Field": "path-pattern",
      "Values": ["/api/*", "/admin/*", "/db/*", "/prompt/*"]
    }
  ]
}
```

### 2️⃣ 백엔드 재배포

```powershell
# 1. Docker 이미지 빌드
cd E:\capstone\back
docker build --no-cache -t capstone-backend:latest -f Dockerfile .

# 2. ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com

# 3. 이미지 태그 및 푸시
docker tag capstone-backend:latest 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-backend:latest
docker push 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-backend:latest

# 4. ECS 서비스 강제 재배포
aws ecs update-service `
  --cluster capstone-cluster `
  --service capstone-backend-service `
  --force-new-deployment `
  --region ap-northeast-2

# 5. 배포 상태 확인
aws ecs describe-services `
  --cluster capstone-cluster `
  --services capstone-backend-service `
  --region ap-northeast-2 `
  --query 'services[0].deployments'
```

**마이그레이션 자동 실행**:

```bash
# back/entrypoint.sh에서 자동 실행됨
python manage.py migrate --noinput
```

**적용되는 마이그레이션**:

- `0004_video_summary_status.py`: summary_status 필드 추가
- `0005_alter_promptsession_related_videos.py`: related_name 추가

### 3️⃣ 프론트엔드 재배포

```powershell
# 1. Docker 이미지 빌드
cd E:\capstone\front
docker build --no-cache -t capstone-frontend:latest -f Dockerfile .

# 2. 이미지 태그 및 푸시
docker tag capstone-frontend:latest 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-frontend:latest
docker push 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-frontend:latest

# 3. ECS 서비스 강제 재배포
aws ecs update-service `
  --cluster capstone-cluster `
  --service capstone-frontend-service `
  --force-new-deployment `
  --region ap-northeast-2

# 4. 배포 상태 확인
aws ecs describe-services `
  --cluster capstone-cluster `
  --services capstone-frontend-service `
  --region ap-northeast-2 `
  --query 'services[0].deployments'
```

### 4️⃣ 배포 순서 (중요)

```
1. Terraform 적용 (ALB 규칙 업데이트)
   ↓
2. 백엔드 재배포 (마이그레이션 적용)
   ↓
3. 프론트엔드 재배포 (URL 수정 반영)
```

---

## 검증 방법

### ✅ 1. 세션 API 테스트

**브라우저 콘솔**:

```javascript
// 1. 세션 목록 가져오기
fetch('/api/prompt-sessions/')
  .then((r) => r.json())
  .then(console.log)[
  // 예상 결과: 200 OK
  {
    session_id: '1336f5b8-cb42-4bac-848f-bdfb8db17086',
    session_name: '테스트 세션',
    total_interactions: 5,
    // ...
  }
];

// 2. 특정 세션 가져오기
fetch('/api/prompt-sessions/1336f5b8-cb42-4bac-848f-bdfb8db17086/')
  .then((r) => r.json())
  .then(console.log);

// 예상 결과: 200 OK (세션 상세 정보)
```

### ✅ 2. 이벤트 통계 API 테스트

```javascript
// 비디오 이벤트 통계
fetch('/db/events/video-stats/?video_id=103')
  .then(r => r.json())
  .then(console.log)

// 예상 결과: 200 OK
{
  "video_id": "103",
  "most_frequent_event": {
    "event_type": "person_detected",
    "count": 45
  },
  "stats": [
    { "event_type": "person_detected", "count": 45 },
    { "event_type": "motion_detected", "count": 23 }
  ]
}
```

### ✅ 3. 채팅 개수 표시 확인

**1) Django Admin에서 확인**:

```python
# Django shell
from apps.db.models import Video

video = Video.objects.get(video_id=103)
print(f"채팅 개수: {video.prompt_sessions.count()}")
# 예상 결과: 실제 세션 개수 출력 (예: 3)
```

**2) API 응답 확인**:

```javascript
fetch('/db/videos/103/')
  .then((r) => r.json())
  .then((data) => console.log('chat_count:', data.chat_count));

// 예상 결과: chat_count: 3 (실제 세션 개수)
```

**3) UI 확인**:

- `/uploaded_video` 페이지 접속
- 비디오 카드에서 "3개 채팅" 표시 확인 ✅

### ✅ 4. 네트워크 탭 검증

**Chrome DevTools → Network 탭**:

| Request                                    | Status | Response         |
| ------------------------------------------ | ------ | ---------------- |
| `GET /api/prompt-sessions/`                | 200 OK | 세션 목록        |
| `GET /api/prompt-sessions/{id}/`           | 200 OK | 세션 상세        |
| `GET /db/events/video-stats/?video_id=103` | 200 OK | 통계 데이터      |
| `GET /db/videos/`                          | 200 OK | `chat_count > 0` |

**모든 요청이 200 OK를 반환해야 합니다!** ✅

### ✅ 5. 로그 확인

**백엔드 로그**:

```bash
# ECS 태스크 로그 확인
aws logs tail /ecs/capstone-backend --follow

# 기대 출력:
Running migrations:
  Applying db.0004_video_summary_status... OK
  Applying db.0005_alter_promptsession_related_videos... OK
```

**프론트엔드 브라우저 콘솔**:

```
✅ Django에서 5개 비디오 로드 완료
📦 Django API 응답: [{chat_count: 3, ...}, ...]
🔥 Django API에서 모든 세션 가져오기 시작
📡 API URL: /api/prompt-sessions/
```

---

## 트러블슈팅

### 문제: 여전히 404 에러 발생

**원인 1**: Terraform 변경사항이 적용되지 않음

```powershell
# ALB 리스너 규칙 확인
aws elbv2 describe-listener-rules --region ap-northeast-2 | Select-String "path-pattern"

# 다시 적용
cd E:\capstone\terraform
terraform apply -auto-approve
```

**원인 2**: 이전 Docker 이미지 캐시 사용

```powershell
# 캐시 없이 재빌드
docker build --no-cache -t capstone-frontend:latest .
docker build --no-cache -t capstone-backend:latest .
```

**원인 3**: ECS 태스크가 이전 버전 실행 중

```powershell
# 실행 중인 태스크 확인
aws ecs list-tasks --cluster capstone-cluster --service-name capstone-backend-service

# 태스크 강제 종료 (새 태스크 자동 시작)
aws ecs stop-task --cluster capstone-cluster --task <TASK_ARN>
```

### 문제: 마이그레이션 미적용

**증상**:

```
OperationalError: column db_promptsession.related_videos does not exist
```

**해결**:

```bash
# ECS 컨테이너 접속
aws ecs execute-command \
  --cluster capstone-cluster \
  --task <TASK_ARN> \
  --container backend \
  --interactive \
  --command "/bin/bash"

# 마이그레이션 수동 실행
python manage.py migrate db 0005

# 확인
python manage.py showmigrations db
```

### 문제: 채팅 개수 여전히 0

**원인**: 세션이 실제로 `related_videos`에 연결되지 않음

**해결**: Django shell에서 수동 연결

```python
from apps.db.models import Video, PromptSession

video = Video.objects.get(video_id=103)
sessions = PromptSession.objects.filter(session_name__contains="103")

for session in sessions:
    session.related_videos.add(video)

# 확인
print(video.prompt_sessions.count())
```

---

## 요약

### 수정된 파일

| 파일                                        | 변경 내용                                                      | 목적                   |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| `terraform/route53.tf`                      | `/prompt-sessions/*` 패턴 제거                                 | ALB 라우팅 중복 해소   |
| `terraform/vpc.tf`                          | `/prompt-sessions/*` 패턴 제거                                 | ALB 라우팅 중복 해소   |
| `front/app/actions/video-service-client.ts` | `/api/video-analysis/event-stats/` → `/db/events/video-stats/` | 올바른 백엔드 URL 호출 |
| `back/apps/db/models.py`                    | `related_name='prompt_sessions'` 추가                          | ORM 역참조 활성화      |
| `back/apps/db/migrations/0005_...py`        | `related_name` 마이그레이션                                    | DB 스키마 변경         |

### 배포 체크리스트

- [ ] Terraform 적용 완료
- [ ] 백엔드 Docker 이미지 빌드 및 푸시
- [ ] 백엔드 ECS 서비스 재배포
- [ ] 마이그레이션 적용 확인 (0004, 0005)
- [ ] 프론트엔드 Docker 이미지 빌드 및 푸시
- [ ] 프론트엔드 ECS 서비스 재배포
- [ ] 세션 API 200 OK 확인
- [ ] 이벤트 통계 API 200 OK 확인
- [ ] 채팅 개수 UI 정상 표시 확인
- [ ] 브라우저 콘솔 에러 없음 확인

---

**문서 버전**: 1.0  
**마지막 업데이트**: 2026년 1월 3일  
**관련 문서**: [PRODUCTION_403_ISSUE_RESOLUTION.md](./PRODUCTION_403_ISSUE_RESOLUTION.md)
