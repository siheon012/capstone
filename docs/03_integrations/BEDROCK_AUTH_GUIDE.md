# AWS Bedrock 인증 방식 가이드

## 🔐 인증 방식 비교

### 1. IAM Role (ECS/Fargate) ✅ **추천 - 프로덕션**

**장점:**

- 🔒 가장 안전 (키 노출 없음)
- 🤖 자동 자격증명
- 🔄 키 로테이션 불필요
- ✅ AWS 모범 사례
- 🎯 세밀한 권한 제어

**설정:**

```python
# ECS Task Role이 자동으로 인증 처리
# 환경 변수에 AWS_ACCESS_KEY_ID 불필요!

# bedrock_service.py
self.bedrock_runtime = boto3.client(
    'bedrock-runtime',
    region_name='ap-northeast-2'
    # ← 자격증명 없음! Task Role 자동 사용
)
```

**Terraform 설정 (이미 완료 ✅):**

```hcl
# ecs-fargate.tf
resource "aws_iam_role_policy" "ecs_task_bedrock_policy" {
  name = "ecs-task-bedrock-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "*"
      }
    ]
  })
}
```

---

### 2. Access Key (로컬 개발) 🔧 **로컬 테스트용**

**장점:**

- 📝 설정 간단
- 🏠 로컬 개발에 편리

**단점:**

- ⚠️ 키 관리 필요
- 🔓 키 노출 위험
- 🔄 수동 로테이션

**설정:**

```bash
# .env 파일
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxx
AWS_BEDROCK_REGION=ap-northeast-2
```

---

### 3. API Key (신규 기능) 🆕 **간단한 프로토타입용**

**장점:**

- ⚡ 빠른 시작
- 📝 설정 최소화

**단점:**

- 🔓 보안 취약
- 🚫 프로덕션 비추천
- ⚙️ 제한된 기능

**설정:**

```bash
# API 키 방식 (현재 프로젝트에는 미사용)
BEDROCK_API_KEY=your-api-key-here
```

---

## 🎯 **권장 구성**

### ✅ **프로덕션 (ECS Fargate)**

```bash
# 환경 변수 (.env 또는 ECS Task Definition)
USE_BEDROCK=true
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# ⚠️ AWS_ACCESS_KEY_ID 설정하지 않음!
# → IAM Role이 자동으로 인증
```

**인증 흐름:**

```
ECS Task 실행
    ↓
Task Role 자동 할당
    ↓
boto3.client('bedrock-runtime')
    ↓
IAM Role 자격증명 자동 사용 ✅
    ↓
Bedrock API 호출 성공
```

---

### 🏠 **로컬 개발**

```bash
# .env 파일
USE_BEDROCK=true
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

**인증 흐름:**

```
로컬 Django 실행
    ↓
settings.py에서 환경 변수 로드
    ↓
boto3.client(..., aws_access_key_id=...)
    ↓
명시적 자격증명 사용 ✅
    ↓
Bedrock API 호출 성공
```

---

## 🔧 **현재 구현 (자동 선택)**

코드가 환경에 따라 **자동으로 적절한 인증 방식을 선택**합니다:

```python
# bedrock_service.py
def __init__(self):
    # AWS 자격증명 확인
    aws_access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
    aws_secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)

    client_kwargs = {
        'service_name': 'bedrock-runtime',
        'region_name': self.region
    }

    # 로컬 개발: 명시적 자격증명 사용
    if aws_access_key and aws_secret_key:
        client_kwargs['aws_access_key_id'] = aws_access_key
        client_kwargs['aws_secret_access_key'] = aws_secret_key
        print("🔑 Bedrock: 명시적 자격증명 사용 (로컬)")
    else:
        # ECS/Fargate: IAM Role 자동 사용
        print("🔐 Bedrock: IAM Role 자동 인증 (프로덕션)")

    self.bedrock_runtime = boto3.client(**client_kwargs)
```

---

## 📋 **체크리스트**

### ✅ **프로덕션 배포 전**

1. **AWS Console에서 Bedrock Model Access 활성화**

   ```
   ☑ Claude 3 Sonnet
   ☑ Titan Embeddings
   ```

2. **Terraform Apply (IAM Role 적용)**

   ```bash
   cd terraform
   terraform apply
   ```

3. **환경 변수 설정 (ECS Task Definition)**

   ```hcl
   environment = [
     {
       name  = "USE_BEDROCK"
       value = "true"
     },
     {
       name  = "AWS_BEDROCK_REGION"
       value = "ap-northeast-2"
     }
   ]
   # ⚠️ AWS_ACCESS_KEY_ID 설정하지 않음!
   ```

4. **배포 및 테스트**

   ```bash
   # Health check
   curl http://your-alb/api/health/

   # Bedrock 테스트
   curl -X POST http://your-alb/api/prompt/ \
     -d '{"prompt": "테스트", "video_id": 1}'
   ```

---

### 🏠 **로컬 개발 설정**

1. **AWS CLI 설정 (선택 1)**

   ```bash
   aws configure
   # Access Key ID, Secret Access Key 입력
   ```

2. **.env 파일 (선택 2)**

   ```bash
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   ```

3. **Bedrock Model Access 활성화**

   - 본인 AWS 계정에서 활성화 필요

4. **로컬 테스트**

   ```bash
   python manage.py runserver

   # 테스트
   curl -X POST http://localhost:8000/api/prompt/ \
     -d '{"prompt": "테스트", "video_id": 1}'
   ```

---

## 🆚 **API Key vs IAM Role**

| 항목            | API Key   | IAM Role (현재) |
| --------------- | --------- | --------------- |
| **보안**        | ⚠️ 중간   | ✅ 최상         |
| **관리**        | 수동      | 자동            |
| **프로덕션**    | ❌ 비추천 | ✅ 추천         |
| **로컬 개발**   | ✅ 간편   | 🔧 설정 필요    |
| **키 로테이션** | 수동      | 자동            |
| **AWS 권장**    | ❌        | ✅              |

---

## 💡 **결론**

### ✅ **현재 프로젝트 설정 (최적)**

```
프로덕션 (ECS): IAM Role ✅ 자동 인증
로컬 개발: Access Key ✅ 명시적 인증
API Key: 사용 안 함 (불필요)
```

**이유:**

1. 🔒 IAM Role이 가장 안전
2. 🤖 자동 자격증명 관리
3. ✅ AWS 모범 사례
4. 📦 이미 Terraform으로 설정 완료

### 🎯 **필요한 작업**

**단 1가지!**

```
AWS Console → Bedrock → Model Access 활성화
```

API Key는 **불필요**합니다! 현재 구현이 더 안전하고 우수합니다. 🚀

---

## 🔍 **트러블슈팅**

### ECS에서 Bedrock 인증 실패 시

```bash
# 로그 확인
🔐 Bedrock: IAM Role 자동 인증 (프로덕션)  # ← 이 로그가 보여야 함

# IAM Role 확인
aws iam get-role --role-name capstone-ecs-task-role

# Bedrock 권한 확인
aws iam list-role-policies --role-name capstone-ecs-task-role
```

### 로컬에서 Bedrock 인증 실패 시

```bash
# 환경 변수 확인
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# AWS CLI로 테스트
aws bedrock list-foundation-models --region ap-northeast-2

# Python으로 테스트
python manage.py shell
>>> import boto3
>>> client = boto3.client('bedrock', region_name='ap-northeast-2')
>>> client.list_foundation_models()
```
