'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail } from 'lucide-react';

interface FooterProps {
  historyOpen?: boolean;
}

export default function Footer({ historyOpen = false }: FooterProps) {
  return (
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
            <span>© 2026 Deep Sentinel. All rights reserved.</span>
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
  );
}
