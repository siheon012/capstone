# ========================================
# Packer 변수 자동 설정 스크립트
# ========================================
# Terraform output에서 값을 가져와 Packer 변수 파일 생성
# 
# 사용법:
#   cd packer
#   .\scripts\setup-packer-vars.ps1
# ========================================

Write-Host "=== Packer Variables Setup ===" -ForegroundColor Cyan

# Terraform 디렉토리 확인
$terraformDir = Join-Path $PSScriptRoot "..\..\terraform"
if (-not (Test-Path $terraformDir)) {
    Write-Error "Terraform directory not found: $terraformDir"
    exit 1
}

# Terraform output에서 값 가져오기
Write-Host "`n1. Fetching Terraform outputs..." -ForegroundColor Yellow
Push-Location $terraformDir

try {
    # Subnet ID (첫 번째 public subnet)
    $subnetIds = terraform output -json public_subnet_ids | ConvertFrom-Json
    $subnetId = $subnetIds[0]
    Write-Host "  ✓ Subnet ID: $subnetId" -ForegroundColor Green
    
    # VPC ID
    $vpcId = terraform output -raw vpc_id
    Write-Host "  ✓ VPC ID: $vpcId" -ForegroundColor Green
    
    # Security Group (기본 SG 또는 Batch 전용 SG)
    $sgId = $null
    $ErrorActionPreference = 'SilentlyContinue'
    $sgId = terraform output -raw batch_compute_security_group_id 2>$null
    $ErrorActionPreference = 'Continue'
    
    if (-not $sgId) {
        # Batch SG가 없으면 임시 SG 생성
        Write-Host "  ℹ Batch SG not found, will create temporary SG" -ForegroundColor Yellow
        
        # Packer용 임시 Security Group 생성
        $sgName = "packer-build-sg-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Write-Host "`n2. Creating temporary Security Group: $sgName" -ForegroundColor Yellow
        
        $sgResult = aws ec2 create-security-group `
            --group-name $sgName `
            --description "Temporary SG for Packer AMI build" `
            --vpc-id $vpcId `
            --region ap-northeast-2 `
            --output json | ConvertFrom-Json
        
        $sgId = $sgResult.GroupId
        Write-Host "  ✓ Created SG: $sgId" -ForegroundColor Green
        Write-Host "  ✓ Default egress rules applied (internet access)" -ForegroundColor Green
        
        # SSH 인바운드 규칙 추가 (내 IP만 허용)
        Write-Host "  Adding SSH ingress rule..." -ForegroundColor Gray
        $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content.Trim()
        
        aws ec2 authorize-security-group-ingress `
            --group-id $sgId `
            --protocol tcp `
            --port 22 `
            --cidr "$myIp/32" `
            --region ap-northeast-2 | Out-Null
        
        Write-Host "  ✓ SSH access allowed from $myIp" -ForegroundColor Green
        
        # 태그 추가
        aws ec2 create-tags `
            --resources $sgId `
            --tags "Key=Name,Value=$sgName" "Key=ManagedBy,Value=Packer" "Key=Temporary,Value=true" `
            --region ap-northeast-2 | Out-Null
    }
    
} catch {
    Write-Error "Failed to get Terraform outputs: $_"
    Pop-Location
    exit 1
}

Pop-Location

# ECR Repository URL
$accountId = "287709190208"
$region = "ap-northeast-2"
$ecrUrl = "$accountId.dkr.ecr.$region.amazonaws.com/capstone-dev-batch-processor"

Write-Host "`n3. Generating Packer variables file..." -ForegroundColor Yellow

# variables.auto.pkrvars.hcl 생성 (packer 루트에)
$varsFile = Join-Path $PSScriptRoot "..\variables.auto.pkrvars.hcl"
$varsContent = @"
# ========================================
# Packer Variables - Auto-generated
# ========================================
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# From Terraform outputs
# ========================================

aws_region         = "$region"
environment        = "dev"
subnet_id          = "$subnetId"
security_group_id  = "$sgId"
ecr_repository_url = "$ecrUrl"
docker_image_tag   = "latest"
instance_type      = "g5.xlarge"

# Optional: S3 bucket for ML models
# models_s3_bucket   = "your-bucket-name"

# Optional: SSH keypair for debugging
# ssh_keypair_name   = "your-keypair"
"@

$varsContent | Out-File -FilePath $varsFile -Encoding UTF8 -Force
Write-Host "  ✓ Created: $varsFile" -ForegroundColor Green

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Review variables: cat variables.auto.pkrvars.hcl"
Write-Host "  2. Initialize Packer: packer init ."
Write-Host "  3. Validate config: packer validate ."
Write-Host "  4. Build AMI: packer build ."
Write-Host ""
Write-Host "Estimated build time: 30-40 minutes" -ForegroundColor Cyan
Write-Host "Estimated cost: ~`$1.00 (g5.xlarge)" -ForegroundColor Cyan
Write-Host ""
