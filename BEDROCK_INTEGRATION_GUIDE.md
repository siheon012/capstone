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
