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

interface DynamicHistorySidebarProps {
  onSelectHistory: (historyItem: HistoryItem) => void;
  currentHistoryId?: string;
  onClose?: () => void;
}

export default function DynamicHistorySidebar({
  onSelectHistory,
  currentHistoryId,
  onClose,
}: DynamicHistorySidebarProps) {
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory();
  }, []);

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

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await getHistoryList();
      if (response.success) {
        setHistoryList(response.data);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
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

  if (loading) {
    return (
      <div className="w-full sm:w-80 bg-[#242a38] border-r border-[#2a3142] p-4 max-w-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[#2a3142] rounded"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-[#2a3142] rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full sm:w-80 bg-[#242a38] border-r border-[#2a3142] flex flex-col max-w-sm h-full relative"
    >
      {/* Sticky Header */}
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
              onClick={loadHistory}
              title="히스토리 새로고침"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            {/* 모바일 전용 닫기 버튼 */}
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1a1f2c] flex-shrink-0"
                onClick={onClose}
                aria-label="히스토리 닫기"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 - 동적 스크롤 */}
      {needsScroll ? (
        <ScrollArea className="flex-1" onScrollCapture={handleScroll}>
          <div ref={scrollAreaRef} className="p-4 space-y-3">
            {historyList.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  아직 분석 기록이 없습니다
                </p>
              </div>
            ) : (
              historyList.map((item) => (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all duration-200 border-0 ${
                    currentHistoryId === item.id
                      ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                      : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                  }`}
                  onClick={() => onSelectHistory(item)}
                >
                  <CardContent className="p-3 sm:p-4">
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
                          <h3 className="font-medium text-white text-xs sm:text-sm truncate">
                            {item.title}
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
                      <div className="text-xs text-gray-300">
                        <div className="truncate">
                          <span className="text-[#3694ff]">Q:</span>{' '}
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
        <div className="flex-1 p-4 space-y-3 overflow-hidden">
          {historyList.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">아직 분석 기록이 없습니다</p>
            </div>
          ) : (
            historyList.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all duration-200 border-0 ${
                  currentHistoryId === item.id
                    ? 'bg-[#00e6b4] bg-opacity-10 border-[#00e6b4] border'
                    : 'bg-[#1a1f2c] hover:bg-[#2a3142]'
                }`}
                onClick={() => onSelectHistory(item)}
              >
                <CardContent className="p-3 sm:p-4">
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
                        <h3 className="font-medium text-white text-xs sm:text-sm truncate">
                          {item.title}
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
                        <span className="truncate">{item.videoInfo.name}</span>
                      </div>
                    )}

                    {/* 메시지 미리보기 */}
                    <div className="text-xs text-gray-300">
                      <div className="truncate">
                        <span className="text-[#3694ff]">Q:</span>{' '}
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

      {/* 맨 위로 버튼 - 스크롤이 있을 때만 표시 */}
      {needsScroll && showScrollTop && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-20 right-4 z-20 w-10 h-10 rounded-full bg-[#00e6b4] border-[#00e6b4] text-[#1a1f2c] hover:bg-[#00c49c] shadow-lg"
          onClick={scrollToTop}
          title="맨 위로"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}

      <Separator className="bg-[#2a3142]" />

      {/* 하단 버튼들 - 새로고침 버튼 제거 */}
      <div className="p-4 space-y-2">
        {/* 모바일에서만 보이는 닫기 버튼 */}
        {onClose && (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:hidden border-[#2a3142] text-gray-300 hover:text-red-400 hover:border-red-400"
            onClick={onClose}
          >
            <X className="h-4 w-4 mr-2" />
            히스토리 닫기
          </Button>
        )}
      </div>
    </div>
  );
}
