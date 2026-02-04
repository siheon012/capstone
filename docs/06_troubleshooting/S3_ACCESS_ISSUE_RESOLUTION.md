# S3 비디오 접근 문제 해결 가이드

## 작성일
2026-01-03

## 문제 정의

### 1. S3 영상이 웹에 표시되지 않는 문제
**증상:**
- 프론트엔드에서 업로드된 비디오 목록이 표시되지 않음
- `api.deepsentinel.cloud/db/videos/` API 호출 시 500 Internal Server Error 발생
- S3 버킷에는 영상과 썸네일이 정상적으로 존재하지만 웹에서 접근 불가

**발생 시점:**
- 2026-01-02, 배포 전부터 문제 발생
- 2~3일 전까지는 정상 작동했으나 갑자기 에러 발생

### 2. Auto-scaling으로 인한 서비스 인스턴스 증가
**증상:**
- Frontend ECS 서비스의 desired count가 1에서 3으로 증가
- Terraform state와 실제 환경 간의 불일치 의심

**발생 시점:**
- 2026-01-02 21:08

---

## 원인 분석

### 1. S3 버킷 정책 누락

**근본 원인:**
```bash
# S3 버킷 정책 조회 시
aws s3api get-bucket-policy --bucket capstone-dev-raw
# Error: NoSuchBucketPolicy
```

- S3 버킷에 public access policy가 **완전히 삭제**됨
- Terraform state에 `aws_s3_bucket_policy` 리소스가 존재하지 않았음
  ```bash
  terraform state list | grep "bucket_policy"
  # (결과 없음)
  ```
- 2~3일 전에는 AWS 콘솔에서 **수동으로** 버킷 정책을 추가했을 가능성
- 해당 수동 정책이 어떤 이유로 삭제됨 (추정)

**S3 버킷 설정 문제:**
```terraform
# terraform/s3.tf
resource "aws_s3_bucket_public_access_block" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  block_public_acls       = true
  block_public_policy     = true    # ← 문제
  ignore_public_acls      = true
  restrict_public_buckets = true    # ← 문제
}
```

- `block_public_policy=true`로 설정되어 있어 버킷 정책 추가 불가
- 웹 브라우저에서 S3 객체에 직접 접근할 수 없는 상태

### 2. Django Serializer의 S3 URL 생성 실패

**증상:**
```python
# back/apps/db/serializers.py - VideoSerializer
def get_current_s3_url(self, obj):
    # presigned URL 생성 시도 → 실패
    # 예외 처리 없이 None 반환 → 500 에러
```

**원인:**
- S3 버킷 정책이 없어서 presigned URL 생성도 실패
- Serializer에서 예외 처리가 없어 에러가 API 레벨까지 전파
- 전체 `/db/videos/` API가 500 에러로 크래시

### 3. Auto-scaling 정상 동작 (문제 아님)

**확인 결과:**
```bash
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/capstone-cluster/capstone-frontend-service

# 결과:
# 2026-01-02T21:08:19 - Setting desired count to 3
# 원인: CPU 사용률 증가로 인한 AlarmHigh 트리거
```

**결론:**
- Auto-scaling 정책이 정상 작동한 것
- Terraform state 충돌이 아님
- S3 backend를 사용하고 있어 동시 apply는 불가능 (state lock)

---

## 해결 방법

### 1. S3 버킷 정책 추가

#### Step 1: Public Access Block 설정 변경
```terraform
# terraform/s3.tf
resource "aws_s3_bucket_public_access_block" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  block_public_acls       = true
  block_public_policy     = false  # 변경: 버킷 정책 허용
  ignore_public_acls      = true
  restrict_public_buckets = false  # 변경: 버킷 정책 허용
}
```

#### Step 2: S3 버킷 정책 리소스 추가
```terraform
# terraform/s3.tf
resource "aws_s3_bucket_policy" "raw_videos" {
  bucket = aws_s3_bucket.raw_videos.id

  depends_on = [aws_s3_bucket_public_access_block.raw_videos]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.raw_videos.arn}/*"
        Condition = {
          StringLike = {
            "aws:Referer" = [
              "https://deepsentinel.cloud/*",
              "https://www.deepsentinel.cloud/*"
            ]
          }
        }
      }
    ]
  })
}
```

**보안 강화:**
- `aws:Referer` 조건으로 deepsentinel.cloud에서만 접근 허용
- 무분별한 public access 방지

#### Step 3: Thumbnails 버킷도 동일하게 적용
```terraform
# terraform/s3.tf
resource "aws_s3_bucket_public_access_block" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "thumbnails" {
  bucket = aws_s3_bucket.thumbnails.id

  depends_on = [aws_s3_bucket_public_access_block.thumbnails]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.thumbnails.arn}/*"
        Condition = {
          StringLike = {
            "aws:Referer" = [
              "https://deepsentinel.cloud/*",
              "https://www.deepsentinel.cloud/*"
            ]
          }
        }
      }
    ]
  })
}
```

