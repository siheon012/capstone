/**
 * 비디오 메타데이터 사전 추출 및 검증 유틸리티
 * 메인 페이지와 동일한 수준의 비디오 준비 상태를 보장
 */

export interface VideoMetadata {
  duration: number;
  videoWidth: number;
  videoHeight: number;
  readyState: number;
}

/**
 * 서버에서 로드된 비디오의 메타데이터를 사전 추출
 * getVideoDurationFromFile과 동일한 검증 로직 적용
 */
export const getVideoMetadataFromUrl = (
  videoUrl: string
): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous'; // CORS 이슈 방지

    // 타임아웃 설정 (10초)
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video metadata extraction timeout'));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.src = '';
    };

    const handleLoadedMetadata = () => {
      console.log(
        `[VideoUtils] Metadata loaded - readyState: ${video.readyState}, duration: ${video.duration}`
      );

      // duration이 유효한지 확인 (getVideoDurationFromFile과 동일한 검증)
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        // canplaythrough 이벤트까지 기다려서 완전한 준비 상태 보장
        if (video.readyState >= 4) {
          // HAVE_ENOUGH_DATA
          cleanup();
          resolve({
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
          });
        }
      } else {
        cleanup();
        reject(new Error('Invalid video duration'));
      }
    };

    const handleCanPlayThrough = () => {
      console.log(
        `[VideoUtils] Can play through - readyState: ${video.readyState}`
      );
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        cleanup();
        resolve({
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        });
      }
    };

    const handleError = (e: Event) => {
      cleanup();
      reject(new Error(`Failed to load video metadata: ${e.type}`));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('error', handleError);
    video.addEventListener('abort', handleError);

    // 비디오 소스 설정
    video.src = videoUrl;
  });
};

/**
 * 비디오 엘리먼트가 완전히 준비될 때까지 대기
 * VideoMinimap에서 요구하는 최소 준비 상태 보장
 */
export const waitForVideoReady = (
  video: HTMLVideoElement,
  targetReadyState: number = 2
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video ready state timeout'));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('canplaythrough', handleReady);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
    };

    const handleReady = () => {
      if (video.readyState >= targetReadyState) {
        cleanup();
        resolve();
      }
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video loading error'));
    };

    // 이미 준비되어 있다면 즉시 resolve
    if (video.readyState >= targetReadyState) {
      resolve();
      return;
    }

    video.addEventListener('canplaythrough', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);
  });
};

/**
 * 비디오 로드 상태를 모니터링하고 콘솔에 출력
 */
export const logVideoState = (video: HTMLVideoElement, context: string) => {
  console.log(`[${context}] Video State:`, {
    readyState: video.readyState,
    duration: video.duration,
    currentTime: video.currentTime,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    networkState: video.networkState,
    error: video.error,
  });
};
