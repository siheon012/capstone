'use client';

import type React from 'react';

import { useState, useEffect, useRef } from 'react';
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
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

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
      // 먼저 기존 히스토리 시스템 사용
      const historyResponse = await getHistoryList();
      if (historyResponse.success) {
        setHistoryList(historyResponse.data);
      }
    } catch (error) {
      console.error('Failed to load history data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 히스토리를 삭제하시겠습니까?')) {
      const success = await deleteHistory(id);
      if (success) {
        setHistoryList((prev) => prev.filter((item) => item.id !== id));
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

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // 제목 생성 함수 추가
  const generateSessionTitle = (item: any, index: number) => {
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
      className="history-content w-full bg-[#242a38] border-r border-[#2a3142] flex flex-col relative"
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
            <div ref={scrollAreaRef} className="p-4 space-y-3">
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
                    className={`cursor-pointer transition-all duration-200 border-0 ${
                      currentHistoryId === item.id
                        ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                        : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                    }`}
                    onClick={() => onSelectHistory(item)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          {/* 날짜 썸네일 */}
                          <div className="flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#00e6b4] bg-opacity-20 rounded-lg border border-[#00e6b4] border-opacity-30 flex-shrink-0">
                            <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#00e6b4] mb-0.5 sm:mb-1" />
                            <span className="text-xs font-bold text-[#00e6b4]">
                              {formatDate(new Date(item.createdAt))}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* 제목을 "prompt_id"에서 "{동영상 이름}의 몇번째 채팅" 형식으로 변경 */}
                            <h3 className="font-medium text-white text-xs sm:text-sm truncate">
                              {generateSessionTitle(
                                item,
                                historyList.indexOf(item)
                              )}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTime(new Date(item.createdAt))}
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

                        {/* 메시지 개수와 이벤트 타입 */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{item.messages.length}개 메시지</span>
                          <div className="flex items-center gap-2">
                            {item.videoInfo && (
                              <span>
                                {Math.floor(item.videoInfo.duration / 60)}분
                              </span>
                            )}
                            {item.eventType && (
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  item.eventType === '도난'
                                    ? 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                                    : item.eventType === '쓰러짐'
                                    ? 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30'
                                    : item.eventType === '폭행'
                                    ? 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30'
                                    : 'bg-gray-500 bg-opacity-20 text-gray-400 border border-gray-500 border-opacity-30'
                                }`}
                              >
                                주요 사건: {item.eventType}
                              </span>
                            )}
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
            className="h-full p-4 space-y-3 overflow-y-auto overflow-x-hidden history-scrollbar"
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
                  className={`cursor-pointer transition-all duration-200 border-0 ${
                    currentHistoryId === item.id
                      ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                      : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                  }`}
                  onClick={() => onSelectHistory(item)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        {/* 날짜 썸네일 */}
                        <div className="flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#00e6b4] bg-opacity-20 rounded-lg border border-[#00e6b4] border-opacity-30 flex-shrink-0">
                          <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#00e6b4] mb-0.5 sm:mb-1" />
                          <span className="text-xs font-bold text-[#00e6b4]">
                            {formatDate(new Date(item.createdAt))}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* 제목을 "prompt_id"에서 "{동영상 이름}의 몇번째 채팅" 형식으로 변경 */}
                          <h3 className="font-medium text-white text-xs sm:text-sm truncate">
                            {generateSessionTitle(
                              item,
                              historyList.indexOf(item)
                            )}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTime(new Date(item.createdAt))}
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

                      {/* 메시지 개수와 이벤트 타입 */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{item.messages.length}개 메시지</span>
                        <div className="flex items-center gap-2">
                          {item.videoInfo && (
                            <span>
                              {Math.floor(item.videoInfo.duration / 60)}분
                            </span>
                          )}
                          {item.eventType && (
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                item.eventType === '도난'
                                  ? 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                                  : item.eventType === '쓰러짐'
                                  ? 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30'
                                  : item.eventType === '폭행'
                                  ? 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30'
                                  : 'bg-gray-500 bg-opacity-20 text-gray-400 border border-gray-500 border-opacity-30'
                              }`}
                            >
                              주요 사건: {item.eventType}
                            </span>
                          )}
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
