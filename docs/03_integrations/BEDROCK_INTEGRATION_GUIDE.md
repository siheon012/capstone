# AWS Bedrock 통합 가이드

## 개요

이 프로젝트는 AWS Bedrock을 활용하여 다음 기능들을 구현합니다:

1. **Text2SQL**: 자연어 프롬프트를 SQL 쿼리로 변환
2. **RAG (Retrieval Augmented Generation)**: 검색된 데이터를 자연어로 정리
3. **타임라인 응답**: 이벤트 정보를 사용자 친화적인 형식으로 제공

## 아키텍처 변경사항

### 기존 방식

```
사용자 프롬프트 → FastAPI Text2SQL → PostgreSQL → 후처리 → 응답
```

### Bedrock 방식

```
사용자 프롬프트 → Bedrock Claude (Text2SQL) → PostgreSQL → Bedrock RAG → 자연어 응답
```

## 필요한 AWS 리소스

### 1. Bedrock 모델 액세스 활성화

AWS Console에서 다음 모델들의 액세스를 활성화해야 합니다:

1. **Claude 3 Sonnet** (Text2SQL 및 RAG용)
   - Model ID: `anthropic.claude-3-sonnet-20240229-v1:0`
   - 용도: 자연어 → SQL 변환, RAG 응답 생성

2. **Titan Embeddings** (선택사항, 향후 벡터 검색용)
   - Model ID: `amazon.titan-embed-text-v1`

#### 활성화 방법

```bash
# AWS Console
1. AWS Bedrock 콘솔 접속
2. 좌측 메뉴에서 "Model access" 선택
3. "Manage model access" 클릭
4. Claude 3 Sonnet 체크
5. "Save changes" 클릭
```

### 2. IAM 권한 설정

ECS Task Role에 다음 권한이 필요합니다 (이미 Terraform에 포함됨):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:GetFoundationModelAvailability",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:Retrieve", "bedrock:RetrieveAndGenerate"],
      "Resource": "*"
    }
  ]
}
```

## 환경 변수 설정

### 로컬 개발 환경

`.env` 파일에 다음 변수들을 추가하세요:

```bash
# Bedrock 설정
USE_BEDROCK=true
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v1

# AWS 자격 증명 (로컬 개발용)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=ap-northeast-2

# Knowledge Base (선택사항)
# AWS_BEDROCK_KNOWLEDGE_BASE_ID=your_knowledge_base_id
```

### Docker Compose 환경

`docker-compose.yml` 또는 `docker-compose.prod.yml`에 환경 변수 추가:

```yaml
services:
  backend:
    environment:
      - USE_BEDROCK=true
      - AWS_BEDROCK_REGION=ap-northeast-2
      - AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
```

### AWS ECS Fargate 환경

Terraform에서 자동으로 Task Role을 통해 권한이 부여됩니다.
환경 변수는 ECS Task Definition에 추가:

```hcl
environment = [
  {
    name  = "USE_BEDROCK"
    value = "true"
  },
  {
    name  = "AWS_BEDROCK_REGION"
    value = "ap-northeast-2"
  },
  {
    name  = "AWS_BEDROCK_MODEL_ID"
    value = "anthropic.claude-3-sonnet-20240229-v1:0"
  }
]
```

## 코드 구조

### 1. Bedrock 서비스 모듈

`back/apps/api/bedrock_service.py`

주요 기능:

- `text_to_sql()`: 프롬프트 → SQL 변환
- `format_timeline_response()`: 이벤트 → 자연어 응답
- `retrieve_from_knowledge_base()`: Knowledge Base 검색 (선택사항)

### 2. Views 통합

`back/apps/api/views.py`

`process_prompt_logic()` 함수가 Bedrock을 사용하도록 수정됨:

- `USE_BEDROCK=true`: Bedrock 사용
- `USE_BEDROCK=false`: 기존 FastAPI 사용 (폴백)

## 사용 예시

### API 호출

```bash
# 프롬프트 처리
curl -X POST http://localhost:8088/api/prompt/ \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "10분에서 15분 사이에 도난 사건이 있었나요?",
    "video_id": 1
  }'
```

### 응답 예시

```json
{
  "response": "네, 12분 30초에 도난 이벤트가 감지되었습니다. 해당 시각에 남성(약 35세)이 매장 내에서 물품을 가방에 넣는 행동이 포착되었습니다. 위치는 매장 중앙 진열대 부근이며, 신뢰도 95.3%로 도난 행동으로 분류되었습니다.",
  "timestamp": 750,
  "event_id": 42
}
```

## 테스트

### 1. Bedrock 연결 테스트

```python
# Django shell
python manage.py shell

