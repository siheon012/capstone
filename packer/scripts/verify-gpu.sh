#!/bin/bash
# ========================================
# Verify GPU and Docker Setup
# ========================================
# This script verifies that GPU, NVIDIA drivers,
# and Docker with GPU support are properly configured.
# ========================================

set -e

echo "=== GPU and Docker Verification ==="

# Check NVIDIA driver
echo "1. Checking NVIDIA driver..."
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi
    echo "✓ NVIDIA driver is installed"
else
    echo "⚠ NVIDIA driver not found (normal during AMI build)"
fi

echo ""

# Check Docker
echo "2. Checking Docker..."
if sudo systemctl is-active --quiet docker; then
    echo "✓ Docker service is running"
    sudo docker --version
else
    echo "⚠ Docker service not running, attempting to start..."
    sudo systemctl start docker
fi

echo ""

# Check NVIDIA Docker runtime
echo "3. Checking NVIDIA Docker runtime..."
if sudo docker info | grep -q nvidia; then
    echo "✓ NVIDIA Docker runtime is available"
else
    echo "⚠ NVIDIA Docker runtime not detected"
fi

echo ""

# Test GPU in container (if GPU is available)
echo "4. Testing GPU in Docker container..."
if nvidia-smi &> /dev/null; then
    sudo docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi || {
        echo "⚠ GPU test in container failed"
    }
else
    echo "⚠ Skipping GPU container test (no GPU detected)"
fi

echo ""
echo "=== Verification completed ==="
