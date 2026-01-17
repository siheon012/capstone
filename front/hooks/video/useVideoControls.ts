import { RefObject } from 'react';

interface UseVideoControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  isPlaying: boolean;
  duration: number;
  isMobile: boolean;
  videoSectionRef?: RefObject<HTMLDivElement | null>;
  setIsPlaying: (playing: boolean) => void;
  addToast: (toast: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration: number;
  }) => void;
}

export const useVideoControls = ({
  videoRef,
  videoSrc,
  isPlaying,
  duration,
  isMobile,
  videoSectionRef,
  setIsPlaying,
  addToast,
}: UseVideoControlsProps) => {
  const togglePlayPause = () => {
    try {
      // 비디오 참조와 소스 유효성 검사
      if (!videoRef.current) {
        console.warn('Video reference not available');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오가 아직 로드되지 않았습니다.',
          duration: 2000,
        });
        return;
      }

      if (!videoSrc) {
        console.warn('Video source not available');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오 파일을 먼저 업로드해주세요.',
          duration: 2000,
        });
        return;
      }

      const video = videoRef.current;

      // 비디오 준비 상태 검사 (모바일에서는 더 관대하게)
      const isVideoReady =
        video.readyState >= 2 || (isMobile && video.readyState >= 1);

      if (!isVideoReady && !isMobile) {
        console.warn('Video not ready to play, readyState:', video.readyState);
        addToast({
          type: 'info',
          title: '비디오 로딩 중',
          message: '비디오가 로드될 때까지 잠시 기다려주세요.',
          duration: 2000,
        });
        return;
      }

      if (isPlaying) {
        // 일시정지
        video.pause();
        setIsPlaying(false);
        console.log('Video paused');
      } else {
        // 재생
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              console.log('Video playing');
            })
            .catch((error) => {
              console.error('Play error:', error);
              setIsPlaying(false);

              if (error.name === 'NotAllowedError') {
                addToast({
                  type: 'warning',
                  title: '재생 권한',
                  message:
                    '브라우저 정책상 자동 재생이 차단되었습니다. 비디오를 클릭하여 재생해주세요.',
                  duration: 3000,
                });
              } else {
                addToast({
                  type: 'error',
                  title: '재생 오류',
                  message: '비디오 재생 중 오류가 발생했습니다.',
                  duration: 3000,
                });
              }
            });
        }
      }
    } catch (error) {
      console.error('Toggle play/pause error:', error);
      setIsPlaying(false);
      addToast({
        type: 'error',
        title: '비디오 컨트롤 오류',
        message: '비디오 컨트롤 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  const skipForward = () => {
    try {
      // 비디오 참조와 소스 유효성 검사
      if (!videoRef.current) {
        console.warn('Video reference not available for skip forward');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오가 아직 로드되지 않았습니다.',
          duration: 2000,
        });
        return;
      }

      if (!videoSrc) {
        console.warn('Video source not available for skip forward');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오 파일을 먼저 업로드해주세요.',
          duration: 2000,
        });
        return;
      }

      const video = videoRef.current;

      // 비디오 준비 상태 검사
      const isVideoReady = video.readyState >= 1 || isMobile;

      if (!isVideoReady) {
        console.warn(
          'Video not ready for skip forward, readyState:',
          video.readyState
        );
        addToast({
          type: 'info',
          title: '비디오 로딩 중',
          message: '비디오가 로드될 때까지 잠시 기다려주세요.',
          duration: 2000,
        });
        return;
      }

      const videoDuration = duration || video.duration || 0;
      if (videoDuration === 0) {
        console.warn('Video duration not available');
        addToast({
          type: 'warning',
          title: '비디오 정보',
          message: '비디오 길이 정보를 가져올 수 없습니다.',
          duration: 2000,
        });
        return;
      }

      const currentTime = video.currentTime;
      const newTime = Math.min(currentTime + 10, videoDuration);

      // 이미 끝에 도달한 경우
      if (currentTime >= videoDuration - 1) {
        addToast({
          type: 'info',
          title: '비디오 끝',
          message: '비디오의 끝에 도달했습니다.',
          duration: 2000,
        });
        return;
      }

      video.currentTime = newTime;
      console.log(`Skipped forward to: ${newTime.toFixed(2)}s`);
    } catch (error) {
      console.error('Skip forward error:', error);
      addToast({
        type: 'error',
        title: '탐색 오류',
        message: '비디오 앞으로 이동 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  const skipBackward = () => {
    try {
      // 비디오 참조와 소스 유효성 검사
      if (!videoRef.current) {
        console.warn('Video reference not available for skip backward');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오가 아직 로드되지 않았습니다.',
          duration: 2000,
        });
        return;
      }

      if (!videoSrc) {
        console.warn('Video source not available for skip backward');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오 파일을 먼저 업로드해주세요.',
          duration: 2000,
        });
        return;
      }

      const video = videoRef.current;

      // 비디오 준비 상태 검사
      const isVideoReady = video.readyState >= 1 || isMobile;

      if (!isVideoReady) {
        console.warn(
          'Video not ready for skip backward, readyState:',
          video.readyState
        );
        addToast({
          type: 'info',
          title: '비디오 로딩 중',
          message: '비디오가 로드될 때까지 잠시 기다려주세요.',
          duration: 2000,
        });
        return;
      }

      const currentTime = video.currentTime;
      const newTime = Math.max(currentTime - 10, 0);

      // 이미 시작 부분에 있는 경우
      if (currentTime <= 1) {
        addToast({
          type: 'info',
          title: '비디오 시작',
          message: '비디오의 시작 부분입니다.',
          duration: 2000,
        });
        video.currentTime = 0; // 정확히 시작점으로 이동
        return;
      }

      video.currentTime = newTime;
      console.log(`Skipped backward to: ${newTime.toFixed(2)}s`);
    } catch (error) {
      console.error('Skip backward error:', error);
      addToast({
        type: 'error',
        title: '탐색 오류',
        message: '비디오 뒤로 이동 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  const seekToTime = (time: number) => {
    console.log(`[SeekToTime] 함수 호출됨 - time: ${time}`);
    console.log(`[SeekToTime] videoRef.current:`, videoRef.current);
    console.log(`[SeekToTime] videoSrc:`, videoSrc);

    try {
      // 입력값 유효성 검사
      if (typeof time !== 'number' || isNaN(time) || time < 0) {
        console.warn('[SeekToTime] Invalid time value for seek:', time);
        addToast({
          type: 'warning',
          title: '탐색 오류',
          message: '잘못된 시간 값입니다.',
          duration: 2000,
        });
        return;
      }

      // 비디오 참조와 소스 유효성 검사
      if (!videoRef.current) {
        console.warn('[SeekToTime] Video reference not available for seek');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오가 아직 로드되지 않았습니다.',
          duration: 2000,
        });
        return;
      }

      if (!videoSrc) {
        console.warn('Video source not available for seek');
        addToast({
          type: 'warning',
          title: '비디오 컨트롤',
          message: '비디오 파일을 먼저 업로드해주세요.',
          duration: 2000,
        });
        return;
      }

      const video = videoRef.current;

      // 비디오 준비 상태 검사
      const isVideoReady = video.readyState >= 1 || isMobile;

      if (!isVideoReady) {
        console.warn('Video not ready for seek, readyState:', video.readyState);
        addToast({
          type: 'info',
          title: '비디오 로딩 중',
          message: '비디오가 로드될 때까지 잠시 기다려주세요.',
          duration: 2000,
        });
        return;
      }

      const videoDuration = duration || video.duration || 0;
      if (videoDuration === 0) {
        console.warn('Video duration not available for seek');
        addToast({
          type: 'warning',
          title: '비디오 정보',
          message: '비디오 길이 정보를 가져올 수 없습니다.',
          duration: 2000,
        });
        return;
      }

      // 유효한 시간 범위로 제한
      const targetTime = Math.min(Math.max(time, 0), videoDuration);

      if (time > videoDuration) {
        console.warn(
          `Seek time ${time} exceeds video duration ${videoDuration}`
        );
        addToast({
          type: 'warning',
          title: '탐색 범위 초과',
          message: '비디오 길이를 초과하는 시간입니다.',
          duration: 2000,
        });
      }

      video.currentTime = targetTime;
      console.log(`Seeked to: ${targetTime.toFixed(2)}s`);

      // 모바일에서 타임스탬프 클릭 시 비디오 영역으로 스크롤
      if (isMobile && videoSectionRef?.current) {
        try {
          videoSectionRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });

          // 스크롤 후 잠시 대기하고 비디오 재생 (선택사항)
          setTimeout(() => {
            if (video && !isPlaying) {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch((error) => {
                  console.warn('Auto play after seek failed:', error);
                });
              }
            }
          }, 500);
        } catch (scrollError) {
          console.warn('Scroll to video failed:', scrollError);
        }
      }
    } catch (error) {
      console.error('Seek error:', error);
      addToast({
        type: 'error',
        title: '탐색 오류',
        message: '비디오 탐색 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  return {
    togglePlayPause,
    skipForward,
    skipBackward,
    seekToTime,
  };
};