from apps.api.bedrock_service import get_bedrock_service

bedrock = get_bedrock_service()

# Text2SQL 테스트
result = bedrock.text_to_sql("10분에서 15분 사이의 이벤트를 찾아줘", video_id=1)
print(result)

# RAG 테스트
events = [
    {
        'timestamp': 750,
        'event_type': 'theft',
        'action_detected': '물품 가방에 넣기',
        'location': '매장 중앙',
        'age': 35,
        'gender': 'male'
    }
]
response = bedrock.format_timeline_response(
    prompt="도난 사건이 있었나요?",
    events=events,
    video_name="매장 CCTV"
)
print(response)
```

### 2. 엔드투엔드 테스트

```bash
# 비디오 업로드
curl -X POST http://localhost:8088/api/videos/ \
  -F "file=@test_video.mp4" \
  -F "name=테스트 비디오"

# 프롬프트 테스트
curl -X POST http://localhost:8088/api/prompt/ \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "이상 행동이 감지된 시간을 알려줘",
    "video_id": 1
  }'
```

## 비용 최적화

### Bedrock 요금

- **Claude 3 Sonnet**:
  - 입력: $0.003 per 1K tokens
  - 출력: $0.015 per 1K tokens
- **예상 비용**: 프롬프트 1개당 약 $0.001 ~ $0.005

### 최적화 팁

1. **캐싱**: 동일한 프롬프트는 결과 캐싱
2. **배치 처리**: 여러 이벤트를 한 번에 처리
3. **폴백 전략**: 간단한 쿼리는 기존 방식 사용

```python
# settings.py에서 전략 선택
USE_BEDROCK = env('USE_BEDROCK', default='true').lower() == 'true'
```

## 문제 해결

### 1. Bedrock 모델 액세스 오류

```
Error: AccessDeniedException
```

**해결**: AWS Console에서 Bedrock Model Access를 활성화하세요.

### 2. IAM 권한 오류

```
Error: User is not authorized to perform: bedrock:InvokeModel
```

**해결**: ECS Task Role에 Bedrock 권한이 있는지 확인하세요.

### 3. 리전 오류

```
Error: Model not available in region
```

**해결**: Claude 3는 `us-east-1`, `us-west-2`, `ap-northeast-1` 등에서 사용 가능합니다.
`AWS_BEDROCK_REGION`을 적절히 설정하세요.

### 4. 폴백 모드 사용

Bedrock이 작동하지 않을 경우 기존 FastAPI로 자동 전환:

```bash
# 환경 변수 설정
USE_BEDROCK=false
```

## 모니터링

### CloudWatch Logs

Bedrock 호출 로그는 ECS Task의 CloudWatch Logs에서 확인:

```
🤖 Bedrock Text2SQL 사용
✅ Bedrock이 생성한 SQL: SELECT timestamp FROM db_event WHERE ...
✅ 쿼리 결과: 3개 발견
🤖 Bedrock RAG를 통해 응답 생성
```

### 비용 모니터링

AWS Cost Explorer에서 Bedrock 사용량 확인:

- 서비스: Amazon Bedrock
- 리전별 사용량
- 모델별 요청 수

## GitHub Actions에서의 Bedrock 활용

GitHub Actions CI/CD 파이프라인에서 Bedrock을 활용하여 자동화된 분석 및 인사이트를 제공합니다.

### 1. Terraform Plan 분석 (`terraform.yml`)

#### 개요

Terraform Plan 결과를 Bedrock Claude가 분석하여 변경사항을 요약하고 리스크를 평가합니다.

#### 주요 기능

- **성공 시**: 변경사항 요약, 비용 영향 분석, 승인 권장사항 제공
- **실패 시**: 실패 원인 분석, 구체적인 해결 방법 제시, 체크리스트 제공
- **자동 Issue 생성**: 분석 결과를 GitHub Issue로 자동 생성

#### 워크플로우 구성

```yaml
# .github/workflows/terraform.yml

