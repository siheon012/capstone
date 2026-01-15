'use client';

import React, { Suspense } from 'react';
import HistorySidebar from '@/components/history/HistorySidebar';

interface HistoryLayoutProps {
  historyOpen: boolean;
  isMobile: boolean;
  currentHistoryId?: string;
  historyRefreshTrigger: number;
  onSelectHistory: (item: any) => void;
  onClose: () => void;
  onHistoryRefresh: () => void;
}

export default function HistoryLayout({
  historyOpen,
  isMobile,
  currentHistoryId,
  historyRefreshTrigger,
  onSelectHistory,
  onClose,
  onHistoryRefresh,
}: HistoryLayoutProps) {
  return (
    <>
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
                <h1 className="text-lg font-bold text-white">Deep Sentinel</h1>
                <span className="text-xs text-gray-400">분석 히스토리</span>
              </div>
            </div>
          </div>

          {/* 히스토리 콘텐츠 - 나머지 화면 전체 사용 */}
          <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
            <Suspense
              fallback={
                <div className="p-4 text-white">히스토리 로딩 중...</div>
              }
            >
              <HistorySidebar
                onSelectHistory={onSelectHistory}
                currentHistoryId={currentHistoryId}
                onClose={onClose}
                refreshTrigger={historyRefreshTrigger}
                onHistoryRefresh={onHistoryRefresh}
              />
            </Suspense>
          </div>
        </div>
      ) : (
        // 데스크톱 사이드바
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
          <Suspense
            fallback={<div className="p-4 text-white">히스토리 로딩 중...</div>}
          >
            <HistorySidebar
              onSelectHistory={onSelectHistory}
              currentHistoryId={currentHistoryId}
              onClose={onClose}
              refreshTrigger={historyRefreshTrigger}
              onHistoryRefresh={onHistoryRefresh}
            />
          </Suspense>
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
          onClick={onClose}
        />
      )}
    </>
  );
}
