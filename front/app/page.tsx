'use client';

console.log('🔥 page.tsx 파일이 로드됨 - 최상단');

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Mail,
  Info,
  MessageSquare,
  X,
  AlertTriangle,
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
import DragDropZone from '@/components/upload/DragDropZone';
import SmartHeader from '@/components/layout/SmartHeader';
import HistoryLayout from '@/components/layout/HistoryLayout';
import { saveHistory, getHistoryList } from '@/app/actions/history-service';
import JQueryCounterAnimation from '@/components/legacy/JQueryCounterAnimation';
import { saveVideoFile } from '@/app/actions/video-service';
import { getUploadedVideos } from '@/app/actions/video-service-client';
import { uploadVideoToS3 } from '@/app/actions/s3-upload-service';
import type { ChatSession } from '@/app/types/session';
import type { UploadedVideo } from '@/app/types/video';
import EventTimeline from '@/components/video/EventTimeline';
import VideoPlayer from '@/components/video/VideoPlayer';
import UploadSection from '@/components/upload/UploadSection';
import ChatInterface from '@/components/chat/ChatInterface';
import SummaryButton from '@/components/video/SummaryButton';
import { useSummary } from '@/hooks/useSummary';
import { useVideoControls } from '@/hooks/useVideoControls';
import { useToast } from '@/hooks/useToast';
import { useAnalysisProgress } from '@/hooks/useAnalysisProgress';
import { useChatMessage } from '@/hooks/useChatMessage';
import { useFileUpload } from '@/hooks/useFileUpload';
import Footer from '@/components/layout/Footer';

