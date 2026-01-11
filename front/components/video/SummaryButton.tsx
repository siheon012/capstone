'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface SummaryButtonProps {
  video: any;
  isLoading: boolean;
  onGenerateSummary: () => void;
}

export default function SummaryButton({
  video,
  isLoading,
  onGenerateSummary,
}: SummaryButtonProps) {
  if (!video) return null;

  return (
    <Card className="bg-[#242a38] border-0 shadow-lg mb-4">
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#00e6b4] bg-opacity-10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-5 w-5 md:h-6 md:w-6 text-[#00e6b4]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm md:text-base font-semibold text-white mb-1">
                영상 요약 (Summary)
              </h3>
              <p className="text-xs md:text-sm text-gray-400">
                전체 영상 내용을 AI가 분석한 요약 정보
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c] transition-all duration-200 w-full md:w-auto"
            onClick={onGenerateSummary}
            disabled={isLoading || !video}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {isLoading ? '출력 중...' : 'Summary 출력'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
