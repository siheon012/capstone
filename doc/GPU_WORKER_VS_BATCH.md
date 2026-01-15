# GPU Worker vs AWS Batch 비교

## ⚠️ 현재 선택: AWS Batch 사용

이 프로젝트는 **AWS Batch**를 영상 처리 시스템으로 사용합니다.

## 📁 디렉토리 설명

### ✅ 사용 중: `batch/`

- **목적**: AWS Batch 기반 서버리스 영상 처리
- **실행 환경**: AWS Batch (Fargate)
- **트리거**: Lambda → SQS → Batch Job
- **장점**: 자동 스케일링, 비용 효율적, 운영 간편
- **상태**: ✅ **활성 사용 중**

### 📦 보관됨: `gpu_worker/`

- **목적**: EC2 GPU 인스턴스 기반 영상 처리
- **실행 환경**: EC2 GPU 인스턴스
- **트리거**: 직접 SQS Polling
- **장점**: GPU 직접 제어, 낮은 레이턴시
- **상태**: ⚠️ **현재 사용 안 함** (참고용 보관)

## 🔄 왜 AWS Batch를 선택했는가?

### 비용 비교

| 항목                       | GPU Worker (EC2)                           | AWS Batch (Fargate)                     |
| -------------------------- | ------------------------------------------ | --------------------------------------- |
| GPU 인스턴스 (g4dn.xlarge) | ~$0.526/시간 × 24시간 × 30일 = **$378/월** | 사용량 기반 (예: 1시간/일 → **$16/월**) |
| 관리 오버헤드              | EC2 관리, 모니터링, 스케일링               | 완전 관리형                             |
| 초기 비용                  | 높음                                       | 없음                                    |

### 기능 비교

| 기능          | GPU Worker   | AWS Batch          |
| ------------- | ------------ | ------------------ |
| 자동 스케일링 | ❌ 수동      | ✅ 자동            |
| 실패 재시도   | ⚠️ 수동 구현 | ✅ 내장            |
| 모니터링      | ⚠️ 직접 설정 | ✅ CloudWatch 통합 |
| 배포          | ⚠️ EC2 관리  | ✅ ECR 이미지만    |
| 비용 최적화   | ❌ 항상 실행 | ✅ 사용시만 과금   |

## 🚀 현재 아키텍처

```
사용자 비디오 업로드 (Django)
         ↓
    S3 raw_videos 버킷
         ↓
  S3 ObjectCreated Event
         ↓
    SQS Main Queue
         ↓
   Lambda 트리거 (sqs_to_batch)
         ↓
   AWS Batch Job 제출
         ↓
  Batch Container 실행 (Fargate)
    - SQS 메시지 처리
    - FastAPI 분석 서비스 호출
         ↓
    FastAPI 분석 처리
    - AI 영상 분석
    - 썸네일 S3 저장
    - 결과 PostgreSQL+pgvector 저장
         ↓
  완료: SQS 메시지 삭제
  실패: DLQ로 이동
```

## 📝 GPU Worker를 사용하려면?

만약 나중에 GPU Worker를 사용하고 싶다면:

1. **EC2 GPU 인스턴스 생성**

   ```bash
   # g4dn.xlarge 또는 g4dn.2xlarge 권장
   ```

2. **환경 설정**

   ```bash
   cd gpu_worker
   pip install -r requirements.txt
   ```

3. **워커 실행**

   ```bash
   ./start_worker.sh
   # 또는
   python video_processor.py
   ```

4. **AWS Batch 비활성화**
   - Lambda 트리거 삭제
   - Batch Job Definition 비활성화

## 🎯 결론

- ✅ **현재 사용**: `batch/` (AWS Batch)
- 📦 **보관**: `gpu_worker/` (참고용)
- 🚫 **사용 안 함**: GPU Worker

## 🔗 관련 문서

- [AWS Batch SQS Guide](./AWS_BATCH_SQS_GUIDE.md)
- [SQS Batch Deployment](./SQS_BATCH_DEPLOYMENT.md)
- [Batch PGVector Architecture](./BATCH_PGVECTOR_ARCHITECTURE.md)
