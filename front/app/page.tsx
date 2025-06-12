'use client';

console.log("🔥 page.tsx 파일이 로드됨 - 최상단");

import React, { useState, useRef, useEffect } from 'react';
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
import DynamicHistorySidebar from '@/components/dynamic-history-sidebar';
import DraggableTooltip from '@/components/draggable-tooltip';
import ToastNotification, { type Toast } from '@/components/toast-notification';
import VideoMinimap from '@/components/video-minimap';
import DragDropZone from '@/components/drag-drop-zone';
import SmartHeader from '@/components/smart-header';
import { saveHistory, getHistoryList } from '@/app/actions/history-service';
import JQueryCounterAnimation from '@/components/jquery-counter-animation';
import { saveVideoFile, getUploadedVideos } from '@/app/actions/video-service';
import type { ChatSession } from '@/app/types/session';
import type { UploadedVideo } from '@/app/types/video';
import EventTimeline from '@/components/event-timeline';

// HTML5 Video API를 사용하여 비디오 duration 추출 함수
const getVideoDurationFromFile = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true; // 모바일 호환성을 위해 음소거
    video.playsInline = true; // iOS에서 인라인 재생

    // 타임아웃 설정 (10초)
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Video duration extraction timeout'));
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);

      // duration이 유효한지 확인
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        resolve(video.duration);
      } else {
        reject(new Error('Invalid video duration'));
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    // 비디오 소스 설정
    video.src = URL.createObjectURL(file);
  });
};

