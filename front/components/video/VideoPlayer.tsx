'use client';

import React, { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Info,
  AlertTriangle,
} from 'lucide-react';

interface VideoPlayerProps {
  videoSrc: string | null;
  videoFileName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  timeMarkers: number[];
  isAnalyzing: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadStage: string;
  analysisProgress: number;
  videoLoading: boolean;
  videoError: string | null;
  isMobile: boolean;
  onTogglePlayPause: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onSeekToTime: (time: number) => void;
  onCancelProcess: () => void;
  onInfoClick: (data: { title: string; content: string }) => void;
  onVideoError: (error: string | null) => void;
  onTimeUpdate: () => void;
  formatTime: (seconds: number) => string;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      videoSrc,
      videoFileName,
      isPlaying,
      currentTime,
      duration,
      timeMarkers,
      isAnalyzing,
      isUploading,
      uploadProgress,
      uploadStage,
      analysisProgress,
      videoLoading,
      videoError,
      isMobile,
      onTogglePlayPause,
      onSkipForward,
      onSkipBackward,
      onSeekToTime,
      onCancelProcess,
      onInfoClick,
      onVideoError,
      onTimeUpdate,
      formatTime,
    },
    ref
  ) => {
    if (!videoSrc) return null;

    return (
      <>
        {/* Video Card */}
        <Card className="mb-4 md:mb-6 bg-[#242a38] border-0 shadow-lg">
          <CardContent className="p-4 md:p-6">
            <div className="relative">
              {/* Upload Progress Overlay */}
              {isUploading && (
                <div
                  className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10"
                  style={{
                    animation: 'borderGlowPurple 2s ease-in-out infinite',
                  }}
                >
                  <div className="relative w-24 h-24 md:w-32 md:h-32 mb-4">
                    <svg
                      className="w-full h-full transform -rotate-90"
                      viewBox="0 0 100 100"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke="#2a3142"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke="#6c5ce7"
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${
                          2 * Math.PI * 45 * (1 - uploadProgress / 100)
                        }`}
                        className="transition-all duration-300 ease-out"
                        style={{
                          filter:
                            'drop-shadow(0 0 8px rgba(108, 92, 231, 0.6))',
                        }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[#6c5ce7] font-bold text-lg md:text-xl">
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-white text-sm md:text-base font-medium mb-2">
                    동영상 업로드 중입니다.
                  </p>
                  <p className="text-gray-300 text-xs md:text-sm text-center px-4 mb-4">
                    {uploadStage || '파일을 처리하고 있습니다...'}
                  </p>
                  <button
                    onClick={onCancelProcess}
                    className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#6c5ce7] hover:border-[#5a4fcf]"
                  >
                    취소
                  </button>
                </div>
              )}

              {/* Analysis Progress Overlay */}
              {isAnalyzing && (
                <div
                  className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10"
                  style={{
                    animation: 'borderGlow 2s ease-in-out infinite',
                  }}
                >
                  <div className="relative w-24 h-24 md:w-32 md:h-32 mb-4">
                    <svg
                      className="w-full h-full transform -rotate-90"
                      viewBox="0 0 100 100"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke="#2a3142"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke="#00e6b4"
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${
                          2 * Math.PI * 45 * (1 - analysisProgress / 100)
                        }`}
                        className="transition-all duration-300 ease-out"
                        style={{
                          filter: 'drop-shadow(0 0 8px rgba(0, 230, 180, 0.6))',
                        }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[#00e6b4] font-bold text-lg md:text-xl">
                        {Math.round(analysisProgress)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-white text-sm md:text-base font-medium mb-2">
                    {analysisProgress === 0
                      ? '영상 분석 준비 중...'
                      : analysisProgress < 10
                      ? '영상 분석 시작 중...'
                      : analysisProgress < 50
                      ? '영상 분석 중...'
                      : analysisProgress < 90
                      ? '영상 분석 중...'
                      : '영상 분석 완료 중...'}
                  </p>
                  <p className="text-gray-300 text-xs md:text-sm text-center px-4 mb-4">
                    {analysisProgress === 0
                      ? 'AI 서버에 분석을 요청하고 있습니다. 잠시만 기다려주세요.'
                      : analysisProgress < 10
                      ? 'AI가 영상 분석을 시작했습니다.'
                      : analysisProgress < 50
                      ? 'AI가 영상의 객체와 동작을 분석하고 있습니다.'
                      : analysisProgress < 90
                      ? 'AI가 이벤트를 감지하고 분류하고 있습니다.'
                      : 'AI가 분석 결과를 정리하고 있습니다.'}
                  </p>
                  <button
                    onClick={onCancelProcess}
                    className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#00e6b4] hover:border-[#00c49c]"
                  >
                    취소
                  </button>
                </div>
              )}

              {/* Video Loading Overlay */}
              {videoLoading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-md flex items-center justify-center z-5">
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00e6b4] mx-auto mb-2"></div>
                    <p className="text-sm">비디오 로딩 중...</p>
                  </div>
                </div>
              )}

              {/* Video Element */}
              {!isUploading && (
                <video
                  ref={ref}
                  className={`w-full h-auto rounded-md bg-black ${
                    isAnalyzing || videoLoading ? 'opacity-50' : 'opacity-100'
                  } transition-opacity duration-300`}
                  src={videoSrc}
                  muted={isMobile}
                  playsInline={isMobile}
                  preload="metadata"
                  controls={false}
                  crossOrigin="anonymous"
                  style={{
                    minHeight: isMobile ? '200px' : '300px',
                    maxHeight: isMobile ? '300px' : '500px',
                  }}
                  onTimeUpdate={onTimeUpdate}
                  onLoadStart={() => {
                    console.log('🎬 [Video] 로드 시작');
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLVideoElement;
                    const error = target.error;

                    const errorMessages = {
                      1: 'MEDIA_ERR_ABORTED: 미디어 재생이 중단됨',
                      2: 'MEDIA_ERR_NETWORK: 네트워크 오류',
                      3: 'MEDIA_ERR_DECODE: 미디어 디코딩 오류 (지원되지 않는 형식)',
                      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 지원되지 않는 미디어 형식',
                    };

                    const errorMessage = error?.code
                      ? errorMessages[
                          error.code as keyof typeof errorMessages
                        ] || `에러 코드: ${error.code}`
                      : '알 수 없는 오류';

                    onVideoError(`비디오 오류: ${errorMessage}`);
                  }}
                  onClick={isMobile ? onTogglePlayPause : undefined}
                />
              )}

              {/* Video Error Overlay */}
              {videoError && (
                <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex items-center justify-center">
                  <div className="text-center text-white p-4 max-w-md">
                    <div className="mb-3">
                      <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                      <h3 className="text-lg font-medium mb-2">
                        비디오 재생 오류
                      </h3>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{videoError}</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent border-gray-500 text-white hover:bg-gray-700"
                        onClick={() => onVideoError(null)}
                      >
                        닫기
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                        onClick={() => {
                          onVideoError(null);
                          if (ref && 'current' in ref && ref.current) {
                            ref.current.load();
                          }
                        }}
                      >
                        다시 시도
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 md:top-4 md:right-4 bg-black bg-opacity-50 text-white hover:bg-opacity-70 h-8 w-8 md:h-10 md:w-10"
                onClick={() =>
                  onInfoClick({
                    title: '비디오 정보',
                    content: `파일명: ${videoFileName}\n재생시간: ${formatTime(
                      duration
                    )}\n현재 시간: ${formatTime(currentTime)}\n모바일: ${
                      isMobile ? '예' : '아니오'
                    }`,
                  })
                }
              >
                <Info className="h-3 w-3 md:h-4 md:w-4" />
              </Button>

              {/* Mobile Play Guide */}
              {isMobile && !isPlaying && !isAnalyzing && !videoLoading && (
                <div className="absolute bottom-2 left-2 right-2 bg-black bg-opacity-70 text-white text-xs p-2 rounded">
                  화면을 터치하여 비디오를 재생하세요
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Video Controls */}
        <Card className="bg-[#242a38] border-0 shadow-lg">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">
                {formatTime(currentTime)}
              </span>
              <div className="flex items-center gap-1 md:gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-8 w-8 md:h-10 md:w-10"
                  onClick={onSkipBackward}
                  disabled={!videoSrc || isAnalyzing || videoLoading}
                >
                  <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-8 w-8 md:h-10 md:w-10"
                  onClick={onTogglePlayPause}
                  disabled={!videoSrc || isAnalyzing || videoLoading}
                >
                  {isPlaying ? (
                    <Pause className="h-3 w-3 md:h-4 md:w-4" />
                  ) : (
                    <Play className="h-3 w-3 md:h-4 md:w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-8 w-8 md:h-10 md:w-10"
                  onClick={onSkipForward}
                  disabled={!videoSrc || isAnalyzing || videoLoading}
                >
                  <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
                </Button>
              </div>
              <span className="text-gray-400 text-sm">
                {formatTime(duration)}
              </span>
            </div>

            {/* Timeline */}
            <div className="relative w-full h-6 md:h-8 bg-[#1a1f2c] rounded-full overflow-hidden cursor-pointer">
              {/* Progress Bar */}
              <div
                className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30"
                style={{
                  width: `${
                    duration > 0 ? (currentTime / duration) * 100 : 0
                  }%`,
                }}
              />

              {/* Time Markers */}
              {timeMarkers.map((time, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full w-1 bg-[#6c5ce7] cursor-pointer"
                  style={{
                    left: `${duration > 0 ? (time / duration) * 100 : 0}%`,
                  }}
                  onClick={() => onSeekToTime(time)}
                  title={`${formatTime(time)}로 이동`}
                />
              ))}

              {/* Timeline Click Handler */}
              <div
                className="absolute top-0 left-0 w-full h-full cursor-pointer"
                onClick={(e) => {
                  if (!duration || duration <= 0) return;

                  const rect = e.currentTarget.getBoundingClientRect();
                  if (rect.width === 0) return;

                  const clickX = e.clientX - rect.left;
                  const pos = Math.max(0, Math.min(1, clickX / rect.width));
                  const newTime = pos * duration;

                  if (newTime >= 0 && newTime <= duration) {
                    onSeekToTime(newTime);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