export default function CCTVAnalysis() {
  console.log('🏠 CCTVAnalysis 컴포넌트 렌더링됨');

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
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
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(
    null
  );

  console.log('🏠 현재 상태:', {
    videoSrc: !!videoSrc,
    inputMessage,
    messagesCount: messages.length,
  });
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
  const { toasts, addToast, addToastIfNotExists, removeToast } = useToast();

  const [dragDropVisible, setDragDropVisible] = useState(false);
  const [uploadHighlight, setUploadHighlight] = useState(false); // 업로드 영역 강조 상태 추가
  const [showWarning, setShowWarning] = useState(false); // 경고 애니메이션 상태

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null); // 새로 추가
  const uploadAreaRef = useRef<HTMLDivElement>(null);

  // 모바일 감지 훅 추가
  // 모바일 감지 훅 수정 - 초기값을 false로 설정하여 hydration 오류 방지
  const [isMobile, setIsMobile] = useState(false);

  // 분석 상태와 진행도를 관리하는 새로운 state 추가:
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const { startProgressPolling, stopProgressPolling } = useAnalysisProgress({
    analysisProgress,
    setAnalysisProgress,
    setIsAnalyzing,
    setMessages,
    setVideo,
    videoFileName,
    addToast,
  });

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const { handleSendMessage: sendChatMessage } = useChatMessage({
    videoSrc,
    videoId,
    videoFileName,
    currentSession,
    currentHistoryId,
    duration,
    videoRef,
    setMessages,
    setTimeMarkers,
    setCurrentSession,
    setTooltipData,
    setCurrentHistoryId,
    formatTime,
    addToast,
  });

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

  // 디버깅을 위한 분석 상태 추적 (개발 환경에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [Debug] isAnalyzing 상태 변경:', {
        isAnalyzing,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isAnalyzing]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 [Debug] analysisProgress 상태 변경:', {
        analysisProgress,
        timestamp: new Date().toISOString(),
      });
    }
  }, [analysisProgress]);

  // 비디오 로딩 상태 추가
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // 중복 비디오 여부 상태 추가
  const [isDuplicateVideo, setIsDuplicateVideo] = useState(false);

  // 업로드 진행률 추적을 위한 새로운 상태들
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);

  // 히스토리 새로고침 트리거
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // API 상태 모니터링을 위한 state 추가
  const [apiHealthStatus, setApiHealthStatus] = useState<{
    aiService: 'healthy' | 'warning' | 'error' | 'unknown';
    backend: 'healthy' | 'warning' | 'error' | 'unknown';
    lastCheck: Date | null;
  }>({
    aiService: 'unknown',
    backend: 'unknown',
    lastCheck: null,
  });

  // 분석 재시도 관련 state
  const [analysisRetryCount, setAnalysisRetryCount] = useState(0);
  const [maxAnalysisRetries] = useState(2);

  // 실제 AI 분석을 수행하는 함수 (분석 애니메이션과 동시 실행)
  const startActualAIAnalysis = async (
    currentVideoId: string | null,
    file: File
  ) => {
    console.log('🎬 [AI Analysis Start] 함수 진입:', {
      videoId: currentVideoId,
      fileName: file.name,
      currentAnimationState: isAnalyzing,
      timestamp: new Date().toISOString(),
    });

    if (!currentVideoId) {
      console.error('❌ [AI Analysis] Video ID가 없어 분석을 시작할 수 없음');
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      return;
    }

    // 분석 중 메시지 업데이트
    setMessages([
      {
        role: 'assistant',
        content: isDuplicateVideo
          ? '이미 업로드된 영상을 분석합니다. 이전 분석 결과를 활용할 수 있습니다.'
          : '영상 분석을 시작합니다. 잠시만 기다려주세요...',
      },
    ]);

    const startAnalysisTime = Date.now();

    // 실제 AI 모델 호출 - 분석 시작만 요청 (완료는 진행률 폴링이 담당)
    try {
      console.log('🤖 [AI Analysis] AI 모델 분석 시작 요청:', {
        videoId: currentVideoId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        startTime: new Date().toISOString(),
      });

      // ✅ S3 업로드 완료 → SQS 이벤트 → Lambda → Batch 자동 실행
      // Frontend에서 별도로 분석 시작 API를 호출할 필요 없음
      console.log(
        '✅ [AI Analysis] S3 업로드 완료 - SQS → Lambda → Batch 자동 실행 대기:',
        {
          videoId: currentVideoId,
          fileName: file.name,
          timestamp: new Date().toISOString(),
        }
      );

      // 진행률 폴링이 자동으로 Batch 작업 완료를 감지할 때까지 대기

      // 진행률 폴링이 완료를 감지하면 자동으로 애니메이션 종료됨
    } catch (analysisError) {
      const errorDetails = {
        videoId: currentVideoId,
        fileName: file.name,
        error:
          analysisError instanceof Error
            ? analysisError.message
            : String(analysisError),
        timestamp: new Date().toISOString(),
        duration: `${Math.round((Date.now() - startAnalysisTime) / 1000)}초`,
      };

      console.error('❌ [AI Analysis] AI 분석 실패:', errorDetails);

      // 분석 실패 시 처리
      stopProgressPolling();
      setIsAnalyzing(false);
      setAnalysisProgress(0);

      // 에러 타입에 따른 사용자 친화적 메시지
      let userErrorMessage = '알 수 없는 오류가 발생했습니다.';

      if (analysisError instanceof Error) {
        const errorMsg = analysisError.message.toLowerCase();

        if (errorMsg.includes('timeout') || errorMsg.includes('타임아웃')) {
          userErrorMessage =
            '대용량 파일 처리 시간이 초과되었습니다. 파일 크기를 줄이거나 다시 시도해주세요.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          userErrorMessage =
            '네트워크 연결 문제가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.';
        } else if (
          errorMsg.includes('decode') ||
          errorMsg.includes('format') ||
          errorMsg.includes('codec')
        ) {
          userErrorMessage =
            '비디오 형식이 지원되지 않습니다. MP4 (H.264) 형식으로 변환하여 다시 시도해주세요.';
        } else if (errorMsg.includes('memory') || errorMsg.includes('메모리')) {
          userErrorMessage =
            '파일이 너무 커서 처리할 수 없습니다. 파일 크기를 줄여서 다시 시도해주세요.';
        } else if (errorMsg.includes('server') || errorMsg.includes('서버')) {
          userErrorMessage =
            '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        }
      }

      if (analysisError instanceof Error) {
        const errorMessage = analysisError.message.toLowerCase();

        if (
          errorMessage.includes('network') ||
          errorMessage.includes('fetch')
        ) {
          userErrorMessage =
            '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.';
        } else if (errorMessage.includes('timeout')) {
          userErrorMessage =
            '분석 시간이 초과되었습니다. 파일 크기가 클 수 있습니다.';
        } else if (
          errorMessage.includes('format') ||
          errorMessage.includes('codec')
        ) {
          userErrorMessage =
            '비디오 형식이 지원되지 않습니다. 다른 형식으로 변환 후 시도해주세요.';
        } else if (
          errorMessage.includes('server') ||
          errorMessage.includes('500')
        ) {
          userErrorMessage =
            '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.';
        } else {
          userErrorMessage = analysisError.message;
        }
      }

      setMessages([
        {
          role: 'assistant',
          content: `영상 분석 중 오류가 발생했습니다: ${userErrorMessage} 나중에 다시 시도해주세요.`,
        },
      ]);

      addToast({
        type: 'error',
        title: '분석 실패',
        message: userErrorMessage,
        duration: 7000,
      });
    }
  };

  // 업로드 및 분석 취소 함수
  const handleCancelProcess = () => {
    // 새로운 stopProgressPolling 함수 사용
    stopProgressPolling();

    console.log('🚫 [Cancel] 업로드/분석 프로세스 취소됨:', {
      isUploading,
      isAnalyzing,
      videoId,
      timestamp: new Date().toISOString(),
    });

    // 업로드 관련 상태 초기화
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStage('');
    setUploadStartTime(null);

    // 분석 관련 상태 초기화
    setIsAnalyzing(false);
    setAnalysisProgress(0);

    // 비디오 관련 상태 초기화
    setVideoLoading(false);
    setVideoError(null);
    setVideoSrc(null);
    setVideoFileName('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setTimeMarkers([]);

    // UI 상태 초기화
    setDragDropVisible(false);
    setIsDuplicateVideo(false);
    setUploadHighlight(false);

    // 메시지 초기화
    setMessages([
      {
        role: 'assistant',
        content:
          '안녕하세요! CCTV 영상 분석을 도와드리겠습니다. 먼저 분석할 영상을 업로드해주세요.',
      },
    ]);
    setCurrentHistoryId(undefined);
    setCurrentSession(null);

    // 비디오 엘리먼트 정리
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.src = '';
    }

    // Object URL 정리 (메모리 누수 방지)
    if (videoSrc && videoSrc.startsWith('blob:')) {
      URL.revokeObjectURL(videoSrc);
    }

    // 취소 토스트 표시
    addToast({
      type: 'info',
      title: '취소됨',
      message: '업로드/분석이 취소되었습니다.',
      duration: 2000,
    });
  };

  // 히스토리 새로고침 함수
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
          message: '히스토리가 갱신되었습니다.',
          duration: 1500,
        });
      }, 800);
    } catch (error) {
      console.error('History refresh error:', error);
      addToastIfNotExists({
        type: 'error',
        title: '새로고침 실패',
        message: '히스토리 새로고침 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  // API 헬스 체크 함수
  const checkApiHealth = async () => {
    const checkTime = new Date();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

    try {
      console.log('🏥 [Health Check] API 상태 확인 시작');

      // 백엔드 API 상태 확인
      const backendHealthPromise = fetch(`${API_URL}/db/videos/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000), // 5초 타임아웃
      })
        .then((response) => (response.ok ? 'healthy' : 'error'))
        .catch(() => 'error');

      // AI 서비스는 백엔드를 통해서만 접근하므로 별도 헬스체크 불필요
      // ECS 환경에서는 직접 접근 불가
      const aiServiceHealthPromise = Promise.resolve('healthy');

      const [backendStatus, aiServiceStatus] = await Promise.all([
        backendHealthPromise,
        aiServiceHealthPromise,
      ]);

      setApiHealthStatus({
        backend: backendStatus as 'healthy' | 'error',
        aiService: aiServiceStatus as 'healthy' | 'error',
        lastCheck: checkTime,
      });

      console.log('🏥 [Health Check] API 상태 확인 완료:', {
        backend: backendStatus,
        aiService: aiServiceStatus,
        timestamp: checkTime.toISOString(),
      });
    } catch (error) {
      console.error('🏥 [Health Check] API 상태 확인 실패:', error);
      setApiHealthStatus({
        backend: 'error',
        aiService: 'error',
        lastCheck: checkTime,
      });
    }
  };

  // 앱 시작 시 API 상태 확인
  useEffect(() => {
    checkApiHealth();

    // 5분마다 API 상태 재확인
    const healthCheckInterval = setInterval(checkApiHealth, 5 * 60 * 1000);

    return () => clearInterval(healthCheckInterval);
  }, []);

  useEffect(() => {
    console.log('🎯 useEffect 실행됨 - 컴포넌트 마운트');

    const checkMobile = () => {
      const userAgent =
        navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent.toLowerCase()
        );
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(isMobileDevice || isSmallScreen);
      console.log('📱 모바일 감지:', { isMobileDevice, isSmallScreen });
    };

    // 컴포넌트 마운트 후에만 실행
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // 전역 클릭 이벤트 리스너 추가 (디버그용)
    const globalClickHandler = (e: Event) => {
      console.log('🖱️ 전역 클릭 이벤트:', e.target);
    };
    document.addEventListener('click', globalClickHandler);

    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('click', globalClickHandler);

      // 컴포넌트 언마운트 시 분석 진행률 폴링 정리
      console.log('🧹 [Cleanup] 컴포넌트 언마운트로 인한 진행률 폴링 정리');
      stopProgressPolling();
    };
  }, []);

  // 모바일에서 히스토리 열릴 때 body 스크롤 방지
  // 모바일에서 히스토리 열릴 때 body 스크롤 방지 - 클라이언트에서만 실행
  useEffect(() => {
    // 클라이언트에서만 실행
    if (typeof window === 'undefined') return;

    if (isMobile && historyOpen) {
      // body 스크롤을 완전히 차단하는 대신 터치 이벤트만 제어
      const preventScroll = (e: TouchEvent) => {
        // 히스토리 사이드바 내부의 스크롤은 허용
        const target = e.target as Element;
        const historyElement = document.querySelector('[data-history-sidebar]');

        if (historyElement && !historyElement.contains(target)) {
          e.preventDefault();
        }
      };

      // 터치 이벤트만 제어하여 브라우저의 스크롤 컨텍스트는 유지
      document.addEventListener('touchmove', preventScroll, { passive: false });

      return () => {
        document.removeEventListener('touchmove', preventScroll);
      };
    }
  }, [isMobile, historyOpen]);

  // useFileUpload hook 사용
  const { handleFileUpload } = useFileUpload({
    setVideoSrc,
    setVideoFileName,
    setVideoId,
    setVideo,
    setVideoLoading,
    setVideoError,
    setIsDuplicateVideo,
    setIsUploading,
    setUploadProgress,
    setUploadStage,
    setUploadStartTime,
    setDragDropVisible,
    setCurrentHistoryId,
    setCurrentSession,
    setTimeMarkers,
    setIsAnalyzing,
    setAnalysisProgress,
    isMobile,
    isDuplicateVideo,
    uploadStartTime,
    startProgressPolling,
    startActualAIAnalysis,
    addToast,
  });

  const handleFileUploadFromInput = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // 비디오 컨트롤 훅 사용
  const { togglePlayPause, skipForward, skipBackward, seekToTime } =
    useVideoControls({
      videoRef,
      videoSrc,
      isPlaying,
      duration,
      isMobile,
      videoSectionRef,
      setIsPlaying,
      addToast,
    });

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

        setVideoError(`비디오 오류: ${error.message}`);
        setIsPlaying(false);
      }
    };

    const handleLoadedData = () => {
      console.log('Video data loaded successfully');
      setVideoError(null);
    };

    const handleLoadedMetadata = () => {
      console.log('Video metadata loaded');
      updateDuration();
    };

    const handleCanPlay = () => {
      console.log('Video can play');
      updateDuration();
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
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
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
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('error', handleError);
        video.removeEventListener('abort', handleError);
        video.removeEventListener('stalled', handleError);
      };
    } catch (error) {
      console.error('Video event listener error:', error);
    }
  }, [videoSrc, isMobile]);

  // 시간 업데이트를 위한 추가 useEffect (백업 메커니즘)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || !isPlaying) return;

    // 재생 중일 때만 주기적으로 시간 업데이트
    const interval = setInterval(() => {
      try {
        if (video.currentTime !== undefined && !isNaN(video.currentTime)) {
          setCurrentTime((prevTime) => {
            const newTime = video.currentTime;
            // 시간이 실제로 변경된 경우에만 상태 업데이트
            if (Math.abs(newTime - prevTime) >= 0.1) {
              console.log(`[Backup] Time updated: ${newTime.toFixed(2)}s`);
              return newTime;
            }
            return prevTime;
          });
        }
      } catch (error) {
        console.warn('Backup time update error:', error);
      }
    }, 100); // 100ms마다 확인 (너무 자주 하지 않도록)

    return () => {
      clearInterval(interval);
    };
  }, [videoSrc, isPlaying]);

  console.log('📝 handleSendMessage 함수가 정의됨');

  const handleSendMessage = async (e: React.FormEvent) => {
    await sendChatMessage(e, inputMessage, setInputMessage);
  };

  const handleNewChat = () => {
    try {
      // 비디오 관련 상태 초기화
      setVideoSrc(null);
      setVideoFileName('');
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setVideoError(null);

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
      setCurrentSession(null);
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

  // 채팅창 클릭 시 경고 표시
  const handleChatWarning = () => {
    if (!videoSrc) {
      setShowWarning(true);
      addToast({
        type: 'warning',
        title: '영상을 먼저 업로드하세요',
        message: '채팅을 사용하려면 먼저 영상을 업로드해주세요.',
        duration: 3000,
      });

      // 업로드 영역으로 스크롤
      if (uploadAreaRef.current) {
        uploadAreaRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }

      // 3초 후 경고 애니메이션 제거
      setTimeout(() => {
        setShowWarning(false);
      }, 3000);
    }
  };

  const handleInputClickWithoutVideo = (
    e: React.MouseEvent | React.FocusEvent | React.FormEvent
  ) => {
    console.log('Input interaction detected, videoSrc:', videoSrc);
    if (!videoSrc) {
      console.log('No video, activating upload highlight');

      // 모바일에서 업로드 영역으로 스크롤
      if (isMobile && uploadAreaRef.current) {
        uploadAreaRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }

      // 업로드 영역 강조 애니메이션
      setUploadHighlight(true);

      // 1초 후 애니메이션 종료
      setTimeout(() => {
        console.log('Deactivating upload highlight');
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
    console.log('⌨️ Key pressed:', e.key, 'shiftKey:', e.shiftKey);

    // 영상이 없을 때도 입력 감지하여 강조 효과 실행
    if (!videoSrc) {
      handleInputClickWithoutVideo(e as any);
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('✅ Enter 키 감지, 전송 조건 확인:', {
        hasVideo: !!videoSrc,
        hasMessage: !!inputMessage.trim(),
        canSend: !!inputMessage.trim() && !!videoSrc,
      });

      // 메시지가 있고 비디오가 있을 때만 전송
      if (inputMessage.trim() && videoSrc) {
        console.log('🚀 Enter 키로 메시지 전송 시작');
        handleSendMessage(e);
      } else {
        console.log(
          '⚠️ 메시지나 비디오가 없어서 전송하지 않음 - 메시지:',
          !!inputMessage.trim(),
          '비디오:',
          !!videoSrc
        );
      }
    }
  };

  const handleSelectHistory = (historyItem: any) => {
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
    { label: '감지된 이벤트', value: 3891, suffix: '건', color: '#6c5ce7' },
    { label: '처리 시간', value: 2.4, suffix: 's', color: '#ffd93d' },
    { label: '정확도', value: 99, suffix: '%', color: '#ff6b6b' },
  ];

  // Add this useEffect after the existing useEffects
  useEffect(() => {
    // Cleanup object URLs when component unmounts or video changes
    return () => {
      if (videoSrc && videoSrc.startsWith('blob:')) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

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
        {/* Main Content - 블러 효과와 함께 */}
        <main
          className={`flex-1 container mx-auto py-4 md:py-8 px-4 overflow-auto transition-all duration-300 ${
            historyOpen && !isMobile
              ? 'blur-sm scale-95 opacity-75'
              : 'blur-0 scale-100 opacity-100'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            <div className="lg:col-span-3" ref={videoSectionRef}>
              {videoSrc ? (
                <>
                  <VideoPlayer
                    ref={videoRef}
                    videoSrc={videoSrc}
                    videoFileName={videoFileName}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    timeMarkers={timeMarkers}
                    isAnalyzing={isAnalyzing}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    uploadStage={uploadStage}
                    analysisProgress={analysisProgress}
                    videoLoading={videoLoading}
                    videoError={videoError}
                    isMobile={isMobile}
                    onTogglePlayPause={togglePlayPause}
                    onSkipForward={skipForward}
                    onSkipBackward={skipBackward}
                    onSeekToTime={seekToTime}
                    onCancelProcess={handleCancelProcess}
                    onInfoClick={setTooltipData}
                    onVideoError={setVideoError}
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
                      isLoading={isUploading || isGenerating}
                      onGenerateSummary={handleGenerateSummary}
                    />
                  )}
                  {video && (
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
                </>
              ) : (
                <UploadSection
                  ref={uploadAreaRef}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  uploadStage={uploadStage}
                  isDuplicateVideo={isDuplicateVideo}
                  uploadHighlight={uploadHighlight}
                  showWarning={showWarning}
                  onUploadClick={() => setDragDropVisible(true)}
                  onCancelProcess={handleCancelProcess}
                />
              )}
            </div>

            <div className="lg:col-span-2 flex flex-col">
              <ChatInterface
                messages={messages}
                inputMessage={inputMessage}
                isAnalyzing={isAnalyzing}
                videoSrc={videoSrc}
                videoId={videoId}
                onInputChange={setInputMessage}
                onSendMessage={handleSendMessage}
                onNewChat={handleNewChat}
                onQuickQuestion={(question) => {
                  setInputMessage(question);
                  const event = new Event('submit', {
                    bubbles: true,
                    cancelable: true,
                  }) as any;
                  handleSendMessage(event);
                }}
                onTextareaClick={handleChatWarning}
                formatTime={formatTime}
              />
            </div>
          </div>

          {/* 카운터 애니메이션 */}
          <div className="mt-6 md:mt-8">
            <JQueryCounterAnimation stats={statsData} />
          </div>
        </main>

        <HistoryLayout
          historyOpen={historyOpen}
          isMobile={isMobile}
          currentHistoryId={currentHistoryId}
          historyRefreshTrigger={historyRefreshTrigger}
          onSelectHistory={handleSelectHistory}
          onClose={handleCloseHistory}
          onHistoryRefresh={handleHistoryRefresh}
        />
      </div>

      <Footer historyOpen={historyOpen} />

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

        @keyframes borderGlowYellow {
          0% {
            border-color: rgba(255, 184, 0, 0.8);
            box-shadow: 0 0 0 2px rgba(255, 184, 0, 0.3);
          }
          50% {
            border-color: rgba(255, 184, 0, 1);
            box-shadow: 0 0 0 4px rgba(255, 184, 0, 0.6);
          }
          100% {
            border-color: rgba(255, 184, 0, 0.8);
            box-shadow: 0 0 0 2px rgba(255, 184, 0, 0.3);
          }
        }
      `}</style>
    </div>
  );
}
