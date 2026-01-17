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
import { getUploadedVideos } from '@/app/actions/video/video-service-client';
import { getSession } from '@/app/actions/storage/session-service';
import { sendMessage, sendVlmMessage } from '@/app/actions/ai/ai-service';
import type { UploadedVideo } from '@/app/types/video';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import SmartHeader from '@/components/layout/SmartHeader';
import HistoryLayout from '@/components/layout/HistoryLayout';
import {
  getVideoMetadataFromUrl,
  waitForVideoReady,
  logVideoState,
} from '@/utils/video-utils';
import SummaryButton from '@/components/video/SummaryButton';
import { useSummary } from '@/hooks/video/useSummary';
import Footer from '@/components/layout/Footer';
import VideoPlayer from '@/components/video/VideoPlayer';
import { useVideoControls } from '@/hooks/video/useVideoControls';
import { useToast } from '@/hooks/ui/useToast';
import { useChatMessage } from '@/hooks/data/useChatMessage';
import { useVideoEventListeners } from '@/hooks/video/useVideoEventListeners';
import ChatInterface from '@/components/chat/ChatInterface';

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
  const { toasts, addToast, addToastIfNotExists, removeToast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

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

  const { togglePlayPause, skipForward, skipBackward, seekToTime } =
    useVideoControls({
      videoRef,
      videoSrc,
      isPlaying,
      duration,
      isMobile,
      setIsPlaying,
      addToast,
    });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const { handleSendMessage: sendChatMessage } = useChatMessage({
    videoSrc,
    videoId,
    videoFileName: videoFileName || '',
    currentSession,
    currentHistoryId: currentHistoryId || undefined,
    duration,
    videoRef,
    setMessages,
    setTimeMarkers,
    setCurrentSession,
    setTooltipData,
    setCurrentHistoryId: (id) => setCurrentHistoryId(id || null),
    formatTime,
    addToast,
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendChatMessage(e, inputMessage, setInputMessage);
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

  // 비디오 이벤트 리스너 설정
  useVideoEventListeners({
    videoRef,
    videoSrc,
    isMobile,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setVideoError,
    setVideoReady,
  });

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
                <VideoPlayer
                  ref={videoRef}
                  videoSrc={videoSrc}
                  videoFileName={videoFileName || ''}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  timeMarkers={timeMarkers}
                  isAnalyzing={isAnalyzing}
                  isUploading={false}
                  uploadProgress={0}
                  uploadStage=""
                  analysisProgress={analysisProgress}
                  videoLoading={isLoading}
                  videoError={videoError}
                  isMobile={isMobile}
                  onTogglePlayPause={togglePlayPause}
                  onSkipForward={skipForward}
                  onSkipBackward={skipBackward}
                  onSeekToTime={seekToTime}
                  onCancelProcess={() => {}}
                  onInfoClick={(data) => setTooltipData(data)}
                  onVideoError={(error) => setVideoError(error)}
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                  formatTime={formatTime}
                />

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
                <ChatInterface
                  messages={messages}
                  inputMessage={inputMessage}
                  isAnalyzing={isLoading}
                  videoSrc={videoSrc}
                  videoId={videoId}
                  onInputChange={setInputMessage}
                  onSendMessage={handleSendMessage}
                  onNewChat={() => {
                    window.location.href = '/';
                  }}
                  onQuickQuestion={(question: string) => {
                    setInputMessage(question);
                    setTimeout(() => {
                      const event = new Event('submit', {
                        bubbles: true,
                        cancelable: true,
                      });
                      handleSendMessage(event as any);
                    }, 100);
                  }}
                  onSeekToTime={seekToTime}
                  formatTime={formatTime}
                />
              </div>
            </div>
          </div>
        </main>

        <HistoryLayout
          historyOpen={historyOpen}
          isMobile={isMobile}
          currentHistoryId={currentSession?.id}
          historyRefreshTrigger={historyRefreshTrigger}
          onSelectHistory={handleSelectHistory}
          onClose={() => setHistoryOpen(false)}
          onHistoryRefresh={handleHistoryRefresh}
        />
      </div>

      <Footer historyOpen={historyOpen} />

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
