# AI 분석 모델 실행 명령어 및 API 호출 예제

## 1. Docker 컨테이너 기반 AI 모델 실행

### AI 모델 컨테이너 실행 명령어
```bash
# AI 분석 모델 Docker 컨테이너 실행
docker run -d \
  --name ai-video-analyzer \
  -p 7500:7500 \
  -v /home/uns/code/project/front/public/uploads/videos:/workspace \
  -e MODEL_PORT=7500 \
  -e DJANGO_DB_URL=http://host.docker.internal:8088/db \
  --network bridge \
  ai-video-analyzer:latest

# 또는 docker-compose 사용 시
docker-compose up -d ai-analyzer
```

### 컨테이너 상태 확인
```bash
# 컨테이너 실행 상태 확인
docker ps | grep ai-video-analyzer

# 컨테이너 로그 확인
docker logs -f ai-video-analyzer

# 컨테이너 내부 진입 (디버깅용)
docker exec -it ai-video-analyzer /bin/bash
```

## 2. AI 분석 API 호출 예제

### 2.1 Python 스크립트를 통한 API 호출

```python
#!/usr/bin/env python3
"""
AI 영상 분석 모델 호출 스크립트
"""
import requests
import json
import time
import sys
from datetime import datetime

class VideoAnalyzer:
    def __init__(self, ai_service_url="http://localhost:7500", django_api_url="http://localhost:8088"):
        self.ai_service_url = ai_service_url
        self.django_api_url = django_api_url
    
    def analyze_video(self, video_id, video_path):
        """영상 분석 실행"""
        print(f"🔄 [{datetime.now()}] 영상 분석 시작 - Video ID: {video_id}")
        
        # AI 모델 분석 요청
        payload = {
            "video_id": int(video_id),
            "video_path": video_path
        }
        
        try:
            response = requests.post(
                f"{self.ai_service_url}/analyze",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=300  # 5분 타임아웃
            )
            
            print(f"📡 AI 서버 응답: {response.status_code}")
            
            if response.ok:
                result = response.json()
                print(f"✅ 분석 성공: {result.get('message', '완료')}")
                return result
            else:
                error_text = response.text
                print(f"❌ 분석 실패: {response.status_code} - {error_text}")
                return None
                
        except requests.exceptions.RequestException as e:
            print(f"❌ 네트워크 오류: {e}")
            return None
    
    def check_analysis_progress(self, video_id):
        """분석 진행률 확인"""
        try:
            response = requests.get(
                f"{self.django_api_url}/db/videos/{video_id}/progress/",
                timeout=10
            )
            
            if response.ok:
                data = response.json()
                return {
                    "progress": data.get("progress", 0),
                    "status": data.get("status", "unknown"),
                    "is_completed": data.get("is_completed", False),
                    "is_failed": data.get("is_failed", False)
                }
        except Exception as e:
            print(f"⚠️ 진행률 조회 실패: {e}")
            
        return {"progress": 0, "status": "unknown", "is_completed": False, "is_failed": False}
    
    def get_analysis_results(self, video_id):
        """분석 결과 조회"""
        try:
            response = requests.get(
                f"{self.django_api_url}/db/events/?video={video_id}",
                timeout=10
            )
            
            if response.ok:
                return response.json()
        except Exception as e:
            print(f"⚠️ 결과 조회 실패: {e}")
            
        return []

# 사용 예제
def main():
    if len(sys.argv) < 3:
        print("사용법: python analyze_video.py <video_id> <video_path>")
        print("예제: python analyze_video.py 123 /workspace/sample_video.mp4")
        sys.exit(1)
    
    video_id = sys.argv[1]
    video_path = sys.argv[2]
    
    analyzer = VideoAnalyzer()
    
    # 분석 실행
    result = analyzer.analyze_video(video_id, video_path)
    
    if result:
        # 진행률 모니터링
        print("🔍 분석 진행률 모니터링 시작...")
        while True:
            progress_info = analyzer.check_analysis_progress(video_id)
            progress = progress_info["progress"]
            status = progress_info["status"]
            
            print(f"📊 진행률: {progress}% - 상태: {status}")
            
            if progress_info["is_completed"]:
                print("✅ 분석 완료!")
                break
            elif progress_info["is_failed"]:
                print("❌ 분석 실패!")
                break
            
            time.sleep(2)  # 2초마다 확인
        
        # 최종 결과 조회
        results = analyzer.get_analysis_results(video_id)
        print(f"📋 분석 결과: {len(results)}개 이벤트 검출")

if __name__ == "__main__":
    main()
```

