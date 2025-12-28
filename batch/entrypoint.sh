#!/bin/bash
set -e

echo "====================================="
echo "Starting memi GPU Video Processor"
echo "====================================="
echo "VIDEO_ID: ${VIDEO_ID}"
echo "S3_BUCKET: ${S3_BUCKET}"
echo "S3_KEY: ${S3_KEY}"
echo "POSTGRES_HOST: ${POSTGRES_HOST}"
echo "CUDA_VISIBLE_DEVICES: ${CUDA_VISIBLE_DEVICES:-0}"
echo "====================================="

# Check required environment variables
if [ -z "$VIDEO_ID" ] || [ -z "$S3_BUCKET" ] || [ -z "$S3_KEY" ]; then
    echo "ERROR: Missing required environment variables"
    echo "VIDEO_ID, S3_BUCKET, and S3_KEY are required"
    exit 1
fi

# Download video from S3
echo "Downloading video from S3: s3://${S3_BUCKET}/${S3_KEY}"
INPUT_VIDEO="/workspace/videos/video_${VIDEO_ID}.mp4"
aws s3 cp "s3://${S3_BUCKET}/${S3_KEY}" "${INPUT_VIDEO}"

if [ ! -f "${INPUT_VIDEO}" ]; then
    echo "ERROR: Failed to download video from S3"
    exit 1
fi

echo "Video downloaded successfully: ${INPUT_VIDEO}"
echo "File size: $(du -h ${INPUT_VIDEO} | cut -f1)"

# Create output directory
OUTPUT_DIR="/workspace/output/video_${VIDEO_ID}"
mkdir -p "${OUTPUT_DIR}"

# Check GPU availability
echo "Checking GPU availability..."
nvidia-smi || echo "WARNING: nvidia-smi not available"

# Run memi video analysis directly
echo "====================================="
echo "Starting memi analysis..."
echo "====================================="
echo "Current working directory: $(pwd)"

# Ensure we're in the memi directory (run.py의 import 경로 때문에)
cd /workspace || { echo "ERROR: Failed to cd to /workspace"; exit 1; }

# run.py에서 --video-id를 integer로 받으므로 VIDEO_ID를 정수로 추출
# VIDEO_ID 형식: test_20251217213302, video_123 등
# PostgreSQL INTEGER 범위: -2,147,483,648 to 2,147,483,647
# 숫자만 추출하되 뒷 8자리만 사용 (범위 초과 방지)
VIDEO_ID_NUM=$(echo -n "${VIDEO_ID}" | tr -d -c 0-9 | tail -c 8)
if [ -z "$VIDEO_ID_NUM" ]; then
    # 숫자가 없으면 현재 타임스탬프 사용
    VIDEO_ID_NUM=$(date +%s)
fi

echo "Extracted video_id: ${VIDEO_ID_NUM} from VIDEO_ID: ${VIDEO_ID}"

python3 memi/run.py \
    --video-id "${VIDEO_ID_NUM}" \
    --input "${INPUT_VIDEO}" \
    --output "${OUTPUT_DIR}" \
    --detector-weights "${DETECTOR_WEIGHTS:-/workspace/models/yolov8x_person_face.pt}" \
    --checkpoint "${MIVOLO_CHECKPOINT:-/workspace/models/model_imdb_cross_person_4.24_99.46.pth.tar}" \
    --mebow-cfg "${MEBOW_CFG:-/workspace/experiments/coco/segm-4_lr1e-3.yaml}" \
    --vlm-path "${VLM_PATH:-/workspace/checkpoints/llava-fastvithd_0.5b_stage2}" \
    --device "${DEVICE:-cuda:0}" \
    --with-persons \
    --draw

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "====================================="
    echo "memi analysis completed successfully!"
    echo "Results saved to database (video_id: ${VIDEO_ID})"
    echo "====================================="
else
    echo "====================================="
    echo "ERROR: memi analysis failed with exit code ${EXIT_CODE}"
    echo "====================================="
    exit $EXIT_CODE
fi

# Cleanup
echo "Cleaning up temporary files..."
rm -f "${INPUT_VIDEO}"

echo "Batch job completed successfully!"
exit 0
