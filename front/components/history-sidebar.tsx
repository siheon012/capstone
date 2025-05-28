'use client';

import type React from 'react';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import type { HistoryItem } from '@/app/types/history';
import { getHistoryList, deleteHistory } from '@/app/actions/history-service';

interface HistorySidebarProps {
  onSelectHistory: (historyItem: HistoryItem) => void;
  currentHistoryId?: string;
  onClose?: () => void; // 닫기 함수 추가
}

export default function HistorySidebar({
  onSelectHistory,
  currentHistoryId,
  onClose,
}: HistorySidebarProps) {
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

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
    <div className="w-full sm:w-80 bg-[#242a38] border-r border-[#2a3142] flex flex-col max-w-sm h-full">
      {/* 헤더 - 모바일 닫기 버튼 추가 */}
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
              className="h-8 w-8 text-gray-400 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
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

      <ScrollArea className="flex-1" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="p-4 space-y-3">
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
                      {/* 날짜 썸네일 - 모바일에서 더 작게 */}
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

                    {/* 메시지 개수 */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{item.messages.length}개 메시지</span>
                      {item.videoInfo && (
                        <span>
                          {Math.floor(item.videoInfo.duration / 60)}분
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <Separator className="bg-[#2a3142]" />

      {/* 하단 버튼들 */}
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
