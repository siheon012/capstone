'use client';

import type React from 'react';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Minimize2, Maximize2, RotateCcw } from 'lucide-react';

interface VideoMinimapProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  videoReady?: boolean; // 메인 페이지와 호환성을 위해 추가
  timeMarkers: number[];
  onSeek: (time: number) => void;
}

// 썸네일 캐시 타입 정의
interface ThumbnailCache {
  [key: string]: string[];
}

// 전역 썸네일 캐시 (동일한 비디오의 썸네일 재사용)
const thumbnailCache: ThumbnailCache = {};

export default function VideoMinimap({
  videoRef,
  currentTime,
  duration,
  videoReady = true, // 기본값 true로 설정 (기존 호환성 보장)
  timeMarkers,
  onSeek,
}: VideoMinimapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // 모바일 감지 훅 최적화
  const [isMobile, setIsMobile] = useState(false);

  const checkMobile = useCallback(() => {
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobileDevice =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent.toLowerCase()
      );
    const isSmallScreen = window.innerWidth <= 768;
    setIsMobile(isMobileDevice || isSmallScreen);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  // 비디오 준비 상태 확인 최적화
  const checkVideoReady = useCallback(() => {
    const video = videoRef.current;
    if (!video) return false;

    if (video.readyState >= 3) {
      // HAVE_FUTURE_DATA 이상
      setIsVideoReady(true);
      return true;
    }
    return false;
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 초기 상태 확인
    checkVideoReady();

    // 이벤트 리스너 등록 (최적화된 이벤트 목록)
    const events = ['loadeddata', 'canplay', 'canplaythrough'];
    events.forEach((event) => {
      video.addEventListener(event, checkVideoReady);
    });

    return () => {
      events.forEach((event) => {
        video.removeEventListener(event, checkVideoReady);
      });
    };
  }, [videoRef.current, checkVideoReady]);

  // 캐시 키 생성 (비디오 src + duration + 썸네일 수)
  const cacheKey = useMemo(() => {
    if (!videoRef.current?.src || !duration) return '';
    const thumbnailCount = isMobile ? 6 : 10;
    return `${videoRef.current.src}_${duration}_${thumbnailCount}`;
  }, [videoRef.current?.src, duration, isMobile]);

  // 썸네일 생성 최적화 - 외부 videoReady prop과 내부 상태를 조합
  useEffect(() => {
    const effectiveVideoReady = videoReady && isVideoReady; // 외부와 내부 모두 준비되어야 함
    if (
      videoRef.current &&
      duration > 0 &&
      effectiveVideoReady &&
      !isGenerating
    ) {
      // 캐시된 썸네일이 있는지 확인
      if (cacheKey && thumbnailCache[cacheKey]) {
        console.log('[VideoMinimap] 캐시된 썸네일 사용');
        setThumbnails(thumbnailCache[cacheKey]);
        return;
      }
      generateThumbnails();
    }
  }, [
    videoRef.current,
    duration,
    videoReady, // 외부 prop 추가
    isVideoReady, // 내부 state
    retryCount,
    cacheKey,
    isGenerating,
  ]);

  const generateThumbnails = useCallback(async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      duration <= 0 ||
      isGenerating
    )
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', {
      alpha: false, // 알파 채널 비활성화로 성능 향상
      willReadFrequently: true, // 빈번한 읽기 작업 최적화
    });
    if (!ctx) return;

    setIsGenerating(true);
    setThumbnails([]);

    try {
      console.log(
        `[VideoMinimap] 썸네일 생성 시도 - readyState: ${video.readyState}, duration: ${duration}`
      );

      // 모바일에서는 더 작은 캔버스 사용 (성능 최적화)
      canvas.width = isMobile ? 80 : 120; // 해상도 약간 줄여서 성능 향상
      canvas.height = isMobile ? 45 : 68;

      const thumbnailCount = isMobile ? 6 : 10;
      const newThumbnails: string[] = [];

      // 비디오가 충분히 준비되었는지 확인
      if (video.readyState < 2) {
        // HAVE_CURRENT_DATA 미만
        console.log(
          `[VideoMinimap] 비디오가 충분히 로드되지 않음 (readyState: ${video.readyState}), 대기 중...`
        );

        // 타임아웃을 줄여서 응답성 향상
        await Promise.race([
          new Promise<void>((resolve) => {
            const readyHandler = () => {
              if (video.readyState >= 2) {
                video.removeEventListener('canplaythrough', readyHandler);
                video.removeEventListener('loadeddata', readyHandler);
                resolve();
              }
            };
            video.addEventListener('canplaythrough', readyHandler);
            video.addEventListener('loadeddata', readyHandler);
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error('비디오 로드 타임아웃'));
            }, 8000); // 타임아웃 시간 단축
          }),
        ]).catch((error) => {
          console.warn(
            `[VideoMinimap] ${error.message}, 현재 상태로 계속 시도합니다.`
          );
        });
      }

      // 원본 시간 저장
      const originalTime = video.currentTime;

      // 병렬로 처리할 수 있는 썸네일들을 배치로 나누어 처리
      const batchSize = isMobile ? 2 : 3; // 배치 크기 조정

      for (
        let batch = 0;
        batch < Math.ceil(thumbnailCount / batchSize);
        batch++
      ) {
        const promises: Promise<string>[] = [];

        for (
          let i = batch * batchSize;
          i < Math.min((batch + 1) * batchSize, thumbnailCount);
          i++
        ) {
          const time = (duration / thumbnailCount) * i;
          promises.push(
            generateSingleThumbnail(video, canvas, ctx, time, i, thumbnailCount)
          );
        }

        // 배치 단위로 병렬 처리
        const batchResults = await Promise.allSettled(promises);
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            newThumbnails.push(result.value);
          } else {
            console.warn('썸네일 생성 실패:', result.reason);
            newThumbnails.push('/placeholder.svg?height=45&width=80');
          }
        });

        // 배치 간 짧은 대기 시간으로 UI 블로킹 방지
        if (batch < Math.ceil(thumbnailCount / batchSize) - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, isMobile ? 50 : 20)
          );
        }
      }

      // 원본 시간으로 복원
      video.currentTime = originalTime;

      console.log(`[VideoMinimap] 썸네일 생성 완료: ${newThumbnails.length}개`);
      setThumbnails(newThumbnails);

      // 캐시에 저장
      if (cacheKey) {
        thumbnailCache[cacheKey] = newThumbnails;
      }
    } catch (error) {
      console.error('[VideoMinimap] 썸네일 생성 실패:', error);

      const fallbackThumbnails = Array(isMobile ? 6 : 10).fill(
        '/placeholder.svg?height=45&width=80'
      );
      setThumbnails(fallbackThumbnails);

      if (retryCount < 2) {
        // 재시도 횟수 줄임
        console.log(`[VideoMinimap] 썸네일 생성 재시도 ${retryCount + 1}/2...`);
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 2000); // 재시도 간격 단축
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
    videoRef.current,
    duration,
    isMobile,
    cacheKey,
    retryCount,
    isGenerating,
  ]);

  // 단일 썸네일 생성 함수 (최적화됨)
  const generateSingleThumbnail = useCallback(
    async (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      time: number,
      index: number,
      totalCount: number
    ): Promise<string> => {
      try {
        // 비디오 시간 설정
        video.currentTime = time;
        console.log(
          `[VideoMinimap] 썸네일 ${
            index + 1
          }/${totalCount} 생성 중 - 시간: ${time.toFixed(1)}초`
        );

        // seek 완료 대기 (타임아웃 시간 최적화)
        const seekTimeout = isMobile ? 1500 : 800;

        await Promise.race([
          new Promise((resolve) => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              video.removeEventListener('timeupdate', handleTimeUpdate);
              resolve(true);
            };

            const handleTimeUpdate = () => {
              if (Math.abs(video.currentTime - time) < 0.3) {
                // 허용 오차 줄임
                video.removeEventListener('seeked', handleSeeked);
                video.removeEventListener('timeupdate', handleTimeUpdate);
                resolve(true);
              }
            };

            video.addEventListener('seeked', handleSeeked);
            video.addEventListener('timeupdate', handleTimeUpdate);
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Seek timeout')), seekTimeout);
          }),
        ]);

        // 모바일에서 프레임 안정화 대기 시간 단축
        if (isMobile) {
          await new Promise((resolve) => setTimeout(resolve, 50)); // 100ms → 50ms
        }

        // 캔버스에 비디오 프레임 그리기
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // WebP 지원 확인 후 최적 포맷 선택
        const format = webPSupported ? 'image/webp' : 'image/jpeg';
        const quality = isMobile ? 0.4 : 0.6; // 품질 조정으로 성능 향상

        return canvas.toDataURL(format, quality);
      } catch (error) {
        console.warn(`Failed to generate thumbnail ${index}:`, error);
        return '/placeholder.svg?height=45&width=80';
      }
    },
    [isMobile]
  );

  // WebP 지원 확인 함수 (메모이제이션)
  const webPSupported = useMemo(() => {
    let supported = false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      supported =
        canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      supported = false;
    }
    return supported;
  }, []);

  // 미니맵 클릭 핸들러 최적화
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent) => {
      if (!minimapRef.current) return;

      const rect = minimapRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const seekTime = percentage * duration;

      onSeek(seekTime);
    },
    [duration, onSeek]
  );

  // 시간 포맷팅 함수 최적화
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 썸네일 재생성 핸들러
  const handleRegenerateThumbnails = useCallback(() => {
    // 캐시 삭제
    if (cacheKey) {
      delete thumbnailCache[cacheKey];
    }
    setThumbnails([]);
    setRetryCount((prev) => prev + 1);
  }, [cacheKey]);

  return (
    <>
      {/* 숨겨진 캔버스 (썸네일 생성용) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 미니맵 */}
      <div
        className={`fixed z-40 transition-all duration-300 ${
          isMobile
            ? isExpanded
              ? 'bottom-2 right-2 w-72 h-48'
              : 'bottom-2 right-2 w-40 h-24'
            : isExpanded
            ? 'bottom-4 right-4 w-96 h-64'
            : 'bottom-4 right-4 w-48 h-32'
        }`}
      >
        <Card className="bg-[#242a38] border border-[#2a3142] shadow-2xl h-full">
          <CardContent className="p-3 h-full flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">
                비디오 미니맵
              </h3>
              <div className="flex gap-1">
                {/* 썸네일 생성 재시도 버튼 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-[#00e6b4]"
                  onClick={handleRegenerateThumbnails}
                  disabled={isGenerating}
                  title="썸네일 다시 생성"
                >
                  <RotateCcw
                    className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-[#00e6b4]"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* 썸네일 그리드 */}
            <div className="flex-1 overflow-hidden">
              {thumbnails.length > 0 ? (
                <div
                  className={`grid gap-1 h-full ${
                    isExpanded
                      ? isMobile
                        ? 'grid-cols-3 grid-rows-2'
                        : 'grid-cols-5 grid-rows-2'
                      : isMobile
                      ? 'grid-cols-2 grid-rows-3'
                      : 'grid-cols-3 grid-rows-2'
                  }`}
                >
                  {thumbnails.map((thumbnail, index) => {
                    const thumbnailTime =
                      (duration / thumbnails.length) * index;
                    const isActive =
                      Math.abs(currentTime - thumbnailTime) <
                      duration / thumbnails.length / 2;

                    return (
                      <div
                        key={index}
                        className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all ${
                          isActive
                            ? 'border-[#00e6b4] scale-105'
                            : 'border-transparent hover:border-[#3694ff]'
                        }`}
                        onClick={() => onSeek(thumbnailTime)}
                      >
                        {thumbnail.includes('placeholder') ? (
                          <div className="w-full h-full bg-[#1a1f2c] flex items-center justify-center">
                            <div className="text-xs text-gray-500">썸네일</div>
                          </div>
                        ) : (
                          <img
                            src={thumbnail}
                            alt={`Thumbnail ${index + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy" // 지연 로딩으로 성능 향상
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                '/placeholder.svg?height=45&width=80';
                            }}
                          />
                        )}

                        {/* 시간 표시 */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white px-1 py-0.5 text-xs">
                          {formatTime(thumbnailTime)}
                        </div>

                        {/* 마커 표시 */}
                        {timeMarkers.some(
                          (marker) =>
                            Math.abs(marker - thumbnailTime) <
                            duration / thumbnails.length / 2
                        ) && (
                          <div className="absolute top-1 right-1 w-2 h-2 bg-[#6c5ce7] rounded-full"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                  {isGenerating
                    ? isMobile
                      ? '생성 중...'
                      : '썸네일 생성 중...'
                    : isMobile
                    ? '썸네일 로딩...'
                    : '썸네일 생성 중...'}
                </div>
              )}
            </div>

            {/* 진행 바 */}
            <div
              ref={minimapRef}
              className="mt-2 h-2 bg-[#1a1f2c] rounded-full cursor-pointer relative overflow-hidden"
              onClick={handleMinimapClick}
            >
              {/* 전체 진행 바 */}
              <div
                className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30 transition-all"
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />

              {/* 현재 위치 표시 */}
              <div
                className="absolute top-0 h-full w-1 bg-[#00e6b4] transition-all"
                style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
              />

              {/* 마커들 */}
              {timeMarkers.map((time, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full w-0.5 bg-[#6c5ce7]"
                  style={{ left: `${(time / (duration || 1)) * 100}%` }}
                />
              ))}
            </div>

            {/* 시간 정보 */}
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
