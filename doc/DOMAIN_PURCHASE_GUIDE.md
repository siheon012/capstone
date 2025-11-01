# Route 53 도메인 구매 가이드

## 🛒 도메인 구매 방법

### 방법 1: AWS Route 53에서 직접 구매 (가장 간단)

#### 1.1 AWS Console 접속

```
1. AWS Console → Route 53
2. 왼쪽 메뉴 → "Registered domains"
3. "Register domain" 클릭
```

#### 1.2 도메인 검색

```
예시 도메인:
- capstone-video.com
- unmanned-cctv.com
- ai-surveillance.com
- video-analysis.click (저렴함)
```

#### 1.3 가격 비교

| 도메인 | 연간 비용 |
| ------ | --------- |
| .com   | $12       |
| .net   | $11       |
| .org   | $12       |
| .click | $3        |
| .link  | $5        |
| .site  | $6        |

#### 1.4 구매 프로세스

```
1. 도메인 선택
2. "Add to cart"
3. 연락처 정보 입력
4. 자동 갱신 설정 (선택)
5. 결제 (신용카드)
6. 5-10분 후 사용 가능
```

**장점**:

- ✅ Route 53과 자동 연동
- ✅ Name Server 설정 불필요
- ✅ Terraform 즉시 사용 가능
- ✅ 간편한 관리

---

### 방법 2: 외부 도메인 등록 업체 사용

#### 2.1 추천 업체

**가비아 (한국)**

- URL: https://www.gabia.com
- .com: 약 15,000원/년
- 한글 지원 ✅

**Cloudflare**

- URL: https://www.cloudflare.com
- .com: $9.77/년 (저렴)
- DNS 무료

**GoDaddy**

- URL: https://www.godaddy.com
- .com: $11.99/년
- 할인 자주 있음

**Namecheap**

- URL: https://www.namecheap.com
- .com: $9.58/년
- 무료 Privacy Protection

#### 2.2 구매 후 Name Server 변경

**가비아 예시**:

```
1. 가비아 로그인
2. 도메인 관리
3. 네임서버 설정
4. "1차~4차 네임서버" 변경
   - AWS에서 제공한 Name Server 입력
```

**Cloudflare 예시**:

```
1. Cloudflare Dashboard
2. DNS → Name Servers
3. Custom Name Servers 선택
4. AWS Route 53 Name Server 입력
```

---

## 🚀 Terraform 적용 (도메인 구매 후)

### Step 1: 도메인 변수 설정

**방법 A: 명령줄에서 직접 지정**

```bash
cd terraform

# 도메인 지정하여 plan
terraform plan -var="domain_name=capstone-video.com" -out=tfplan

# 적용
terraform apply tfplan
```

**방법 B: terraform.tfvars 파일 생성** (추천)

```bash
# terraform/terraform.tfvars 파일 생성
echo 'domain_name = "capstone-video.com"' > terraform.tfvars

# 일반적인 plan/apply
terraform plan -out=tfplan
terraform apply tfplan
```

### Step 2: Name Server 확인 (외부 도메인 사용 시)

```bash
# Terraform apply 후 출력 확인
terraform output route53_name_servers

# 출력 예시:
# route53_name_servers = tolist([
#   "ns-123.awsdns-12.com.",
#   "ns-456.awsdns-34.net.",
#   "ns-789.awsdns-56.org.",
#   "ns-012.awsdns-78.co.uk.",
# ])
```

이 Name Server들을 도메인 등록 업체에 설정하세요.

### Step 3: DNS 전파 확인

```bash
# Windows
nslookup capstone-video.com

# PowerShell
Resolve-DnsName capstone-video.com

# 결과가 ALB IP로 나오면 성공!
```

---

## 📋 Route 53 설정 내용

Terraform apply 시 자동으로 생성되는 리소스:

### 1. Hosted Zone

```
capstone-video.com
```

### 2. DNS 레코드

```
A Record (ALIAS):
- capstone-video.com → ALB
- www.capstone-video.com → ALB
- api.capstone-video.com → ALB
```

### 3. SSL 인증서 (ACM)

