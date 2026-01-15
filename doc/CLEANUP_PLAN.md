# Terraform 정리 계획

## 현재 문제점

### 1. 중복된 IAM Role

- `batch.tf`: `ecs_instance_role` (ECS GPU에서 사용 중)
- `batch-memi-gpu.tf`: `batch_instance_role` (Batch에서 사용 중)

### 2. 불필요한 리소스

- `data.aws_ami.ecs_gpu` in batch.tf (사용 안 함)
- `aws_cloudwatch_log_group.batch_video_processor` (gpu_video_processing 제거됨)

### 3. 파일 구조

- `batch.tf`: 너무 많은 공통 리소스 포함
- IAM 역할들이 여러 파일에 분산

## 정리 옵션

### Option A: 최소 변경 (안전)

**장점:** 운영 중인 리소스 영향 없음
**단점:** 중복 유지

1. 불필요한 리소스만 제거
   - `data.aws_ami.ecs_gpu` 삭제
   - `aws_cloudwatch_log_group.batch_video_processor` 삭제
2. 주석 정리
3. 문서화

### Option B: IAM 통합 (권장)

**장점:** 깔끔한 구조
**단점:** Terraform state 조작 필요

1. Option A 실행
2. `batch_instance_role`을 `ecs_instance_role`로 통합
3. Terraform state move 사용
4. 두 파일에서 모두 참조하도록 수정

### Option C: 파일 재구성 (대규모)

**장점:** 완벽한 구조
**단점:** 시간 소요, 위험

1. `iam-batch.tf` 새로 생성 (모든 Batch IAM 통합)
2. `batch-common.tf` (공통 리소스)
3. `batch-gpu.tf` (GPU 전용)

## 추천: Option A (지금 당장)

현재 운영 중이고 빠른 개발이 목표이므로:

1. ✅ 불필요한 리소스 제거
2. ✅ 주석 정리
3. ✅ 포맷팅 완료됨
4. ⏭️ IAM 통합은 다음 기회에

## 즉시 실행 가능한 정리

```bash
# 1. 불필요한 data source 제거
# batch.tf에서 data.aws_ami.ecs_gpu 삭제

# 2. 사용 안 하는 Log Group 제거
# aws_cloudwatch_log_group.batch_video_processor 삭제

# 3. 검증
terraform plan
```

## 나중에 할 일 (프로젝트 끝난 후)

- [ ] IAM Role 통합 (batch_instance_role → ecs_instance_role)
- [ ] 파일 재구성
- [ ] outputs.tf 분리
- [ ] variables 정리