- name: Analyze Terraform Plan with Bedrock
  if: always()
  id: bedrock-analysis
  run: |
    pip install boto3

    python3 -c "
    import json
    import os
    import boto3

    def read_file_safe(path):
        try:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8', errors='replace') as f:
                    return f.read()[:8000]  # 토큰 제한 고려
        except Exception as e:
            return f'Error reading file: {str(e)}'
        return 'No log found'

    plan_output = read_file_safe('/tmp/terraform_plan_output.txt')
    plan_readable = read_file_safe('/tmp/terraform_plan_readable.txt')

    fmt_outcome = '${{ steps.fmt.outcome }}'
    init_outcome = '${{ steps.init.outcome }}'
    plan_outcome = '${{ steps.plan.outcome }}'

    # Plan 실패 시 프롬프트
    if plan_outcome == 'failure' or init_outcome == 'failure' or fmt_outcome == 'failure':
        prompt = f'''You are a Terraform expert. Analyze the failure and provide solutions in Korean.

    **Format Check:** {fmt_outcome}
    **Init Check:** {init_outcome}
    **Plan Check:** {plan_outcome}

    **Plan Output:**
    {plan_output}

    **Detailed Plan:**
    {plan_readable}

    Please provide:
    1. 🔴 **실패 원인**: 무엇이 잘못되었는지
    2. 💡 **해결 방법**: 구체적인 수정 방법 (코드 예시 포함)
    3. 📌 **체크리스트**: 확인해야 할 사항들

    답변은 명확하고 실행 가능한 한국어로 작성해주세요.
    '''
    else:
        # Plan 성공 시 프롬프트
        prompt = f'''You are a Terraform expert. Analyze the successful plan and summarize changes in Korean.

    **Plan Output:**
    {plan_output}

    **Detailed Plan:**
    {plan_readable}

    Please provide:
    1. 📊 **변경 요약**: 
       - 생성될 리소스 (create)
       - 수정될 리소스 (update/change)
       - 삭제될 리소스 (destroy) ⚠️ **굵게 강조**

    2. 💰 **비용 영향**: 예상되는 비용 변화

    3. ⚠️ **주의사항**: 
       - Destroy가 있다면 **강력하게 경고**
       - 중요한 인프라 변경사항
       - 다운타임 가능성

    4. ✅ **승인 권장사항**: 이 변경을 승인해도 되는지 의견

    답변은 명확하고 구조화된 한국어로 작성해주세요.
    '''

    payload = {
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 3000,
        'messages': [{'role': 'user', 'content': prompt}]
    }

    try:
        client = boto3.client('bedrock-runtime', region_name='ap-northeast-2')
        response = client.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps(payload, ensure_ascii=False)
        )
        
        result = json.loads(response['body'].read())
        summary = result['content'][0]['text']
        
        with open('/tmp/bedrock_terraform_analysis.txt', 'w', encoding='utf-8') as f:
            f.write(summary)
        print('✅ Bedrock analysis complete.')
        
    except Exception as e:
        print(f'❌ Bedrock failed: {str(e)}')
        with open('/tmp/bedrock_terraform_analysis.txt', 'w', encoding='utf-8') as f:
            f.write(f'AI 분석 실패: {str(e)}')
    "

- name: Create Terraform Analysis Issue
  if: always()
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      let analysis = "Bedrock 분석을 사용할 수 없습니다.";
      try {
        analysis = fs.readFileSync('/tmp/bedrock_terraform_analysis.txt', 'utf8');
      } catch (e) {
        console.log("No bedrock analysis found");
      }

      // GitHub Issue 생성 로직...
```

#### 사용 모델

- **모델**: `anthropic.claude-3-haiku-20240307-v1:0`
- **리전**: `ap-northeast-2` (서울)
- **Max Tokens**: 3000

#### 출력 예시

**성공 시:**

```markdown
📊 **변경 요약**

- 생성될 리소스: 5개 (ECS Task Definition, Security Group Rules 등)
- 수정될 리소스: 2개 (ALB Target Group, IAM Role)
- 삭제될 리소스: ⚠️ **0개**

💰 **비용 영향**
예상 월 비용 증가: 약 $15 (ECS Task CPU/Memory 증가)

⚠️ **주의사항**

- ECS Task Definition 변경으로 재배포 필요 (다운타임 ~2분)
- Security Group 규칙 변경 시 네트워크 연결 일시 중단 가능

✅ **승인 권장사항**
변경사항이 안전하며 승인을 권장합니다.
```

**실패 시:**

```markdown
🔴 **실패 원인**
Terraform state lock 충돌이 발생했습니다.

💡 **해결 방법**

1. DynamoDB에서 lock 상태 확인:
   aws dynamodb get-item --table-name terraform-state-lock --key '{"LockID": {"S": "..."}}'

2. 수동으로 lock 해제:
   terraform force-unlock <LOCK_ID>

