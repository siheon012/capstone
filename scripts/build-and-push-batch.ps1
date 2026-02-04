# AWS Batch Docker Image Build and Push Script
# This script builds the batch processor image and pushes it to ECR

# Usage: # PowerShell에서 실행
#cd e:\capstone
#.\scripts\build-and-push-batch.ps1
param(
    [string]$Region = "ap-northeast-2",
    [string]$AccountId = "",
    [string]$Environment = "dev",
    [string]$ImageTag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AWS Batch Image Build & Push" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Get AWS Account ID if not provided
if ([string]::IsNullOrEmpty($AccountId)) {
    Write-Host "Getting AWS Account ID..." -ForegroundColor Yellow
    $AccountId = (aws sts get-caller-identity --query Account --output text)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to get AWS Account ID. Make sure you're logged in." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Account ID: $AccountId" -ForegroundColor Green
Write-Host "Region: $Region" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
Write-Host "Image Tag: $ImageTag" -ForegroundColor Green
Write-Host ""

# Repository details
$RepositoryName = "capstone-$Environment-batch-processor"
$RepositoryUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/$RepositoryName"

# Change to project root (scripts folder is one level below root)
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Green
Write-Host ""

# Check if models exist
Write-Host "Checking for AI models..." -ForegroundColor Yellow
$ModelPaths = @(
    "video-analysis\models\yolov8x_person_face.pt",
    "video-analysis\models\model_imdb_cross_person_4.22_99.46.pth.tar",
    "video-analysis\experiments\coco\segm-4_lr1e-3.yaml",
    "video-analysis\checkpoints\llava-fastvithd_0.5b_stage2"
)

$MissingModels = @()
foreach ($path in $ModelPaths) {
    $fullPath = Join-Path $ProjectRoot $path
    if (-not (Test-Path $fullPath)) {
        $MissingModels += $path
        Write-Host "[MISSING] $path" -ForegroundColor Red
    } else {
        Write-Host "[OK] $path" -ForegroundColor Green
    }
}

if ($MissingModels.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] Missing model files. Please download them first." -ForegroundColor Red
    Write-Host "Required models:" -ForegroundColor Yellow
    $MissingModels | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 1: ECR Login" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] ECR login failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] ECR login successful" -ForegroundColor Green
Write-Host ""

# Build Docker image
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 2: Building Docker Image" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "This will take 10-15 minutes (downloading models and dependencies)..." -ForegroundColor Yellow
Write-Host ""

docker build `
    -f batch/Dockerfile `
    -t "${RepositoryName}:${ImageTag}" `
    -t "${RepositoryUri}:${ImageTag}" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker build successful" -ForegroundColor Green
Write-Host ""

# Get image size
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 3: Image Information" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ImageInfo = docker images "${RepositoryName}:${ImageTag}" --format "{{.Size}}"
Write-Host "Image Size: $ImageInfo" -ForegroundColor Green
Write-Host ""

# Push to ECR
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 4: Pushing to ECR" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Repository: $RepositoryUri" -ForegroundColor Yellow
Write-Host ""

docker push "${RepositoryUri}:${ImageTag}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker push failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker push successful" -ForegroundColor Green
Write-Host ""

# Get image digest (SHA256)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 5: Getting Image Digest" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ImageDigest = aws ecr describe-images `
    --repository-name $RepositoryName `
    --image-ids imageTag=$ImageTag `
    --region $Region `
    --query 'imageDetails[0].imageDigest' `
    --output text

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to get image digest" -ForegroundColor Red
    exit 1
}

Write-Host "Image Digest: $ImageDigest" -ForegroundColor Green
Write-Host ""
Write-Host "Full Image URI:" -ForegroundColor Cyan
Write-Host "${RepositoryUri}@${ImageDigest}" -ForegroundColor Yellow
Write-Host ""

# Save digest to file for Terraform
$DigestFile = "terraform\batch-image-digest.txt"
"${RepositoryUri}@${ImageDigest}" | Out-File -FilePath $DigestFile -Encoding utf8 -NoNewline
Write-Host "[OK] Image digest saved to: $DigestFile" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Build and Push Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update terraform/batch-video-analysis-gpu.tf with the new image digest:" -ForegroundColor White
Write-Host "   `"image`": `"${RepositoryUri}@${ImageDigest}`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Apply Terraform changes:" -ForegroundColor White
Write-Host "   cd terraform" -ForegroundColor Cyan
Write-Host "   terraform plan" -ForegroundColor Cyan
Write-Host "   terraform apply" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. (Optional) Create Custom AMI with this image pre-loaded" -ForegroundColor White
Write-Host "   See docs/CUSTOM_AMI_GUIDE.md" -ForegroundColor Cyan
Write-Host ""