### 2.2 curl을 이용한 API 호출

```bash
#!/bin/bash
# AI 영상 분석 API 호출 스크립트

VIDEO_ID=$1
VIDEO_PATH=$2

if [ -z "$VIDEO_ID" ] || [ -z "$VIDEO_PATH" ]; then
    echo "사용법: ./analyze_video.sh <video_id> <video_path>"
    echo "예제: ./analyze_video.sh 123 /workspace/sample_video.mp4"
    exit 1
fi

echo "🔄 영상 분석 시작 - Video ID: $VIDEO_ID"

# AI 모델 분석 요청
RESPONSE=$(curl -s -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"video_id\": $VIDEO_ID, \"video_path\": \"$VIDEO_PATH\"}" \
    http://localhost:7500/analyze)

HTTP_CODE="${RESPONSE: -3}"
BODY="${RESPONSE%???}"

echo "📡 AI 서버 응답 코드: $HTTP_CODE"

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ 분석 요청 성공"
    echo "응답: $BODY"
    
    # 진행률 모니터링
    echo "🔍 분석 진행률 모니터링..."
    while true; do
        PROGRESS_RESPONSE=$(curl -s http://localhost:8088/db/videos/$VIDEO_ID/progress/)
        PROGRESS=$(echo $PROGRESS_RESPONSE | jq -r '.progress // 0')
        STATUS=$(echo $PROGRESS_RESPONSE | jq -r '.status // "unknown"')
        IS_COMPLETED=$(echo $PROGRESS_RESPONSE | jq -r '.is_completed // false')
        IS_FAILED=$(echo $PROGRESS_RESPONSE | jq -r '.is_failed // false')
        
        echo "📊 진행률: ${PROGRESS}% - 상태: $STATUS"
        
        if [ "$IS_COMPLETED" = "true" ]; then
            echo "✅ 분석 완료!"
            break
        elif [ "$IS_FAILED" = "true" ]; then
            echo "❌ 분석 실패!"
            break
        fi
        
        sleep 2
    done
    
    # 최종 결과 조회
    echo "📋 분석 결과 조회..."
    curl -s http://localhost:8088/db/events/?video=$VIDEO_ID | jq '.'
    
else
    echo "❌ 분석 요청 실패: $BODY"
fi
```

### 2.3 JavaScript/TypeScript API 호출 (브라우저/Node.js)

