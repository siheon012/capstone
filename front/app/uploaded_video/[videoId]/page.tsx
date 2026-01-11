'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ArrowLeft,
  Video,
  X,
  MessageSquare,
  Mail,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import HistorySidebar from '@/components/history/HistorySidebar';
import DraggableTooltip from '@/components/feedback/DraggableTooltip';
import ToastNotification, {
  type Toast,
} from '@/components/feedback/ToastNotification';
import VideoMinimap from '@/components/video/VideoMinimap';
import EventTimeline from '@/components/video/EventTimeline';
import type { ChatSession } from '@/app/types/session';
import { getUploadedVideos } from '@/app/actions/video-service-client';
import { getSession } from '@/app/actions/session-service';
import { sendMessage } from '@/app/actions/ai-service';
import type { UploadedVideo } from '@/app/types/video';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import SmartHeader from '@/components/layout/SmartHeader';
import {
  getVideoMetadataFromUrl,
  waitForVideoReady,
  logVideoState,
} from '@/utils/video-utils';
import SummaryButton from '@/components/video/SummaryButton';
import { useSummary } from '@/hooks/useSummary';

export default function CCTVAnalysis() {
  const params = useParams();
  const searchParams = useSearchParams();
  const videoId = params.videoId as string;
  const sessionId = searchParams.get('sessionId');

  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(
    null
  );
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
  >([]);
  const [inputMessage, setInputMessage] = useState('');
  const [timeMarkers, setTimeMarkers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null); // 비디오 에러 상태 추가

  // 분석 상태와 진행도를 관리하는 state (메인페이지와 동일)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // 로딩 애니메이션 상태 (분석 진행률과는 별개)
  const [isLoading, setIsLoading] = useState(false);

  // UI 상태
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tooltipData, setTooltipData] = useState<{
    title: string;
    content: string;
    timestamp?: number;
  } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  const { isGenerating, generateSummary, formatSummary } = useSummary({
    onSuccess: (summary) => {
      const formattedSummary = formatSummary(summary);
      const summaryMessage = {
        role: 'assistant' as const,
        content: `📋 **영상 요약**\n\n${formattedSummary}`,
      };
      setMessages((prev) => [...prev, summaryMessage]);
      addToast({
        type: 'success',
        title: 'Summary 출력 완료',
        message: '영상 요약이 채팅에 출력되었습니다.',
        duration: 2000,
      });
    },
    onError: (error) => {
      addToast({
        type: 'error',
        title: 'Summary 출력 실패',
        message: error,
        duration: 3000,
      });
    },
  });

  const handleGenerateSummary = async () => {
    await generateSummary(video, setVideo);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (videoId) {
      loadVideoFromId(videoId);
    }
  }, [videoId]);
  const loadVideoFromId = async (id: string) => {
    try {
      setLoading(true);
      setVideoReady(false);
      setIsLoading(true); // 로딩 애니메이션 시작

      // 이미 분석된 비디오를 로드하는 메시지
      setMessages([
        {
          role: 'assistant',
          content: sessionId
            ? '영상 로드 중... 기존 세션을 가져오고 있습니다.'
            : '영상을 로드하고 있습니다.',
        },
      ]);

      const videosResponse = await getUploadedVideos();
      if (videosResponse.success) {
        const foundVideo = videosResponse.data.find((v) => v.id === id);
        if (foundVideo) {
          setVideo(foundVideo);

          // 비디오 파일 준비
          if (
            foundVideo.filePath &&
            !foundVideo.filePath.includes('placeholder.svg')
          ) {
            console.log('[LoadVideo] 비디오 파일 로드 시작...');

            try {
              // 메타데이터 검증
              const metadata = await getVideoMetadataFromUrl(
                foundVideo.filePath
              );
              console.log('[LoadVideo] 비디오 메타데이터 검증 완료:', metadata);

              const validatedDuration =
                metadata.duration || foundVideo.duration;
              setDuration(validatedDuration);
              setVideoSrc(foundVideo.filePath);

              // 비디오 준비 완료
              setTimeout(() => {
                setVideoReady(true);
                console.log('[LoadVideo] 비디오 준비 완료');
              }, 300);
            } catch (metadataError) {
              console.warn(
                '[LoadVideo] 메타데이터 검증 실패, 기본값 사용:',
                metadataError
              );

              setVideoSrc(foundVideo.filePath);
              setDuration(foundVideo.duration);

              setTimeout(() => {
                setVideoReady(true);
                console.log('[LoadVideo] 비디오 준비 완료 (fallback)');
              }, 500);
            }
          }

          setVideoFileName(foundVideo.name);

          // 이미 분석된 비디오이므로 바로 완료 메시지 표시
          setTimeout(() => {
            setIsLoading(false); // 로딩 애니메이션 종료
            setMessages([
              {
                role: 'assistant',
                content: sessionId
                  ? `"${foundVideo.name}" 영상이 로드되었습니다. 기존 대화를 불러오고 있습니다.`
                  : `"${foundVideo.name}" 영상이 로드되었습니다. 영상 내용에 대해 질문할 수 있습니다.`,
              },
            ]);

            // 세션 ID가 있으면 세션 데이터 로드
            if (sessionId) {
              setTimeout(() => {
                loadSessionData(sessionId);
              }, 500);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Failed to load video:', error);
      setVideoReady(false);
      setIsLoading(false); // 에러 시에도 로딩 애니메이션 종료
      addToast({
        type: 'error',
        title: '로드 실패',
        message: '비디오 데이터를 불러오는 중 오류가 발생했습니다.',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 세션 로딩 함수 추가
  const loadSessionData = async (sessionId: string) => {
    try {
      console.log('[LoadSession] Loading session data for:', sessionId);
      const sessionData = await getSession(sessionId);

      if (sessionData) {
        console.log('[LoadSession] Session data loaded:', sessionData);

        // 기존 메시지에 세션 메시지들을 추가
        setMessages((prevMessages) => {
          // 현재 마지막 메시지가 "영상이 로드되었습니다" 메시지인 경우
          const lastMessage = prevMessages[prevMessages.length - 1];

          if (
            lastMessage &&
            lastMessage.content.includes('영상이 로드되었습니다')
          ) {
            // 세션 메시지들을 추가
            const sessionMessages = sessionData.messages || [];
            return [...prevMessages, ...sessionMessages];
          } else {
            // 다른 경우에는 세션 메시지들로 교체
            return sessionData.messages || [];
          }
        });

        // 세션 정보 설정
        setCurrentSession(sessionData);

        // 타임스탬프 마커 복원
        const timestamps = (sessionData.messages || [])
          .filter((msg: any) => msg.timestamp)
          .map((msg: any) => msg.timestamp!);
        setTimeMarkers(timestamps);

        addToast({
          type: 'success',
          title: '세션 로드 완료',
          message: '기존 대화 내용을 불러왔습니다.',
          duration: 3000,
        });
      } else {
        console.warn('[LoadSession] Session not found or failed to load');
        addToast({
          type: 'warning',
          title: '세션 로드',
          message: '기존 세션을 찾을 수 없습니다.',
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('[LoadSession] Error loading session:', error);
      addToast({
        type: 'error',
        title: '세션 로드 실패',
        message: '기존 세션을 불러오는 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  // sessionId는 loadVideoFromId에서 직접 처리됩니다.

  // loadVideoData 함수 전체를 제거하거나 주석 처리

  // 토스트 알림 함수들
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

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

  const togglePlayPause = async () => {
    if (videoRef.current && videoReady) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          await videoRef.current.play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error('비디오 재생 오류:', error);
        // 재생 실패 시 상태 복원
        setIsPlaying(false);
        addToast({
          type: 'error',
          title: '재생 오류',
          message: '비디오 재생 중 오류가 발생했습니다.',
          duration: 3000,
        });
      }
    } else if (!videoReady) {
      addToast({
        type: 'warning',
        title: '비디오 로딩 중',
        message: '비디오가 아직 로드되지 않았습니다.',
        duration: 2000,
      });
    }
  };

  const skipForward = () => {
    if (videoRef.current && videoReady) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.currentTime + 10,
        duration
      );
    }
  };

  const skipBackward = () => {
    if (videoRef.current && videoReady) {
      videoRef.current.currentTime = Math.max(
        videoRef.current.currentTime - 10,
        0
      );
    }
  };

  const seekToTime = (time: number) => {
    if (videoRef.current && videoReady) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      const userMessage = inputMessage.trim();
      setInputMessage(''); // 입력 필드 즉시 클리어

      // 사용자 메시지 추가
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

      addToast({
        type: 'info',
        title: '분석 중',
        message: 'AI가 영상을 분석하고 있습니다...',
        duration: 2000,
      });

      try {
        // AI 서비스를 통해 실제 응답 받기
        const response = await sendMessage(
          userMessage,
          videoId,
          currentSession?.id || null
        );

        if (response.success && response.reply) {
          // AI 응답 메시지 추가
          const assistantMessage = {
            role: 'assistant' as const,
            content: response.reply,
            ...(response.timestamp && { timestamp: response.timestamp }),
          };

          setMessages((prev) => [...prev, assistantMessage]);

          // 타임스탬프가 있으면 마커에 추가
          if (response.timestamp) {
            setTimeMarkers((prev) => [...prev, response.timestamp!]);
          }

          // 새 세션이 생성된 경우 현재 세션 업데이트
          if (response.session) {
            setCurrentSession(response.session);
          }

          addToast({
            type: 'success',
            title: '분석 완료',
            message: 'AI 분석이 완료되었습니다.',
            duration: 3000,
          });
        } else {
          // 에러 응답 처리
          const errorMessage = {
            role: 'assistant' as const,
            content:
              response.error || '응답을 생성하는 중 오류가 발생했습니다.',
          };

          setMessages((prev) => [...prev, errorMessage]);

          addToast({
            type: 'error',
            title: '분석 실패',
            message: response.error || 'AI 분석 중 오류가 발생했습니다.',
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('Send message error:', error);

        // 에러 시 기본 응답 추가
        const errorMessage = {
          role: 'assistant' as const,
          content:
            '죄송합니다. 현재 서비스에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        };

        setMessages((prev) => [...prev, errorMessage]);

        addToast({
          type: 'error',
          title: '연결 오류',
          message: '서버와의 연결에 문제가 발생했습니다.',
          duration: 3000,
        });
      }
    }
  };

  // 홈페이지와 동일한 handleSelectHistory 함수 사용
  const handleSelectHistory = (historyItem: any) => {
    try {
      setMessages(historyItem.messages);
      setCurrentSession(historyItem);

      if (historyItem.videoInfo) {
        // 비디오 정보가 있으면 업데이트하지만, 현재 페이지의 비디오는 유지
        setDuration(historyItem.videoInfo.duration);
      }

      // 타임스탬프 마커 복원
      const timestamps = historyItem.messages
        .filter((msg: any) => msg.timestamp)
        .map((msg: any) => msg.timestamp!);
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

  // 히스토리 새로고침 함수 개선
  const handleHistoryRefresh = async () => {
    try {
      // 중복 방지로 로딩 토스트 추가
      addToastIfNotExists({
        type: 'info',
        title: '히스토리 새로고침',
        message: '히스토리를 불러오는 중...',
        duration: 1500,
      });

      // 트리거 값을 변경하여 DynamicHistorySidebar에서 새로고침 실행
      setHistoryRefreshTrigger((prev) => prev + 1);

      // 잠시 대기 후 성공 토스트 표시 (로딩 토스트와 겹치지 않도록)
      setTimeout(() => {
        addToastIfNotExists({
          type: 'success',
          title: '새로고침 완료',
          message: '히스토리가 성공적으로 새로고침되었습니다.',
          duration: 2000,
        });
      }, 1000);
    } catch (error) {
      console.error('History refresh error:', error);
      addToast({
        type: 'error',
        title: '새로고침 실패',
        message: '히스토리 새로고침 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => {
      setDuration(video.duration);
      console.log('Video metadata loaded, duration:', video.duration);
    };

    // 비디오 준비 상태 확인을 위한 추가 이벤트 리스너 (메인 페이지와 동일하게 확장)
    const handleCanPlay = () => {
      console.log('Video can play, ready state:', video.readyState);
      setVideoReady(true);
    };

    const handleLoadedData = () => {
      console.log(
        'Video data loaded, dimensions:',
        video.videoWidth,
        'x',
        video.videoHeight
      );
      setVideoReady(true); // loadeddata에서도 비디오 준비 상태 설정
    };

    const handleCanPlayThrough = () => {
      console.log('Video can play through, ready state:', video.readyState);
      setVideoReady(true);
    };

    const handleLoadedMetadata = () => {
      console.log('Video metadata loaded, ready state:', video.readyState);
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    // 에러 처리를 위한 추가 이벤트 리스너
    const handleError = () => {
      console.log('Video error or stalled');
      setVideoReady(false);
    };

    // 메인 페이지와 동일한 이벤트 리스너 등록
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('error', handleError);
    video.addEventListener('abort', handleError);
    video.addEventListener('stalled', handleError);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('error', handleError);
      video.removeEventListener('abort', handleError);
      video.removeEventListener('stalled', handleError);
    };
  }, [videoSrc]);

  // 모바일에서 히스토리 열릴 때 body 스크롤 방지
  useEffect(() => {
    // 클라이언트에서만 실행
    if (typeof window === 'undefined') return;

    if (isMobile && historyOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isMobile, historyOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-[#00e6b4] rounded-full mx-auto mb-4 animate-bounce"></div>
          <p className="text-white text-lg">
            {sessionId ? '기존 세션을 불러오는 중...' : '비디오 로딩 중...'}
          </p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            비디오를 찾을 수 없습니다
          </h1>
          <Link href="/uploaded_video">
            <Button className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              비디오 목록으로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex flex-col">
      {/* Smart Header */}
      <SmartHeader
        currentPage="home"
        historyOpen={historyOpen}
        onHistoryToggle={() => {
          setHistoryOpen(!historyOpen);
          // 히스토리를 열 때는 모바일 메뉴 닫기
          if (!historyOpen) {
            setMobileMenuOpen(false);
          }
        }}
        onHistoryRefresh={handleHistoryRefresh}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => {
          setMobileMenuOpen(!mobileMenuOpen);
          // 모바일 메뉴를 열 때는 히스토리 닫기
          if (!mobileMenuOpen && historyOpen) {
            setHistoryOpen(false);
          }
        }}
      />

      {/* Main Layout - 헤더 높이만큼 패딩 추가 */}
      <div className="flex flex-1 overflow-hidden relative pt-20">
        {/* Main Content */}
        <main
          className={`flex-1 w-full min-w-0 py-4 md:py-8 px-2 md:px-4 overflow-auto transition-all duration-300 ${
            historyOpen && !isMobile
              ? 'blur-sm scale-95 opacity-75'
              : 'blur-0 scale-100 opacity-100'
          }`}
        >
          <div className="w-full max-w-7xl mx-auto">
            <div className="flex flex-col lg:grid lg:grid-cols-5 gap-3 md:gap-6">
              <div className="lg:col-span-3 min-w-0 order-1 lg:order-1">
                <Card className="mb-3 md:mb-6 bg-[#242a38] border-0 shadow-lg">
                  <CardContent className="p-2 md:p-6">
                    {videoSrc ? (
                      <div className="relative">
                        {isAnalyzing ? (
                          // 분석 중일 때 민트색 프로그레스 오버레이 (메인페이지와 동일)
                          <div
                            className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10"
                            style={{
                              animation: 'borderGlow 2s ease-in-out infinite',
                            }}
                          >
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
                          </div>
                        ) : isLoading ? (
                          // 간단한 로딩 애니메이션 (비분석 작업용)
                          <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10">
                            <div className="relative w-24 h-24 md:w-32 md:h-32 mb-4">
                              <div className="w-full h-full border-8 border-gray-600 border-t-[#00e6b4] rounded-full animate-spin"></div>
                            </div>
                            <p className="text-white text-sm md:text-base font-medium mb-2">
                              {sessionId
                                ? '영상 로드 중...'
                                : '영상 로드 중...'}
                            </p>
                            <p className="text-gray-300 text-xs md:text-sm text-center px-4">
                              {sessionId
                                ? '기존 세션을 가져오고 있습니다. 잠시만 기다려주세요.'
                                : '영상을 준비하고 있습니다. 잠시만 기다려주세요.'}
                            </p>
                          </div>
                        ) : null}

                        <video
                          ref={videoRef}
                          className={`w-full h-auto rounded-md bg-black ${
                            isLoading ? 'opacity-50' : 'opacity-100'
                          } transition-opacity duration-300`}
                          src={videoSrc}
                          crossOrigin="anonymous"
                          muted={isMobile} // 모바일에서 음소거
                          playsInline={isMobile} // iOS에서 인라인 재생
                          preload="metadata" // 메타데이터 미리 로드
                          controls={false}
                          style={{
                            minHeight: isMobile ? '200px' : '300px', // 최소 높이 보장
                            maxHeight: isMobile ? '300px' : '500px', // 최대 높이 제한
                          }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}
                          onLoadedData={(e) => {
                            const video = e.target as HTMLVideoElement;
                            console.log(
                              'Video data loaded - readyState:',
                              video.readyState
                            );
                            logVideoState(video, 'onLoadedData');
                            // loadVideoFromId에서 이미 검증된 상태이므로 추가 설정
                            if (video.readyState >= 2) {
                              setVideoReady(true);
                            }
                          }}
                          onLoadStart={() => {
                            console.log('Video loading started');
                            // loadVideoFromId에서 관리하므로 여기서는 로그만
                          }}
                          onCanPlay={(e) => {
                            const video = e.target as HTMLVideoElement;
                            console.log(
                              'Video can play - readyState:',
                              video.readyState
                            );
                            logVideoState(video, 'onCanPlay');
                            setVideoError(null);
                            if (video.readyState >= 2) {
                              setVideoReady(true);
                            }
                          }}
                          onCanPlayThrough={(e) => {
                            const video = e.target as HTMLVideoElement;
                            console.log(
                              'Video can play through - readyState:',
                              video.readyState
                            );
                            logVideoState(video, 'onCanPlayThrough');
                            setVideoReady(true);
                          }}
                          onLoadedMetadata={(e) => {
                            const video = e.target as HTMLVideoElement;
                            console.log(
                              'Video metadata loaded - readyState:',
                              video.readyState
                            );
                            logVideoState(video, 'onLoadedMetadata');
                            if (
                              video.duration &&
                              !isNaN(video.duration) &&
                              video.duration > 0
                            ) {
                              // loadVideoFromId에서 이미 설정했지만 보완적으로 설정
                              if (!duration || duration !== video.duration) {
                                setDuration(video.duration);
                                console.log(
                                  'Video duration updated:',
                                  video.duration
                                );
                              }
                            }
                          }}
                          onWaiting={() => {
                            console.log('Video waiting for data');
                          }}
                          onSeeked={() => {
                            console.log('Video seek completed');
                          }}
                          onSeeking={() => {
                            console.log('Video seeking');
                          }}
                          onProgress={() => {
                            if (videoRef.current) {
                              console.log(
                                'Video progress:',
                                videoRef.current.buffered.length
                              );
                            }
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLVideoElement;
                            const error = target.error;
                            console.error('Video error details:', {
                              code: error?.code,
                              message: error?.message,
                              networkState: target.networkState,
                              readyState: target.readyState,
                              src: target.src,
                            });

                            setVideoReady(false);
                            setIsPlaying(false);
                            addToast({
                              type: 'error',
                              title: '비디오 오류',
                              message: `비디오 로드 오류: ${
                                error?.message || '알 수 없는 오류'
                              }`,
                              duration: 3000,
                            });
                          }}
                          // 모바일에서 터치로 재생 가능하도록
                          onClick={isMobile ? togglePlayPause : undefined}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[400px] rounded-lg bg-[#2a3142]">
                        <Video className="h-16 w-16 text-gray-500 mb-4" />
                        <p className="text-gray-400">
                          비디오를 로드할 수 없습니다
                        </p>
                        <p className="text-gray-500 text-sm mt-2">
                          데모 비디오입니다
                        </p>
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
                            className={`border-[#2a3142] h-9 w-9 md:h-10 md:w-10 ${
                              videoReady && !isLoading
                                ? 'text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] cursor-pointer'
                                : 'text-gray-500 cursor-not-allowed opacity-50'
                            }`}
                            onClick={skipBackward}
                            disabled={!videoReady || isLoading}
                          >
                            <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className={`border-[#2a3142] h-9 w-9 md:h-10 md:w-10 ${
                              videoReady && !isLoading
                                ? 'text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] cursor-pointer'
                                : 'text-gray-500 cursor-not-allowed opacity-50'
                            }`}
                            onClick={togglePlayPause}
                            disabled={!videoReady || isLoading}
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
                            className={`border-[#2a3142] h-9 w-9 md:h-10 md:w-10 ${
                              videoReady && !isLoading
                                ? 'text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] cursor-pointer'
                                : 'text-gray-500 cursor-not-allowed opacity-50'
                            }`}
                            onClick={skipForward}
                            disabled={!videoReady || isLoading}
                          >
                            <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                        </div>
                        <span className="text-gray-400 text-sm">
                          {formatTime(duration)}
                        </span>
                      </div>

                      <div className="relative w-full h-6 md:h-8 bg-[#1a1f2c] rounded-full overflow-hidden cursor-pointer">
                        <div
                          className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30"
                          style={{
                            width: `${(currentTime / (duration || 1)) * 100}%`,
                          }}
                        />

                        {timeMarkers.map((time, index) => (
                          <div
                            key={index}
                            className="absolute top-0 h-full w-1 bg-[#6c5ce7] cursor-pointer"
                            style={{
                              left: `${(time / (duration || 1)) * 100}%`,
                            }}
                            onClick={() => seekToTime(time)}
                            title={`${formatTime(time)}로 이동`}
                          />
                        ))}

                        <div
                          className="absolute top-0 left-0 w-full h-full"
                          onClick={(e) => {
                            if (videoRef.current && videoReady) {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const pos = (e.clientX - rect.left) / rect.width;
                              const newTime = pos * (duration || 0);
                              videoRef.current.currentTime = Math.max(
                                0,
                                Math.min(newTime, duration)
                              );
                            }
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {videoSrc && video && (
                  <SummaryButton
                    video={video}
                    isLoading={isLoading || isGenerating}
                    onGenerateSummary={handleGenerateSummary}
                  />
                )}

                {/* Event Timeline - 비디오 아래에 추가 */}
                {videoSrc && video && (
                  <Card className="bg-[#242a38] border-0 shadow-lg">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm md:text-base font-semibold text-white">
                          이벤트 타임라인
                        </h3>
                        <span className="text-xs text-gray-400">
                          실시간 이벤트 감지
                        </span>
                      </div>
                      <EventTimeline
                        video={video}
                        currentTime={currentTime}
                        onSeekToEvent={seekToTime}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="order-2 lg:order-2 lg:col-span-2 min-w-0 overflow-hidden flex flex-col">
                <Card className="flex-1 min-h-[500px] lg:min-h-[600px] max-h-[90vh] lg:max-h-[85vh] bg-[#242a38] border-0 shadow-lg chat-container-flexible overflow-hidden">
                  <CardContent className="p-2 md:p-4 flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-2 md:mb-4 flex-shrink-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <h2 className="text-base md:text-xl font-semibold text-white">
                          새 분석 세션
                        </h2>
                        <p className="text-xs md:text-sm text-gray-400 break-words overflow-hidden">
                          <span
                            className="inline-block max-w-full truncate"
                            title={
                              video?.name
                                ? `${video.name} 영상에 대한 새로운 분석을 시작합니다`
                                : ''
                            }
                          >
                            {video?.name && video.name.length > 30
                              ? `${video.name.substring(0, 30)}...`
                              : video?.name || '영상'}{' '}
                            영상에 대한 새로운 분석을 시작합니다
                          </span>
                        </p>
                      </div>
                      <Link href="/">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#6c5ce7] text-[#6c5ce7] hover:bg-[#6c5ce7] hover:text-white hover:border-[#6c5ce7] transition-all duration-200"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />새 분석 시작
                        </Button>
                      </Link>
                    </div>

                    <div className="flex-1 overflow-hidden mb-2 md:mb-4 border border-[#2a3142] rounded-md chat-messages-area">
                      <ScrollArea className="h-full pr-1 md:pr-2">
                        <div className="space-y-2 md:space-y-4 p-2 md:p-4">
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
                                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-2 md:p-3 text-xs md:text-base break-words overflow-wrap-anywhere word-break ${
                                  message.role === 'user'
                                    ? 'bg-[#6c5ce7] text-white'
                                    : 'bg-[#2a3142] text-gray-200'
                                }`}
                                style={{
                                  wordBreak: 'break-word',
                                  overflowWrap: 'anywhere',
                                  hyphens: 'auto',
                                }}
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

                    <form
                      onSubmit={handleSendMessage}
                      className="flex gap-1 md:gap-2"
                    >
                      <Textarea
                        placeholder="영상 내용에 대해 질문하세요..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        disabled={isLoading}
                        className={`flex-1 resize-none border-[#2a3142] text-gray-200 placeholder:text-gray-500 text-sm md:text-base bg-[#1a1f2c] hover:border-[#00e6b4] focus:border-[#00e6b4] ${
                          isLoading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        rows={3}
                      />
                      <Button
                        type="submit"
                        disabled={!inputMessage.trim() || isLoading}
                        className={`px-3 md:px-4 text-sm md:text-sm transition-all duration-200 ${
                          !inputMessage.trim() || isLoading
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                            : 'bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]'
                        }`}
                      >
                        {isLoading ? '로드 중...' : '전송'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        {/* History Sidebar - 홈페이지와 동일한 DynamicHistorySidebar 사용 */}
        {isMobile ? (
          <div
            className={`fixed inset-0 z-50 bg-[#1a1f2c] transform transition-transform duration-300 ease-out ${
              historyOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* 모바일 전용 헤더 */}
            <div className="bg-[#242a38] border-b border-[#2a3142] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center">
                  <img
                    src="/images/ds_logo_transparent.png"
                    alt="Deep Sentinel Logo"
                    className="w-full h-full object-contain scale-[1.7]"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">
                    Deep Sentinel
                  </h1>
                  <span className="text-xs text-gray-400">분석 히스토리</span>
                </div>
              </div>
            </div>

            <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
              <HistorySidebar
                onSelectHistory={handleSelectHistory}
                currentHistoryId={currentSession?.id}
                onClose={() => setHistoryOpen(false)}
                refreshTrigger={historyRefreshTrigger}
                onHistoryRefresh={handleHistoryRefresh}
              />
            </div>
          </div>
        ) : (
          <div
            className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out ${
              historyOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{
              top: '73px',
              height: 'calc(100vh - 73px)',
              width: '35vw',
              maxWidth: '600px',
              minWidth: '400px',
            }}
          >
            <HistorySidebar
              onSelectHistory={handleSelectHistory}
              currentHistoryId={currentSession?.id}
              onClose={() => setHistoryOpen(false)}
              refreshTrigger={historyRefreshTrigger}
              onHistoryRefresh={handleHistoryRefresh}
            />
          </div>
        )}

        {historyOpen && !isMobile && (
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-gradient-to-r from-[#1a1f2c]/20 via-[#00e6b4]/5 to-[#3694ff]/10"
            style={{
              top: '73px',
              height: 'calc(100vh - 73px)',
            }}
            onClick={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Enhanced Footer - 추가된 푸터 */}
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
              <span>© 2026 Deep Sentinel. All rights reserved.</span>
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

      {/* Components */}
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
          videoReady={videoReady}
          timeMarkers={timeMarkers}
          onSeek={seekToTime}
        />
      )}
    </div>
  );
}