📌 **체크리스트**

- [ ] 다른 terraform 프로세스가 실행 중인지 확인
- [ ] DynamoDB 테이블 접근 권한 확인
- [ ] State 파일 백업 상태 확인
```

### 2. 배포 실패 분석 (`deploy.yml`)

#### 개요

배포 실패 시 빌드 로그, 보안 스캔 로그, CloudWatch 런타임 로그를 종합적으로 분석합니다.

#### 주요 기능

- **다층 로그 분석**: 빌드/보안/런타임 로그 통합 분석
- **근본 원인 파악**: AI 기반 자동 진단
- **자동 Issue 생성**: 실패 원인 및 해결 방법을 Issue로 생성

#### 워크플로우 구성

```yaml
# .github/workflows/deploy.yml

- name: Summarize logs with Bedrock
  if: failure()
  id: bedrock-summary
  run: |
    pip install boto3

    python3 -c "
    import json
    import os
    import boto3

    def read_file_safe(path):
        try:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8', errors='replace') as f:
                    return f.read()[:5000] # 토큰 제한으로 5000자 자름
        except Exception as e:
            return f'Error reading file: {str(e)}'
        return 'No log found'

    # 1. GitHub Actions Build Logs (빌드 에러)
    front_build_log = read_file_safe('/tmp/front_build.log')
    back_build_log = read_file_safe('/tmp/back_build.log')

    # 2. Trivy Security Logs (보안 에러)
    trivy_front = read_file_safe('/tmp/trivy_front_log.txt')
    trivy_back = read_file_safe('/tmp/trivy_back_log.txt')

    # 3. CloudWatch Logs (런타임 에러)
    front_cw = read_file_safe('/tmp/frontend_cw_logs.txt')
    back_cw = read_file_safe('/tmp/backend_cw_logs.txt')

    code_changes = read_file_safe('/tmp/code_changes.diff')

    prompt = f'''You are a DevOps expert. Analyze the failure.
    Use Korean.

    [Code Changes]
    {code_changes}

    [Build Logs (Docker/Build Error)]
    Frontend Build: {front_build_log}
    Backend Build: {back_build_log}

    [Security Scan Logs (Trivy)]
    Frontend Security: {trivy_front}
    Backend Security: {trivy_back}

    [Runtime Logs (CloudWatch)]
    Frontend Runtime: {front_cw}
    Backend Runtime: {back_cw}

    Summarize the root cause based on the logs above.
    '''

    payload = {
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 2000,
        'messages': [{'role': 'user', 'content': prompt}]
    }

    try:
        client = boto3.client('bedrock-runtime', region_name='${{ env.AWS_REGION }}')
        response = client.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps(payload, ensure_ascii=False)
        )
        
        result = json.loads(response['body'].read())
        summary = result['content'][0]['text']
        
        with open('/tmp/bedrock_summary.txt', 'w', encoding='utf-8') as f:
            f.write(summary)
        print('✅ Bedrock analysis complete.')
        
    except Exception as e:
        print(f'❌ Bedrock failed: {str(e)}')
        with open('/tmp/bedrock_summary.txt', 'w', encoding='utf-8') as f:
            f.write(f'AI Analysis Failed: {str(e)}')
    "

- name: Create deployment failure issue
  if: failure()
  uses: actions/github-script@v7
  # Issue 생성 로직...
```

#### 분석 레이어

| 레이어            | 로그 파일                                   | 목적                        |
| ----------------- | ------------------------------------------- | --------------------------- |
| **빌드 레이어**   | `front_build.log`, `back_build.log`         | Docker 빌드 에러 감지       |
| **보안 레이어**   | `trivy_front_log.txt`, `trivy_back_log.txt` | 취약점 스캔 결과 분석       |
| **런타임 레이어** | CloudWatch Logs                             | ECS 컨테이너 실행 에러 추적 |
| **코드 변경**     | `code_changes.diff`                         | 최근 변경사항 컨텍스트      |

#### 사용 모델

- **모델**: `anthropic.claude-3-haiku-20240307-v1:0`
- **리전**: 동적 (`${{ env.AWS_REGION }}`)
- **Max Tokens**: 2000

#### 출력 예시

````markdown
## 🔍 근본 원인 분석

### 1️⃣ 빌드 단계 (Docker Build)

- ✅ Frontend: 정상 빌드
- ❌ Backend: psycopg2 설치 실패
  - 원인: PostgreSQL development headers 누락
  - 해결: Dockerfile에 `postgresql-dev` 추가 필요

### 2️⃣ 보안 스캔 (Trivy)

- ⚠️ Frontend: 1개의 HIGH 취약점 발견 (CVE-2024-XXXX)
- ✅ Backend: 보안 문제 없음

### 3️⃣ 런타임 (CloudWatch)

- 로그 없음 (컨테이너가 시작되지 않음)

## 💡 해결 방법

**backend/Dockerfile 수정:**

```dockerfile
RUN apk add --no-cache \
    postgresql-dev \
    gcc \
    musl-dev
