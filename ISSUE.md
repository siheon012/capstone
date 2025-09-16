# ISSUE 해결 기록

## 🔧 S3 영상 업로드 기능 구현 (2025.09.11)

### **문제**
- 기존 로컬 파일 시스템 업로드만 지원
- dev/prod 환경에서 S3 업로드 필요
- JWT 인증 기반 보안 업로드 구현 필요

### **해결 방안**
S3 업로드를 위한 별도 서비스 모듈 구조 구현 (views.py 수정 대신 모듈 분리)

#### **1. 새로운 파일 구조**
```
back/apps/api/
├── services/
│   ├── s3_service.py      # S3 업로드 로직
│   └── auth_service.py    # JWT 인증 로직
├── views_s3.py           # S3 전용 API 뷰
└── urls_s3.py            # S3 전용 URL 라우팅
```

#### **2. 환경설정 통일**
- ❌ 기존: `AWS_S3_BUCKET_NAME` + `AWS_S3_VIDEO_BUCKET` (중복)
- ✅ 개선: `AWS_S3_BUCKET_NAME` 하나로 통일

#### **3. 환경별 S3 설정**
| 환경 | USE_LOCALSTACK | 엔드포인트 | 버킷명 |
|------|----------------|------------|--------|
| Local | true | localhost:4566 | capstone-local-video-bucket |
| Dev | false | AWS S3 | capstone-dev-video-bucket |
| Prod | false | AWS S3 | capstone-production-video-bucket |

#### **4. JWT 이중 인증 구조**
1. **사용자 JWT** (7일): 로그인 시 발급, 기존 회원 기반
2. **업로드 JWT** (1시간): 업로드 요청 시 발급, 특정 파일용

#### **5. 업로드 플로우**
```
사용자 로그인 → 사용자 JWT 검증 → 업로드 JWT 발급 → Pre-signed URL 생성 → S3 직접 업로드
```

### **핵심 특징**
- ✅ **두 방식 병존**: 기존 로컬 파일 + 새로운 S3 업로드
- ✅ **환경 일관성**: LocalStack으로 로컬에서도 S3 API 사용 가능
- ✅ **보안 강화**: JWT 기반 인증된 사용자만 업로드 가능
- ✅ **확장성**: 모듈 분리로 유지보수 용이

### **사용법**
```bash
# 로컬 개발 (LocalStack)
docker compose --env-file .env.local up -d --build

# 개발 서버 (AWS S3)
docker compose --env-file .env.dev up -d --build

# 운영 서버 (AWS S3)
docker compose --env-file .env.prod up -d --build
```

### **의존성 추가**
```txt
boto3==1.35.50
PyJWT==2.9.0
```

---