```
*.capstone-video.com (와일드카드)
- 자동 발급
- DNS 검증
- 무료 ✅
```

### 4. HTTPS 리스너

```
Port 443 (HTTPS)
- SSL Certificate 적용
- Frontend/Backend 라우팅
```

### 5. HTTP 리다이렉트

```
Port 80 → Port 443
- 자동 HTTPS 리다이렉트
```

---

## ⏱️ 타임라인

| 단계                | 소요 시간    |
| ------------------- | ------------ |
| AWS에서 도메인 구매 | 5-10분       |
| Terraform apply     | 5-10분       |
| ACM 인증서 발급     | 5-10분       |
| DNS 전파            | 10분~48시간  |
| **총 예상**         | **30분~2일** |

**실제로는 대부분 30분 이내 완료됩니다!**

---

## 💰 총 비용

### AWS Route 53 도메인 구매 시

| 항목                 | 비용             |
| -------------------- | ---------------- |
| .com 도메인 등록     | $12/년           |
| Route 53 Hosted Zone | $0.50/월 = $6/년 |
| DNS 쿼리 (100만 건)  | ~$0.40/월        |
| ACM Certificate      | **무료**         |
| **연간 총계**        | **~$23/년**      |

### 외부 도메인 + Route 53

| 항목                 | 비용             |
| -------------------- | ---------------- |
| 가비아 .com 도메인   | 15,000원/년      |
| Route 53 Hosted Zone | $0.50/월 = $6/년 |
| DNS 쿼리             | ~$0.40/월        |
| **연간 총계**        | **~$21/년**      |

---

## 🎯 추천 도메인명

프로젝트에 맞는 도메인:

### 기능 중심

- `unmanned-surveillance.com`
- `ai-video-analysis.com`
- `smart-cctv.com`
- `video-intelligence.com`

### 프로젝트 중심

- `capstone-video.com`
- `capstone-ai.com`
- `capstone-project.com`

### 저렴한 옵션

- `unmanned-ai.click` ($3/년)
- `video-analysis.site` ($6/년)
- `capstone.link` ($5/년)

---

## 🔧 문제 해결

### Q: Name Server 변경이 안 먹혀요

A: DNS 전파 시간 (최대 48시간) 대기 필요. 보통 10분~1시간.

### Q: ACM 인증서가 Pending 상태예요

A: DNS 검증 레코드가 자동으로 추가되므로 5-10분 대기.

### Q: HTTPS 접속이 안 돼요

A:

1. ACM 인증서 상태 확인 (AWS Console → ACM)
2. ALB에 443 리스너 확인
3. 보안 그룹 443 포트 확인

### Q: 도메인을 아직 안 샀는데 테스트하고 싶어요

A:

```bash
# Route 53 설정 비활성화
mv terraform/route53.tf terraform/route53.tf.disabled

# 현재 ALB DNS로 계속 테스트
# http://capstone-alb-175357648.ap-northeast-2.elb.amazonaws.com
```

---

## 📚 다음 단계

1. ✅ 도메인 구매
2. ✅ Terraform apply
3. ✅ DNS 전파 확인
4. ✅ HTTPS 접속 테스트
5. ✅ Frontend 환경변수 업데이트
   ```
   NEXT_PUBLIC_API_URL=https://capstone-video.com/api
   ```

---

## 🎉 완료 후 최종 결과

```
사용자 브라우저
  ↓
https://capstone-video.com
  ↓
Route 53 (DNS)
  ↓
ALIAS Record → ALB
  ↓
HTTPS Listener (443)
  ↓ SSL Certificate
  ↓
┌──────────────┬──────────────┐
│   Frontend   │   Backend    │
│   (/)        │   (/api/*)   │
└──────────────┴──────────────┘
```

**접속 URL**:

- ✅ `https://capstone-video.com` (Frontend)
- ✅ `https://capstone-video.com/api/` (Backend API)
- ✅ `https://www.capstone-video.com` (www 리다이렉트)
- ✅ `https://api.capstone-video.com` (API 서브도메인)

모두 **HTTPS 자동 적용** 및 **HTTP → HTTPS 자동 리다이렉트**!
