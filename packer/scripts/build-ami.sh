#!/bin/bash
# ========================================
# Packer AMI 빌드 통합 스크립트
# ========================================
# Terraform output 자동 수집 → Packer 변수 생성 → AMI 빌드
#
# 사용법:
#   cd packer
#   ./scripts/build-ami.sh
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "  Packer AMI Build - Automated"
echo "========================================"
echo ""

# Step 1: 변수 자동 설정
echo "Step 1: Setting up Packer variables from Terraform..."
echo "----------------------------------------"
bash "$SCRIPT_DIR/setup-packer-vars.sh"

# Step 2: Packer 초기화
echo ""
echo "Step 2: Initializing Packer..."
echo "----------------------------------------"
cd "$PACKER_DIR"
packer init .

# Step 3: 검증
echo ""
echo "Step 3: Validating Packer configuration..."
echo "----------------------------------------"
packer validate .

# Step 4: 빌드 확인
echo ""
echo "========================================"
echo "  Ready to Build AMI"
echo "========================================"
echo ""
echo "Estimated time: 30-40 minutes"
echo "Estimated cost: ~\$1.00 (g5.xlarge instance)"
echo ""
echo "Configuration:"
cat variables.auto.pkrvars.hcl | grep -E "subnet_id|security_group_id|instance_type"
echo ""
read -p "Do you want to proceed with the build? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy](es)?$ ]]; then
    echo "Build cancelled."
    exit 0
fi

# Step 5: AMI 빌드
echo ""
echo "Step 4: Building AMI..."
echo "----------------------------------------"
echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

packer build .

echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "Check manifest.json for AMI details"
echo ""