```
````

## 📋 체크리스트

- [ ] Dockerfile의 dependencies 확인
- [ ] 로컬 환경에서 Docker 빌드 테스트
- [ ] requirements.txt 버전 호환성 확인

````

### 3. GitHub Actions 권한 설정

#### IAM Role/User 권한

GitHub Actions에서 Bedrock을 사용하려면 다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-runtime:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:ap-northeast-2::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
      ]
    }
  ]
}
````

#### Secrets 설정

GitHub Repository Settings → Secrets and variables → Actions에 추가:

```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2  # 또는 사용하는 리전
```

### 4. 비용 및 성능

#### GitHub Actions에서의 Bedrock 비용

| 워크플로우      | 호출 빈도 | 평균 토큰   | 월 예상 비용  |
| --------------- | --------- | ----------- | ------------- |
| `terraform.yml` | ~10회/월  | 2000 tokens | ~$0.10        |
| `deploy.yml`    | ~20회/월  | 1500 tokens | ~$0.15        |
| **합계**        | -         | -           | **~$0.25/월** |

> 💡 **Haiku 모델 사용 이유**: 빠른 응답 속도 + 저렴한 비용 (Sonnet 대비 5배 저렴)

#### 성능 최적화

1. **토큰 제한**: 로그 파일을 5000~8000자로 제한하여 비용 절감
2. **조건부 실행**: `if: failure()` 또는 `if: always()` 조건으로 필요할 때만 실행
3. **캐싱**: 분석 결과를 파일로 저장하여 재사용

### 5. 트러블슈팅

#### Bedrock 호출 실패

```
❌ Bedrock failed: An error occurred (AccessDeniedException)
```

**해결 방법:**

1. IAM 권한 확인
2. Bedrock Model Access 활성화 확인
3. 리전 설정 확인 (Claude Haiku는 일부 리전에서만 사용 가능)

#### 토큰 제한 초과

```
❌ Bedrock failed: Input is too long
```

**해결 방법:**

- `read_file_safe()` 함수의 문자 수 제한 조정
- 로그 파일을 더 작게 자르기 (현재 5000~8000자)

#### 분석 결과가 Issue에 반영 안 됨

**해결 방법:**

- `/tmp/bedrock_*.txt` 파일이 정상 생성되었는지 확인
- GitHub Actions Artifacts에서 로그 확인

### 6. 모범 사례

1. **구조화된 프롬프트 사용**
   - 명확한 섹션 구분 (원인, 해결, 체크리스트)
   - 한국어/영어 명시적 지정

2. **에러 핸들링**
   - `try-except`로 Bedrock 실패 시 폴백 메시지 제공
   - 분석 실패 시에도 워크플로우 계속 진행

3. **로그 수집 표준화**
   - `read_file_safe()` 함수로 안전한 파일 읽기
   - UTF-8 인코딩 에러 처리 (`errors='replace'`)

4. **비용 관리**
   - Haiku 모델 사용으로 비용 최소화
   - 토큰 제한으로 과도한 비용 방지

## 다음 단계

1. **Knowledge Base 구축**:
   - 과거 이벤트 데이터를 Knowledge Base에 저장
   - 더 정확한 컨텍스트 제공

2. **프롬프트 최적화**:
   - Few-shot 예시 추가
   - 도메인 특화 프롬프트 템플릿

3. **성능 개선**:
   - 응답 캐싱
   - 스트리밍 응답 (InvokeModelWithResponseStream)

4. **다국어 지원**:
   - Claude의 다국어 능력 활용
   - 자동 언어 감지 및 응답

## 참고 자료

- [AWS Bedrock 문서](https://docs.aws.amazon.com/bedrock/)
- [Claude 3 모델 가이드](https://docs.anthropic.com/claude/docs)
- [Bedrock 요금](https://aws.amazon.com/bedrock/pricing/)
- [boto3 Bedrock 문서](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/bedrock-runtime.html)