#### Step 4: Terraform 적용
```bash
cd terraform
terraform plan
terraform apply -auto-approve
```

**결과:**
```
Plan: 3 to add, 2 to change, 1 to destroy.

# 적용 완료
aws_s3_bucket_policy.raw_videos: Creation complete
aws_s3_bucket_policy.thumbnails: Creation complete
```

### 2. Django Serializer 개선 (이미 적용됨)

#### 기존 코드 문제
```python
# back/apps/db/serializers.py
def get_current_s3_url(self, obj):
    s3_key = obj.get_current_s3_key()
    return self._generate_s3_url(s3_key)  # 실패 시 None → 500 에러
```

#### 개선된 코드 (Fallback 로직 추가)
```python
# back/apps/db/serializers.py
def get_current_s3_url(self, obj):
    try:
        if hasattr(obj, 'get_current_s3_key'):
            s3_url = self._generate_s3_url(obj.get_current_s3_key())
            if s3_url:
                return s3_url
        
        # Fallback: S3 공개 URL
        bucket_name = settings.AWS_STORAGE_BUCKET_NAME
        region = settings.AWS_S3_REGION_NAME
        s3_key = obj.get_current_s3_key()
        return f"https://{bucket_name}.s3.{region}.amazonaws.com/{s3_key}"
    
    except Exception as e:
        print(f"⚠️ current_s3_url 생성 실패: {e}")
        return None
```

**장점:**
- Presigned URL 생성 실패 시 공개 URL로 fallback
- 예외 처리로 API 전체 크래시 방지
- 디버깅을 위한 에러 로깅 추가

---

## 검증

### 1. S3 버킷 정책 확인
```bash
aws s3api get-bucket-policy --bucket capstone-dev-raw \
  --query Policy --output text | jq .

# 결과:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::capstone-dev-raw/*",
      "Condition": {
        "StringLike": {
          "aws:Referer": [
            "https://deepsentinel.cloud/*",
            "https://www.deepsentinel.cloud/*"
          ]
        }
      }
    }
  ]
}
```

### 2. API 응답 확인
```bash
curl -I https://api.deepsentinel.cloud/db/videos/

# 결과:
HTTP/2 200 OK
Content-Type: application/json
```

### 3. 웹에서 비디오 확인
- `https://deepsentinel.cloud/uploaded_video` 페이지 접속
- 업로드된 비디오 목록 정상 표시
- 썸네일 정상 로드
- 비디오 재생 정상 작동

---

## 교훈 및 권장 사항

### 1. Terraform으로 모든 인프라 관리
**문제:**
- AWS 콘솔에서 수동으로 변경한 리소스는 Terraform state와 불일치 발생
- 누군가 콘솔에서 삭제하면 추적 불가능

**권장 사항:**
```bash
# 모든 인프라 변경은 Terraform으로만 수행
terraform plan   # 변경 사항 미리 확인
terraform apply  # 변경 적용
```

### 2. S3 접근 제어 전략

**옵션 1: Presigned URL (기존 방식)**
- 장점: 완전 private 유지, 시간 제한 URL
- 단점: 백엔드 부하, URL 생성 실패 시 서비스 중단

**옵션 2: Referer 기반 Public Policy (현재 적용)**
- 장점: 백엔드 부하 없음, 단순함
- 단점: Referer 헤더 위조 가능 (보안 약화)

**옵션 3: CloudFront + OAI (권장)**
```terraform
# CloudFront를 통해서만 S3 접근 허용
# - 더 안전한 접근 제어
# - CDN 캐싱으로 성능 향상
# - DDoS 방어
```

### 3. Serializer 예외 처리 필수

**나쁜 예:**
```python
def get_url(self, obj):
    return generate_url(obj)  # 실패 시 500 에러
```

**좋은 예:**
```python
def get_url(self, obj):
    try:
        return generate_url(obj)
    except Exception as e:
        logger.error(f"URL generation failed: {e}")
        return None  # 또는 fallback URL
```

### 4. Auto-scaling 모니터링

**정상 동작 확인 방법:**
```bash
# Scaling 활동 이력 확인
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/capstone-cluster/capstone-frontend-service \
  --max-results 5

# CloudWatch Alarm 확인
aws cloudwatch describe-alarms \
  --alarm-name-prefix TargetTracking
```

---

## 관련 파일

- `terraform/s3.tf` - S3 버킷 정책 설정
- `back/apps/db/serializers.py` - Django Serializer fallback 로직
- `terraform/ecs-fargate.tf` - ECS Task Definition 환경 변수

## 참고 문서

- [AWS S3 Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [AWS S3 Referer Condition](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html#example-bucket-policies-use-case-4)
- [Terraform AWS S3 Bucket Policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy)
