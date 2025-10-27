# AWS Bedrock 통합 요약

## 🎯 주요 변경 사항

### 1. **Text2SQL 엔진 교체**

- **이전**: FastAPI Text2SQL 모델
- **현재**: AWS Bedrock Claude 3 Sonnet
- **장점**:
  - 더 정확한 SQL 생성
  - 한국어 지원 향상
  - 인프라 관리 불필요
  - 확장성 및 안정성

### 2. **RAG 시스템 추가**

- 검색된 데이터를 자연어로 정리
- 사용자 친화적인 응답 생성
- 타임라인 정보를 스토리텔링 형식으로 제공

### 3. **플로우 변경**

```
[기존]
프롬프트 → FastAPI Text2SQL → PostgreSQL → 후처리 → JSON 응답

[Bedrock]
프롬프트 → Bedrock Claude (Text2SQL) → PostgreSQL →
         → Bedrock Claude (RAG) → 자연어 응답
```

## 📦 설치된 패키지

```
langchain==0.3.13
langchain-aws==0.2.6
langchain-community==0.3.13
```

## 🔑 필요한 AWS 설정

### 1. Bedrock Model Access 활성화

AWS Console > Bedrock > Model Access에서:

- ✅ **Claude 3 Sonnet** (`anthropic.claude-3-sonnet-20240229-v1:0`)
- ✅ **Titan Embeddings** (선택사항)

### 2. IAM 권한 (이미 Terraform에 포함됨)

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream",
    "bedrock:Retrieve",
    "bedrock:RetrieveAndGenerate"
  ],
  "Resource": "*"
}
```

## 🚀 사용 방법

### 환경 변수 설정

```bash
# .env 파일
USE_BEDROCK=true
AWS_BEDROCK_REGION=ap-northeast-2
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# AWS 자격 증명 (로컬 개발용)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

### API 호출 예시

```bash
curl -X POST http://localhost:8088/api/prompt/ \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "10분에서 15분 사이에 이상 행동이 있었나요?",
    "video_id": 1
  }'
```

### 응답 예시

```json
{
  "response": "네, 12분 30초에 도난 이벤트가 감지되었습니다. 해당 시각에 남성(약 35세)이 매장 중앙 진열대 부근에서 물품을 가방에 넣는 행동이 포착되었습니다. 신뢰도 95.3%로 도난 행동으로 분류되었습니다.",
  "timestamp": 750,
  "event_id": 42
}
```

## 📊 비용 예상

### Bedrock 요금 (Claude 3 Sonnet)

- **입력**: $0.003 per 1K tokens
- **출력**: $0.015 per 1K tokens
- **예상**: 프롬프트 1개당 약 $0.001 ~ $0.005

### 월간 예상 비용 (1,000 프롬프트 기준)

- **Bedrock**: ~$3-5
- **기존 FastAPI**: EC2 인스턴스 비용 ~$30-50
- **절감액**: ~$25-45/월

## 🔄 폴백 전략

Bedrock이 작동하지 않을 경우 자동으로 FastAPI로 전환:

```bash
USE_BEDROCK=false
```

## 📁 파일 구조

```
back/
├── apps/
│   └── api/
│       ├── bedrock_service.py   # 새로 추가
│       └── views.py              # 수정됨
├── core/
│   └── settings.py               # Bedrock 설정 추가
└── requirements.txt              # langchain 패키지 추가

terraform/
└── ecs-fargate.tf                # Bedrock IAM 권한 추가

docker-compose.yml                 # Bedrock 환경 변수 추가
docker-compose.prod.yml            # Bedrock 환경 변수 추가
```

## 🧪 테스트

### 로컬 테스트

```bash
# Django shell
python manage.py shell

from apps.api.bedrock_service import get_bedrock_service

bedrock = get_bedrock_service()

# Text2SQL 테스트
result = bedrock.text_to_sql("10분 이후의 이벤트를 찾아줘", video_id=1)
print(result['sql'])

# RAG 테스트
events = [{'timestamp': 750, 'event_type': 'theft', ...}]
response = bedrock.format_timeline_response("도난 사건이 있었나요?", events, "테스트 비디오")
print(response)
```

## 📚 문서

상세한 가이드는 `BEDROCK_INTEGRATION_GUIDE.md` 참조

## ⚠️ 주의사항

1. **리전 제약**: Claude 3는 특정 리전에서만 사용 가능

   - `us-east-1`, `us-west-2`, `ap-northeast-1`, `eu-west-1` 등
   - 한국 리전(`ap-northeast-2`)에서 사용 시 리전 간 데이터 전송 비용 발생 가능

2. **Model Access**: AWS Console에서 Bedrock Model Access를 먼저 활성화해야 함

3. **폴백 전략**: 중요한 서비스에는 FastAPI 폴백 옵션 유지 권장

## 🔜 다음 단계

1. **Knowledge Base 구축**

   - 과거 이벤트 데이터 임베딩
   - 더 정확한 컨텍스트 제공

2. **프롬프트 최적화**

   - Few-shot 예시 추가
   - 도메인 특화 템플릿

3. **성능 개선**

   - 응답 캐싱
   - 스트리밍 응답

4. **다국어 지원**
   - 자동 언어 감지
   - 다국어 응답 생성
