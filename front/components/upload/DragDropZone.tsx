'use client';

import type React from 'react';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  FileVideo,
  X,
  MessageSquare,
  CirclePlay,
  CalendarDays,
  Check,
  Play,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomDateTimePicker from './CustomDateTimePicker';

interface DragDropZoneProps {
  onFileUpload: (file: File, videoDateTime?: string) => void;
  isVisible: boolean;
  onClose: () => void;
  isUploading?: boolean;
  uploadProgress?: {
    stage: string;
    progress: number;
    stageProgress: number;
    timeElapsed: number;
    estimatedTotal: number;
  };
}

export default function DragDropZone({
  onFileUpload,
  isVisible,
  onClose,
}: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 뷰포트 높이 및 모바일 감지 훅 사용
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 파일 선택 및 날짜/시간 선택 상태
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<string>('');

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

  // 모달이 열릴 때 메인 창 스크롤 방지
  useEffect(() => {
    if (isVisible) {
      // 현재 스크롤 위치 저장
      const scrollY = window.scrollY;

      // body에 스크롤 방지 스타일 추가 (메인 창 스크롤 방지)
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        // 모달 닫힐 때 원래 상태로 복원
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isVisible]);

  // 드래그 앤 드롭 존 이벤트 핸들러 개선
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((prev) => prev + 1);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
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

    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find((file) => file.type.startsWith('video/'));

    if (videoFile) {
      setSelectedFile(videoFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
    }
  };

  // 플레이 버튼 클릭 시 업로드 시작
  const handleStartUpload = () => {
    if (selectedFile) {
      onFileUpload(selectedFile, selectedDateTime);
      onClose();
    }
  };

  // 날짜/시간 선택 핸들러
  const handleDateTimeSelect = () => {
    // 서울 시간 기준으로 현재 날짜와 시간을 기본값으로 설정
    const now = new Date();
    const seoulTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
    );

    const year = seoulTime.getFullYear();
    const month = String(seoulTime.getMonth() + 1).padStart(2, '0');
    const day = String(seoulTime.getDate()).padStart(2, '0');
    const hours = String(seoulTime.getHours()).padStart(2, '0');
    const minutes = String(seoulTime.getMinutes()).padStart(2, '0');

    const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
    setSelectedDateTime(dateTimeString);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-0 md:p-4 overflow-hidden"
      onWheel={(e) => {
        // 모달 배경 클릭 시에만 스크롤 방지 (내부 컨텐츠는 스크롤 허용)
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        className={`relative w-full h-full md:h-auto md:max-w-4xl transition-all duration-300 ${
          isDragOver ? 'md:scale-105' : 'md:scale-100'
        } ${
          isMobile
            ? 'overflow-y-auto max-h-full'
            : 'overflow-y-auto md:overflow-visible max-h-screen md:max-h-none'
        }`}
      >
        {/* Sticky Header - 모바일에서만 표시 */}
        {isMobile && (
          <div className="sticky top-0 z-20 bg-[#242a38] border-b border-[#2a3142] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-[#00e6b4]" />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    비디오 업로드
                  </h2>
                  <p className="text-sm text-gray-400">
                    CCTV 영상 분석을 위한 파일 업로드
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* 모바일 전용 닫기 버튼 */}
                {onClose && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1a1f2c] flex-shrink-0"
                    onClick={onClose}
                    aria-label="업로드 창 닫기"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <Card
          className={`${
            isMobile ? 'h-auto' : 'h-full md:h-auto'
          } border-0 md:border-2 border-dashed transition-all duration-300 group ${
            isDragOver
              ? 'border-[#00e6b4] bg-[#00e6b4] bg-opacity-10 shadow-2xl'
              : 'md:border-[#2a3142] bg-[#242a38] md:hover:border-[#3694ff]'
          } rounded-none md:rounded-lg`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <CardContent
            className={`p-6 md:p-12 relative ${
              isMobile
                ? 'h-auto min-h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] overflow-y-auto'
                : 'h-full min-h-screen md:min-h-0 max-h-screen md:max-h-none overflow-y-auto md:overflow-visible'
            } flex flex-col justify-center`}
          >
            {/* 데스크톱 전용 닫기 버튼 */}
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            )}

            {/* 중앙 수직 점선 (모바일에서는 수평선) - 두 선택이 모두 완료되면 숨김 */}
            {!(selectedFile && selectedDateTime) && (
              <>
                <div className="absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-[#2a3142] group-hover:border-[#3694ff] transition-colors duration-300 transform -translate-x-1/2 hidden md:block"></div>
                <div className="absolute left-0 right-0 top-1/2 h-px border-t-2 border-dashed border-[#2a3142] group-hover:border-[#3694ff] transition-colors duration-300 transform -translate-y-1/2 block md:hidden"></div>
              </>
            )}

            {/* 중앙 CirclePlay 버튼 - 두 선택이 모두 완료되면 표시 */}
            {selectedFile && selectedDateTime && (
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                <Button
                  onClick={handleStartUpload}
                  className="w-24 h-24 rounded-full bg-[#6c5ce7] hover:bg-[#a29bfe] text-white flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 animate-[gentleGlow_4s_ease-in-out_infinite] hover:animate-none"
                  style={{
                    background:
                      'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                    boxShadow:
                      '0 0 30px rgba(108, 92, 231, 0.5), 0 10px 25px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <CirclePlay
                    className="h-20 w-20"
                    style={{ width: '80px', height: '80px' }}
                  />
                </Button>
              </div>
            )}

            <div className="flex flex-col md:flex-row flex-1 md:flex-none gap-8">
              {/* 왼쪽 영역 (모바일에서는 상단) */}
              <div className="w-full md:w-1/2 pr-0 md:pr-8 flex flex-col items-center justify-start flex-1 md:flex-none py-8 md:py-16">
                {/* 아이콘 */}
                <div
                  className={`mb-6 transition-all duration-300 ${
                    isDragOver ? 'scale-110' : 'scale-100'
                  }`}
                >
                  {selectedFile ? (
                    <div className="w-24 h-24 rounded-full bg-[#00e6b4] bg-opacity-20 flex items-center justify-center">
                      <FileVideo className="h-12 w-12 text-[#00e6b4]" />
                    </div>
                  ) : isDragOver ? (
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
                  className={`text-2xl font-bold mb-4 transition-colors text-center ${
                    selectedFile
                      ? 'text-[#00e6b4]'
                      : isDragOver
                      ? 'text-[#00e6b4]'
                      : 'text-white'
                  }`}
                >
                  {selectedFile
                    ? '파일이 선택됨'
                    : isDragOver
                    ? '파일을 여기에 놓으세요'
                    : '1. CCTV 영상 업로드'}
                </h2>

                <p className="text-gray-400 mb-8 leading-relaxed text-center">
                  {selectedFile ? (
                    <>
                      선택된 파일: {selectedFile.name}
                      <br />
                      <span className="text-[#00e6b4]">✓ 파일 준비 완료</span>
                    </>
                  ) : isDragOver ? (
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
                {!isDragOver && !selectedFile && (
                  <Button
                    onClick={handleClick}
                    className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-8 py-3 text-lg font-semibold"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    파일 선택
                  </Button>
                )}

                {/* 파일 변경 버튼 */}
                {selectedFile && (
                  <Button
                    onClick={handleClick}
                    variant="outline"
                    className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c] px-8 py-3 text-lg font-semibold"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    다른 파일 선택
                  </Button>
                )}

                {/* 지원 형식 */}
                <div className="mt-8 text-sm text-gray-500 text-center">
                  <p>지원 형식: MP4, AVI, MOV, WMV, MKV</p>
                  <p>최대 파일 크기: 5GB</p>
                </div>
              </div>

              {/* 모바일 전용 구분선 */}
              {isMobile && (
                <div className="w-full h-px bg-gradient-to-r from-transparent via-[#2a3142] to-transparent my-4"></div>
              )}

              {/* 오른쪽 영역 (모바일에서는 하단) */}
              <div className="w-full md:w-1/2 pl-0 md:pl-8 flex flex-col items-center justify-start flex-1 md:flex-none py-8 md:py-16">
                {/* 아이콘 */}
                <div
                  className={`mb-6 transition-all duration-300 ${
                    isDragOver ? 'scale-110' : 'scale-100'
                  }`}
                >
                  {selectedDateTime ? (
                    <div className="w-24 h-24 rounded-full bg-[#00e6b4] bg-opacity-20 flex items-center justify-center">
                      <Check className="h-12 w-12 text-[#00e6b4]" />
                    </div>
                  ) : isDragOver ? (
                    <div className="w-24 h-24 rounded-full bg-[#00e6b4] bg-opacity-20 flex items-center justify-center">
                      <CalendarDays className="h-12 w-12 text-[#00e6b4]" />
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-[#1a1f2c] flex items-center justify-center">
                      <CalendarDays className="h-12 w-12 text-[#00e6b4]" />
                    </div>
                  )}
                </div>

                {/* 메시지 */}
                <h2
                  className={`text-2xl font-bold mb-4 transition-colors text-center ${
                    selectedDateTime
                      ? 'text-[#00e6b4]'
                      : isDragOver
                      ? 'text-[#00e6b4]'
                      : 'text-white'
                  }`}
                >
                  {selectedDateTime
                    ? '시간이 설정됨'
                    : isDragOver
                    ? '파일을 여기에 놓으세요'
                    : '2. 시작 시간 설정'}
                </h2>

                <p className="text-gray-400 mb-8 leading-relaxed text-center">
                  {selectedDateTime ? (
                    <>
                      설정된 시간:{' '}
                      {new Date(selectedDateTime).toLocaleString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                      <br />
                      <span className="text-[#00e6b4]">✓ 시간 설정 완료</span>
                    </>
                  ) : isDragOver ? (
                    '비디오 파일을 드롭하여 분석을 시작하세요'
                  ) : (
                    <>
                      영상의 시작 날짜와 시간을 설정하세요
                      <br />
                      <span className="text-sm">
                        정확한 시간 분석을 위해 필요합니다
                      </span>
                    </>
                  )}
                </p>

                {/* 날짜/시간 선택 버튼 또는 변경 버튼 */}
                {!isDragOver && (
                  <div className="flex flex-col gap-4 w-full max-w-xs">
                    {/* 커스텀 날짜/시간 선택기 */}
                    <CustomDateTimePicker
                      value={selectedDateTime}
                      onChange={setSelectedDateTime}
                    />

                    {!selectedDateTime ? (
                      <Button
                        onClick={handleDateTimeSelect}
                        className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] px-8 py-3 text-lg font-semibold w-full"
                      >
                        <CalendarDays className="h-5 w-5 mr-2" />
                        현재 시간으로 설정
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setSelectedDateTime('')}
                        variant="outline"
                        className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c] px-8 py-3 text-lg font-semibold w-full"
                      >
                        <CalendarDays className="h-5 w-5 mr-2" />
                        시간 다시 설정
                      </Button>
                    )}
                  </div>
                )}

                {/* 안내 텍스트 */}
                <div className="mt-8 text-sm text-gray-500 text-center">
                  <p>CCTV 영상의 실제 촬영 시간을 입력하세요</p>
                  <p>분석 결과의 정확도가 향상됩니다</p>
                </div>
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
