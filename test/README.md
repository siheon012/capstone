# 테스트 가이드

이 디렉토리는 프로젝트의 **성능 테스트**와 **인프라 테스트**를 포함합니다.

## 📁 디렉토리 구조

```
test/
├── README.md                 # 이 문서
├── performance/              # 웹 성능 및 부하 테스트 (k6)
│   ├── load-test.js          # k6 부하 테스트 스크립트
│   └── README.md             # 성능 테스트 상세 결과
└── infra/                    # 인프라 테스트 (Terratest)
    ├── go.mod                # Go 모듈 정의
    ├── go.sum                # 의존성 체크섬
    ├── network_test.go       # Network 모듈 테스트
    ├── storage_test.go       # Storage 모듈 테스트
    ├── security_test.go      # Security 모듈 테스트
    ├── integration_test.go   # 통합 테스트
    ├── module_test.go        # 공통 모듈 테스트
    ├── run-tests.sh          # 테스트 실행 스크립트
    └── TERRATEST_README.md   # Terratest 상세 가이드
```

## 🎯 테스트 유형

### 1. 성능 테스트 (Performance Testing)

**목적**: 웹 애플리케이션의 부하 처리 능력 검증

**도구**: k6 (Grafana)

**위치**: `test/performance/`

**주요 검증 항목**:

- ✅ 응답 시간 (평균, p95, p99)
- ✅ 초당 처리량 (req/s)
- ✅ 성공률 및 오류율
- ✅ 동시 사용자 확장성

**실행 방법**:

```bash
# k6 설치
choco install k6  # Windows
brew install k6   # Mac

# 부하 테스트 실행
cd test/performance
k6 run load-test.js

# 더 높은 부하로 테스트
k6 run --vus 100 --duration 5m load-test.js
```

**테스트 결과**: [performance/README.md](performance/README.md) 참조

---

### 2. 인프라 테스트 (Infrastructure Testing)

**목적**: Terraform 인프라 코드의 안정성 및 정확성 검증

**도구**: Terratest (Go)

**위치**: `test/infra/`

**주요 검증 항목**:

- ✅ Terraform 문법 및 포맷 검증
- ✅ 모듈별 Plan 생성 확인
- ✅ 실제 리소스 생성 및 설정 검증
- ✅ 전체 스택 통합 테스트
- ✅ Idempotency (멱등성) 검증

**테스트 계층**:

#### Tier 1: Validation (무료, 빠름)

```bash
cd test/infra
go test -v -short ./...
```

- 실행 시간: 1-2분
- 비용: $0
- 리소스 생성: ❌

#### Tier 2: Unit Tests (저비용)

```bash
cd test/infra
go test -v -run TestNetworkModule -timeout 30m
go test -v -run TestStorageModule -timeout 30m
```

- 실행 시간: 10-20분
- 비용: ~$0.50
- 리소스 생성: ✅ (자동 정리)

#### Tier 3: Integration (고비용)

```bash
cd test/infra
export RUN_FULL_INTEGRATION_TEST=true
go test -v -run TestCompleteInfrastructure -timeout 60m
```

- 실행 시간: 20-30분
- 비용: ~$1-2
- 리소스 생성: ✅ (전체 스택)

**상세 가이드**: [infra/TERRATEST_README.md](infra/TERRATEST_README.md) 참조

---

## 🚀 빠른 시작

### Performance Testing

```bash
# 1. k6 설치
choco install k6

# 2. 테스트 실행
cd test/performance
k6 run load-test.js

# 3. 결과 확인
# - 콘솔에 실시간 메트릭 표시
# - README.md에서 벤치마크 확인
```

### Infrastructure Testing

```bash
# 1. Go 설치 (1.21 이상)
go version

# 2. 의존성 다운로드
cd test/infra
go mod download

# 3. 빠른 검증 (무료)
go test -v -short ./...

# 4. AWS 자격증명 설정
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

# 5. 특정 모듈 테스트 (선택)
go test -v -run TestNetworkModule -timeout 30m
```

---

## 📊 테스트 현황

### Performance Testing

| 메트릭        | 목표       | 실제 결과  | 상태 |
| ------------- | ---------- | ---------- | ---- |
| 성공률        | > 99%      | 99.93%     | ✅   |
| p95 응답시간  | < 500ms    | 472.58ms   | ✅   |
| 평균 응답시간 | < 300ms    | 171.4ms    | ✅   |
| 처리량        | > 20 req/s | 44.7 req/s | ✅   |

**최종 평가**: ✅ 프로덕션 준비 완료

상세 결과: [performance/README.md](performance/README.md)

---

### Infrastructure Testing

