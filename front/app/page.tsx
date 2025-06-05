'use client';

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
import { saveVideoFile } from '@/app/actions/video-service';

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
  const videoSectionRef = useRef<HTMLDivElement>(null); // 새로 추가
  const uploadAreaRef = useRef<HTMLDivElement>(null);

  // 모바일 감지 훅 추가
  // 모바일 감지 훅 수정 - 초기값을 false로 설정하여 hydration 오류 방지
  const [isMobile, setIsMobile] = useState(false);

  // 분석 상태와 진행도를 관리하는 새로운 state 추가:
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

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

  // 업로드 및 분석 취소 함수
  const handleCancelProcess = () => {
    console.log('🚫 업로드/분석 프로세스 취소됨');
    
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

  useEffect(() => {
    const checkMobile = () => {
      const userAgent =
        navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent.toLowerCase()
        );
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(isMobileDevice || isSmallScreen);
    };

    // 컴포넌트 마운트 후에만 실행
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
      
      const validVideoTypes = [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/avi',
        'video/mov',
        'video/quicktime',
      ];
      if (!validVideoTypes.includes(file.type)) {
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

      // Validate file size (10-20%)
      setUploadStage('파일 크기를 확인하는 중...');
      setUploadProgress(15);
      
      const maxSize = 2 * 1024 * 1024 * 1024;
      if (file.size > maxSize) {
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

      // HTML5 Video API를 사용하여 비디오 duration 추출 (20-40%)
      setUploadStage('비디오 메타데이터를 추출하는 중...');
      setUploadProgress(25);
      
      let videoDuration: number | undefined = undefined;
      try {
        videoDuration = await getVideoDurationFromFile(file);
        console.log('Extracted video duration:', videoDuration);
        setUploadProgress(40);
      } catch (durationError) {
        console.warn('Failed to extract video duration:', durationError);
        setUploadProgress(40);
      }

      // 썸네일 생성 및 업로드 (40-60%)
      setUploadStage('썸네일을 생성하는 중...');
      setUploadProgress(45);
      
      let thumbnailPath: string | null = null;
      try {
        const { createAndUploadThumbnail } = await import(
          '@/utils/thumbnail-utils'
        );
        thumbnailPath = await createAndUploadThumbnail(file, file.name);
        if (thumbnailPath) {
          console.log('Thumbnail generated and uploaded:', thumbnailPath);
        } else {
          console.warn(
            'Thumbnail generation failed, continuing without thumbnail'
          );
        }
        setUploadProgress(60);
      } catch (thumbnailError) {
        console.warn('Thumbnail generation error:', thumbnailError);
        setUploadProgress(60);
      }

      // 서버에 파일 저장 및 중복 체크 (60-80%)
      setUploadStage('중복 파일을 확인하는 중...');
      setUploadProgress(65);
      
      let serverSaveResult = null;
      try {
        const formData = new FormData();
        formData.append('video', file);
        if (videoDuration !== undefined) {
          formData.append('duration', videoDuration.toString());
        }
        
        setUploadStage('파일을 저장하는 중...');
        setUploadProgress(70);
        
        serverSaveResult = await saveVideoFile(
          formData,
          videoDuration,
          thumbnailPath || undefined,
          videoDateTime
        );
        console.log('Server save result:', serverSaveResult);
        setUploadProgress(80);

        // 중복 비디오 처리 - success가 false이고 isDuplicate가 true인 경우
        if (serverSaveResult.isDuplicate && !serverSaveResult.success) {
          setIsUploading(false);
          setVideoLoading(false);
          setDragDropVisible(false);

          // 중복 비디오 애니메이션 활성화
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
            message: '동일한 비디오가 이미 업로드되어 있습니다.',
            duration: 4000,
          });
          return; // 중복 비디오인 경우 업로드 중단
        }

        // 서버 저장 실패 시 처리
        if (!serverSaveResult.success && !serverSaveResult.isDuplicate) {
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
      } catch (serverError) {
        console.warn('Server save failed, but client continues:', serverError);
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
        setTimeMarkers([]);
        
        // 업로드 진행률 완료
        setUploadProgress(100);
        
        // 업로드 완료 후 상태 정리
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          setUploadStage('');
          setVideoLoading(false);
          // 업로드 완료 후 DragDrop 모달 닫기
          setDragDropVisible(false);
        }, 500);

        // 분석 시작
        setIsAnalyzing(true);
        setAnalysisProgress(0);

        // 업로드 시간 계산
        const uploadEndTime = Date.now();
        const uploadDuration = uploadStartTime ? (uploadEndTime - uploadStartTime) / 1000 : 0;
        console.log(`Upload completed in ${uploadDuration.toFixed(1)} seconds`);

        // 분석 중 메시지 추가
        setMessages([
          {
            role: 'assistant',
            content: isDuplicateVideo
              ? '이미 업로드된 영상을 분석합니다. 이전 분석 결과를 활용할 수 있습니다.'
              : '영상 분석을 시작합니다. 잠시만 기다려주세요...',
          },
        ]);

        // 성공 토스트
        addToast({
          type: isDuplicateVideo ? 'warning' : 'success',
          title: isDuplicateVideo ? '중복 영상 감지' : '업로드 완료',
          message: isDuplicateVideo
            ? `${file.name} 파일이 이미 업로드된 영상입니다. 기존 파일을 사용합니다.`
            : `${file.name} 파일이 성공적으로 업로드되었습니다.`,
          duration: 3000,
        });

        // 분석 진행도 시뮬레이션
        const progressInterval = setInterval(() => {
          setAnalysisProgress((prev) => {
            const newProgress = prev + Math.random() * 15 + 5;

            if (newProgress >= 100) {
              clearInterval(progressInterval);

              setTimeout(() => {
                setIsAnalyzing(false);
                setAnalysisProgress(100);
                setMessages([
                  {
                    role: 'assistant',
                    content: `"${file.name}" 영상 분석이 완료되었습니다. 이제 영상을 재생하고 내용에 대해 질문할 수 있습니다.`,
                  },
                ]);

                addToast({
                  type: 'success',
                  title: '분석 완료',
                  message:
                    '영상 분석이 완료되었습니다. 이제 질문할 수 있습니다.',
                  duration: 3000,
                });
              }, 500);

              return 100;
            }

            return newProgress;
          });
        }, 800);
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
      if (videoRef.current && videoSrc) {
        // 모바일에서는 더 관대한 조건으로 재생 허용
        if (videoRef.current.readyState >= 1 || isMobile) {
          if (isPlaying) {
            videoRef.current.pause();
          } else {
            // 모바일에서 재생 시 음소거 및 인라인 재생 설정
            if (isMobile) {
              videoRef.current.muted = true;
              videoRef.current.playsInline = true;
            }

            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('Video play started successfully');
                  setIsPlaying(true);
                })
                .catch((error) => {
                  console.warn('Video play failed:', error);
                  setIsPlaying(false);

                  // 모바일에서 재생 실패 시 사용자에게 안내
                  if (isMobile) {
                    addToast({
                      type: 'info',
                      title: '재생 안내',
                      message:
                        '모바일에서는 화면을 터치하여 비디오를 재생해주세요.',
                      duration: 3000,
                    });
                  }
                });
            }
          }
        } else {
          console.warn(
            'Video not ready to play, readyState:',
            videoRef.current.readyState
          );

          // 모바일에서는 강제로 재생 시도
          if (isMobile) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch((error) => {
                console.warn('Force play failed:', error);
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Video control error:', error);
      setIsPlaying(false);
    }
  };

  const skipForward = () => {
    try {
      if (
        videoRef.current &&
        videoSrc &&
        (videoRef.current.readyState >= 1 || isMobile)
      ) {
        const newTime = Math.min(
          videoRef.current.currentTime + 10,
          duration || videoRef.current.duration || 0
        );
        videoRef.current.currentTime = newTime;
      }
    } catch (error) {
      console.error('Skip forward error:', error);
    }
  };

  const skipBackward = () => {
    try {
      if (
        videoRef.current &&
        videoSrc &&
        (videoRef.current.readyState >= 1 || isMobile)
      ) {
        const newTime = Math.max(videoRef.current.currentTime - 10, 0);
        videoRef.current.currentTime = newTime;
      }
    } catch (error) {
      console.error('Skip backward error:', error);
    }
  };

  const seekToTime = (time: number) => {
    try {
      if (
        videoRef.current &&
        videoSrc &&
        (videoRef.current.readyState >= 1 || isMobile)
      ) {
        const targetTime = Math.min(
          time,
          duration || videoRef.current.duration || 0
        );
        videoRef.current.currentTime = targetTime;

        // 모바일에서 타임스탬프 클릭 시 비디오 영역으로 스크롤
        if (isMobile && videoSectionRef.current) {
          videoSectionRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });

          // 스크롤 후 잠시 대기하고 비디오 재생 (선택사항)
          setTimeout(() => {
            if (videoRef.current && !isPlaying) {
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch((error) => {
                  console.warn('Auto play after seek failed:', error);
                });
              }
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error('Seek error:', error);
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
      if (video.currentTime !== undefined && !isNaN(video.currentTime)) {
        setCurrentTime(video.currentTime);
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
      updateTime();
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    try {
      video.addEventListener('timeupdate', handleTimeUpdate);
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

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
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
          const videoDuration = duration || videoRef.current?.duration || 60;
          const randomTimestamp = videoSrc
            ? Math.random() * videoDuration
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2" ref={videoSectionRef}>
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
                          <p className="text-gray-300 text-xs md:text-sm text-center px-4 mb-4">
                            AI가 영상을 분석하고 있습니다. 잠시만 기다려주세요.
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
                          style={{
                            minHeight: isMobile ? '200px' : '300px', // 최소 높이 보장
                            maxHeight: isMobile ? '300px' : '500px', // 최대 높이 제한
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

                            setVideoError(
                              `비디오 오류: ${
                                error?.message || '알 수 없는 오류'
                              }`
                            );
                            setIsPlaying(false);
                            setVideoLoading(false);
                          }}
                          onLoadStart={() => {
                            console.log('Video loading started');
                            setVideoLoading(true);
                          }}
                          onCanPlay={() => {
                            console.log('Video can play');
                            setVideoLoading(false);
                            setVideoError(null);
                          }}
                          onLoadedData={() => {
                            console.log('Video data loaded');
                            setVideoLoading(false);
                          }}
                          onLoadedMetadata={(e) => {
                            console.log('Video metadata loaded');
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
                          onWaiting={() => {
                            console.log('Video waiting for data');
                          }}
                          // 모바일에서 터치로 재생 가능하도록
                          onClick={isMobile ? togglePlayPause : undefined}
                        />
                      )}

                      {/* 비디오 에러 표시 */}
                      {videoError && (
                        <div className="absolute inset-0 bg-black bg-opacity-75 rounded-md flex items-center justify-center">
                          <div className="text-center text-white p-4">
                            <p className="text-sm mb-2">비디오 로드 오류</p>
                            <p className="text-xs text-gray-300">
                              {videoError}
                            </p>
                            <Button
                              size="sm"
                              className="mt-2 bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                              onClick={() => {
                                setVideoError(null);
                                if (videoRef.current) {
                                  videoRef.current.load();
                                }
                              }}
                            >
                              다시 시도
                            </Button>
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
                        className="absolute top-0 left-0 w-full h-full"
                        onClick={(e) => {
                          try {
                            if (videoRef.current && videoSrc && duration > 0) {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const pos = (e.clientX - rect.left) / rect.width;
                              const newTime = pos * duration;
                              videoRef.current.currentTime = newTime;
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
                      className="border-[#6c5ce7] text-[#6c5ce7] hover:bg-[#6c5ce7] hover:text-white hover:border-[#6c5ce7] transition-all duration-200"
                      onClick={handleNewChat}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />새 채팅
                    </Button>
                  </div>

                  <div className="flex-1 overflow-hidden mb-3 md:mb-4 border border-[#2a3142] rounded-md">
                    <ScrollArea className="h-[250px] md:h-[400px] pr-2">
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
