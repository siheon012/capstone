#!/bin/bash
# ========================================
# Download ML Models Script
# ========================================
# This script downloads pre-trained ML models to /opt/ml
# for video analysis to reduce container startup time.
#
# Models are optionally downloaded from S3 or directly from sources.
# ========================================

set -e

echo "=== ML Models Download ==="

# Create models directory
sudo mkdir -p /opt/ml/models
sudo chown -R ec2-user:ec2-user /opt/ml

MODEL_DIR="/opt/ml/models"

# ========================================
# Option 1: Download from S3 (if bucket provided)
# ========================================

if [ -n "$MODELS_S3_BUCKET" ] && [ "$MODELS_S3_BUCKET" != "" ]; then
    echo "Downloading models from S3: s3://${MODELS_S3_BUCKET}/models/"
    
    /usr/local/bin/aws s3 sync "s3://${MODELS_S3_BUCKET}/models/" "$MODEL_DIR/" --region "$AWS_REGION" || {
        echo "Warning: Failed to download from S3, will try direct download"
    }
fi

# ========================================
# Option 2: Direct download (fallback or primary)
# ========================================

echo "Checking for required models in $MODEL_DIR"

# Function to download a file if it doesn't exist
download_if_missing() {
    local url=$1
    local dest=$2
    local name=$3
    
    if [ ! -f "$dest" ]; then
        echo "Downloading $name..."
        wget -q --show-progress -O "$dest" "$url" || {
            echo "Failed to download $name from $url"
            return 1
        }
        echo "✓ $name downloaded"
    else
        echo "✓ $name already exists"
    fi
}

# Example: Download specific models
# Uncomment and customize based on your actual model requirements

# Example 1: YOLO model
# download_if_missing \
#     "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt" \
#     "$MODEL_DIR/yolov8n.pt" \
#     "YOLOv8 Nano"

# Example 2: Depth estimation model  
# download_if_missing \
#     "https://huggingface.co/Intel/dpt-large/resolve/main/pytorch_model.bin" \
#     "$MODEL_DIR/dpt_large.bin" \
#     "DPT Large"

# Example 3: Custom model from your infrastructure
# aws s3 cp "s3://your-models-bucket/custom-model.pth" "$MODEL_DIR/custom-model.pth" --region ap-northeast-2

# ========================================
# Verify models directory
# ========================================

echo ""
echo "Models directory contents:"
ls -lh "$MODEL_DIR"

echo ""
echo "Total models size:"
du -sh "$MODEL_DIR"

# Set proper permissions
sudo chown -R ec2-user:ec2-user /opt/ml
sudo chmod -R 755 /opt/ml

echo ""
echo "✓ Models download completed"
