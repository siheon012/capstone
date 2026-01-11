'use client';

import React, { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface UploadSectionProps {
  isUploading: boolean;
  uploadProgress: number;
  uploadStage: string;
  isDuplicateVideo: boolean;
  uploadHighlight: boolean;
  onUploadClick: () => void;
  onCancelProcess: () => void;
}

const UploadSection = forwardRef<HTMLDivElement, UploadSectionProps>(
  (
    {
      isUploading,
      uploadProgress,
      uploadStage,
      isDuplicateVideo,
      uploadHighlight,
      onUploadClick,
      onCancelProcess,
    },
    ref
  ) => {
    return (
      <Card className="mb-4 md:mb-6 bg-[#242a38] border-0 shadow-lg">
        <CardContent className="p-4 md:p-6">
          <div
            ref={ref}
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
            {/* Upload Progress Overlay */}
            {isUploading && (
              <div className="absolute inset-0 bg-black bg-opacity-60 rounded-lg flex flex-col items-center justify-center z-10">
                <div className="relative w-20 h-20 md:w-24 md:h-24 mb-4">
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
                        2 * Math.PI * 45 * (1 - uploadProgress / 100)
                      }`}
                      className="transition-all duration-300 ease-out"
                      style={{
                        filter: 'drop-shadow(0 0 8px rgba(108, 92, 231, 0.6))',
                      }}
                    />
                  </svg>
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
                <button
                  onClick={onCancelProcess}
                  className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium border border-[#6c5ce7] hover:border-[#5a4fcf]"
                >
                  취소
                </button>
              </div>
            )}

            {/* Upload Icon */}
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
                      isDuplicateVideo ? 'text-[#FFB800]' : 'text-[#00e6b4]'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Main Text */}
            {!isUploading && (
              <p className="text-gray-300 mb-6 text-base md:text-lg text-center px-4 font-medium">
                {isDuplicateVideo
                  ? '이미 업로드된 동영상입니다. 분석을 시작하세요.'
                  : '분석을 시작하려면 CCTV 영상을 업로드하세요'}
              </p>
            )}

            {/* Upload Button */}
            {!isUploading && (
              <Button
                disabled={isUploading}
                className={`px-8 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                  isUploading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] hover:scale-105'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isUploading) {
                    onUploadClick();
                  }
                }}
              >
                {isUploading ? '업로드 중...' : '영상 업로드'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

UploadSection.displayName = 'UploadSection';

export default UploadSection;