export default function CCTVAnalysis() {
  // 분석 진행률 폴링 interval을 안전하게 관리하기 위한 ref
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  console.log("🏠 CCTVAnalysis 컴포넌트 렌더링됨");
  
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
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  
  console.log("🏠 현재 상태:", {
    videoSrc: !!videoSrc,
    inputMessage,
    messagesCount: messages.length
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragDropVisible, setDragDropVisible] = useState(false);
  const [uploadHighlight, setUploadHighlight] = useState(false); // 업로드 영역 강조 상태 추가

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null); // 새로 추가
  const uploadAreaRef = useRef<HTMLDivElement>(null);

  // 모바일 감지 훅 추가
  // 모바일 감지 훅 수정 - 초기값을 false로 설정하여 hydration 오류 방지
  const [isMobile, setIsMobile] = useState(false);

  // 분석 상태와 진행도를 관리하는 새로운 state 추가:
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

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
        timestamp: new Date().toISOString()
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
    lastCheck: null
  });

  // 분석 재시도 관련 state
  const [analysisRetryCount, setAnalysisRetryCount] = useState(0);
  const [maxAnalysisRetries] = useState(2);

  // 실제 AI 분석을 수행하는 함수 (분석 애니메이션과 동시 실행)
  const startActualAIAnalysis = async (currentVideoId: string | null, file: File) => {
    console.log('🎬 [AI Analysis Start] 함수 진입:', {
      videoId: currentVideoId,
      fileName: file.name,
      currentAnimationState: isAnalyzing,
      timestamp: new Date().toISOString()
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
        startTime: new Date().toISOString()
      });
      
      // ai-service의 분석 시작 함수 호출 (즉시 반환되는 버전)
      const { startAnalyzeVideo } = await import('./actions/ai-service');
      
      // 🔑 중요: 분석 시작만 요청하고, 완료는 기다리지 않음
      // 진행률 폴링이 완료를 감지할 때까지 애니메이션 유지
      const startResult = await startAnalyzeVideo(currentVideoId);
      
      if (startResult.success) {
        console.log('✅ [AI Analysis] AI 분석 시작 성공:', {
          videoId: currentVideoId,
          message: startResult.message,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(startResult.message || 'AI 분석 시작에 실패했습니다.');
      }
      
      console.log('✅ [AI Analysis] AI 분석 시작 요청 완료 - 진행률 폴링으로 완료 대기:', {
        videoId: currentVideoId,
        timestamp: new Date().toISOString()
      });
      
      // 진행률 폴링이 완료를 감지하면 자동으로 애니메이션 종료됨
    } catch (analysisError) {
      const errorDetails = {
        videoId: currentVideoId,
        fileName: file.name,
        error: analysisError instanceof Error ? analysisError.message : String(analysisError),
        timestamp: new Date().toISOString(),
        duration: `${Math.round((Date.now() - startAnalysisTime) / 1000)}초`
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
          userErrorMessage = '대용량 파일 처리 시간이 초과되었습니다. 파일 크기를 줄이거나 다시 시도해주세요.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          userErrorMessage = '네트워크 연결 문제가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.';
        } else if (errorMsg.includes('decode') || errorMsg.includes('format') || errorMsg.includes('codec')) {
          userErrorMessage = '비디오 형식이 지원되지 않습니다. MP4 (H.264) 형식으로 변환하여 다시 시도해주세요.';
        } else if (errorMsg.includes('memory') || errorMsg.includes('메모리')) {
          userErrorMessage = '파일이 너무 커서 처리할 수 없습니다. 파일 크기를 줄여서 다시 시도해주세요.';
        } else if (errorMsg.includes('server') || errorMsg.includes('서버')) {
          userErrorMessage = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        }
      }
      
      if (analysisError instanceof Error) {
        const errorMessage = analysisError.message.toLowerCase();
        
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          userErrorMessage = '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.';
        } else if (errorMessage.includes('timeout')) {
          userErrorMessage = '분석 시간이 초과되었습니다. 파일 크기가 클 수 있습니다.';
        } else if (errorMessage.includes('format') || errorMessage.includes('codec')) {
          userErrorMessage = '비디오 형식이 지원되지 않습니다. 다른 형식으로 변환 후 시도해주세요.';
        } else if (errorMessage.includes('server') || errorMessage.includes('500')) {
          userErrorMessage = '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.';
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

  // 진행률 폴링을 시작하는 함수
  const startProgressPolling = (currentVideoId: string) => {
    console.log('📊 [Progress Polling] DB 진행률 폴링 시작:', currentVideoId);
    
    // DB 진행률 폴링으로만 애니메이션 제어
    let progressRetryCount = 0;
    const maxProgressRetries = 10; // 재시도 횟수 증가
    let hasProgressStarted = false; // 분석이 실제로 시작되었는지 추적
    let initialCheckCount = 0; // 초기 체크 횟수
    const maxInitialChecks = 150; // 최대 300초(5분) 동안 분석 시작 대기 (2초 * 150)
    
    // 기존 interval이 남아 있다면 정리
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    progressIntervalRef.current = setInterval(async () => {
      if (!currentVideoId) {
        console.log('🛑 [Progress Polling] videoId가 없어 폴링 중단');
        stopProgressPolling();
        return;
      }
      
      try {
        console.log('🔄 [Progress Polling] 진행률 API 호출 시도:', currentVideoId);
        
        const { getAnalysisProgress } = await import('./actions/ai-service');
        console.log('✅ [Progress Polling] ai-service import 성공');
        
        const progressData = await getAnalysisProgress(currentVideoId);
        console.log('✅ [Progress Polling] 진행률 데이터 수신:', progressData);
        
        // 성공적으로 진행률을 가져온 경우 재시도 카운트 리셋
        progressRetryCount = 0;
        initialCheckCount++;
        
        console.log('📊 [Progress Polling] DB 진행률 업데이트:', {
          videoId: currentVideoId,
          progress: progressData.progress,
          status: progressData.status,
          is_completed: progressData.is_completed,
          is_failed: progressData.is_failed,
          hasProgressStarted,
          initialCheckCount,
          currentAnalysisProgress: analysisProgress,
          timestamp: new Date().toISOString()
        });
        
        // 분석이 시작되었는지 확인 (status가 'processing'이거나 progress가 0보다 크면)
        if (!hasProgressStarted && (progressData.status === 'processing' || progressData.progress > 0)) {
          hasProgressStarted = true;
          console.log('🎬 [Progress Polling] 분석 시작 감지됨');
        }
        
        // 분석이 시작된 경우에만 진행률 업데이트
        if (hasProgressStarted) {
          setAnalysisProgress(progressData.progress);
        } else {
          // 분석이 아직 시작되지 않았으면 0% 유지
          console.log('⏳ [Progress Polling] 분석 아직 시작 안됨, 0% 유지');
          
          // 너무 오래 기다린 경우 강제로 시작 처리 (AI 서버가 응답하지 않을 수 있음)
          if (initialCheckCount >= maxInitialChecks) {
            console.warn('⚠️ [Progress Polling] 너무 오래 기다렸음, 강제로 분석 시작 처리');
            hasProgressStarted = true;
            setAnalysisProgress(5); // 5%로 시작하여 사용자에게 진행 중임을 표시
          }
        }
        
        // 분석 완료 또는 실패 시 폴링 중단
        if (progressData.is_completed || progressData.is_failed) {
          console.log('🏁 [Progress Polling] 분석 종료 감지, 폴링 중단:', {
            videoId: currentVideoId,
            is_completed: progressData.is_completed,
            is_failed: progressData.is_failed
          });
          
          stopProgressPolling();
          
          if (progressData.is_completed) {
            setAnalysisProgress(100);
            
            // 분석 완료 시 결과 조회 및 메시지 업데이트
            setTimeout(async () => {
              console.log('✨ [Progress Polling] 분석 애니메이션 종료');
              setIsAnalyzing(false);
              
              try {
                // 분석 결과 조회
                const { getAnalysisResult } = await import('./actions/ai-service');
                const analysisResult = await getAnalysisResult(currentVideoId);
                
                const eventsCount = analysisResult?.events?.length || 0;
                const successMessage = eventsCount > 0 
                  ? `"${videoFileName}" 영상 분석이 완료되었습니다. ${eventsCount}개의 이벤트가 감지되었습니다. 이제 영상을 재생하고 내용에 대해 질문할 수 있습니다.`
                  : `"${videoFileName}" 영상 분석이 완료되었습니다. 특별한 이벤트는 감지되지 않았지만 영상 내용에 대해 질문할 수 있습니다.`;
                
                setMessages([
                  {
                    role: 'assistant',
                    content: successMessage,
                  },
                ]);

                addToast({
                  type: 'success',
                  title: '분석 완료',
                  message: `영상 분석이 완료되었습니다.`,
                  duration: 3000,
                });

                // 비디오 정보 로드하여 EventTimeline에서 사용할 수 있도록 설정
                try {
                  const videoResponse = await getUploadedVideos();
                  if (videoResponse.success) {
                    const currentVideo = videoResponse.data.find((v: UploadedVideo) => v.id === currentVideoId);
                    if (currentVideo) {
                      setVideo(currentVideo);
                    }
                  }
                } catch (videoError) {
                  console.error('❌ 비디오 정보 로드 실패:', videoError);
                }
              } catch (resultError) {
                console.error('❌ [Progress Polling] 분석 결과 조회 실패:', resultError);
                setMessages([
                  {
                    role: 'assistant',
                    content: '영상 분석이 완료되었지만 결과를 가져오는 중 오류가 발생했습니다.',
                  },
                ]);
              }
            }, 1500); // 1.5초 동안 100% 상태 유지
          } else if (progressData.is_failed) {
            // 분석 실패 처리
            setIsAnalyzing(false);
            setAnalysisProgress(0);
            
            setMessages([
              {
                role: 'assistant',
                content: '영상 분석 중 오류가 발생했습니다. 나중에 다시 시도해주세요.',
              },
            ]);

            addToast({
              type: 'error',
              title: '분석 실패',
              message: '영상 분석에 실패했습니다.',
              duration: 5000,
            });
          }
        }
      } catch (progressError) {
        progressRetryCount++;
        console.error('⚠️ [Progress Polling] 진행률 조회 실패:', {
          videoId: currentVideoId,
          error: progressError instanceof Error ? progressError.message : String(progressError),
          errorStack: progressError instanceof Error ? progressError.stack : undefined,
          retryCount: progressRetryCount,
          maxRetries: maxProgressRetries,
          timestamp: new Date().toISOString()
        });
        
        // 네트워크 에러인지 확인
        if (progressError instanceof Error && progressError.message.includes('fetch')) {
          console.error('🌐 [Progress Polling] 네트워크 연결 문제 감지');
        }
        
        // 최대 재시도 횟수 초과 시에만 알림
        if (progressRetryCount >= maxProgressRetries) {
          console.error('💥 [Progress Polling] 진행률 폴링 최대 재시도 초과, 폴링 중단');
          stopProgressPolling();
          
          // 실패 시 애니메이션 종료
          setIsAnalyzing(false);
          setAnalysisProgress(0);
          
          addToast({
            type: 'error',
            title: '진행률 조회 실패',
            message: '분석 진행률을 가져올 수 없습니다. 다시 시도해주세요.',
            duration: 3000,
          });
        }
      }
    }, 2000); // 2초마다 폴링 (서버 부하 감소)
  };

  // 진행률 폴링을 중단하는 함수
  const stopProgressPolling = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
      console.log('🛑 [Progress Polling] 폴링 중단됨');
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
      timestamp: new Date().toISOString()
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

  // 테스트용 애니메이션 시뮬레이션 함수
  const handleTestAnimation = () => {
    console.log('🎭 테스트 애니메이션 시작');
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage('테스트: 파일 형식을 확인하는 중...');
    setUploadStartTime(Date.now());

    // 단계별 진행률 시뮬레이션
    const simulateProgress = () => {
      let progress = 0;
      const stages = [
        { progress: 10, stage: '테스트: 파일 형식을 확인하는 중...' },
        { progress: 25, stage: '테스트: 비디오 메타데이터를 추출하는 중...' },
        { progress: 45, stage: '테스트: 썸네일을 생성하는 중...' },
        { progress: 65, stage: '테스트: 중복 파일을 확인하는 중...' },
        { progress: 80, stage: '테스트: 파일을 저장하는 중...' },
        { progress: 90, stage: '테스트: 비디오를 준비하는 중...' },
        { progress: 100, stage: '테스트: 업로드 완료!' },
      ];

      let currentStage = 0;
      const progressInterval = setInterval(() => {
        if (currentStage < stages.length) {
          const stage = stages[currentStage];
          setUploadProgress(stage.progress);
          setUploadStage(stage.stage);
          console.log(`🎭 진행률: ${stage.progress}% - ${stage.stage}`);
          currentStage++;
        } else {
          clearInterval(progressInterval);
          
          

          // 3초 후 애니메이션 종료
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
            setUploadStage('');

            const endTime = Date.now();
            const duration = endTime - (uploadStartTime || endTime);
            console.log(
              `🎭 테스트 애니메이션 완료 - 소요 시간: ${Math.round(
                duration / 1000
              )}초`
            );

            addToast({
              type: 'success',
              title: '테스트 완료',
              message: `애니메이션 테스트가 완료되었습니다. (소요 시간: ${Math.round(
                duration / 1000
              )}초)`,
              duration: 3000,
            });
          }, 2000);
        }
      }, 800); // 각 단계마다 800ms
    };

    simulateProgress();
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
    
    try {
      console.log('🏥 [Health Check] API 상태 확인 시작');
      
      // 백엔드 API 상태 확인
      const backendHealthPromise = fetch('http://localhost:8088/db/videos/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5초 타임아웃
      }).then(response => response.ok ? 'healthy' : 'error').catch(() => 'error');
      
      // AI 서비스 상태 확인 (간접적으로 - 실제로는 ping 엔드포인트가 필요)
      const aiServiceHealthPromise = fetch('http://localhost:7500/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      }).then(response => response.ok ? 'healthy' : 'error').catch(() => 'error');
      
      const [backendStatus, aiServiceStatus] = await Promise.all([
        backendHealthPromise,
        aiServiceHealthPromise
      ]);
      
      setApiHealthStatus({
        backend: backendStatus as 'healthy' | 'error',
        aiService: aiServiceStatus as 'healthy' | 'error',
        lastCheck: checkTime
      });
      
      console.log('🏥 [Health Check] API 상태 확인 완료:', {
        backend: backendStatus,
        aiService: aiServiceStatus,
        timestamp: checkTime.toISOString()
      });
      
    } catch (error) {
      console.error('🏥 [Health Check] API 상태 확인 실패:', error);
      setApiHealthStatus({
        backend: 'error',
        aiService: 'error', 
        lastCheck: checkTime
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
    console.log("🎯 useEffect 실행됨 - 컴포넌트 마운트");
    
    const checkMobile = () => {
      const userAgent =
        navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent.toLowerCase()
        );
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(isMobileDevice || isSmallScreen);
      console.log("📱 모바일 감지:", { isMobileDevice, isSmallScreen });
    };

    // 컴포넌트 마운트 후에만 실행
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // 전역 클릭 이벤트 리스너 추가 (디버그용)
    const globalClickHandler = (e: Event) => {
      console.log("🖱️ 전역 클릭 이벤트:", e.target);
    };
    document.addEventListener('click', globalClickHandler);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('click', globalClickHandler);
      
      // 컴포넌트 언마운트 시 분석 진행률 폴링 정리
      if (progressIntervalRef.current) {
        console.log('🧹 [Cleanup] 컴포넌트 언마운트로 인한 진행률 폴링 정리');
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
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

  const handleFileUpload = async (file: File, videoDateTime?: string) => {
    try {
      console.log('🎬 [Upload Start] 파일 업로드 시작:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        videoDateTime
      });

      setVideoLoading(true);
      setVideoError(null);
      // 중복 비디오 상태 초기화
      setIsDuplicateVideo(false);
      
      // 업로드 진행률 추적 시작
      setIsUploading(true);
      setUploadProgress(0);
      setUploadStartTime(Date.now());

      // Validate file type (0-10%)
      setUploadStage('파일 형식을 확인하는 중...');
      setUploadProgress(5);
      
      console.log('📋 [File Validation] 파일 형식 검증 중:', file.type);
      
      const validVideoTypes = [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/avi',
        'video/mov',
        'video/quicktime',
      ];
      console.log('✅ [File Validation] 지원되는 형식:', validVideoTypes);
      
      if (!validVideoTypes.includes(file.type)) {
        console.error('❌ [File Validation] 지원하지 않는 파일 형식:', file.type);
        setIsUploading(false);
        setVideoLoading(false);
        setDragDropVisible(false);
        addToast({
          type: 'error',
          title: '지원하지 않는 파일 형식',
          message: 'MP4, WebM, OGG 형식의 비디오 파일만 지원됩니다.',
          duration: 3000,
        });
        return;
      }
      console.log('✅ [File Validation] 파일 형식 검증 통과:', file.type);

      // Validate file size (10-20%)
      setUploadStage('파일 크기를 확인하는 중...');
      setUploadProgress(15);
      
      console.log('📏 [Size Validation] 파일 크기 검증 중:', {
        size: file.size,
        sizeInMB: (file.size / (1024 * 1024)).toFixed(2) + 'MB'
      });
      
      const maxSize = 5 * 1024 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error('❌ [Size Validation] 파일 크기 초과:', file.size, 'max:', maxSize);
        setIsUploading(false);
        setVideoLoading(false);
        setDragDropVisible(false);
        addToast({
          type: 'error',
          title: '파일 크기 초과',
          message: '2GB 이하의 파일만 업로드할 수 있습니다.',
          duration: 3000,
        });
        return;
      }
      console.log('✅ [Size Validation] 파일 크기 검증 통과');

      // HTML5 Video API를 사용하여 비디오 duration 추출 (20-40%)
      setUploadStage('비디오 메타데이터를 추출하는 중...');
      setUploadProgress(25);
      
      console.log('🎞️ [Duration Extraction] 비디오 duration 추출 시작');
      let videoDuration: number | undefined = undefined;
      try {
        videoDuration = await getVideoDurationFromFile(file);
        console.log('✅ [Duration Extraction] 성공:', videoDuration, '초');
        setUploadProgress(40);
      } catch (durationError) {
        console.warn('⚠️ [Duration Extraction] 실패:', durationError);
        setUploadProgress(40);
      }

      // 썸네일 생성 및 업로드 (40-60%)
      setUploadStage('썸네일을 생성하는 중...');
      setUploadProgress(45);
      
      console.log('🖼️ [Thumbnail] 썸네일 생성 시작');
      let thumbnailPath: string | null = null;
      try {
        const { createAndUploadThumbnailWithFallback } = await import(
          '@/utils/thumbnail-utils'
        );
        thumbnailPath = await createAndUploadThumbnailWithFallback(file, file.name);
        if (thumbnailPath) {
          console.log('✅ [Thumbnail] 생성 및 업로드 성공:', thumbnailPath);
        } else {
          console.warn('⚠️ [Thumbnail] 생성 실패, 썸네일 없이 진행');
        }
        setUploadProgress(60);
      } catch (thumbnailError) {
        console.warn('❌ [Thumbnail] 오류 발생:', thumbnailError);
        setUploadProgress(60);
      }

      // 서버에 파일 저장 및 중복 체크 (60-80%)
      setUploadStage('중복 파일을 확인하는 중...');
      setUploadProgress(65);
      
      console.log('💾 [Server Save] 서버 저장 프로세스 시작');
      let serverSaveResult = null;
      try {
        const formData = new FormData();
        formData.append('video', file);
        if (videoDuration !== undefined) {
          formData.append('duration', videoDuration.toString());
        }
        
        console.log('📤 [Server Save] FormData 준비 완료, 서버에 전송 중...');
        setUploadStage('파일을 저장하는 중...');
        setUploadProgress(70);
        
        serverSaveResult = await saveVideoFile(
          formData,
          videoDuration,
          thumbnailPath || undefined,
          videoDateTime
        );
        console.log('📥 [Server Save] 서버 응답:', serverSaveResult);
        setUploadProgress(80);

        // 중복 비디오 처리 - success가 false이고 isDuplicate가 true인 경우
        if (serverSaveResult.isDuplicate && !serverSaveResult.success) {
          console.log('🔄 [Duplicate] 중복 비디오 감지:', serverSaveResult.duplicateVideoId);
          
          // 중복 비디오의 ID를 videoId로 설정 (AI 분석에 필요)
          if (serverSaveResult.duplicateVideoId) {
            setVideoId(serverSaveResult.duplicateVideoId);
            console.log('🆔 [Duplicate] 중복 비디오 ID 설정:', serverSaveResult.duplicateVideoId);
          }
          
          // 중복 비디오 표시를 위한 UI 상태 업데이트
          setIsDuplicateVideo(true);

          // 모바일에서 업로드 영역으로 스크롤
          if (isMobile && uploadAreaRef.current) {
            uploadAreaRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }

          // 1초 후 애니메이션 종료
          setTimeout(() => {
            setIsDuplicateVideo(false);
          }, 1000);

          addToast({
            type: 'warning',
            title: '중복된 비디오',
            message: '동일한 비디오가 이미 업로드되어 있습니다. 기존 분석 결과를 활용합니다.',
            duration: 4000,
          });
          // 중복 비디오의 경우에도 AI 분석을 진행하므로 return 제거
        }

        // 서버 저장 실패 시 처리
        if (!serverSaveResult.success && !serverSaveResult.isDuplicate) {
          console.error('❌ [Server Save] 저장 실패:', serverSaveResult.error);
          setIsUploading(false);
          setVideoLoading(false);
          setDragDropVisible(false);
          addToast({
            type: 'error',
            title: '업로드 실패',
            message:
              serverSaveResult.error || '파일 저장 중 오류가 발생했습니다.',
            duration: 4000,
          });
          return;
        }
        
        // 새로운 비디오 업로드 성공 시 videoId 설정
        if (serverSaveResult.success && serverSaveResult.videoId) {
          setVideoId(serverSaveResult.videoId);
          console.log('🆔 [New Video] 새 비디오 ID 설정:', serverSaveResult.videoId);
        }
        
        console.log('✅ [Server Save] 저장 성공:', serverSaveResult.videoId);
      } catch (serverError) {
        console.error('❌ [Server Save] 예외 발생:', serverError);
        setUploadProgress(80);
      }

      // 즉시 Object URL 생성하여 클라이언트에서 사용 (80-90%)
      setUploadStage('비디오를 준비하는 중...');
      setUploadProgress(85);
      
      const objectUrl = URL.createObjectURL(file);

      // 모바일에서 비디오 검증을 더 관대하게 처리
      const testVideo = document.createElement('video');
      testVideo.muted = true; // 모바일에서 자동재생을 위해 음소거
      testVideo.playsInline = true; // iOS에서 인라인 재생
      testVideo.preload = 'metadata';

      const loadPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            console.warn('Video loading timeout, but continuing...');
            resolve(objectUrl); // 타임아웃이어도 계속 진행
          },
          isMobile ? 15000 : 10000
        ); // 모바일에서는 더 긴 타임아웃

        testVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
          console.log('Video metadata loaded successfully');
          resolve(objectUrl);
        };

        testVideo.oncanplay = () => {
          clearTimeout(timeout);
          console.log('Video can play');
          resolve(objectUrl);
        };

        testVideo.onerror = (e) => {
          clearTimeout(timeout);
          console.warn('Video validation failed, but continuing:', e);
          resolve(objectUrl); // 에러가 있어도 계속 진행 (모바일 호환성)
        };

        testVideo.src = objectUrl;
      });

      try {
        const validUrl = await loadPromise;
        
        // 업로드 완료 (90-100%)
        setUploadStage('업로드를 완료하는 중...');
        setUploadProgress(95);

        // 비디오 상태 즉시 업데이트
        setVideoSrc(validUrl as string);
        setVideoFileName(file.name);
        setCurrentHistoryId(undefined);
        setCurrentSession(null);
        setTimeMarkers([]);
        
        // 서버에서 받은 videoId 저장 (AI 채팅에서 사용)
        let currentVideoId = null;
        
        console.log('🔍 [Debug] serverSaveResult 상세 분석:', {
          serverSaveResult,
          success: serverSaveResult?.success,
          videoId: serverSaveResult?.videoId,
          isDuplicate: serverSaveResult?.isDuplicate,
          duplicateVideoId: serverSaveResult?.duplicateVideoId,
          error: serverSaveResult?.error,
          // 추가 디버깅 정보
          allKeys: serverSaveResult ? Object.keys(serverSaveResult) : [],
          stringifiedResult: JSON.stringify(serverSaveResult, null, 2)
        });
        
        if (serverSaveResult?.success && serverSaveResult.videoId) {
          currentVideoId = serverSaveResult.videoId;
          setVideoId(currentVideoId);
          console.log('✅ [New Video] Video ID captured for AI chat:', {
            currentVideoId,
            type: typeof currentVideoId,
            stringValue: String(currentVideoId)
          });
        } else if (serverSaveResult?.isDuplicate && serverSaveResult.duplicateVideoId) {
          // 중복 비디오의 경우 duplicateVideoId 사용
          currentVideoId = serverSaveResult.duplicateVideoId;
          setVideoId(currentVideoId);
          console.log('✅ [Duplicate Video] Video ID captured for AI chat:', {
            currentVideoId,
            type: typeof currentVideoId,
            stringValue: String(currentVideoId)
          });
        } else {
          console.error('❌ [Critical] Video ID를 찾을 수 없음:', {
            serverSaveResult,
            serverSaveResultType: typeof serverSaveResult,
            serverSaveResultKeys: serverSaveResult ? Object.keys(serverSaveResult) : null
          });
        }
        
        console.log('🆔 [Final] currentVideoId 최종 확인:', currentVideoId);
        
        // 업로드 진행률 완료
        setUploadProgress(100);
        
        // 업로드 완료 후 상태 정리 (분석 시작보다 먼저 실행)
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          setUploadStage('');
          setVideoLoading(false);
          // 업로드 완료 후 DragDrop 모달 닫기
          setDragDropVisible(false);
          
          // 분석 애니메이션을 확실히 보이도록 더 긴 지연 후 시작
          setTimeout(() => {
            // 업로드 상태가 완전히 정리된 후 분석 시작
            console.log('🚀 [Main Page] 분석 애니메이션과 API 호출 동시 시작:', {
              videoId: currentVideoId,
              fileName: file.name,
              isDuplicate: isDuplicateVideo,
              hasVideoSrc: !!videoSrc,
              timestamp: new Date().toISOString()
            });
            
            if (!currentVideoId) {
              console.error('❌ [Critical Error] currentVideoId가 null이므로 분석을 시작할 수 없습니다');
              addToast({
                type: 'error',
                title: '분석 시작 실패',
                message: 'Video ID를 찾을 수 없어 분석을 시작할 수 없습니다.',
                duration: 4000,
              });
              return;
            }
            
            // 🎯 분석 애니메이션 시작 - 0%에서 시작하여 유지
            console.log('✨ [Animation] 분석 애니메이션 시작');
            setIsAnalyzing(true);
            setAnalysisProgress(0); // 0%에서 시작
            
            // 진행률 폴링 시작 (DB의 실제 진행률로 업데이트)
            startProgressPolling(currentVideoId);
            
            // 🎯 동시에 실제 AI 분석 API 호출 시작
            console.log('🤖 [API] AI 분석 API 호출 시작');
            startActualAIAnalysis(currentVideoId, file);
          }, 500); // 500ms로 지연 시간 증가하여 분석 애니메이션이 확실히 보이도록
        }, 200); // 업로드 완료 후 200ms 대기

        // 업로드 시간 계산
        const uploadEndTime = Date.now();
        const uploadDuration = uploadStartTime ? (uploadEndTime - uploadStartTime) / 1000 : 0;
        console.log(`Upload completed in ${uploadDuration.toFixed(1)} seconds`);

        // 성공 토스트
        addToast({
          type: isDuplicateVideo ? 'warning' : 'success',
          title: isDuplicateVideo ? '중복 영상 감지' : '업로드 완료',
          message: isDuplicateVideo
            ? `${file.name} 파일이 이미 업로드된 영상입니다. 기존 파일을 사용합니다.`
            : `${file.name} 파일이 성공적으로 업로드되었습니다.`,
          duration: 3000,
        });

      } catch (validationError) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('비디오 파일이 손상되었거나 지원되지 않는 형식입니다.');
      }
    } catch (error) {
      console.error('File upload error:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setVideoLoading(false);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      // 에러 발생 시에도 DragDrop 모달 닫기
      setDragDropVisible(false);
      setVideoError(
        error instanceof Error
          ? error.message
          : '파일 업로드 중 오류가 발생했습니다.'
      );
      addToast({
        type: 'error',
        title: '업로드 실패',
        message:
          error instanceof Error
            ? error.message
            : '파일 업로드 중 오류가 발생했습니다.',
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
      const isVideoReady = video.readyState >= 2 || (isMobile && video.readyState >= 1);
      
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
        // 모바일에서 재생 시 필수 설정
        if (isMobile) {
          video.muted = true;
          video.playsInline = true;
        }

        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Video play started successfully');
              setIsPlaying(true);
            })
            .catch((error) => {
              console.warn('Video play failed:', error);
              setIsPlaying(false);

              // 재생 실패 시 사용자에게 상세한 안내
              if (isMobile) {
                addToast({
                  type: 'info',
                  title: '재생 안내',
                  message: '모바일에서는 화면을 직접 터치하여 비디오를 재생해주세요.',
                  duration: 4000,
                });
              } else {
                addToast({
                  type: 'error',
                  title: '재생 실패',
                  message: '비디오 재생에 실패했습니다. 브라우저 설정을 확인해주세요.',
                  duration: 3000,
                });
              }
            });
        } else {
          // play() 메서드가 Promise를 반환하지 않는 경우 (구형 브라우저)
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error('Video control error:', error);
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
        console.warn('Video not ready for skip forward, readyState:', video.readyState);
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
        console.warn('Video not ready for skip backward, readyState:', video.readyState);
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
        console.warn(`Seek time ${time} exceeds video duration ${videoDuration}`);
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
      if (isMobile && videoSectionRef.current) {
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

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

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
        if (video && video.currentTime !== undefined && !isNaN(video.currentTime)) {
          const newCurrentTime = video.currentTime;
          // 성능 최적화: 시간이 실제로 변경된 경우에만 상태 업데이트
          setCurrentTime(prevTime => {
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
          setCurrentTime(prevTime => {
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

  console.log("📝 handleSendMessage 함수가 정의됨");
  
  const handleSendMessage = async (e: React.FormEvent) => {
    console.log("🚀🚀🚀 handleSendMessage 함수 호출됨!!!");
    e.preventDefault();
    console.log("🚀 handleSendMessage 시작:", {
      inputMessage: inputMessage.trim(),
      videoSrc: !!videoSrc,
      timestamp: new Date().toISOString()
    });
    
    if (inputMessage.trim()) {
      const userMessage = inputMessage;
      console.log("✅ 메시지 전송 조건 만족, 사용자 메시지:", userMessage);

      // 사용자 메시지 추가
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

      // 정보 토스트
      addToast({
        type: 'info',
        title: '분석 중',
        message: 'AI가 영상을 분석하고 있습니다...',
        duration: 2000,
      });

      // 실제 AI 응답 호출
      setTimeout(async () => {
        console.log("⏰ setTimeout 실행됨, AI 서비스 호출 시작");
        try {
          let assistantMessage;
          let timestamp: number | undefined = undefined;
          
          if (videoSrc && videoId) {
            console.log("📹 비디오 있음, AI 서비스 호출 진행", { videoId, videoFileName, currentSessionId: currentSession?.id });
            // AI 서비스 호출 - sendMessage 함수 사용
            const { sendMessage } = await import('./actions/ai-service');
            console.log("📦 sendMessage 함수 로드됨");
            
            const result = await sendMessage(
              userMessage,
              videoId,
              currentSession?.id || null // 기존 세션 ID 전달
            );
            console.log("🎯 sendMessage 결과:", result);

            if (result.success && result.reply) {
              // 타임스탬프가 있으면 추가
              if (result.timestamp) {
                timestamp = result.timestamp;
                setTimeMarkers((prev) => [...prev, result.timestamp!]);
              }
              
              assistantMessage = {
                role: 'assistant' as const,
                content: result.reply,
                ...(timestamp && { timestamp: timestamp }),
              };

              // 새 세션이 생성된 경우 현재 세션 업데이트
              if (result.session) {
                setCurrentSession(result.session);
                console.log("🔄 새 세션 생성됨:", result.session);
              }
            } else {
              // 에러 응답 처리
              assistantMessage = {
                role: 'assistant' as const,
                content: result.error || '응답을 생성하는 중 오류가 발생했습니다.',
              };
            }
          } else {
            console.log("❌ 비디오 없음 또는 videoId 없음, 업로드 안내 메시지", { videoSrc: !!videoSrc, videoId });
            assistantMessage = {
              role: 'assistant' as const,
              content: '분석을 위해 먼저 영상을 업로드해 주세요.',
            };
          }

          console.log("💬 최종 assistant 메시지:", assistantMessage);
          setMessages((prev) => [...prev, assistantMessage]);

          // 툴팁 표시
          if (timestamp) {
            setTooltipData({
              title: '분석 결과',
              content: `${formatTime(
                timestamp
              )} 시점에서 중요한 이벤트가 감지되었습니다. 클릭하여 해당 시점으로 이동할 수 있습니다.`,
              timestamp: timestamp,
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
            const videoDuration = duration || videoRef.current?.duration || 60;

            const historyData = {
              title: `prompt_id : ${nextPromptId}`,
              messages: [
                { role: 'user' as const, content: userMessage },
                assistantMessage,
              ],
              videoInfo: {
                name: videoFileName,
                duration: videoDuration,
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
          console.error('❌ Message handling error:', error);
          console.error('🔍 Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          addToast({
            type: 'error',
            title: '분석 실패',
            message: 'AI 분석 중 오류가 발생했습니다.',
            duration: 3000,
          });
        }
      }, 1000);

      setInputMessage('');
      console.log("🔄 입력 메시지 초기화됨");
    } else {
      console.log("⚠️ 입력 메시지가 비어있음");
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
    console.log("⌨️ Key pressed:", e.key, "shiftKey:", e.shiftKey);
    
    // 영상이 없을 때도 입력 감지하여 강조 효과 실행
    if (!videoSrc) {
      handleInputClickWithoutVideo(e as any);
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log("✅ Enter 키 감지, 전송 조건 확인:", {
        hasVideo: !!videoSrc,
        hasMessage: !!inputMessage.trim(),
        canSend: !!inputMessage.trim() && !!videoSrc
      });
      
      // 메시지가 있고 비디오가 있을 때만 전송
      if (inputMessage.trim() && videoSrc) {
        console.log("🚀 Enter 키로 메시지 전송 시작");
        handleSendMessage(e);
      } else {
        console.log("⚠️ 메시지나 비디오가 없어서 전송하지 않음 - 메시지:", !!inputMessage.trim(), "비디오:", !!videoSrc);
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

  // 컴포넌트 언마운트 시 진행률 폴링 interval 정리
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        console.log('🧹 [Cleanup] 진행률 폴링 interval 정리');
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

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
              <Card className="mb-4 md:mb-6 bg-[#242a38] border-0 shadow-lg">
                <CardContent className="p-4 md:p-6">
                  {videoSrc ? (
                    <div className="relative">
                      {isUploading ? (
                        // 업로드 중일 때 보라색 프로그레스 오버레이
                        <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10"
                             style={{ animation: 'borderGlowPurple 2s ease-in-out infinite' }}>
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
                              {/* 보라색 진행도 원 */}
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
                                  2 *
                                  Math.PI *
                                  45 *
                                  (1 - uploadProgress / 100)
                                }`}
                                className="transition-all duration-300 ease-out"
                                style={{
                                  filter:
                                    'drop-shadow(0 0 8px rgba(108, 92, 231, 0.6))',
                                }}
                              />
                            </svg>
                            {/* 진행도 텍스트 */}
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
                          {/* 취소 버튼 */}
                          <button
                            onClick={handleCancelProcess}
                            className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#6c5ce7] hover:border-[#5a4fcf]"
                          >
                            취소
                          </button>
                        </div>
                      ) : isAnalyzing ? (
                        // 분석 중일 때 프로그레스 오버레이
                        <div 
                          className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex flex-col items-center justify-center z-10"
                          style={{
                            animation: 'borderGlow 2s ease-in-out infinite'
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
                                    : '영상 분석 완료 중...'
                            }
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
                                    : 'AI가 분석 결과를 정리하고 있습니다.'
                            }
                          </p>
                          {/* 취소 버튼 */}
                          <button
                            onClick={handleCancelProcess}
                            className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#00e6b4] hover:border-[#00c49c]"
                          >
                            취소
                          </button>
                        </div>
                      ) : null}

                      {videoLoading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-md flex items-center justify-center z-5">
                          <div className="text-white text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00e6b4] mx-auto mb-2"></div>
                            <p className="text-sm">비디오 로딩 중...</p>
                          </div>
                        </div>
                      )}

                      {/* 비디오 요소 - 업로드 중일 때 숨김 */}
                      {!isUploading && (
                        <video
                          ref={videoRef}
                          className={`w-full h-auto rounded-md bg-black ${
                            isAnalyzing || videoLoading
                              ? 'opacity-50'
                              : 'opacity-100'
                          } transition-opacity duration-300`}
                          src={videoSrc}
                          muted={isMobile} // 모바일에서 음소거
                          playsInline={isMobile} // iOS에서 인라인 재생
                          preload="metadata"
                          controls={false}
                          crossOrigin="anonymous" // CORS 설정
                          style={{
                            minHeight: isMobile ? '200px' : '300px', // 최소 높이 보장
                            maxHeight: isMobile ? '300px' : '500px', // 최대 높이 제한
                          }}
                          // 비디오 로드 이벤트
                          onLoadStart={() => {
                            console.log('🎬 [Video] 로드 시작');
                            setVideoLoading(true);
                          }}
                          onLoadedMetadata={(e) => {
                            console.log('📊 [Video] 메타데이터 로드 완료');
                            setVideoLoading(false);
                            const video = e.target as HTMLVideoElement;
                            if (
                              video.duration &&
                              !isNaN(video.duration) &&
                              video.duration > 0
                            ) {
                              setDuration(video.duration);
                              console.log('Video duration set:', video.duration);
                            }
                          }}
                          onCanPlay={() => {
                            console.log('▶️ [Video] 재생 준비 완료');
                            setVideoLoading(false);
                            setVideoError(null);
                          }}
                          onWaiting={() => {
                            console.log('⏳ [Video] 데이터 대기 중');
                            setVideoLoading(true);
                          }}
                          onPlaying={() => {
                            console.log('🎥 [Video] 재생 중');
                            setVideoLoading(false);
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLVideoElement;
                            const error = target.error;
                            
                            // 에러 코드별 메시지 매핑
                            const errorMessages = {
                              1: 'MEDIA_ERR_ABORTED: 미디어 재생이 중단됨',
                              2: 'MEDIA_ERR_NETWORK: 네트워크 오류',
                              3: 'MEDIA_ERR_DECODE: 미디어 디코딩 오류 (지원되지 않는 형식)',
                              4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 지원되지 않는 미디어 형식'
                            };
                            
                            const errorMessage = error?.code 
                              ? errorMessages[error.code as keyof typeof errorMessages] || `에러 코드: ${error.code}`
                              : '알 수 없는 오류';
                            
                            console.error('❌ [Video Error] 비디오 재생 오류:', {
                              code: error?.code,
                              message: error?.message,
                              networkState: target.networkState,
                              readyState: target.readyState,
                              src: target.src,
                              currentSrc: target.currentSrc,
                              canPlayType: {
                                mp4: target.canPlayType('video/mp4'),
                                webm: target.canPlayType('video/webm'),
                                ogg: target.canPlayType('video/ogg')
                              }
                            });

                            // 대용량 파일 또는 코덱 문제 감지
                            if (error?.code === 3 || error?.code === 4) {
                              console.warn('⚠️ [Video] 코덱/포맷 문제 감지됨. 파일 재처리가 필요할 수 있습니다.');
                            }

                            setVideoError(
                              `비디오 오류: ${errorMessage}`
                            );
                            setIsPlaying(false);
                            setVideoLoading(false);
                          }}
                          // 모바일에서 터치로 재생 가능하도록
                          onClick={isMobile ? togglePlayPause : undefined}
                        />
                      )}

                      {/* 비디오 에러 표시 */}
                      {videoError && (
                        <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex items-center justify-center">
                          <div className="text-center text-white p-4 max-w-md">
                            <div className="mb-3">
                              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                              <h3 className="text-lg font-medium mb-2">비디오 재생 오류</h3>
                            </div>
                            
                            <p className="text-sm text-gray-300 mb-3">
                              {videoError}
                            </p>
                            
                            {/* 코덱/포맷 문제인 경우 추가 안내 */}
                            {(videoError.includes('DECODE') || videoError.includes('SUPPORTED')) && (
                              <div className="bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded-md p-3 mb-3">
                                <p className="text-xs text-yellow-200">
                                  <strong>대용량 파일 또는 특수 코덱 문제:</strong><br/>
                                  • 파일이 손상되었거나 지원되지 않는 형식입니다<br/>
                                  • Chrome/Edge 브라우저 사용을 권장합니다<br/>
                                  • MP4 (H.264) 형식으로 변환하여 다시 시도해보세요
                                </p>
                              </div>
                            )}
                            
                            <div className="flex gap-2 justify-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-transparent border-gray-500 text-white hover:bg-gray-700"
                                onClick={() => {
                                  setVideoError(null);
                                  // 비디오 컨테이너 초기화
                                  setVideoSrc('');
                                  setVideoId(null);
                                }}
                              >
                                닫기
                              </Button>
                              <Button
                                size="sm"
                                className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                                onClick={() => {
                                  setVideoError(null);
                                  if (videoRef.current) {
                                    console.log('🔄 [Video] 수동 재로드 시도');
                                    videoRef.current.load();
                                  }
                                }}
                              >
                                다시 시도
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

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
                            )}\n현재 시간: ${formatTime(
                              currentTime
                            )}\n모바일: ${isMobile ? '예' : '아니오'}`,
                          })
                        }
                      >
                        <Info className="h-3 w-3 md:h-4 md:w-4" />
                      </Button>

                      {/* 모바일에서 재생 안내 */}
                      {isMobile &&
                        !isPlaying &&
                        !isAnalyzing &&
                        !videoLoading && (
                          <div className="absolute bottom-2 left-2 right-2 bg-black bg-opacity-70 text-white text-xs p-2 rounded">
                            화면을 터치하여 비디오를 재생하세요
                          </div>
                        )}
                    </div>
                  ) : (
                    <div
                      ref={uploadAreaRef}
                      className={`flex flex-col items-center justify-center h-[250px] md:h-[400px] rounded-lg transition-all duration-500 relative ${
                        isUploading
                          ? 'bg-[#2a3142] border-2 border-[#6c5ce7] shadow-2xl shadow-[#6c5ce7]/30'
                          : isDuplicateVideo
                          ? 'bg-[#2a3142] border-2 border-[#FFB800] shadow-2xl shadow-[#FFB800]/30'
                          : uploadHighlight
                          ? 'bg-[#2a3142] border-2 border-[#00e6b4] shadow-2xl shadow-[#00e6b4]/30'
                          : 'bg-[#2a3142] border-2 border-[#3a4553] hover:border-[#4a5563]'
                      }`}
                      style={{
                        animation: isUploading
                          ? 'borderGlowPurple 2s ease-in-out infinite'
                          : isDuplicateVideo
                          ? 'borderGlowYellow 1s ease-in-out 3'
                          : uploadHighlight
                          ? 'borderGlow 0.5s ease-in-out'
                          : 'none',
                      }}
                    >
                      {/* 업로드 진행 중일 때 보라색 오버레이 */}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-60 rounded-lg flex flex-col items-center justify-center z-10">
                          <div className="relative w-20 h-20 md:w-24 md:h-24 mb-4">
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
                              {/* 보라색 진행도 원 */}
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
                                  2 *
                                  Math.PI *
                                  45 *
                                  (1 - uploadProgress / 100)
                                }`}
                                className="transition-all duration-300 ease-out"
                                style={{
                                  filter:
                                    'drop-shadow(0 0 8px rgba(108, 92, 231, 0.6))',
                                }}
                              />
                            </svg>
                            {/* 진행도 텍스트 */}
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
                          {/* 취소 버튼 */}
                          <button
                            onClick={handleCancelProcess}
                            className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#6c5ce7] hover:border-[#5a4fcf]"
                          >
                            취소
                          </button>
                        </div>
                      )}
                      {/* 업로드 아이콘 - 업로드 중일 때 숨김, 중복 감지 시 노란색으로 변경 */}
                      {!isUploading && (
                        <div className="mb-6">
                          <div
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center border-2 ${
                              isDuplicateVideo
                                ? 'bg-[#FFB800] bg-opacity-10 border-[#FFB800] border-opacity-30'
                                : 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border-opacity-30'
                            }`}
                          >
                            <Upload
                              className={`h-8 w-8 md:h-10 md:w-10 ${
                                isDuplicateVideo
                                  ? 'text-[#FFB800]'
                                  : 'text-[#00e6b4]'
                              }`}
                            />
                          </div>
                        </div>
                      )}

                      {/* 메인 텍스트 - 업로드 중일 때 숨김, 중복 감지 시 메시지 변경 */}
                      {!isUploading && (
                        <p className="text-gray-300 mb-6 text-base md:text-lg text-center px-4 font-medium">
                          {isDuplicateVideo
                            ? '이미 업로드된 동영상입니다. 분석을 시작하세요.'
                            : '분석을 시작하려면 CCTV 영상을 업로드하세요'}
                        </p>
                      )}

                      {/* 업로드 버튼 - 업로드 중일 때 숨김 */}
                      {!isUploading && (
                        <Button
                          disabled={isUploading}
                          className={`px-8 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                            isUploading
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] hover:scale-105'
                          }`}
                          onClick={(e) => {
                            try {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isUploading) {
                                setDragDropVisible(true);
                              }
                            } catch (error) {
                              console.error('Main upload button error:', error);
                            }
                          }}
                        >
                          {isUploading ? '업로드 중...' : '영상 업로드'}
                        </Button>
                      )}
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
                          disabled={!videoSrc || isAnalyzing || videoLoading}
                        >
                          <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-8 w-8 md:h-10 md:w-10"
                          onClick={togglePlayPause}
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
                          onClick={skipForward}
                          disabled={!videoSrc || isAnalyzing || videoLoading}
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
                          width: `${
                            duration > 0 ? (currentTime / duration) * 100 : 0
                          }%`,
                        }}
                      />

                      {/* 시간 마커 */}
                      {timeMarkers.map((time, index) => (
                        <div
                          key={index}
                          className="absolute top-0 h-full w-1 bg-[#6c5ce7] cursor-pointer"
                          style={{
                            left: `${
                              duration > 0 ? (time / duration) * 100 : 0
                            }%`,
                          }}
                          onClick={() => seekToTime(time)}
                          title={`${formatTime(time)}로 이동`}
                        />
                      ))}

                      {/* 타임라인 클릭 핸들러 */}
                      <div
                        className="absolute top-0 left-0 w-full h-full cursor-pointer"
                        onClick={(e) => {
                          try {
                            // 비디오 참조와 소스 유효성 검사
                            if (!videoRef.current) {
                              console.warn('Video reference not available for timeline click');
                              addToast({
                                type: 'warning',
                                title: '비디오 컨트롤',
                                message: '비디오가 아직 로드되지 않았습니다.',
                                duration: 2000,
                              });
                              return;
                            }

                            if (!videoSrc) {
                              console.warn('Video source not available for timeline click');
                              addToast({
                                type: 'warning',
                                title: '비디오 컨트롤',
                                message: '비디오 파일을 먼저 업로드해주세요.',
                                duration: 2000,
                              });
                              return;
                            }

                            if (!duration || duration <= 0) {
                              console.warn('Video duration not available for timeline click');
                              addToast({
                                type: 'warning',
                                title: '비디오 정보',
                                message: '비디오 길이 정보를 가져올 수 없습니다.',
                                duration: 2000,
                              });
                              return;
                            }

                            const video = videoRef.current;
                            
                            // 비디오 준비 상태 검사
                            const isVideoReady = video.readyState >= 1 || isMobile;
                            
                            if (!isVideoReady) {
                              console.warn('Video not ready for timeline click, readyState:', video.readyState);
                              addToast({
                                type: 'info',
                                title: '비디오 로딩 중',
                                message: '비디오가 로드될 때까지 잠시 기다려주세요.',
                                duration: 2000,
                              });
                              return;
                            }

                            // 타임라인 클릭 위치 계산
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (rect.width === 0) {
                              console.warn('Timeline width is zero');
                              return;
                            }

                            const clickX = e.clientX - rect.left;
                            const pos = Math.max(0, Math.min(1, clickX / rect.width));
                            const newTime = pos * duration;

                            // 유효한 시간 범위 확인
                            if (newTime < 0 || newTime > duration) {
                              console.warn('Calculated time is out of bounds:', newTime);
                              return;
                            }

                            video.currentTime = newTime;
                            console.log(`Timeline clicked: seeked to ${newTime.toFixed(2)}s (${(pos * 100).toFixed(1)}%)`);

                            // 모바일에서 타임라인 클릭 시 추가 처리
                            if (isMobile && videoSectionRef.current) {
                              try {
                                videoSectionRef.current.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start',
                                  inline: 'nearest',
                                });
                              } catch (scrollError) {
                                console.warn('Scroll to video after timeline click failed:', scrollError);
                              }
                            }

                          } catch (error) {
                            console.error('Timeline click error:', error);
                            addToast({
                              type: 'error',
                              title: '타임라인 오류',
                              message: '타임라인 클릭 처리 중 오류가 발생했습니다.',
                              duration: 3000,
                            });
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
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

            <div className="lg:col-span-2 flex flex-col">
              <Card className="flex-1 min-h-[500px] lg:min-h-[600px] max-h-[90vh] lg:max-h-[85vh] bg-[#242a38] border-0 shadow-lg chat-container-flexible overflow-hidden">
                <CardContent className="p-3 md:p-4 flex flex-col h-full overflow-hidden">
                  <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                    <h2 className="text-lg md:text-xl font-semibold text-white">
                      영상 분석 채팅
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#6c5ce7] text-[#6c5ce7] hover:bg-[#6c5ce7] hover:text-white hover:border-[#6c5ce7] transition-all duration-200"
                      onClick={handleNewChat}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />새 채팅
                    </Button>
                  </div>

                  <div className="flex-1 overflow-hidden mb-3 md:mb-4 border border-[#2a3142] rounded-md chat-messages-area">
                    <ScrollArea className="h-full pr-2">
                      <div className="space-y-3 md:space-y-4 p-3 md:p-4 overflow-hidden">
                        {messages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${
                              message.role === 'user'
                                ? 'justify-end'
                                : 'justify-start'
                            } w-full`}
                            style={{ minWidth: 0 }}
                          >
                            <div
                              className={`max-w-[80%] sm:max-w-[85%] md:max-w-[80%] rounded-lg p-2 md:p-3 text-sm md:text-base break-words overflow-wrap-anywhere ${
                                message.role === 'user'
                                  ? 'bg-[#6c5ce7] text-white'
                                  : 'bg-[#2a3142] text-gray-200'
                              }`}
                              style={{
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                hyphens: 'auto',
                                maxWidth:
                                  message.role === 'user' ? '85%' : '90%',
                              }}
                            >
                              <div className="break-words whitespace-pre-wrap">
                                {message.content}
                              </div>
                              {message.timestamp && (
                                <button
                                  onClick={() => {
                                    seekToTime(message.timestamp || 0);

                                    // 모바일에서 타임스탬프 클릭 시 안내 토스트
                                    if (isMobile) {
                                      addToast({
                                        type: 'info',
                                        title: '비디오로 이동',
                                        message: `${formatTime(
                                          message.timestamp || 0
                                        )} 시점으로 이동합니다.`,
                                        duration: 2000,
                                      });
                                    }
                                  }}
                                  className="mt-2 text-xs md:text-sm font-medium text-[#00e6b4] hover:underline block break-words"
                                  style={{ wordBreak: 'break-word' }}
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

                  <form onSubmit={(e) => {
                    console.log("📝 Form onSubmit 이벤트 발생");
                    handleSendMessage(e);
                  }} className="flex gap-2">
                    <Textarea
                      placeholder={
                        isAnalyzing
                          ? '영상 분석 중입니다. 잠시만 기다려주세요...'
                          : videoSrc
                          ? '영상 내용에 대해 질문하세요...'
                          : '먼저 영상을 업로드해주세요'
                      }
                      value={inputMessage}
                      onChange={(e) => {
                        console.log("✏️ Input change:", e.target.value);
                        setInputMessage(e.target.value);
                      }}
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
                      disabled={!inputMessage.trim() || isAnalyzing || !videoSrc || !videoId}
                      onClick={(e) => {
                        console.log("🔘 Button click 이벤트 발생, disabled:", !inputMessage.trim() || isAnalyzing || !videoSrc || !videoId);
                        console.log("🔘 Button click - inputMessage:", inputMessage);
                        console.log("🔘 Button click - isAnalyzing:", isAnalyzing);
                        console.log("🔘 Button click - videoSrc:", !!videoSrc);
                        console.log("🔘 Button click - videoId:", videoId);
                      }}
                      className={`px-3 md:px-4 transition-all duration-200 ${
                        !inputMessage.trim() || isAnalyzing || !videoSrc || !videoId
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

        {/* History Sidebar - 모바일에서는 전체 화면으로 */}
        {isMobile ? (
          // 모바일 전체 화면 히스토리
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
              {/* X 버튼 제거됨 */}
            </div>

            {/* 히스토리 콘텐츠 - 나머지 화면 전체 사용 */}
            <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
              <DynamicHistorySidebar
                onSelectHistory={handleSelectHistory}
                currentHistoryId={currentHistoryId}
                onClose={handleCloseHistory}
                refreshTrigger={historyRefreshTrigger}
                onHistoryRefresh={handleHistoryRefresh}
              />
            </div>
          </div>
        ) : (
          // 데스크톱 사이드바 - 기존과 동일
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
            <DynamicHistorySidebar
              onSelectHistory={handleSelectHistory}
              currentHistoryId={currentHistoryId}
              onClose={handleCloseHistory}
              refreshTrigger={historyRefreshTrigger}
              onHistoryRefresh={handleHistoryRefresh}
            />
          </div>
        )}

        {/* History Backdrop - 데스크톱에서만 표시 */}
        {historyOpen && !isMobile && (
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-gradient-to-r from-[#1a1f2c]/20 via-[#00e6b4]/5 to-[#6c5ce7]/10"
            style={{
              top: '73px',
              height: 'calc(100vh - 73px)',
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
