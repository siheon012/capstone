# API 아키텍처 리팩터링 가이드

**작성일**: 2026년 1월 3일  
**환경**: AWS ECS Fargate (deepsentinel.cloud)  
**관련 파일**: Terraform ALB, Next.js API Config, Frontend Services

---

## 📋 목차

1. [리팩터링 배경](#리팩터링-배경)
2. [Host-based vs Path-based Routing 비교](#host-based-vs-path-based-routing-비교)
3. [Next.js Rewrites 활용](#nextjs-rewrites-활용)
4. [API Config 중앙화](#api-config-중앙화)
5. [환경변수 설정](#환경변수-설정)
6. [마이그레이션 가이드](#마이그레이션-가이드)
7. [배포 절차](#배포-절차)

---

## 리팩터링 배경

### 초기 문제점

**Host-based routing 방식**:
```typescript
// ❌ 문제가 있던 방식
const getApiBaseUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.deepsentinel.cloud';
};

fetch('https://api.deepsentinel.cloud/db/videos/')
```

**발견된 이슈**:
1. 하드코딩된 절대 URL (`https://api.deepsentinel.cloud`)
2. SSR 환경에서 `window` 객체 의존성 문제
3. 환경별로 다른 로직 필요 (복잡도 증가)
4. CORS 설정 필요 (Cross-Origin)

### 목표

✅ **Same-Origin 상대 경로 사용**  
✅ **환경 격리** (Production/Development 코드 동일)  
✅ **CORS 문제 해결** (Same-Origin이므로 불필요)  
✅ **코드 간소화** (중앙화된 설정)

---

## Host-based vs Path-based Routing 비교

### 1️⃣ Host-based Routing (이전 방식)

**구조**:
```
Frontend: https://deepsentinel.cloud → Frontend Container
Backend:  https://api.deepsentinel.cloud → Backend Container
```

**Terraform ALB 설정**:
```terraform
# Host 헤더로 구분
condition {
  host_header {
    values = ["api.deepsentinel.cloud"]
  }
}
```

**프론트엔드 코드**:
```typescript
// ❌ Cross-Origin 요청
fetch('https://api.deepsentinel.cloud/db/videos/')
```

**장단점**:
- ✅ 명확한 도메인 분리
- ✅ 마이크로서비스 확장 용이
- ❌ 절대 URL 필수
- ❌ CORS 설정 필요
- ❌ 코드에 하드코딩된 도메인

### 2️⃣ Path-based Routing (현재 방식)

**구조**:
```
https://deepsentinel.cloud/          → Frontend Container
https://deepsentinel.cloud/api/*     → Backend Container
https://deepsentinel.cloud/db/*      → Backend Container
https://deepsentinel.cloud/admin/*   → Backend Container
```

**Terraform ALB 설정**:
```terraform
# Path 패턴으로 구분
condition {
  path_pattern {
    values = ["/api/*", "/admin/*", "/db/*"]
  }
}
```

**프론트엔드 코드**:
```typescript
// ✅ Same-Origin 상대 경로
fetch('/db/videos/')
```

**장단점**:
- ✅ Same-Origin (CORS 불필요)
- ✅ 상대 경로 사용 (환경 독립적)
- ✅ 코드 간소화
- ✅ Next.js rewrites와 완벽 호환
- ⚠️ Path 패턴 관리 필요 (하지만 명확함)

---

## Next.js Rewrites 활용

### rewrites란?

Next.js의 강력한 기능으로, 클라이언트가 `/api/videos/`를 요청하면 실제로는 다른 서버(Django)로 프록시합니다.

**장점**:
- 브라우저는 Same-Origin으로 인식
- CORS 문제 없음
- 환경별 다른 백엔드 주소 자동 처리

### 설정 파일

**파일**: `front/next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Development 환경에서만 rewrites 적용
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
        {
          source: '/db/:path*',
          destination: 'http://localhost:8000/db/:path*',
        },
        {
          source: '/admin/:path*',
          destination: 'http://localhost:8000/admin/:path*',
        },
      ];
    }
    // Production에서는 ALB가 처리하므로 rewrites 불필요
    return [];
  },
};

export default nextConfig;
```

### 동작 원리

**Development (로컬)**:
```
Browser: fetch('/db/videos/')
         ↓
Next.js rewrites: http://localhost:8000/db/videos/
         ↓
Django Backend (localhost:8000)
         ↓
Response
```

**Production (AWS)**:
```
Browser: fetch('/db/videos/')
         ↓
ALB: Path /db/* 매칭
         ↓
Backend Container
         ↓
Response
```

---

## API Config 중앙화

### 구조

모든 API 설정을 한 곳에서 관리합니다.

**파일**: `front/lib/api-config.ts`

```typescript
/**
 * API 기본 URL 설정
 * - Production: '' (상대 경로 - Same-Origin)
 * - Development: '' (Next.js rewrites가 처리)
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * API 엔드포인트 상수
 */
export const API_ENDPOINTS = {
  // 비디오 관련
  videos: '/db/videos/',
  videoDetail: (id: string) => `/db/videos/${id}/`,
  
  // 이벤트 관련
  events: '/db/events/',
  eventDetail: (id: string) => `/db/events/${id}/`,
  eventStats: '/db/events/video-stats/',
  
  // 세션 관련
  promptSessions: '/api/prompt-sessions/',
  promptSessionDetail: (id: string) => `/api/prompt-sessions/${id}/`,
  
  // 분석 관련
  videoAnalysis: '/api/video-analysis/',
  vectorSearch: '/api/video-analysis/vector-search/',
} as const;
```

### 사용 예시

**Before (분산된 설정)**:
```typescript
// session-service.ts
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

fetch(`${getApiBaseUrl()}/api/prompt-sessions/`)
```

**After (중앙화된 설정)**:
```typescript
// session-service.ts
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/api-config';

fetch(`${API_BASE_URL}${API_ENDPOINTS.promptSessions}`)
```

---

## 환경변수 설정

### Production 환경

**파일**: `front/.env.production`

```dotenv
# API 엔드포인트
# Path-based routing: 같은 도메인, 경로로 구분
NEXT_PUBLIC_API_URL=
# 빈 문자열 = 상대 경로 사용 (Same-Origin)

# AWS Fargate 배포
AWS_DEPLOYMENT_TYPE=fargate
AWS_ECS_CLUSTER=capstone-cluster

# S3 설정
USE_S3=true
AWS_REGION=ap-northeast-2
```

**동작**:
- `NEXT_PUBLIC_API_URL=''` → `API_BASE_URL = ''`
- `fetch('/db/videos/')` → Same-Origin 요청
- ALB가 `/db/*` 패턴을 백엔드로 라우팅

### Development 환경

**파일**: `front/.env.development`

```dotenv
# Django Backend URL
NEXT_PUBLIC_API_URL=
# 빈 문자열 = Next.js rewrites가 처리

# 로컬 개발
AWS_DEPLOYMENT_TYPE=local
USE_S3=false
```

**동작**:
- `NEXT_PUBLIC_API_URL=''` → `API_BASE_URL = ''`
- `fetch('/db/videos/')` → Next.js rewrites
- `http://localhost:8000/db/videos/`로 프록시

### 환경별 비교

| 항목 | Production | Development |
|------|-----------|-------------|
| **NEXT_PUBLIC_API_URL** | `''` | `''` |
| **API_BASE_URL** | `''` | `''` |
| **fetch 호출** | `/db/videos/` | `/db/videos/` |
| **실제 요청 URL** | `https://deepsentinel.cloud/db/videos/` | `http://localhost:8000/db/videos/` |
| **라우팅 방식** | ALB Path-based | Next.js rewrites |
| **코드 차이** | **없음** ✅ | **없음** ✅ |

---

## 마이그레이션 가이드

### Step 1: Terraform 수정

**파일**: `terraform/vpc.tf`, `terraform/route53.tf`

```terraform
# HTTP 리스너 (vpc.tf)
resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/admin/*", "/db/*"]
    }
  }
}

# HTTPS 리스너 (route53.tf)
resource "aws_lb_listener_rule" "backend_https" {
  count        = var.domain_name != "" ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/admin/*", "/db/*"]
    }
  }
}
```

### Step 2: Django CORS 설정

**파일**: `back/core/settings.py`

```python
# CORS 설정 - Path-based routing (Same-Origin)
CORS_ALLOWED_ORIGINS = [
    "https://deepsentinel.cloud",
    "https://www.deepsentinel.cloud",
    "http://localhost:3000",  # 로컬 개발용
]
CORS_ALLOW_CREDENTIALS = True
```

### Step 3: Next.js 설정

**1) next.config.mjs 생성**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
        {
          source: '/db/:path*',
          destination: 'http://localhost:8000/db/:path*',
        },
        {
          source: '/admin/:path*',
          destination: 'http://localhost:8000/admin/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
```

**2) lib/api-config.ts 생성**:
```typescript
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const API_ENDPOINTS = {
  videos: '/db/videos/',
  events: '/db/events/',
  promptSessions: '/api/prompt-sessions/',
  // ...
} as const;
```

### Step 4: Service 파일 리팩터링

**모든 service 파일** (`session-service.ts`, `video-service-client.ts`, `event-service.ts`)에서:

**Before**:
```typescript
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

const url = `${getApiBaseUrl()}/db/videos/`;
```

**After**:
```typescript
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/api-config';

const url = `${API_BASE_URL}${API_ENDPOINTS.videos}`;
```

### Step 5: 환경변수 설정

**`.env.production`**:
```dotenv
NEXT_PUBLIC_API_URL=
```

**`.env.development`**:
```dotenv
NEXT_PUBLIC_API_URL=
```

---

## 배포 절차

### 1️⃣ Terraform 변경 적용

```powershell
cd E:\capstone\terraform
terraform plan
terraform apply -auto-approve
```

**검증**:
```powershell
aws elbv2 describe-rules --listener-arn <LISTENER_ARN> --region ap-northeast-2
```

### 2️⃣ 백엔드 재배포

```powershell
# Docker 이미지 빌드
cd E:\capstone\back
docker build --no-cache -t capstone-backend:latest -f Dockerfile .

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com

# 이미지 푸시
docker tag capstone-backend:latest 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-backend:latest
docker push 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-backend:latest

# ECS 강제 재배포
aws ecs update-service `
  --cluster capstone-cluster `
  --service capstone-backend-service `
  --force-new-deployment `
  --region ap-northeast-2
```

### 3️⃣ 프론트엔드 재배포

```powershell
# Docker 이미지 빌드
cd E:\capstone\front
docker build --no-cache -t capstone-frontend:latest -f Dockerfile .

# 이미지 푸시
docker tag capstone-frontend:latest 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-frontend:latest
docker push 287709190208.dkr.ecr.ap-northeast-2.amazonaws.com/capstone-frontend:latest

# ECS 강제 재배포
aws ecs update-service `
  --cluster capstone-cluster `
  --service capstone-frontend-service `
  --force-new-deployment `
  --region ap-northeast-2
```

### 4️⃣ 검증

**브라우저 개발자 도구 → Network 탭**:

```
✅ Request URL: https://deepsentinel.cloud/db/videos/
✅ Status: 200 OK
✅ Response: JSON 데이터

✅ Request URL: https://deepsentinel.cloud/api/prompt-sessions/
✅ Status: 200 OK
✅ Response: JSON 데이터
```

**CORS 헤더 확인 (불필요하지만 확인)**:
```
Access-Control-Allow-Origin: https://deepsentinel.cloud
Access-Control-Allow-Credentials: true
```

---

## 트러블슈팅

### 문제 1: 로컬에서 CORS 에러

**증상**:
```
Access to fetch at 'http://localhost:8000/db/videos/' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

**원인**: `next.config.mjs`의 rewrites가 작동하지 않음

**해결**:
```powershell
# Next.js 서버 재시작
npm run dev
```

### 문제 2: Production에서 404 에러

**증상**:
```javascript
GET https://deepsentinel.cloud/db/videos/ 404 (Not Found)
```

**원인**: ALB 리스너 규칙 미적용

**해결**:
```powershell
cd E:\capstone\terraform
terraform apply -auto-approve

# ALB 규칙 확인
aws elbv2 describe-listener-rules --region ap-northeast-2
```

### 문제 3: 환경변수가 적용되지 않음

**증상**:
```typescript
API_BASE_URL = undefined
```

**원인**: Docker 빌드 시 환경변수 미전달

**해결**:
```dockerfile
# Dockerfile에서 ARG → ENV 전달 확인
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
```

또는:
```powershell
# 빌드 시 전달
docker build --build-arg NEXT_PUBLIC_API_URL= -t capstone-frontend:latest .
```

---

## 주요 개선 사항 요약

| 항목 | Before | After |
|------|--------|-------|
| **라우팅 방식** | Host-based (api.deepsentinel.cloud) | Path-based (/api/*, /db/*) |
| **API URL** | 절대 URL (하드코딩) | 상대 경로 (환경 독립) |
| **환경 차이** | 코드에서 분기 로직 | 환경변수로 자동 처리 |
| **CORS** | 필요 (Cross-Origin) | 불필요 (Same-Origin) |
| **코드 복잡도** | 높음 (각 파일마다 getApiBaseUrl) | 낮음 (중앙 설정) |
| **유지보수성** | 어려움 (분산된 설정) | 쉬움 (한 곳에서 관리) |
| **타입 안정성** | 낮음 (문자열 하드코딩) | 높음 (상수 객체) |

---

## Best Practices

### ✅ DO

1. **환경변수를 비워두기** (`NEXT_PUBLIC_API_URL=`)
   - Same-Origin 상대 경로 활성화
   
2. **API_BASE_URL 상수 사용**
   ```typescript
   import { API_BASE_URL } from '@/lib/api-config';
   ```

3. **Next.js rewrites 활용**
   - 로컬 개발에서도 Same-Origin 유지

4. **엔드포인트 상수화**
   ```typescript
   API_ENDPOINTS.videos // ✅
   '/db/videos/' // ❌
   ```

### ❌ DON'T

1. **절대 URL 하드코딩 금지**
   ```typescript
   fetch('https://api.deepsentinel.cloud/...') // ❌
   ```

2. **window 객체 의존 금지**
   ```typescript
   if (typeof window !== 'undefined') { ... } // ❌ SSR 위험
   ```

3. **환경별 분기 로직 금지**
   ```typescript
   const url = isDev ? 'localhost' : 'production'; // ❌
   ```

4. **API URL 중복 정의 금지**
   ```typescript
   // session-service.ts
   const API_URL = '/api/sessions/'; // ❌
   
   // video-service.ts
   const API_URL = '/api/videos/'; // ❌
   
   // 대신 lib/api-config.ts에 통합
   ```

---

## 결론

Path-based routing과 Next.js rewrites를 활용한 새로운 아키텍처는:

- ✅ **깔끔한 코드**: 상대 경로로 통일
- ✅ **환경 독립적**: Production/Development 동일한 코드
- ✅ **타입 안전**: 중앙화된 상수 관리
- ✅ **CORS 불필요**: Same-Origin 설계
- ✅ **유지보수 용이**: 한 곳에서 설정 관리

**현대적인 Next.js + Django 풀스택 아키텍처의 모범 사례**입니다! 🚀

---

**문서 버전**: 1.0  
**마지막 업데이트**: 2026년 1월 3일  
**관련 문서**: 
- [PRODUCTION_403_ISSUE_RESOLUTION.md](./PRODUCTION_403_ISSUE_RESOLUTION.md)
- [PRODUCTION_404_ROUTING_ISSUES.md](./PRODUCTION_404_ROUTING_ISSUES.md)
