#!/bin/bash

# EC2 GPU Video Processing Worker 시작 스크립트

set -e

echo "🤖 GPU Video Worker 시작 중..."

# 현재 디렉토리를 스크립트 위치로 설정
cd "$(dirname "$0")"

# 환경 변수 로드
if [ -f "../.env.prod" ]; then
    echo "📋 운영 환경 설정 로드 (.env.prod)"
    export $(cat ../.env.prod | grep -v '^#' | xargs)
elif [ -f "../.env.dev" ]; then
    echo "📋 개발 환경 설정 로드 (.env.dev)"
    export $(cat ../.env.dev | grep -v '^#' | xargs)
elif [ -f "../.env.local" ]; then
    echo "📋 로컬 환경 설정 로드 (.env.local)"
    export $(cat ../.env.local | grep -v '^#' | xargs)
else
    echo "❌ 환경 설정 파일을 찾을 수 없습니다!"
    exit 1
fi

# Python 가상환경 활성화 (필요시)
if [ -d "../back/env" ]; then
    echo "🐍 Python 가상환경 활성화"
    source ../back/env/bin/activate
fi

# Python 경로 설정
export PYTHONPATH="../back:$PYTHONPATH"

# 필수 디렉토리 생성
mkdir -p temp results logs

# GPU 가용성 확인
echo "🔍 GPU 상태 확인..."
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU 감지됨"
    nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits
else
    echo "⚠️ GPU가 감지되지 않았습니다. CPU로 실행됩니다."
fi

# 로그 파일 설정
LOG_FILE="logs/gpu_worker_$(date +%Y%m%d_%H%M%S).log"

echo "📝 로그 파일: $LOG_FILE"
echo "🚀 GPU Video Worker 실행 중..."

# Python 워커 실행 (nohup으로 백그라운드 실행 가능)
python video_processor.py 2>&1 | tee "$LOG_FILE"