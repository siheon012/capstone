# test/ 디렉토리에서 Go 의존성 다운로드
cd test
go mod download

# 빠른 검증 (무료, 추천)
go test -v -short ./...

# 특정 모듈 Plan 테스트
go test -v -run TestNetworkModulePlan
go test -v -run TestStorageModulePlan

# 포맷 검사
go test -v -run TestTerraformFormatting

# Terraform validate
go test -v -run TestTerraformValidation

# ========================================
# ⚠️ 아래 명령어는 실제 AWS 리소스 생성 (비용 발생)
# ========================================

# Network 모듈 테스트 (VPC 생성 및 삭제)
# 비용: ~$0.05, 소요 시간: 10분
go test -v -run TestNetworkModule -timeout 30m

# Storage 모듈 테스트 (S3 버킷 생성 및 삭제)
# 비용: ~$0.01, 소요 시간: 5분
go test -v -run TestStorageModule -timeout 30m

# Security 모듈 테스트 (IAM 역할 생성 및 삭제)
# 비용: $0, 소요 시간: 5분
go test -v -run TestIAMRoleCreation -timeout 30m

# ========================================
# ⚠️⚠️ 전체 통합 테스트 (고비용!)
# ========================================

# 전체 인프라 스택 생성 및 검증
# 비용: ~$1-2, 소요 시간: 20-30분
# 환경 변수 설정 필요
# export RUN_FULL_INTEGRATION_TEST=true
# go test -v -run TestCompleteInfrastructure -timeout 60m
