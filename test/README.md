# Testing Guide

This directory contains **performance testing** and **infrastructure testing** for the project.

## 📁 Directory Structure

```
test/
├── README.md                 # This document
├── performance/              # Web performance & load testing (k6)
│   ├── load-test.js          # k6 load testing script
│   └── README.md             # Performance test detailed results
└── infra/                    # Infrastructure testing (Terratest)
    ├── go.mod                # Go module definition
    ├── go.sum                # Dependency checksums
    ├── network_test.go       # Network module test
    ├── storage_test.go       # Storage module test
    ├── security_test.go      # Security module test
    ├── integration_test.go   # Integration test
    ├── module_test.go        # Common module test
    ├── run-tests.sh          # Test execution script
    └── TERRATEST_README.md   # Terratest detailed guide
```

## 🎯 Test Types

### 1. Performance Testing

**Purpose**: Validate web application load handling capacity

**Tool**: k6 (Grafana)

**Location**: `test/performance/`

**Key Validation Items**:

- ✅ Response time (average, p95, p99)
- ✅ Throughput (req/s)
- ✅ Success rate and error rate
- ✅ Concurrent user scalability

**How to Run**:

```bash
# Install k6
choco install k6  # Windows
brew install k6   # Mac

# Run load test
cd test/performance
k6 run load-test.js

# Test with higher load
k6 run --vus 100 --duration 5m load-test.js
```

**Test Results**: See [performance/README.md](performance/README.md)

---

### 2. Infrastructure Testing

**Purpose**: Validate Terraform infrastructure code stability and accuracy

**Tool**: Terratest (Go)

**Location**: `test/infra/`

**Key Validation Items**:

- ✅ Terraform syntax and format validation
- ✅ Verify plan generation per module
- ✅ Validate actual resource creation and configuration
- ✅ Full stack integration testing
- ✅ Idempotency validation

**Test Tiers**:

#### Tier 1: Validation (Free, Fast)

```bash
cd test/infra
go test -v -short ./...
```

- Execution time: 1-2 minutes
- Cost: $0
- Resource creation: ❌

#### Tier 2: Unit Tests (Low cost)

```bash
cd test/infra
go test -v -run TestNetworkModule -timeout 30m
go test -v -run TestStorageModule -timeout 30m
```

- Execution time: 10-20 minutes
- Cost: ~$0.50
- Resource creation: ✅ (Auto cleanup)

#### Tier 3: Integration (High cost)

```bash
cd test/infra
export RUN_FULL_INTEGRATION_TEST=true
go test -v -run TestCompleteInfrastructure -timeout 60m
```

- Execution time: 20-30 minutes
- Cost: ~$1-2
- Resource creation: ✅ (Full stack)

**Detailed Guide**: See [infra/TERRATEST_README.md](infra/TERRATEST_README.md)

---

## 🚀 Quick Start

### Performance Testing

```bash
# 1. Install k6
choco install k6

# 2. Run test
cd test/performance
k6 run load-test.js

# 3. Check results
# - Real-time metrics displayed in console
# - Check benchmarks in README.md
```

### Infrastructure Testing

```bash
# 1. Install Go (1.21 or higher)
go version

# 2. Download dependencies
cd test/infra
go mod download

# 3. Quick validation (free)
go test -v -short ./...

# 4. Configure AWS credentials
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

# 5. Test specific module (optional)
go test -v -run TestNetworkModule -timeout 30m
```

---

## 📊 Test Status

### Performance Testing

| Metric           | Target     | Actual     | Status |
| ---------------- | ---------- | ---------- | ------ |
| Success rate     | > 99%      | 99.93%     | ✅     |
| p95 response     | < 500ms    | 472.58ms   | ✅     |
| Avg response     | < 300ms    | 171.4ms    | ✅     |
| Throughput       | > 20 req/s | 44.7 req/s | ✅     |

**Final Assessment**: ✅ Production Ready

Detailed results: [performance/README.md](performance/README.md)

---

### Infrastructure Testing

