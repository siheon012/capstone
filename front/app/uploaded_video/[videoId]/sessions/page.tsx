'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  Calendar,
  Clock,
  HardDrive,
  MessageSquare,
  Trash2,
  Download,
  ArrowLeft,
  Plus,
  Play,
  TimerIcon as Timeline,
  X,
} from 'lucide-react';
import type { UploadedVideo } from '@/app/types/video';
import type { ChatSession } from '@/app/types/session';
import { getUploadedVideos, deleteVideo } from '@/app/actions/video-service';
import { getVideoSessions, deleteSession } from '@/app/actions/session-service';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SmartHeader from '@/components/smart-header';
import DynamicHistorySidebar from '@/components/dynamic-history-sidebar';
import ToastNotification from '@/components/toast-notification';

export default function VideoSessionsPage() {
  const params = useParams();
  const videoId = params.videoId as string;

  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 히스토리 관련 상태 추가
  const [currentHistoryId, setCurrentHistoryId] = useState<string>();
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // 토스트 시스템 상태
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      title: string;
      message: string;
      type: 'success' | 'error' | 'info';
    }>
  >([]);

  // 토스트 함수들
  const addToast = (
    title: string,
    message: string = '',
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => removeToast(id), 3000);
  };

  const addToastIfNotExists = (
    title: string,
    message: string = '',
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    const exists = toasts.some((toast) => toast.title === title);
    if (!exists) {
      addToast(title, message, type);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  useEffect(() => {
    if (videoId) {
      loadVideoAndSessions();
    }
  }, [videoId]);

  const loadVideoAndSessions = async () => {
    setLoading(true);
    try {
      // 비디오 정보 로드
      const videosResponse = await getUploadedVideos();
      if (videosResponse.success) {
        const foundVideo = videosResponse.data.find((v) => v.id === videoId);
        if (foundVideo) {
          setVideo(foundVideo);
        }
      }

      // 세션 목록 로드
      const sessionsResponse = await getVideoSessions(videoId);
      if (sessionsResponse.success) {
        setSessions(sessionsResponse.data);
      }
    } catch (error) {
      console.error('Failed to load video and sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  // 히스토리 새로고침 핸들러 함수 추가 (loadVideoAndSessions 함수 아래에 추가)
  const handleHistoryRefresh = async () => {
    try {
      addToastIfNotExists(
        '히스토리 새로고침',
        '분석 히스토리를 새로고침하고 있습니다...',
        'info'
      );

      // 히스토리 새로고침 트리거
      setHistoryRefreshTrigger((prev) => prev + 1);

      // 잠시 후 성공 메시지 표시
      setTimeout(() => {
        addToastIfNotExists(
          '새로고침 완료',
          '히스토리가 성공적으로 새로고침되었습니다.',
          'success'
        );
      }, 500);
    } catch (error) {
      console.error('History refresh failed:', error);
      addToastIfNotExists(
        '새로고침 실패',
        '히스토리 새로고침에 실패했습니다.',
        'error'
      );
    }
  };

  // 히스토리 선택 핸들러
  const handleSelectHistory = (historyItem: any) => {
    setCurrentHistoryId(historyItem.id);
    if (historyItem.videoId) {
      window.location.href = `/uploaded_video/${historyItem.videoId}`;
    }
    setHistoryOpen(false);
  };

  // 히스토리 닫기 핸들러
  const handleCloseHistory = () => {
    setHistoryOpen(false);
  };

  const handleDeleteVideo = async () => {
    if (confirm('이 비디오와 모든 관련 세션을 삭제하시겠습니까?')) {
      try {
        // 삭제 시작 토스트
        addToast(
          '비디오 삭제 중',
          '비디오 파일과 관련 데이터를 삭제하고 있습니다...',
          'info'
        );

        const success = await deleteVideo(videoId);
        
        if (success) {
          // 성공 토스트
          addToast(
            '삭제 완료',
            '비디오와 관련 세션이 성공적으로 삭제되었습니다.',
            'success'
          );

          // 비디오 목록 페이지로 리다이렉트
          setTimeout(() => {
            window.location.href = '/uploaded_video';
          }, 1000);
        } else {
          // 실패 토스트
          addToast(
            '삭제 실패',
            '비디오 삭제 중 오류가 발생했습니다.',
            'error'
          );
        }
      } catch (error) {
        console.error('Delete video error:', error);
        addToast(
          '삭제 오류',
          '비디오 삭제 중 예상치 못한 오류가 발생했습니다.',
          'error'
        );
      }
    }
  };

  const handleDeleteSession = async (
    sessionId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (confirm('이 세션을 삭제하시겠습니까?')) {
      const success = await deleteSession(sessionId);
      if (success) {
        setSessions((prev) =>
          prev.filter((session) => session.id !== sessionId)
        );
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimestampsFromSession = (session: ChatSession) => {
    return session.messages
      .filter((msg) => msg.timestamp)
      .map((msg) => msg.timestamp!)
      .sort((a, b) => a - b);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-[#00e6b4] rounded-full mx-auto mb-4 animate-bounce"></div>
          <p className="text-white text-lg">로딩 중...</p>
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

      {/* Main Content - 헤더 높이만큼 패딩 추가 */}
      <main
        className={`flex-1 container mx-auto py-4 px-2 sm:py-8 sm:px-4 pt-28 transition-all duration-300 ${
          historyOpen && !isMobile
            ? 'blur-sm scale-95 opacity-75'
            : 'blur-0 scale-100 opacity-100'
        }`}
      >
        {/* 뒤로가기 버튼 */}
        <div className="mb-4 sm:mb-6">
          <Link href="/uploaded_video">
            <Button
              variant="ghost"
              className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              비디오 목록으로 돌아가기
            </Button>
          </Link>
        </div>

        {/* 비디오 정보 카드 - 모바일에서 세로 레이아웃 */}
        <Card className="mb-6 sm:mb-8 bg-[#242a38] border-0 shadow-lg">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              {/* 썸네일 - 모바일에서는 전체 너비로 */}
              <div className="w-full sm:w-64 sm:flex-shrink-0 order-1">
                <div className="w-full h-48 sm:w-64 sm:h-36 bg-[#1a1f2c] rounded-lg overflow-hidden border border-[#2a3142] mx-auto">
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className="h-12 w-12 text-gray-500" />
                  </div>
                </div>
              </div>

              {/* 비디오 정보 - 모바일에서는 썸네일 아래로 */}
              <div className="flex-1 min-w-0 order-2 sm:order-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      {video.originalName}
                    </h1>
                    {video.description && (
                      <p className="text-sm sm:text-base text-gray-400 mb-3">
                        {video.description}
                      </p>
                    )}
                  </div>

                  {/* 주요 사건 배지 */}
                  {video.majorEvent && (
                    <Badge
                      className={`self-start sm:ml-4 mt-1 sm:mt-0 ${
                        video.majorEvent === '도난'
                          ? 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                          : video.majorEvent === '쓰러짐'
                          ? 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30'
                          : video.majorEvent === '폭행'
                          ? 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30'
                          : 'bg-gray-500 bg-opacity-20 text-gray-400 border border-gray-500 border-opacity-30'
                      }`}
                    >
                      주요 사건: {video.majorEvent}
                    </Badge>
                  )}
                </div>

                {/* 메타데이터 그리드 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                    <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">{sessions.length}개 채팅</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">
                      {formatDate(video.uploadDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                    <HardDrive className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">
                      {formatFileSize(video.size)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">
                      {formatDuration(video.duration)}
                    </span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/uploaded_video/${video.id}`}>
                    <Button className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] text-xs sm:text-sm h-9">
                      <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />새
                      분석 시작
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] text-xs sm:text-sm h-9"
                    onClick={() => window.open(video.filePath, '_blank')}
                  >
                    <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    다운로드
                  </Button>

                  <Button
                    variant="outline"
                    className="border-[#2a3142] text-gray-300 hover:text-red-400 hover:border-red-400 text-xs sm:text-sm h-9"
                    onClick={handleDeleteVideo}
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    삭제
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 세션 목록 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">
              분석 세션 목록
            </h2>
            <p className="text-sm text-gray-400">
              이 비디오로 진행된 모든 분석 세션을 확인할 수 있습니다.
            </p>
          </div>

          {/* 세션이 있을 때만 "새 세션 시작" 버튼 표시 */}
          {sessions.length > 0 && (
            <Link href={`/uploaded_video/${video.id}`}>
              <Button className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />새 세션 시작
              </Button>
            </Link>
          )}
        </div>

        {/* 세션 목록 */}
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <Card className="bg-[#242a38] border-0 shadow-lg">
              <CardContent className="p-6 sm:p-12 text-center">
                <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 text-gray-500 mx-auto mb-4" />
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                  아직 분석 세션이 없습니다
                </h3>
                <p className="text-sm sm:text-base text-gray-400 mb-6">
                  이 비디오로 첫 번째 분석을 시작해보세요.
                </p>
                <Link href={`/uploaded_video/${video.id}`}>
                  <Button className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]">
                    <Plus className="h-4 w-4 mr-2" />첫 번째 세션 시작
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            sessions.map((session) => {
              const timestamps = getTimestampsFromSession(session);
              const firstUserMessage = session.messages.find(
                (msg) => msg.role === 'user'
              );
              const firstAssistantMessage = session.messages.find(
                (msg) => msg.role === 'assistant'
              );

              return (
                <Card
                  key={session.id}
                  className="bg-[#242a38] border-0 shadow-lg hover:bg-[#2a3142] transition-colors cursor-pointer"
                >
                  <Link href={`/uploaded_video/${video.id}`}>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-0">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                            {session.title}
                          </h3>

                          {/* 첫 번째 질문과 답변 */}
                          <div className="space-y-2 mb-3 sm:mb-4">
                            {firstUserMessage && (
                              <div className="text-xs sm:text-sm">
                                <span className="text-[#6c5ce7] font-medium">
                                  Q:
                                </span>
                                <span className="text-gray-300 ml-2">
                                  {firstUserMessage.content}
                                </span>
                              </div>
                            )}
                            {firstAssistantMessage && (
                              <div className="text-xs sm:text-sm">
                                <span className="text-[#00e6b4] font-medium">
                                  A:
                                </span>
                                <span className="text-gray-300 ml-2">
                                  {firstAssistantMessage.content.length > 100
                                    ? firstAssistantMessage.content.substring(
                                        0,
                                        100
                                      ) + '...'
                                    : firstAssistantMessage.content}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* 메타데이터 */}
                          <div className="grid grid-cols-2 gap-2 sm:gap-4">
                            <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-400">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">
                                {formatDate(session.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-400">
                              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">
                                {session.messages.length}개 메시지
                              </span>
                            </div>

                            {timestamps.length > 0 && (
                              <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-400 col-span-2 sm:col-span-1">
                                <Timeline className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                                <span className="truncate">
                                  {timestamps.length}개 타임라인 (
                                  {formatTime(timestamps[0])} ~{' '}
                                  {formatTime(
                                    timestamps[timestamps.length - 1]
                                  )}
                                  )
                                </span>
                              </div>
                            )}

                            {session.eventType && (
                              <div className="flex items-center gap-1 sm:gap-2 col-span-2 sm:col-span-1">
                                <Badge
                                  className={`text-xs ${
                                    session.eventType === '도난'
                                      ? 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                                      : session.eventType === '쓰러짐'
                                      ? 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30'
                                      : session.eventType === '폭행'
                                      ? 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30'
                                      : 'bg-gray-500 bg-opacity-20 text-gray-400 border border-gray-500 border-opacity-30'
                                  }`}
                                >
                                  {session.eventType}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 삭제 버튼 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-red-400 hover:bg-red-400 hover:bg-opacity-10 flex-shrink-0 self-start sm:ml-4"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          aria-label="세션 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              );
            })
          )}
        </div>
      </main>

      {/* History Sidebar - 모바일에서는 전체 화면으로 */}
      {isMobile ? (
        <div
          className={`fixed inset-0 z-50 bg-[#1a1f2c] transform transition-transform duration-300 ease-out ${
            historyOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* 모바일 전용 헤더 */}
          <div className="bg-[#242a38] border-b border-[#2a3142] p-4 flex items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <img
                  src="/images/ds_logo_transparent.png"
                  alt="Deep Sentinel Logo"
                  className="w-full h-full object-contain scale-[1.7]"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Deep Sentinel</h1>
                <span className="text-xs text-gray-400">분석 히스토리</span>
              </div>
            </div>
          </div>

          <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
            {/* 모바일 히스토리 사이드바에 onHistoryRefresh prop 추가 */}
            <DynamicHistorySidebar
              onSelectHistory={handleSelectHistory}
              onClose={handleCloseHistory}
              onHistoryRefresh={handleHistoryRefresh}
              refreshTrigger={historyRefreshTrigger}
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
          {/* 데스크톱 히스토리 사이드바에도 onHistoryRefresh prop 추가 */}
          <DynamicHistorySidebar
            onSelectHistory={handleSelectHistory}
            onClose={handleCloseHistory}
            onHistoryRefresh={handleHistoryRefresh}
            refreshTrigger={historyRefreshTrigger}
          />
        </div>
      )}

      {/* History Backdrop - 데스크톱에서만 표시 */}
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

      {/* Footer */}
      <footer
        className={`bg-[#242a38] border-t border-[#2a3142] mt-auto transition-all duration-300 ${
          historyOpen ? 'blur-sm opacity-75' : 'blur-0 opacity-100'
        }`}
      >
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#00e6b4] mb-2 sm:mb-3">
              AI 기반 CCTV 영상 분석 플랫폼
            </h2>
            <p className="text-sm sm:text-lg text-gray-400">
              실시간 이벤트 감지 • 스마트 보안 솔루션 • Deep Sentinel
            </p>
          </div>

          <Separator className="bg-[#2a3142] my-4 sm:my-6" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-base text-gray-400">
              <span>© 2024 Deep Sentinel. All rights reserved.</span>
            </div>

            <div className="flex items-center gap-2 text-xs sm:text-base text-gray-300">
              <span>궁금한 부분은 여기로</span>
              <span className="text-[#00e6b4]">→</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#00e6b4] hover:text-[#00c49c] hover:bg-[#1a1f2c] p-1 sm:p-2 text-xs sm:text-sm"
                onClick={() =>
                  window.open('mailto:contact@deepsentinel.com', '_blank')
                }
              >
                Contact
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
