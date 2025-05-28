'use client';

import type React from 'react';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
}: MobileBottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // 터치 이벤트 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    // 아래로만 드래그 허용
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    // 드래그 거리가 100px 이상이면 닫기
    if (dragY > 100) {
      onClose();
    }

    setDragY(0);
  };

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* 바텀 시트 */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out"
        style={{
          transform: `translateY(${dragY}px)`,
          height: '75vh',
          borderTopLeftRadius: '1.5rem',
          borderTopRightRadius: '1.5rem',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Card className="h-full bg-[#242a38] border-0 shadow-2xl rounded-t-3xl overflow-hidden">
          {/* 드래그 핸들 영역 */}
          <div className="flex flex-col items-center py-3 bg-[#2a3142] cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-gray-400 rounded-full mb-2" />

            {/* 헤더 */}
            <div className="flex items-center justify-between w-full px-4">
              <h2 className="text-lg font-semibold text-white">
                {title || '히스토리'}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-white"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* 콘텐츠 */}
          <div className="flex-1 overflow-hidden">{children}</div>
        </Card>
      </div>
    </>
  );
}
