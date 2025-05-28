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
  Github,
  Mail,
  Store,
  Info,
  History,
  Menu,
  X,
  MessageSquare,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import DynamicHistorySidebar from '@/components/dynamic-history-sidebar';
import DraggableTooltip from '@/components/draggable-tooltip';
import ToastNotification, { type Toast } from '@/components/toast-notification';
import VideoMinimap from '@/components/video-minimap';
import DragDropZone from '@/components/drag-drop-zone';
import type { HistoryItem } from '@/app/types/history';
import { saveHistory } from '@/app/actions/history-service';
import JQueryCounterAnimation from '@/components/jquery-counter-animation';

export default function CCTVAnalysis() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
  >([
    {
      role: 'assistant',
      content:
        '안녕하세요! CCTV 영상 분석을 도와드리겠습니다. 먼저 분석할 영상을 업로드해주세요.',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [timeMarkers, setTimeMarkers] = useState<number[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string>();

  // 히스토리 사이드바 상태
  const [historyOpen, setHistoryOpen] = useState(false);
  // 모바일 메뉴 상태 추가
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 새로운 상태들
  const [tooltipData, setTooltipData] = useState<{
    title: string;
    content: string;
    timestamp?: number;
  } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragDropVisible, setDragDropVisible] = useState(false);
  const [uploadHighlight, setUploadHighlight] = useState(false); // 업로드 영역 강조 상태 추가

  const videoRef = useRef<HTMLVideoElement>(null);

  // 모바일 감지 훅 추가
  const [isMobile, setIsMobile] = useState(false);

  // 분석 상태와 진행도를 관리하는 새로운 state 추가:
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 토스트 알림 함수
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  // 중복 토스트 방지 함수
  const addToastIfNotExists = (toast: Omit<Toast, 'id'>) => {
    // 같은 타입과 제목의 토스트가 이미 있는지 확인
    const existingToast = toasts.find(
      (existingToast) =>
        existingToast.type === toast.type && existingToast.title === toast.title
    );

    if (!existingToast) {
      addToast(toast);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleFileUpload = (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setVideoFileName(file.name);
      setCurrentHistoryId(undefined);
      setTimeMarkers([]);

      // 분석 시작
      setIsAnalyzing(true);
      setAnalysisProgress(0);

      // 분석 중 메시지 추가
      setMessages([
        {
          role: 'assistant',
          content: '영상 분석을 시작합니다. 잠시만 기다려주세요...',
        },
      ]);

      // 성공 토스트
      addToast({
        type: 'success',
        title: '업로드 완료',
        message: `${file.name} 파일이 성공적으로 업로드되었습니다.`,
        duration: 3000,
      });

      // 분석 진행도 시뮬레이션 (실제로는 서버에서 진행도를 받아와야 함)
      const progressInterval = setInterval(() => {
        setAnalysisProgress((prev) => {
          const newProgress = prev + Math.random() * 15 + 5; // 5-20% 씩 증가

          if (newProgress >= 100) {
            clearInterval(progressInterval);

            // 분석 완료
            setTimeout(() => {
              setIsAnalyzing(false);
              setAnalysisProgress(100);
              setMessages([
                {
                  role: 'assistant',
                  content: `"${file.name}" 영상 분석이 완료되었습니다. 이제 영상을 재생하고 내용에 대해 질문할 수 있습니다.`,
                },
              ]);

              // 분석 완료 토스트
              addToast({
                type: 'success',
                title: '분석 완료',
                message: '영상 분석이 완료되었습니다. 이제 질문할 수 있습니다.',
                duration: 3000,
              });
            }, 500);

            return 100;
          }

          return newProgress;
        });
      }, 800); // 0.8초마다 진행도 업데이트
    } catch (error) {
      console.error('File upload error:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      addToast({
        type: 'error',
        title: '업로드 실패',
        message: '파일 업로드 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  const handleFileUploadFromInput = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const togglePlayPause = () => {
    try {
      if (videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
      }
    } catch (error) {
      console.error('Video control error:', error);
    }
  };

  const skipForward = () => {
    try {
      if (videoRef.current) {
        videoRef.current.currentTime += 10;
      }
    } catch (error) {
      console.error('Skip forward error:', error);
    }
  };

  const skipBackward = () => {
    try {
      if (videoRef.current) {
        videoRef.current.currentTime -= 10;
      }
    } catch (error) {
      console.error('Skip backward error:', error);
    }
  };

  const seekToTime = (time: number) => {
    try {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    } catch (error) {
      console.error('Seek error:', error);
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

    try {
      video.addEventListener('timeupdate', updateTime);
      video.addEventListener('loadedmetadata', updateDuration);

      return () => {
        video.removeEventListener('timeupdate', updateTime);
        video.removeEventListener('loadedmetadata', updateDuration);
      };
    } catch (error) {
      console.error('Video event listener error:', error);
    }
  }, [videoSrc]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      const userMessage = inputMessage;

      // 사용자 메시지 추가
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

      // 정보 토스트
      addToast({
        type: 'info',
        title: '분석 중',
        message: 'AI가 영상을 분석하고 있습니다...',
        duration: 2000,
      });

      // AI 응답 시뮬레이션 (타임스탬프 포함)
      setTimeout(async () => {
        try {
          // 데모 목적으로 랜덤 타임스탬프 생성
          const randomTimestamp = videoSrc
            ? Math.random() * (duration || 60)
            : null;

          if (randomTimestamp) {
            setTimeMarkers((prev) => [...prev, randomTimestamp]);
          }

          const assistantMessage = {
            role: 'assistant' as const,
            content:
              '영상 내용을 분석했습니다. ' +
              (videoSrc
                ? `${formatTime(
                    randomTimestamp || 0
                  )} 시점에서 관련 정보를 찾았습니다. 타임스탬프를 클릭하면 해당 시점으로 이동합니다.`
                : '분석을 위해 먼저 영상을 업로드해 주세요.'),
            timestamp: randomTimestamp || undefined,
          };

          setMessages((prev) => [...prev, assistantMessage]);

          // 툴팁 표시
          if (randomTimestamp) {
            setTooltipData({
              title: '분석 결과',
              content: `${formatTime(
                randomTimestamp
              )} 시점에서 중요한 이벤트가 감지되었습니다. 클릭하여 해당 시점으로 이동할 수 있습니다.`,
              timestamp: randomTimestamp,
            });
          }

          // 성공 토스트
          addToast({
            type: 'success',
            title: '분석 완료',
            message: 'AI 분석이 완료되었습니다.',
            duration: 3000,
          });

          // 새로운 대화가 시작된 경우 히스토리 저장
          if (!currentHistoryId && videoSrc) {
            // prompt_id 형식으로 제목 생성 (실제로는 데이터베이스에서 다음 ID를 가져와야 함)
            const nextPromptId = Date.now() % 10000; // 임시로 타임스탬프 기반 ID 생성

            const historyData = {
              title: `prompt_id : ${nextPromptId}`,
              messages: [
                { role: 'user' as const, content: userMessage },
                assistantMessage,
              ],
              videoInfo: {
                name: videoFileName,
                duration: duration,
                url: videoSrc,
              },
              eventType: null, // 초기에는 null, 나중에 AI 분석 결과에 따라 업데이트
            };

            const savedId = await saveHistory(historyData);
            if (savedId) {
              setCurrentHistoryId(savedId);
            }
          }
        } catch (error) {
          console.error('Message handling error:', error);
          addToast({
            type: 'error',
            title: '분석 실패',
            message: 'AI 분석 중 오류가 발생했습니다.',
            duration: 3000,
          });
        }
      }, 1000);

      setInputMessage('');
    }
  };

  const handleNewChat = () => {
    try {
      // 비디오 관련 상태 초기화
      setVideoSrc(null);
      setVideoFileName('');
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      // 분석 상태 초기화
      setIsAnalyzing(false);
      setAnalysisProgress(0);

      // 채팅 관련 상태 초기화
      setMessages([
        {
          role: 'assistant',
          content:
            'CCTV 영상을 업로드하여 분석을 시작하세요. 그 후 영상 내용에 대해 질문할 수 있습니다.',
        },
      ]);
      setInputMessage('');

      // 히스토리 및 마커 초기화
      setCurrentHistoryId(undefined);
      setTimeMarkers([]);

      // 툴팁 닫기
      setTooltipData(null);

      // 성공 토스트
      addToast({
        type: 'success',
        title: '새 채팅 시작',
        message: '새로운 분석 세션이 시작되었습니다.',
        duration: 2000,
      });
    } catch (error) {
      console.error('New chat error:', error);
      addToast({
        type: 'error',
        title: '오류 발생',
        message: '새 채팅을 시작하는 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  const handleInputClickWithoutVideo = (
    e: React.MouseEvent | React.FocusEvent | React.FormEvent
  ) => {
    console.log('Input interaction detected, videoSrc:', videoSrc); // 디버깅용
    if (!videoSrc) {
      console.log('No video, activating upload highlight'); // 디버깅용

      // 업로드 영역 강조 애니메이션
      setUploadHighlight(true);

      // 1초 후 애니메이션 종료 (3초에서 1초로 변경)
      setTimeout(() => {
        console.log('Deactivating upload highlight'); // 디버깅용
        setUploadHighlight(false);
      }, 500);

      // 중복 알림 방지하여 안내 토스트 추가
      addToastIfNotExists({
        type: 'warning',
        title: '영상 업로드 필요',
        message: '먼저 CCTV 영상을 업로드해주세요.',
        duration: 3000,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 영상이 없을 때도 입력 감지하여 강조 효과 실행
    if (!videoSrc) {
      handleInputClickWithoutVideo(e as any);
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 영상이 있고 메시지가 있을 때만 전송
      if (videoSrc && inputMessage.trim()) {
        handleSendMessage(e);
      }
    }
  };

  const handleSelectHistory = (historyItem: HistoryItem) => {
    try {
      setMessages(historyItem.messages);
      setCurrentHistoryId(historyItem.id);

      if (historyItem.videoInfo) {
        setVideoSrc(historyItem.videoInfo.url);
        setVideoFileName(historyItem.videoInfo.name);
        setDuration(historyItem.videoInfo.duration);
      }

      // 타임스탬프 마커 복원
      const timestamps = historyItem.messages
        .filter((msg) => msg.timestamp)
        .map((msg) => msg.timestamp!);
      setTimeMarkers(timestamps);

      // 히스토리 선택 후 사이드바 닫기
      setHistoryOpen(false);

      // 히스토리 로드 토스트
      addToast({
        type: 'info',
        title: '히스토리 로드',
        message: `"${historyItem.title}" 대화를 불러왔습니다.`,
        duration: 2000,
      });
    } catch (error) {
      console.error('History selection error:', error);
    }
  };

  // 히스토리 닫기 함수
  const handleCloseHistory = () => {
    setHistoryOpen(false);
  };

  // 전역 드래그 앤 드롭 이벤트 - 에러 핸들링 추가
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      try {
        e.preventDefault();
      } catch (error) {
        console.warn('Drag over error:', error);
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      try {
        e.preventDefault();
        // 드래그 앤 드롭 존이 이미 열려있지 않을 때만 실행
        if (
          !dragDropVisible &&
          e.dataTransfer?.files &&
          e.dataTransfer.files.length > 0
        ) {
          setDragDropVisible(true);
        }
      } catch (error) {
        console.warn('Drag drop error:', error);
      }
    };

    // 조건부로 이벤트 리스너 추가
    if (typeof window !== 'undefined') {
      try {
        document.addEventListener('dragover', handleGlobalDragOver);
        document.addEventListener('drop', handleGlobalDrop);
      } catch (error) {
        console.warn('Event listener error:', error);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        try {
          document.removeEventListener('dragover', handleGlobalDragOver);
          document.removeEventListener('drop', handleGlobalDrop);
        } catch (error) {
          console.warn('Event listener cleanup error:', error);
        }
      }
    };
  }, [dragDropVisible]);

  const statsData = [
    { label: '분석된 영상', value: 1247, suffix: '개', color: '#00e6b4' },
    { label: '감지된 이벤트', value: 3891, suffix: '건', color: '#3694ff' },
    { label: '처리 시간', value: 2.4, suffix: 's', color: '#ffd93d' },
    { label: '정확도', value: 99, suffix: '%', color: '#ff6b6b' },
  ];

  return (
    <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex flex-col">
      {/* Header - 모바일 최적화 */}
      <header className="bg-[#242a38] border-b border-[#2a3142] shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-3 md:gap-6">
              <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center">
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Adobe%20Express%20-%20file-z6kXCSxAQt4ISVmQRZCDhYxUILirrx.png"
                  alt="Deep Sentinel Logo"
                  className="w-full h-full object-contain scale-[1.7]"
                />
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-bold text-white">
                  Deep Sentinel
                </h1>
                <span className="text-xs md:text-sm text-gray-400 hidden sm:block">
                  CCTV Analysis Platform
                </span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className={`text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c] ${
                  historyOpen ? 'text-[#00e6b4] bg-[#1a1f2c]' : ''
                }`}
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={() => window.open('https://github.com', '_blank')}
              >
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={() => window.open('https://google.com', '_blank')}
              >
                <svg
                  className="h-4 w-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={() => window.open('#', '_blank')}
              >
                <Store className="h-4 w-4 mr-2" />
                Store
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={(e) => {
                  try {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragDropVisible(true);
                  } catch (error) {
                    console.error('Upload button error:', error);
                  }
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                업로드
              </Button>
            </nav>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={`text-gray-300 hover:text-[#00e6b4] transition-colors ${
                  historyOpen ? 'text-[#00e6b4] bg-[#1a1f2c]' : ''
                }`}
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  setMobileMenuOpen(false); // 히스토리 열 때 모바일 메뉴 닫기
                }}
              >
                <History className="h-5 w-5" />
                History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-[#00e6b4]"
                onClick={() => {
                  setMobileMenuOpen(!mobileMenuOpen);
                  setHistoryOpen(false); // 모바일 메뉴 열 때 히스토리 닫기
                }}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t border-[#2a3142] pt-4">
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                  onClick={() => {
                    window.open('https://github.com', '_blank');
                    setMobileMenuOpen(false);
                  }}
                >
                  <Github className="h-4 w-4 mr-2" />
                  GitHub
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                  onClick={() => {
                    window.open('https://google.com', '_blank');
                    setMobileMenuOpen(false);
                  }}
                >
                  <svg
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                  onClick={() => {
                    window.open('#', '_blank');
                    setMobileMenuOpen(false);
                  }}
                >
                  <Store className="h-4 w-4 mr-2" />
                  Store
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                  onClick={(e) => {
                    try {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragDropVisible(true);
                      setMobileMenuOpen(false);
                    } catch (error) {
                      console.error('Mobile upload button error:', error);
                    }
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  업로드
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content - 블러 효과와 함께 */}
        <main
          className={`flex-1 container mx-auto py-4 md:py-8 px-4 overflow-auto transition-all duration-300 ${
            historyOpen && !isMobile
              ? 'blur-sm scale-95 opacity-75'
              : 'blur-0 scale-100 opacity-100'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2">
              <Card className="mb-4 md:mb-6 bg-[#242a38] border-0 shadow-lg">
                <CardContent className="p-4 md:p-6">
                  {videoSrc ? (
                    <div className="relative">
                      {isAnalyzing ? (
                        // 분석 중일 때 프로그레스 오버레이
                        <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10">
                          <div className="relative w-24 h-24 md:w-32 md:h-32 mb-4">
                            {/* 배경 원 */}
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
                              {/* 진행도 원 */}
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
                                  2 *
                                  Math.PI *
                                  45 *
                                  (1 - analysisProgress / 100)
                                }`}
                                className="transition-all duration-300 ease-out"
                                style={{
                                  filter:
                                    'drop-shadow(0 0 8px rgba(0, 230, 180, 0.6))',
                                }}
                              />
                            </svg>
                            {/* 진행도 텍스트 */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[#00e6b4] font-bold text-lg md:text-xl">
                                {Math.round(analysisProgress)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-white text-sm md:text-base font-medium mb-2">
                            영상 분석 중...
                          </p>
                          <p className="text-gray-300 text-xs md:text-sm text-center px-4">
                            AI가 영상을 분석하고 있습니다. 잠시만 기다려주세요.
                          </p>
                        </div>
                      ) : null}

                      <video
                        ref={videoRef}
                        className={`w-full h-auto rounded-md bg-black ${
                          isAnalyzing ? 'opacity-50' : 'opacity-100'
                        } transition-opacity duration-300`}
                        src={videoSrc}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />

                      {/* 비디오 위 정보 버튼 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 md:top-4 md:right-4 bg-black bg-opacity-50 text-white hover:bg-opacity-70 h-8 w-8 md:h-10 md:w-10"
                        onClick={() =>
                          setTooltipData({
                            title: '비디오 정보',
                            content: `파일명: ${videoFileName}\n재생시간: ${formatTime(
                              duration
                            )}\n현재 시간: ${formatTime(currentTime)}`,
                          })
                        }
                      >
                        <Info className="h-3 w-3 md:h-4 md:w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col items-center justify-center h-[250px] md:h-[400px] rounded-lg transition-all duration-500 ${
                        uploadHighlight
                          ? 'bg-[#2a3142] border-2 border-[#00e6b4] shadow-2xl shadow-[#00e6b4]/30'
                          : 'bg-[#2a3142] border-2 border-[#3a4553] hover:border-[#4a5563]'
                      }`}
                      style={{
                        animation: uploadHighlight
                          ? 'borderGlow 0.5s ease-in-out'
                          : 'none',
                      }}
                    >
                      {/* 업로드 아이콘 */}
                      <div className="mb-6">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#00e6b4] bg-opacity-10 flex items-center justify-center border-2 border-[#00e6b4] border-opacity-30">
                          <Upload className="h-8 w-8 md:h-10 md:w-10 text-[#00e6b4]" />
                        </div>
                      </div>

                      {/* 메인 텍스트 */}
                      <p className="text-gray-300 mb-6 text-base md:text-lg text-center px-4 font-medium">
                        분석을 시작하려면 CCTV 영상을 업로드하세요
                      </p>

                      {/* 업로드 버튼 */}
                      <Button
                        className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-8 py-3 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-105"
                        onClick={(e) => {
                          try {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragDropVisible(true);
                          } catch (error) {
                            console.error('Main upload button error:', error);
                          }
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
                          onClick={skipBackward}
                        >
                          <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-8 w-8 md:h-10 md:w-10"
                          onClick={togglePlayPause}
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
                          onClick={skipForward}
                        >
                          <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                      </div>
                      <span className="text-gray-400 text-sm">
                        {formatTime(duration)}
                      </span>
                    </div>

                    <div className="relative w-full h-6 md:h-8 bg-[#1a1f2c] rounded-full overflow-hidden cursor-pointer">
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
                          try {
                            if (videoRef.current) {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const pos = (e.clientX - rect.left) / rect.width;
                              videoRef.current.currentTime =
                                pos * (duration || 0);
                            }
                          } catch (error) {
                            console.error('Timeline click error:', error);
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
                <CardContent className="p-3 md:p-4 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3 md:mb-4">
                    <h2 className="text-lg md:text-xl font-semibold text-white">
                      영상 분석 채팅
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#3694ff] text-[#3694ff] hover:bg-[#3694ff] hover:text-white hover:border-[#3694ff] transition-all duration-200"
                      onClick={handleNewChat}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />새 채팅
                    </Button>
                  </div>

                  <div className="flex-1 overflow-hidden mb-3 md:mb-4 border border-[#2a3142] rounded-md">
                    <ScrollArea className="h-[250px] md:h-[400px] pr-2">
                      <div className="space-y-3 md:space-y-4 p-3 md:p-4">
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
                              className={`max-w-[85%] md:max-w-[80%] rounded-lg p-2 md:p-3 text-sm md:text-base ${
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
                                  className="mt-2 text-xs md:text-sm font-medium text-[#00e6b4] hover:underline block"
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

                  <Separator className="my-3 md:my-4 bg-[#2a3142]" />

                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Textarea
                      placeholder={
                        isAnalyzing
                          ? '영상 분석 중입니다. 잠시만 기다려주세요...'
                          : videoSrc
                          ? '영상 내용에 대해 질문하세요...'
                          : '먼저 영상을 업로드해주세요'
                      }
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onClick={handleInputClickWithoutVideo}
                      onFocus={handleInputClickWithoutVideo}
                      onMouseDown={handleInputClickWithoutVideo}
                      onInput={handleInputClickWithoutVideo}
                      disabled={isAnalyzing}
                      className={`flex-1 resize-none border-[#2a3142] text-gray-200 placeholder:text-gray-500 text-sm md:text-base transition-all duration-200 bg-[#1a1f2c] hover:border-[#00e6b4] focus:border-[#00e6b4] ${
                        isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      rows={2}
                    />
                    <Button
                      type="submit"
                      disabled={
                        !videoSrc || !inputMessage.trim() || isAnalyzing
                      }
                      className={`px-3 md:px-4 transition-all duration-200 ${
                        !videoSrc || !inputMessage.trim() || isAnalyzing
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                          : 'bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]'
                      }`}
                    >
                      {isAnalyzing ? '분석 중...' : '전송'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 카운터 애니메이션 */}
          <div className="mt-6 md:mt-8">
            <JQueryCounterAnimation stats={statsData} />
          </div>
        </main>

        {/* History Sidebar - 모바일 완전 최적화 */}
        {isMobile ? (
          // 모바일 바텀 시트
          <div
            className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
              historyOpen ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{
              height: historyOpen ? '70vh' : '0',
              borderTopLeftRadius: '1rem',
              borderTopRightRadius: '1rem',
            }}
          >
            {/* 드래그 핸들 */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gray-400 rounded-full"></div>

            <DynamicHistorySidebar
              onSelectHistory={handleSelectHistory}
              currentHistoryId={currentHistoryId}
              onClose={handleCloseHistory}
            />
          </div>
        ) : (
          // 데스크톱 사이드바 (기존)
          <div
            className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out ${
              historyOpen ? 'translate-x-0' : 'translate-x-full'
            } w-80 max-w-sm`}
            style={{
              top: '73px',
              height: 'calc(100vh - 73px)',
            }}
          >
            <DynamicHistorySidebar
              onSelectHistory={handleSelectHistory}
              currentHistoryId={currentHistoryId}
              onClose={handleCloseHistory}
            />
          </div>
        )}

        {/* History Backdrop - 모바일/데스크톱 구분 */}
        {historyOpen && (
          <div
            className={`fixed inset-0 z-40 ${
              isMobile
                ? 'bg-black/30'
                : 'backdrop-blur-sm bg-gradient-to-r from-[#1a1f2c]/20 via-[#00e6b4]/5 to-[#3694ff]/10'
            }`}
            style={{
              top: isMobile ? '0' : '73px',
              height: isMobile ? '100vh' : 'calc(100vh - 73px)',
            }}
            onClick={handleCloseHistory}
          />
        )}
      </div>

      {/* Enhanced Footer - 모바일 최적화 */}
      <footer
        className={`bg-[#242a38] border-t border-[#2a3142] mt-auto transition-all duration-300 ${
          historyOpen ? 'blur-sm opacity-75' : 'blur-0 opacity-100'
        }`}
      >
        <div className="container mx-auto px-4 py-6 md:py-8">
          {/* 메인 푸터 콘텐츠 */}
          <div className="text-center mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-[#00e6b4] mb-2 md:mb-3">
              AI 기반 CCTV 영상 분석 플랫폼
            </h2>
            <p className="text-gray-400 text-sm md:text-lg">
              실시간 이벤트 감지 • 스마트 보안 솔루션 • Deep Sentinel
            </p>
          </div>

          {/* 구분선 */}
          <Separator className="bg-[#2a3142] my-4 md:my-6" />

          {/* 하단 정보 */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm md:text-base">
              <span>© 2024 Deep Sentinel. All rights reserved.</span>
            </div>

            <div className="flex items-center gap-2 text-gray-300 text-sm md:text-base">
              <span>궁금한 부분은 여기로</span>
              <span className="text-[#00e6b4]">→</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#00e6b4] hover:text-[#00c49c] hover:bg-[#1a1f2c] p-2"
                onClick={() =>
                  window.open('mailto:contact@deepsentinel.com', '_blank')
                }
              >
                <Mail className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                Contact
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* 절대 좌표 활용 컴포넌트들 - 모바일 최적화 */}
      <DraggableTooltip
        data={tooltipData}
        onClose={() => setTooltipData(null)}
      />

      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {videoSrc && (
        <VideoMinimap
          videoRef={videoRef}
          currentTime={currentTime}
          duration={duration}
          timeMarkers={timeMarkers}
          onSeek={seekToTime}
        />
      )}

      <DragDropZone
        onFileUpload={handleFileUpload}
        isVisible={dragDropVisible}
        onClose={() => setDragDropVisible(false)}
      />

      {/* jQuery 플로팅 요소들 - 파티클 배경 비활성화 */}
      {/* <JQueryParticleBackground /> */}

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes highlightPulse {
          0% {
            box-shadow: 0 0 30px rgba(0, 230, 180, 0.4),
              0 0 60px rgba(0, 230, 180, 0.3);
            border-color: rgba(0, 230, 180, 0.8);
            background-color: rgba(0, 230, 180, 0.1);
          }
          50% {
            box-shadow: 0 0 50px rgba(0, 230, 180, 0.8),
              0 0 100px rgba(0, 230, 180, 0.6);
            border-color: rgba(0, 230, 180, 1);
            background-color: rgba(0, 230, 180, 0.3);
          }
          100% {
            box-shadow: 0 0 30px rgba(0, 230, 180, 0.4),
              0 0 60px rgba(0, 230, 180, 0.3);
            border-color: rgba(0, 230, 180, 0.8);
            background-color: rgba(0, 230, 180, 0.1);
          }
        }

        @keyframes glow {
          0% {
            box-shadow: 0 0 20px rgba(0, 230, 180, 0.3),
              0 0 40px rgba(0, 230, 180, 0.2);
            border-color: rgba(0, 230, 180, 0.8);
          }
          100% {
            box-shadow: 0 0 30px rgba(0, 230, 180, 0.6),
              0 0 60px rgba(0, 230, 180, 0.4);
            border-color: rgba(0, 230, 180, 1);
          }
        }

        @keyframes borderGlow {
          0% {
            border-color: rgba(0, 230, 180, 0.8);
            box-shadow: 0 0 0 2px rgba(0, 230, 180, 0.3);
          }
          50% {
            border-color: rgba(0, 230, 180, 1);
            box-shadow: 0 0 0 4px rgba(0, 230, 180, 0.6);
          }
          100% {
            border-color: rgba(0, 230, 180, 0.8);
            box-shadow: 0 0 0 2px rgba(0, 230, 180, 0.3);
          }
        }
      `}</style>
    </div>
  );
}
