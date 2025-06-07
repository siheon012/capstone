'use client';

import type React from 'react';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  Trash2,
  MessageSquare,
  Video,
  X,
  RotateCcw,
  ChevronUp,
} from 'lucide-react';
import type { HistoryItem } from '@/app/types/history';
import { getHistoryList, deleteHistory } from '@/app/actions/history-service';
import type { ChatSession } from '@/app/types/session';
import { getAllSessions, deleteSession } from '@/app/actions/session-service';

// HistoryItem과 ChatSession을 모두 처리할 수 있는 유니온 타입 정의
type HistoryOrSession = HistoryItem | ChatSession;

// 기존 HistoryItem 대신 ChatSession 사용
interface DynamicHistorySidebarProps {
  onSelectHistory: (item: HistoryOrSession) => void;
  currentHistoryId?: string;
  onClose?: () => void;
  refreshTrigger?: number; // 새로고침 트리거용
  onHistoryRefresh?: () => void; // 새로고침 함수 추가
}

export default function DynamicHistorySidebar({
  onSelectHistory,
  currentHistoryId,
  onClose,
  refreshTrigger,
  onHistoryRefresh,
}: DynamicHistorySidebarProps) {
  const [historyList, setHistoryList] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // 뷰포트 높이 및 모바일 감지 훅 사용
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);

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
      setViewportHeight(window.innerHeight);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    loadHistoryData();
  }, []);

  // 외부에서 새로고침 트리거 시 히스토리 다시 로드
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadHistoryData();
    }
  }, [refreshTrigger]);

  // 화면 크기와 콘텐츠 높이를 체크하여 스크롤 필요성 판단
  useEffect(() => {
    const checkScrollNeed = () => {
      if (containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        const headerHeight = 120; // 헤더 + 여백
        const footerHeight = 80; // 하단 버튼 영역
        const availableHeight = containerHeight - headerHeight - footerHeight;
        const contentHeight = historyList.length * 120; // 각 아이템 대략 120px

        setNeedsScroll(contentHeight > availableHeight);
      }
    };

    checkScrollNeed();
    window.addEventListener('resize', checkScrollNeed);
    return () => window.removeEventListener('resize', checkScrollNeed);
  }, [historyList]);

  // loadHistory 함수를 loadSessions로 변경하고 getAllSessions 사용
  const loadHistoryData = async () => {
    setLoading(true);
    try {
      // 실제 세션 데이터 사용
      const sessionResponse = await getAllSessions();
      if (sessionResponse.success) {
        // updatedAt 기준으로 최신순 정렬 (최근 수정된 순서)
        const sortedSessions = sessionResponse.data.sort((a, b) => {
          // updatedAt이 없으면 createdAt을 fallback으로 사용
          const dateA = a.updatedAt 
            ? (typeof a.updatedAt === 'string' ? new Date(a.updatedAt) : a.updatedAt)
            : (typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt);
          const dateB = b.updatedAt 
            ? (typeof b.updatedAt === 'string' ? new Date(b.updatedAt) : b.updatedAt)
            : (typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt);
          
          // 날짜가 유효하지 않은 경우 처리
          const timeA = dateA && !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
          const timeB = dateB && !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
          
          return timeB - timeA;
        });
        setHistoryList(sortedSessions);
      }
    } catch (error) {
      console.error('Failed to load session data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 세션을 삭제하시겠습니까?')) {
      // 현재 URL에서 세션 ID 확인
      const currentSessionId = searchParams.get('sessionId');
      const isCurrentSession = currentSessionId === id;
      
      const success = await deleteSession(id);
      if (success) {
        setHistoryList((prev) => prev.filter((item) => item.id !== id));
        
        // 현재 보고 있는 세션이 삭제된 경우 리디렉션
        if (isCurrentSession) {
          try {
            // 현재 URL에서 videoId 추출
            const currentPath = window.location.pathname;
            const videoIdMatch = currentPath.match(/\/uploaded_video\/([^\/\?]+)/);
            
            if (videoIdMatch && videoIdMatch[1]) {
              const videoId = videoIdMatch[1];
              console.log('현재 세션이 삭제됨, 리디렉션:', `/uploaded_video/${videoId}`);
              router.push(`/uploaded_video/${videoId}`);
            } else {
              // videoId를 찾을 수 없는 경우 메인 페이지로
              console.warn('videoId를 찾을 수 없음, 메인 페이지로 리디렉션');
              router.push('/uploaded_video');
            }
          } catch (error) {
            console.error('리디렉션 중 오류 발생:', error);
            // 오류가 발생해도 메인 페이지로 리디렉션
            router.push('/uploaded_video');
          }
        }
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setShowScrollTop(scrollTop > 200);
  };

  const scrollToTop = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 안전한 날짜 추출 함수 추가
  const getSafeDate = (item: ChatSession) => {
    // updatedAt이 있으면 사용, 없으면 createdAt 사용
    const dateValue = item.updatedAt || item.createdAt;
    return typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  };

  const formatDate = (date: Date | string) => {
    // 안전한 날짜 파싱
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    
    // 유효한 날짜인지 확인
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return '--/--';
    }
    
    const month = parsedDate.getMonth() + 1;
    const day = parsedDate.getDate();
    return `${month}/${day}`;
  };

  const formatTime = (date: Date | string) => {
    // 안전한 날짜 파싱
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    
    // 유효한 날짜인지 확인
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return '--:--';
    }
    
    return parsedDate.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // 이벤트 타입 번역 함수
  const translateEventType = (eventType: string) => {
    switch (eventType) {
      case 'theft':
        return '도난';
      case 'collapse':
        return '쓰러짐';
      case 'violence':
        return '폭행';
      default:
        return eventType;
    }
  };

  // 제목 생성 함수 추가
  const generateSessionTitle = (item: ChatSession, index: number) => {
    if (item.videoInfo?.name) {
      // 동영상 파일명에서 확장자 제거
      const videoName = item.videoInfo.name.replace(
        /\.(mp4|avi|mov|mkv)$/i,
        ''
      );
      // 세션 번호는 역순으로 계산 (최신이 1번)
      const sessionNumber = historyList.length - index;
      return `${videoName}의 ${sessionNumber}번째 세션`;
    }
    // videoInfo가 없는 경우 기본 제목
    return `세션 ${historyList.length - index}`;
  };

  // 찾은 사건들을 포맷팅하는 함수 수정
  const formatDetectedEvents = (session: ChatSession) => {
    if (!session.detected_events || session.detected_events.length === 0) {
      return null; // 사건이 없으면 null 반환 (뱃지를 표시하지 않음)
    }
    
    const eventTypes = session.detected_events.map(event => {
      switch (event.event_type) {
        case 'theft':
          return '도난';
        case 'collapse':
          return '쓰러짐';
        case 'violence':
          return '폭행';
        default:
          return event.event_type;
      }
    });
    
    // 중복 제거 후 문자열로 조합
    const uniqueEvents = [...new Set(eventTypes)];
    return uniqueEvents.join(', ');
  };

  // 이벤트 타입에 따른 뱃지 스타일 반환 함수 추가
  const getEventBadgeStyle = (events: string) => {
    if (events.includes('도난')) {
      return 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30';
    } else if (events.includes('폭행')) {
      return 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30';
    } else if (events.includes('쓰러짐')) {
      return 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30';
    }
    // 기본값 (혼합되거나 알 수 없는 경우)
    return 'bg-blue-500 bg-opacity-20 text-blue-400 border border-blue-500 border-opacity-30';
  };

  // videoId 추출 함수 추가
  const getVideoId = (session: ChatSession) => {
    // 1. videoId 필드가 있는 경우
    if (session.videoId) {
      return session.videoId;
    }
    
    // 2. videoInfo.name에서 추출하는 경우 (fallback)
    if (session.videoInfo?.name) {
      // 파일명에서 확장자를 제거한 것을 videoId로 사용
      return session.videoInfo.name.replace(/\.(mp4|avi|mov|mkv)$/i, '');
    }
    
    // 3. 모든 경우에 실패하면 sessionId를 사용
    return session.id;
  };

  // 카드 클릭 핸들러 추가
  const handleCardClick = (session: ChatSession) => {
    const videoId = getVideoId(session);
    const sessionId = session.id;
    
    // /uploaded_video/[videoId]?sessionId=[sessionId] 형태로 네비게이션
    router.push(`/uploaded_video/${videoId}?sessionId=${sessionId}`);
  };

  if (loading) {
    return (
      <div className="w-full bg-[#242a38] border-r border-[#2a3142] p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[#2a3142] rounded"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-[#2a3142] rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // 모바일에서 안전한 높이 계산
  const effectiveHeight = isMobile
    ? Math.min(viewportHeight, window.screen?.height || viewportHeight)
    : viewportHeight;
  const contentHeight = isMobile
    ? `${effectiveHeight - 160}px`
    : 'calc(100vh - 280px)'; // 웹에서는 헤더 높이 고려

  return (
    <div
      ref={containerRef}
      data-history-sidebar="true"
      className="history-content w-full bg-[#242a38] border-r border-[#2a3142] flex flex-col relative overflow-hidden"
      style={{
        height: isMobile ? `${effectiveHeight}px` : '100vh',
        maxHeight: isMobile ? `${effectiveHeight}px` : '100vh',
        overflow: 'hidden',
        // CSS 변수를 사용한 안전 영역 고려
        paddingBottom: isMobile
          ? 'max(env(safe-area-inset-bottom), 20px)'
          : '0',
        // 뷰포트 기반 높이 설정
        minHeight: isMobile ? 'var(--actual-vh, 100vh)' : '100vh',
        // 모바일에서 고정 너비 설정
        width: isMobile ? '100vw' : '100%',
        maxWidth: isMobile ? '100vw' : '100%',
      }}
      onWheel={(e) => {
        // 히스토리 사이드바 내에서 스크롤 이벤트가 부모로 전파되지 않도록 방지
        e.stopPropagation();
      }}
    >
      {/* Sticky Header - 웹에서만 표시 */}
      {!isMobile && (
        <div className="sticky top-0 z-10 bg-[#242a38] border-b border-[#2a3142] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#00e6b4]" />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  분석 히스토리
                </h2>
                <p className="text-sm text-gray-400">과거 CCTV 분석 기록</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 새로고침 버튼 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-[#00e6b4] hover:bg-[#1a1f2c] transition-colors"
                onClick={onHistoryRefresh || loadHistoryData}
                title="히스토리 새로고침"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              {/* 웹 전용 닫기 버튼 */}
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1a1f2c] flex-shrink-0"
                  onClick={onClose}
                  aria-label="히스토리 닫기"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 콘텐츠 영역 - 고정 높이로 설정 */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          height: contentHeight,
          minHeight: '200px', // 최소 높이 보장
        }}
      >
        {needsScroll ? (
          <ScrollArea
            className="h-full history-scrollbar"
            onScrollCapture={handleScroll}
          >
            <div ref={scrollAreaRef} className="p-3 sm:p-4 space-y-3">
              {historyList.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">
                    아직 분석 기록이 없습니다
                  </p>
                </div>
              ) : (
                historyList.map((item, index) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-all duration-200 border-0 overflow-hidden ${
                      currentHistoryId === item.id
                        ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                        : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                    }`}
                    onClick={() => handleCardClick(item)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          {/* 날짜 썸네일 */}
                          <div className="flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#00e6b4] bg-opacity-20 rounded-lg border border-[#00e6b4] border-opacity-30 flex-shrink-0">
                            <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#00e6b4] mb-0.5 sm:mb-1" />
                            <span className="text-xs font-bold text-[#00e6b4]">
                              {formatDate(getSafeDate(item))}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* 제목을 "prompt_id"에서 "{동영상 이름}의 몇번째 채팅" 형식으로 변경 */}
                            <h3 
                              className="font-medium text-white text-xs sm:text-sm truncate"
                              title={generateSessionTitle(item, historyList.indexOf(item))}
                            >
                              {generateSessionTitle(
                                item,
                                historyList.indexOf(item)
                              )}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTime(getSafeDate(item))}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 hover:text-red-400 hover:bg-red-400 hover:bg-opacity-10 flex-shrink-0 ml-2"
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          aria-label="히스토리 삭제"
                        >
                          <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {/* 비디오 정보 */}
                        {item.videoInfo && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Video className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {item.videoInfo.name}
                            </span>
                          </div>
                        )}

                        {/* 메시지 미리보기 */}
                        <div className="text-sm text-gray-300">
                          <div className="truncate">
                            <span className="text-[#6c5ce7]">Q:</span>{' '}
                            {item.messages[0]?.content || '질문 없음'}
                          </div>
                          {item.messages[1] && (
                            <div className="truncate mt-1">
                              <span className="text-[#00e6b4]">A:</span>{' '}
                              {item.messages[1].content}
                            </div>
                          )}
                        </div>

                        {/* 메시지 개수와 사건 뱃지 */}
                        <div className="flex items-start justify-between text-xs text-gray-500 gap-2">
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span>{item.interactionCount || item.messages.length}개 메시지</span>
                            {item.videoInfo && (
                              <span>
                                {Math.floor(item.videoInfo.duration / 60)}분
                              </span>
                            )}
                          </div>
                          
                          {/* 찾은 사건 뱃지 - 우측 하단 영역 확장 */}
                          <div className="flex-1 flex justify-end min-w-0">
                            {(() => {
                              const events = formatDetectedEvents(item);
                              if (!events) return null; // 사건이 없으면 뱃지를 표시하지 않음
                              
                              return (
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium truncate max-w-full ${getEventBadgeStyle(events)}`}
                                  title={`찾은 사건: ${events}`}
                                >
                                  찾은 사건: {events}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        ) : (
          // 스크롤이 필요없는 경우 일반 div 사용
          <div
            className="h-full p-3 sm:p-4 space-y-3 overflow-y-auto overflow-x-hidden history-scrollbar"
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {historyList.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  아직 분석 기록이 없습니다
                </p>
              </div>
            ) : (
              historyList.map((item, index) => (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all duration-200 border-0 overflow-hidden ${
                    currentHistoryId === item.id
                      ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                      : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                  }`}
                  onClick={() => handleCardClick(item)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                        {/* 날짜 썸네일 */}
                        <div className="flex flex-col items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-[#00e6b4] bg-opacity-20 rounded-lg border border-[#00e6b4] border-opacity-30 flex-shrink-0">
                          <Calendar className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-[#00e6b4] mb-0.5" />
                          <span className="text-[10px] sm:text-xs font-bold text-[#00e6b4] leading-none">
                            {formatDate(getSafeDate(item))}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0 overflow-hidden">
                          {/* 제목을 "prompt_id"에서 "{동영상 이름}의 몇번째 채팅" 형식으로 변경 */}
                          <h3 
                            className="font-medium text-white text-xs sm:text-sm truncate overflow-hidden"
                            title={generateSessionTitle(item, historyList.indexOf(item))}
                          >
                            {generateSessionTitle(
                              item,
                              historyList.indexOf(item)
                            )}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1 truncate overflow-hidden">
                            {formatTime(getSafeDate(item))}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-gray-400 hover:text-red-400 hover:bg-red-400 hover:bg-opacity-10 flex-shrink-0"
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        aria-label="히스토리 삭제"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>

                    <div className="space-y-2 overflow-hidden">
                      {/* 비디오 정보 */}
                      {item.videoInfo && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
                          <Video className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate overflow-hidden">
                            {item.videoInfo.name}
                          </span>
                        </div>
                      )}

                      {/* 메시지 미리보기 */}
                      <div className="text-xs sm:text-sm text-gray-300 space-y-1 overflow-hidden">
                        <div className="truncate overflow-hidden">
                          <span className="text-[#6c5ce7]">Q:</span>{' '}
                          <span className="break-words">
                            {item.messages[0]?.content || '질문 없음'}
                          </span>
                        </div>
                        {item.messages[1] && (
                          <div className="truncate overflow-hidden">
                            <span className="text-[#00e6b4]">A:</span>{' '}
                            <span className="break-words">
                              {item.messages[1].content}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 메시지 개수와 사건 뱃지 */}
                      <div className="flex items-start justify-between text-xs text-gray-500 gap-2 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                          <span className="whitespace-nowrap">{item.interactionCount || item.messages.length}개 메시지</span>
                          {item.videoInfo && (
                            <span className="whitespace-nowrap">
                              {Math.floor(item.videoInfo.duration / 60)}분
                            </span>
                          )}
                        </div>
                        
                        {/* 찾은 사건 뱃지 - 우측 하단 영역 확장 */}
                        <div className="flex-1 flex justify-end min-w-0 overflow-hidden">
                          {(() => {
                            const events = formatDetectedEvents(item);
                            if (!events) return null; // 사건이 없으면 뱃지를 표시하지 않음
                            
                            return (
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium truncate max-w-full whitespace-nowrap overflow-hidden ${getEventBadgeStyle(events)}`}
                                title={`찾은 사건: ${events}`}
                              >
                                찾은 사건: {events}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* 맨 위로 버튼 - 스크롤이 있을 때만 표시 */}
      {needsScroll && showScrollTop && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-24 right-4 z-30 w-10 h-10 rounded-full bg-[#00e6b4] border-[#00e6b4] text-[#1a1f2c] hover:bg-[#00c49c] shadow-lg"
          onClick={scrollToTop}
          title="맨 위로"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}

      {/* 구분선 */}
      <div className="flex-shrink-0">
        <Separator className="bg-[#2a3142]" />
      </div>

      {/* 하단 버튼들 - 모바일 안전 영역 고려한 고정 위치 */}
      {onClose && (
        <div
          ref={footerRef}
          className="flex-shrink-0 bg-[#242a38] border-t border-[#2a3142] p-4"
          style={{
            zIndex: 50,
            position: 'sticky',
            bottom: '0',
            left: '0',
            right: '0',
            // 모바일 브라우저 안전 영역을 고려한 패딩
            paddingBottom: isMobile
              ? 'calc(max(env(safe-area-inset-bottom), 20px) + 10px)'
              : '16px',
            // 모바일에서 추가 마진으로 브라우저 하단 UI와의 충돌 방지
            marginBottom: isMobile
              ? 'max(env(keyboard-inset-height, 0px), env(safe-area-inset-bottom, 0px))'
              : '0',
            // 배경을 확실히 보이게 하기 위한 설정
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(36, 42, 56, 0.95)',
            // iOS Safari 및 Chrome 하단 네비게이션 바 고려
            transform: isMobile ? 'translateY(-10px)' : 'none',
          }}
        >
          {/* 새로고침 버튼과 닫기 버튼을 나란히 배치 */}
          <div className="flex gap-2">
            {onHistoryRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] bg-[#242a38] hover:bg-[#00e6b4] hover:bg-opacity-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onHistoryRefresh();
                }}
                style={{
                  minHeight: isMobile ? '48px' : '36px',
                  fontSize: isMobile ? '16px' : '14px',
                  touchAction: 'manipulation',
                  fontWeight: '500',
                  boxShadow: isMobile ? '0 2px 8px rgba(0, 0, 0, 0.3)' : 'none',
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                새로고침
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-[#2a3142] text-gray-300 hover:text-red-400 hover:border-red-400 bg-[#242a38] hover:bg-red-400 hover:bg-opacity-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              style={{
                minHeight: isMobile ? '48px' : '36px',
                fontSize: isMobile ? '16px' : '14px',
                touchAction: 'manipulation',
                fontWeight: '500',
                boxShadow: isMobile ? '0 2px 8px rgba(0, 0, 0, 0.3)' : 'none',
              }}
            >
              <X className="h-4 w-4 mr-2" />
              히스토리 닫기
            </Button>
          </div>

          {/* 모바일에서 버튼이 가려지지 않도록 하는 여백 */}
          <div className="h-6" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
