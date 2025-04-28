'use client';

import type React from 'react';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  AlertTriangle,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

// 장면 요약 타입 정의
interface SceneSummary {
  startTime: number; // 시작 시간 (초)
  endTime: number; // 종료 시간 (초)
  thumbnailUrl: string; // 대표 프레임 이미지 URL
  description: string; // 텍스트 요약
  anomalyType?: string; // 이상 행동 유형 (선택적)
}

export default function CCTVAnalysis() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
  >([
    {
      role: 'assistant',
      content:
        'CCTV 영상을 업로드하여 분석을 시작하세요. 그 후 영상 내용에 대해 질문할 수 있습니다.',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [timeMarkers, setTimeMarkers] = useState<number[]>([]);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [sceneSummaries, setSceneSummaries] = useState<SceneSummary[]>([]);
  const [currentSceneSummary, setCurrentSceneSummary] =
    useState<SceneSummary | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `"${file.name}" 영상이 성공적으로 업로드되었습니다. 이제 영상을 재생하고 내용에 대해 질문할 수 있습니다.`,
        },
      ]);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime += 10;
    }
  };

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime -= 10;
    }
  };

  const seekToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
    };
  }, [videoSrc]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      // 사용자 메시지 추가
      setMessages((prev) => [...prev, { role: 'user', content: inputMessage }]);

      // AI 응답 시뮬레이션 (타임스탬프 포함)
      setTimeout(() => {
        // 데모 목적으로 랜덤 타임스탬프 생성
        const randomTimestamp = videoSrc
          ? Math.random() * (duration || 60)
          : null;

        if (randomTimestamp) {
          setTimeMarkers((prev) => [...prev, randomTimestamp]);
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              '영상 내용을 분석했습니다. ' +
              (videoSrc
                ? `${formatTime(
                    randomTimestamp || 0
                  )} 시점에서 관련 정보를 찾았습니다. 타임스탬프를 클릭하면 해당 시점으로 이동합니다.`
                : '분석을 위해 먼저 영상을 업로드해 주세요.'),
            timestamp: randomTimestamp || undefined,
          },
        ]);
      }, 1000);

      setInputMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1f2c] text-gray-100">
      <div className="container mx-auto py-8 px-4">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 flex items-center justify-center">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Adobe%20Express%20-%20file-z6kXCSxAQt4ISVmQRZCDhYxUILirrx.png"
                alt="Deep Sentinel Logo"
                className="w-full h-full object-contain scale-[1.7]"
              />
            </div>
            <h1 className="text-3xl font-bold text-white ml-4">
              Deep Sentinel
            </h1>
          </div>
          <p className="text-gray-400">CCTV Analysis Platform</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="mb-6 bg-[#242a38] border-0 shadow-lg">
              <CardContent className="p-6">
                {videoSrc ? (
                  <div className="relative">
                    <video
                      ref={videoRef}
                      className="w-full h-auto rounded-md bg-black"
                      src={videoSrc}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] bg-[#1a1f2c] rounded-md border border-[#2a3142]">
                    <Upload className="h-12 w-12 text-[#00e6b4] mb-4" />
                    <p className="text-gray-400 mb-4">
                      분석을 시작하려면 CCTV 영상을 업로드하세요
                    </p>
                    <Button
                      className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'video/*';
                        input.onchange = (e) =>
                          handleFileUpload(
                            e as unknown as React.ChangeEvent<HTMLInputElement>
                          );
                        input.click();
                      }}
                    >
                      영상 업로드
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {videoSrc && (
              <Card className="bg-[#242a38] border-0 shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">
                      {formatTime(currentTime)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4]"
                        onClick={skipBackward}
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4]"
                        onClick={togglePlayPause}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4]"
                        onClick={skipForward}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-gray-400">
                      {formatTime(duration)}
                    </span>
                  </div>

                  <div className="relative w-full h-8 bg-[#1a1f2c] rounded-full overflow-hidden cursor-pointer">
                    {/* 진행 바 */}
                    <div
                      className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30"
                      style={{
                        width: `${(currentTime / (duration || 1)) * 100}%`,
                      }}
                    />

                    {/* 시간 마커 */}
                    {timeMarkers.map((time, index) => (
                      <div
                        key={index}
                        className="absolute top-0 h-full w-1 bg-[#3694ff] cursor-pointer"
                        style={{ left: `${(time / (duration || 1)) * 100}%` }}
                        onClick={() => seekToTime(time)}
                        title={`${formatTime(time)}로 이동`}
                      />
                    ))}

                    {/* 타임라인 클릭 핸들러 */}
                    <div
                      className="absolute top-0 left-0 w-full h-full"
                      onClick={(e) => {
                        if (videoRef.current) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = (e.clientX - rect.left) / rect.width;
                          videoRef.current.currentTime = pos * (duration || 0);
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <Card className="h-full bg-[#242a38] border-0 shadow-lg">
              <CardContent className="p-4 flex flex-col h-full">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  영상 분석 채팅
                </h2>

                <div className="flex-1 overflow-hidden mb-4 border border-[#2a3142] rounded-md">
                  <ScrollArea className="h-[400px] pr-2">
                    <div className="space-y-4 p-4">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={`flex ${
                            message.role === 'user'
                              ? 'justify-end'
                              : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              message.role === 'user'
                                ? 'bg-[#3694ff] text-white'
                                : 'bg-[#2a3142] text-gray-200'
                            }`}
                          >
                            {message.content}
                            {message.timestamp && (
                              <button
                                onClick={() =>
                                  seekToTime(message.timestamp || 0)
                                }
                                className="mt-2 text-sm font-medium text-[#00e6b4] hover:underline"
                              >
                                {formatTime(message.timestamp)}로 이동
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Separator className="my-4 bg-[#2a3142]" />

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Textarea
                    placeholder="영상 내용에 대해 질문하세요..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 resize-none bg-[#1a1f2c] border-[#2a3142] text-gray-200 placeholder:text-gray-500"
                    rows={2}
                  />
                  <Button
                    type="submit"
                    className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                  >
                    전송
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
