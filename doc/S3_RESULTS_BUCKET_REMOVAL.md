# S3 Results 버킷 제거 가이드

## 📋 변경 사항

### 제거된 리소스

- **S3 Bucket**: `capstone-dev-results`
- **이유**: 모든 분석 결과가 PostgreSQL + pgvector에 저장되므로 불필요

### 영향받는 Terraform 파일

1. `terraform/s3.tf` - results 버킷 정의 제거
2. `terraform/iam.tf` - ECS Task Role에서 results 버킷 권한 제거

### 변경 전 아키텍처

```
FastAPI 분석 → S3 results 버킷 (❌)
             → PostgreSQL + pgvector (✅)
```

### 변경 후 아키텍처

```
FastAPI 분석 → PostgreSQL + pgvector만 사용 (✅)
```

## 🚀 적용 방법

### 1단계: Terraform Plan 확인

```bash
cd e:\capstone\terraform
terraform plan
```

**예상 결과**:

- 4개 리소스 삭제
- 5개 리소스 수정 (IAM 정책)

### 2단계: Terraform Apply

```bash
terraform apply
```

**확인 메시지**: `yes` 입력

### 3단계: 검증

```bash
# S3 버킷 목록 확인 (results 버킷이 없어야 함)
aws s3 ls | grep capstone

# 예상 결과:
# capstone-dev-raw (있음)
# capstone-dev-videos (있음)
# capstone-dev-results (없음) ✅
```

## ⚠️ 주의사항

### 기존 데이터 백업

만약 `capstone-dev-results` 버킷에 중요한 데이터가 있다면:

```bash
# 백업 (선택사항)
aws s3 sync s3://capstone-dev-results ./backup-results/

# 확인 후 삭제
terraform apply
```

### 롤백 방법

만약 다시 results 버킷이 필요하면:

```bash
# Git에서 이전 버전 복원
git checkout HEAD~1 terraform/s3.tf terraform/iam.tf

# 다시 apply
terraform apply
```

## ✅ 삭제 후 확인사항

- [ ] S3 버킷 목록에서 results 버킷 사라짐
- [ ] IAM 정책에서 results 버킷 권한 제거됨
- [ ] ECS 서비스 정상 작동 (영향 없음)
- [ ] Batch Job Definition 업데이트됨

## 💰 비용 절감

**예상 절감액**:

- S3 저장 비용: $0.023/GB/월
- S3 요청 비용: $0.0004/1000 PUT 요청
- 작지만 불필요한 리소스 제거로 깔끔한 아키텍처 유지

## 🔗 관련 문서

- `BATCH_PGVECTOR_ARCHITECTURE.md` - 올바른 아키텍처 설명
- `AWS_BATCH_SQS_GUIDE.md` - Batch 파이프라인 가이드
