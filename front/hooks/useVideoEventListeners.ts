import { useEffect, RefObject } from 'react';

interface UseVideoEventListenersProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  isMobile?: boolean;
  setCurrentTime: (value: number | ((prev: number) => number)) => void;
  setDuration: (value: number) => void;
  setIsPlaying?: (value: boolean) => void;
  setVideoError?: (value: string | null) => void;
  setVideoReady?: (value: boolean) => void;
}

/**
 * 비디오 엘리먼트의 모든 이벤트 리스너를 관리하는 커스텀 훅
 * - 시간 업데이트 (timeupdate, progress, seeking, seeked)
 * - 메타데이터 로딩 (loadedmetadata, loadeddata, canplay, canplaythrough)
 * - 재생 제어 (play, pause)
 * - 에러 처리 (error, abort, stalled)
 * - 모바일 최적화 (muted, playsInline)
 */
export function useVideoEventListeners({
  videoRef,
  videoSrc,
  isMobile = false,
  setCurrentTime,
  setDuration,
  setIsPlaying,
  setVideoError,
  setVideoReady,
}: UseVideoEventListenersProps) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    // 모바일 최적화 설정
    if (isMobile) {
      video.muted = true;
      video.playsInline = true;
      video.controls = false;
    }

    const updateTime = () => {
      try {
        if (
          video &&
          video.currentTime !== undefined &&
          !isNaN(video.currentTime)
        ) {
          const newCurrentTime = video.currentTime;
          // 성능 최적화: 시간이 실제로 변경된 경우에만 상태 업데이트
          setCurrentTime((prevTime) => {
            // 0.1초 이상 차이가 날 때만 업데이트 (과도한 렌더링 방지)
            if (Math.abs(newCurrentTime - prevTime) >= 0.1) {
              return newCurrentTime;
            }
            return prevTime;
          });
        }
      } catch (error) {
        console.warn('Update time error:', error);
      }
    };

    const updateDuration = () => {
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setDuration(video.duration);
        console.log('Duration updated:', video.duration);
      }
    };

    const handleError = (e: Event) => {
      console.error('Video event error:', e);
      const target = e.target as HTMLVideoElement;
      const error = target.error;

      if (error) {
        console.error('Video error details:', {
          code: error.code,
          message: error.message,
          networkState: target.networkState,
          readyState: target.readyState,
        });

        if (setVideoError) {
          setVideoError(`비디오 오류: ${error.message}`);
        }
        if (setIsPlaying) {
          setIsPlaying(false);
        }
        if (setVideoReady) {
          setVideoReady(false);
        }
      }
    };

    const handleLoadedData = () => {
      console.log('Video data loaded successfully');
      if (video.videoWidth && video.videoHeight) {
        console.log(
          'Video dimensions:',
          video.videoWidth,
          'x',
          video.videoHeight
        );
      }
      if (setVideoError) {
        setVideoError(null);
      }
      if (setVideoReady) {
        setVideoReady(true);
      }
    };

    const handleLoadedMetadata = () => {
      console.log('Video metadata loaded, ready state:', video.readyState);
      updateDuration();
    };

    const handleCanPlay = () => {
      console.log('Video can play, ready state:', video.readyState);
      updateDuration();
      if (setVideoReady) {
        setVideoReady(true);
      }
    };

    const handleCanPlayThrough = () => {
      console.log('Video can play through, ready state:', video.readyState);
      if (setVideoReady) {
        setVideoReady(true);
      }
    };

    const handleTimeUpdate = () => {
      try {
        updateTime();
        // 디버깅용 로그 (개발 중에만 활성화)
        if (process.env.NODE_ENV === 'development') {
          console.log(`Video time update: ${video.currentTime?.toFixed(2)}s`);
        }
      } catch (error) {
        console.warn('Handle time update error:', error);
      }
    };

    const handlePlay = () => {
      if (setIsPlaying) {
        setIsPlaying(true);
      }
    };

    const handlePause = () => {
      if (setIsPlaying) {
        setIsPlaying(false);
      }
    };

    try {
      // 시간 업데이트 관련 이벤트들 - 더 많은 이벤트를 등록해서 확실히 작동하도록
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('progress', handleTimeUpdate); // 추가: 버퍼링 진행 시에도 시간 업데이트
      video.addEventListener('seeking', handleTimeUpdate); // 추가: 탐색 중에도 시간 업데이트
      video.addEventListener('seeked', handleTimeUpdate); // 추가: 탐색 완료 시에도 시간 업데이트

      // 기존 이벤트들
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('canplaythrough', handleCanPlayThrough);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('error', handleError);
      video.addEventListener('abort', handleError);
      video.addEventListener('stalled', handleError);

      // 초기 duration 설정 시도
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }

      // 초기 currentTime 설정 시도
      if (video.currentTime !== undefined && !isNaN(video.currentTime)) {
        setCurrentTime(video.currentTime);
      }

      return () => {
        // 모든 이벤트 리스너 제거
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('progress', handleTimeUpdate);
        video.removeEventListener('seeking', handleTimeUpdate);
        video.removeEventListener('seeked', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('error', handleError);
        video.removeEventListener('abort', handleError);
        video.removeEventListener('stalled', handleError);
      };
    } catch (error) {
      console.error('Video event listener error:', error);
    }
  }, [
    videoRef,
    videoSrc,
    isMobile,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setVideoError,
    setVideoReady,
  ]);
}