```typescript
interface AnalysisRequest {
  video_id: number;
  video_path: string;
}

interface AnalysisResult {
  success: boolean;
  message: string;
  data?: any;
}

interface ProgressInfo {
  progress: number;
  status: string;
  is_completed: boolean;
  is_failed: boolean;
}

class VideoAnalysisClient {
  private aiServiceUrl: string;
  private djangoApiUrl: string;

  constructor(
    aiServiceUrl = "http://localhost:7500",
    djangoApiUrl = "http://localhost:8088"
  ) {
    this.aiServiceUrl = aiServiceUrl;
    this.djangoApiUrl = djangoApiUrl;
  }

  async analyzeVideo(videoId: number, videoPath: string): Promise<AnalysisResult | null> {
    console.log(`🔄 영상 분석 시작 - Video ID: ${videoId}`);

    const payload: AnalysisRequest = {
      video_id: videoId,
      video_path: videoPath
    };

    try {
      const response = await fetch(`${this.aiServiceUrl}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log(`📡 AI 서버 응답: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ 분석 성공: ${result.message || "완료"}`);
        return result;
      } else {
        const errorText = await response.text();
        console.log(`❌ 분석 실패: ${response.status} - ${errorText}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 네트워크 오류:`, error);
      return null;
    }
  }

  async checkProgress(videoId: number): Promise<ProgressInfo> {
    try {
      const response = await fetch(
        `${this.djangoApiUrl}/db/videos/${videoId}/progress/`
      );

      if (response.ok) {
        const data = await response.json();
        return {
          progress: data.progress || 0,
          status: data.status || "unknown",
          is_completed: data.is_completed || false,
          is_failed: data.is_failed || false,
        };
      }
    } catch (error) {
      console.warn("⚠️ 진행률 조회 실패:", error);
    }

    return {
      progress: 0,
      status: "unknown",
      is_completed: false,
      is_failed: false,
    };
  }

  async getResults(videoId: number): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.djangoApiUrl}/db/events/?video=${videoId}`
      );

      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data) ? data : data.results || [];
      }
    } catch (error) {
      console.warn("⚠️ 결과 조회 실패:", error);
    }

    return [];
  }

  async monitorAnalysis(videoId: number): Promise<any[]> {
    console.log("🔍 분석 진행률 모니터링 시작...");

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        const progress = await this.checkProgress(videoId);
        
        console.log(`📊 진행률: ${progress.progress}% - 상태: ${progress.status}`);

        if (progress.is_completed) {
          clearInterval(checkInterval);
          console.log("✅ 분석 완료!");
          const results = await this.getResults(videoId);
          console.log(`📋 분석 결과: ${results.length}개 이벤트 검출`);
          resolve(results);
        } else if (progress.is_failed) {
          clearInterval(checkInterval);
          console.log("❌ 분석 실패!");
          reject(new Error("분석이 실패했습니다."));
        }
      }, 2000); // 2초마다 확인

      // 10분 타임아웃
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error("분석 타임아웃"));
      }, 600000);
    });
  }
}

// 사용 예제
async function example() {
  const client = new VideoAnalysisClient();
  
  const videoId = 123;
  const videoPath = "/workspace/sample_video.mp4";
  
  // 분석 시작
  const result = await client.analyzeVideo(videoId, videoPath);
  
  if (result) {
    // 진행률 모니터링 및 결과 대기
    try {
      const finalResults = await client.monitorAnalysis(videoId);
      console.log("최종 결과:", finalResults);
    } catch (error) {
      console.error("분석 모니터링 실패:", error);
    }
  }
}
```

## 3. 환경 설정

### 3.1 Docker 환경 변수
```bash
# AI 모델 컨테이너 환경 변수
export MODEL_PORT=7500
export DJANGO_DB_URL=http://host.docker.internal:8088/db
export VIDEO_WORKSPACE=/workspace
export MODEL_CONFIG_PATH=/app/config/model.json
```

### 3.2 네트워크 설정
```bash
# Docker 네트워크 생성 (필요한 경우)
docker network create video-analysis-network

# 컨테이너들을 같은 네트워크에 연결
docker network connect video-analysis-network ai-video-analyzer
docker network connect video-analysis-network django-backend
```

## 4. 실제 사용 시나리오

### 시나리오 1: 새 영상 업로드 및 분석
```bash
# 1. 비디오 파일 업로드 (Front-end에서 처리됨)
# 2. Django DB에 비디오 정보 저장
# 3. AI 분석 모델 호출
python analyze_video.py 123 /workspace/new_video.mp4
```

### 시나리오 2: 기존 영상 재분석
```bash
# 기존 비디오 ID로 재분석 실행
./analyze_video.sh 456 /workspace/existing_video.mp4
```

### 시나리오 3: 배치 처리
```bash
# 여러 영상 동시 분석
for video_id in 123 124 125; do
    python analyze_video.py $video_id /workspace/video_$video_id.mp4 &
done
wait  # 모든 분석 완료 대기
```

## 5. 모니터링 및 디버깅

### 로그 확인
```bash
# AI 모델 컨테이너 로그
docker logs -f ai-video-analyzer

# Django 백엔드 로그
cd /home/uns/code/project/back
python manage.py runserver --verbosity=2

# 실시간 분석 진행률 모니터링
watch -n 2 'curl -s http://localhost:8088/db/videos/123/progress/ | jq .'
```

### API 상태 확인
```bash
# AI 서비스 헬스체크
curl -I http://localhost:7500/

# Django API 헬스체크
curl -s http://localhost:8088/db/videos/ | jq '.results | length'
```

이 문서는 실제 프로덕션 환경에서 AI 영상 분석 모델을 호출하고 모니터링하는 완전한 가이드입니다.