| Module     | Validation | Unit Test | Integration |
| ---------- | ---------- | --------- | ----------- |
| Network    | ✅         | ✅        | ✅          |
| Storage    | ✅         | ✅        | ✅          |
| Security   | ✅         | ✅        | ✅          |
| Full Stack | ✅         | -         | ✅          |

**Final Assessment**: ✅ All modules passed

Detailed guide: [infra/TERRATEST_README.md](infra/TERRATEST_README.md)

---

## 🔄 CI/CD Integration

### GitHub Actions Workflows

#### 1. Performance Testing

- **Trigger**: Manual execution (workflow_dispatch)
- **Frequency**: Before major releases
- **Location**: `.github/workflows/performance-test.yml` (optional)

#### 2. Infrastructure Testing

- **Triggers**:
  - On PR creation (Validation only)
  - Weekly on Mondays (Unit Tests)
  - Manual execution (All tests)
- **Location**: `.github/workflows/terratest.yml`

```yaml
# .github/workflows/terratest.yml
on:
  pull_request:
    paths: ['terraform/**'] # Auto-run validation
  schedule:
    - cron: '0 2 * * 1' # Weekly unit tests
  workflow_dispatch: # Manual execution
```

---

## 💰 Estimated Test Costs

### Performance Testing

- **Cost**: $0 (only external traffic)
- **Frequency**: As needed

### Infrastructure Testing

| Test Type   | Frequency         | Unit Cost | Monthly Cost |
| ----------- | ----------------- | --------- | ------------ |
| Validation  | Per PR (Unlimited)| $0        | $0           |
| Unit Tests  | Weekly            | ~$0.50    | ~$2/month    |
| Integration | Monthly           | ~$2       | ~$2/month    |
| **Total**   | -                 | -         | **~$4/month**|

---

## 📚 Related Documents

### Performance Testing

- [Performance Test Results Report](performance/README.md)
- [Cost Optimization Report](../docs/04_cost_optimization/COST_REDUCTION_JAN_2026.md)

### Infrastructure Testing

- [Terratest Detailed Guide](infra/TERRATEST_README.md)
- [Policy as Code Documentation](../docs/POLICY_AS_CODE.md)
- [Packer AMI Build Guide](../packer/README.md)

### Overall Architecture

- [Infrastructure Diagram](../INFRA.md)
- [Cloud Architecture](../docs/CLOUD_ARCHITECTURE.md)

---

## 🐛 Troubleshooting

### Performance Testing

**Issue**: k6 installation failed

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

**Issue**: High test failure rate

- Check ALB health checks
- Check ECS task status
- Check CloudWatch logs

### Infrastructure Testing

**Issue**: "aws: command not found"

```bash
# Verify AWS CLI installation
aws --version

# Configure credentials
aws configure
```

**Issue**: "timeout exceeded"

```bash
# Increase timeout
go test -v -run TestNetworkModule -timeout 60m
```

**Issue**: Resources not cleaned up

```bash
# Manual cleanup
cd terraform/modules/network
terraform init
terraform destroy
```

---

## 🎓 Best Practices

### Performance Testing

1. ✅ Test in production-like environment
2. ✅ Gradual load increase (ramp-up)
3. ✅ Test multiple endpoint combinations
4. ✅ Record and track key metrics

### Infrastructure Testing

1. ✅ Test isolation (use unique IDs)
2. ✅ Automatic resource cleanup (`defer terraform.Destroy`)
3. ✅ Set appropriate timeouts
4. ✅ Cost management (run only necessary levels)

---

## 📝 Contribution Guide

### Add New Performance Test

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

### Add New Infrastructure Test

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

	// Validation logic
	output := terraform.Output(t, terraformOptions, "my_output")
	assert.NotEmpty(t, output)
}
```

---

## 📞 Contact & Support

- **File Issues**: [GitHub Issues](../../issues)
- **Documentation**: [Project README](../README.md)
- **Architecture**: [CLOUD_ARCHITECTURE.md](../docs/CLOUD_ARCHITECTURE.md)

---

**Last Updated**: February 4, 2026  
**Test Environment**: AWS (ap-northeast-2)
