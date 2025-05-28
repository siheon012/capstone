'use client';

import type React from 'react';

import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileVideo, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DragDropZoneProps {
  onFileUpload: (file: File) => void;
  isVisible: boolean;
  onClose: () => void;
}

export default function DragDropZone({
  onFileUpload,
  isVisible,
  onClose,
}: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 드래그 앤 드롭 존 이벤트 핸들러 개선
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((prev) => prev + 1);

    if (
      e.dataTransfer &&
      e.dataTransfer.items &&
      e.dataTransfer.items.length > 0
    ) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((prev) => prev - 1);

    if (dragDepth <= 1) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragOver(false);
    setDragDepth(0);

    if (e.dataTransfer && e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files);
      const videoFile = files.find((file) => file.type.startsWith('video/'));

      if (videoFile) {
        onFileUpload(videoFile);
        onClose();
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onFileUpload(file);
      onClose();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        className={`relative w-full max-w-2xl mx-4 transition-all duration-300 ${
          isDragOver ? 'scale-105' : 'scale-100'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Card
          className={`border-2 border-dashed transition-all duration-300 ${
            isDragOver
              ? 'border-[#00e6b4] bg-[#00e6b4] bg-opacity-10 shadow-2xl'
              : 'border-[#2a3142] bg-[#242a38] hover:border-[#3694ff]'
          }`}
        >
          <CardContent className="p-12">
            {/* 닫기 버튼 */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>

            <div className="text-center">
              {/* 아이콘 */}
              <div
                className={`mx-auto mb-6 transition-all duration-300 ${
                  isDragOver ? 'scale-110' : 'scale-100'
                }`}
              >
                {isDragOver ? (
                  <div className="w-24 h-24 rounded-full bg-[#00e6b4] bg-opacity-20 flex items-center justify-center">
                    <FileVideo className="h-12 w-12 text-[#00e6b4]" />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#1a1f2c] flex items-center justify-center">
                    <Upload className="h-12 w-12 text-[#00e6b4]" />
                  </div>
                )}
              </div>

              {/* 메시지 */}
              <h2
                className={`text-2xl font-bold mb-4 transition-colors ${
                  isDragOver ? 'text-[#00e6b4]' : 'text-white'
                }`}
              >
                {isDragOver ? '파일을 여기에 놓으세요' : 'CCTV 영상 업로드'}
              </h2>

              <p className="text-gray-400 mb-8 leading-relaxed">
                {isDragOver ? (
                  '비디오 파일을 드롭하여 분석을 시작하세요'
                ) : (
                  <>
                    비디오 파일을 드래그하여 이곳에 놓거나
                    <br />
                    아래 버튼을 클릭하여 파일을 선택하세요
                  </>
                )}
              </p>

              {/* 업로드 버튼 */}
              {!isDragOver && (
                <Button
                  onClick={handleClick}
                  className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-8 py-3 text-lg font-semibold"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  파일 선택
                </Button>
              )}

              {/* 지원 형식 */}
              <div className="mt-8 text-sm text-gray-500">
                <p>지원 형식: MP4, AVI, MOV, WMV, MKV</p>
                <p>최대 파일 크기: 2GB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 숨겨진 파일 입력 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