| 모듈       | Validation | Unit Test | Integration |
| ---------- | ---------- | --------- | ----------- |
| Network    | ✅         | ✅        | ✅          |
| Storage    | ✅         | ✅        | ✅          |
| Security   | ✅         | ✅        | ✅          |
| Full Stack | ✅         | -         | ✅          |

**최종 평가**: ✅ 모든 모듈 테스트 통과

상세 가이드: [infra/TERRATEST_README.md](infra/TERRATEST_README.md)

---

## 🔄 CI/CD 통합

### GitHub Actions 워크플로우

#### 1. Performance Testing

- **트리거**: 수동 실행 (workflow_dispatch)
- **빈도**: 주요 릴리스 전
- **위치**: `.github/workflows/performance-test.yml` (선택 사항)

#### 2. Infrastructure Testing

- **트리거**:
  - PR 생성 시 (Validation만)
  - 매주 월요일 (Unit Tests)
  - 수동 실행 (모든 테스트)
- **위치**: `.github/workflows/terratest.yml`

```yaml
# .github/workflows/terratest.yml
on:
  pull_request:
    paths: ['terraform/**'] # Validation 자동 실행
  schedule:
    - cron: '0 2 * * 1' # 주간 Unit Tests
  workflow_dispatch: # 수동 실행
```

---

## 💰 테스트 비용 예상

### Performance Testing

- **비용**: $0 (외부 트래픽만 발생)
- **빈도**: 필요시

### Infrastructure Testing

| 테스트 유형 | 실행 빈도       | 단위 비용 | 월 비용    |
| ----------- | --------------- | --------- | ---------- |
| Validation  | PR마다 (무제한) | $0        | $0         |
| Unit Tests  | 주 1회          | ~$0.50    | ~$2/월     |
| Integration | 월 1회          | ~$2       | ~$2/월     |
| **총합**    | -               | -         | **~$4/월** |

---

## 📚 관련 문서

### Performance Testing

- [성능 테스트 결과 보고서](performance/README.md)
- [비용 최적화 보고서](../docs/04_cost_optimization/COST_REDUCTION_JAN_2026.md)

### Infrastructure Testing

- [Terratest 상세 가이드](infra/TERRATEST_README.md)
- [Policy as Code 문서](../docs/POLICY_AS_CODE.md)
- [Packer AMI 빌드 가이드](../packer/README.md)

### 전체 아키텍처

- [인프라 구성도](../INFRA.md)
- [클라우드 아키텍처](../docs/CLOUD_ARCHITECTURE.md)

---

## 🐛 트러블슈팅

### Performance Testing

**문제**: k6 설치 안됨

```bash
# Windows
choco install k6

# Mac
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**문제**: 테스트 실패율 높음

- ALB 헬스체크 확인
- ECS 태스크 상태 확인
- CloudWatch 로그 확인

### Infrastructure Testing

**문제**: "aws: command not found"

```bash
# AWS CLI 설치 확인
aws --version

# 자격증명 설정
aws configure
```

**문제**: "timeout exceeded"

```bash
# 타임아웃 증가
go test -v -run TestNetworkModule -timeout 60m
```

**문제**: 리소스가 정리되지 않음

```bash
# 수동 정리
cd terraform/modules/network
terraform init
terraform destroy
```

---

## 🎓 베스트 프랙티스

### Performance Testing

1. ✅ 프로덕션과 유사한 환경에서 테스트
2. ✅ 점진적 부하 증가 (램프업)
3. ✅ 여러 엔드포인트 조합 테스트
4. ✅ 주요 지표 기록 및 추적

### Infrastructure Testing

1. ✅ 테스트 격리 (고유 ID 사용)
2. ✅ 자동 리소스 정리 (`defer terraform.Destroy`)
3. ✅ 적절한 타임아웃 설정
4. ✅ 비용 관리 (필요한 수준만 실행)

---

## 📝 기여 가이드

### 새로운 Performance Test 추가

```javascript
// test/performance/my-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('https://your-endpoint.com');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
```

### 새로운 Infrastructure Test 추가

```go
// test/infra/my_module_test.go
package test

import (
	"testing"
	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

func TestMyModule(t *testing.T) {
	terraformOptions := &terraform.Options{
		TerraformDir: "../terraform/modules/my-module",
	}

	defer terraform.Destroy(t, terraformOptions)
	terraform.InitAndApply(t, terraformOptions)

	// 검증 로직
	output := terraform.Output(t, terraformOptions, "my_output")
	assert.NotEmpty(t, output)
}
```

---

## 📞 문의 및 지원

- **이슈 등록**: [GitHub Issues](../../issues)
- **문서**: [프로젝트 README](../README.md)
- **아키텍처**: [CLOUD_ARCHITECTURE.md](../docs/CLOUD_ARCHITECTURE.md)

---

**마지막 업데이트**: 2026년 2월 4일  
**테스트 환경**: AWS (ap-northeast-2)
