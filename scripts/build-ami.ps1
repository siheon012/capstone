# ========================================
# Build Custom GPU AMI with Packer
# ========================================
# This script builds a custom ECS GPU-optimized AMI
# with pre-loaded Docker images and ML models
# ========================================

param(
    [string]$Action = "build",  # build, validate, or init
    [string]$VarFile = "variables.auto.pkrvars.hcl",
    [switch]$Force,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Navigate to packer directory
$PackerDir = Join-Path $PSScriptRoot "..\packer"
Set-Location $PackerDir

Write-Info "=== Packer AMI Builder ==="
Write-Info "Current directory: $(Get-Location)"
Write-Info ""

# Check if Packer is installed
Write-Info "Checking Packer installation..."
try {
    $packerVersion = packer version
    Write-Success "✓ Packer is installed: $packerVersion"
} catch {
    Write-Error "✗ Packer is not installed"
    Write-Info "Please install Packer from: https://www.packer.io/downloads"
    exit 1
}
Write-Info ""

# Check if variables file exists
if ($Action -ne "init" -and -not (Test-Path $VarFile)) {
    Write-Error "✗ Variables file not found: $VarFile"
    Write-Info "Please create $VarFile from variables.auto.pkrvars.hcl.example"
    Write-Info "Example:"
    Write-Info "  cp variables.auto.pkrvars.hcl.example variables.auto.pkrvars.hcl"
    Write-Info "  # Then edit variables.auto.pkrvars.hcl with your values"
    exit 1
}

# Execute action
switch ($Action.ToLower()) {
    "init" {
        Write-Info "Initializing Packer plugins..."
        packer init .
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Packer initialized successfully"
        } else {
            Write-Error "✗ Packer init failed"
            exit 1
        }
    }
    
    "validate" {
        Write-Info "Validating Packer template..."
        if ($Debug) {
            packer validate -var-file="$VarFile" .
        } else {
            packer validate -var-file="$VarFile" . 2>&1 | Out-Null
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "✓ Packer template is valid"
        } else {
            Write-Error "✗ Packer validation failed"
            packer validate -var-file="$VarFile" .
            exit 1
        }
    }
    
    "build" {
        Write-Info "Building AMI with Packer..."
        Write-Info ""
        
        # Validate first
        Write-Info "Validating template..."
        packer validate -var-file="$VarFile" .
        if ($LASTEXITCODE -ne 0) {
            Write-Error "✗ Validation failed, aborting build"
            exit 1
        }
        Write-Success "✓ Template is valid"
        Write-Info ""
        
        # Confirm build
        if (-not $Force) {
            Write-Warning "This will create a new AMI in AWS."
            Write-Warning "Estimated time: 15-30 minutes"
            Write-Warning "Estimated cost: ~$0.50 (g5.xlarge for ~20 minutes)"
            Write-Info ""
            $confirm = Read-Host "Continue? (yes/no)"
            if ($confirm -ne "yes") {
                Write-Info "Build cancelled"
                exit 0
            }
        }
        
        Write-Info ""
        Write-Info "Starting AMI build..."
        Write-Info "This will take approximately 15-30 minutes."
        Write-Info ""
        
        # Build
        $buildArgs = @("-var-file=$VarFile")
        if ($Force) {
            $buildArgs += "-force"
        }
        if ($Debug) {
            $buildArgs += "-debug"
        }
        
        packer build @buildArgs .
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success ""
            Write-Success "=== AMI Build Successful ==="
            Write-Success ""
            
            # Read manifest
            if (Test-Path "manifest.json") {
                $manifest = Get-Content "manifest.json" | ConvertFrom-Json
                $ami = $manifest.builds[0].artifact_id -replace '.*:', ''
                $region = $manifest.builds[0].custom_data.aws_region
                
                Write-Success "AMI ID: $ami"
                Write-Success "Region: $region"
                Write-Info ""
                Write-Info "Next steps:"
                Write-Info "1. Update Terraform configuration with new AMI ID:"
                Write-Info "   terraform/modules/pipeline/batch-video-analysis-gpu.tf"
                Write-Info "   Change image_id = `"$ami`""
                Write-Info ""
                Write-Info "2. Apply Terraform changes:"
                Write-Info "   cd terraform"
                Write-Info "   terraform plan"
                Write-Info "   terraform apply"
            }
        } else {
            Write-Error "✗ AMI build failed"
            exit 1
        }
    }
    
    default {
        Write-Error "Unknown action: $Action"
        Write-Info "Valid actions: init, validate, build"
        exit 1
    }
}

Write-Info ""
Write-Success "Done!"
