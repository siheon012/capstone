'use client';

import type React from 'react';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  Calendar,
  Clock,
  HardDrive,
  MessageSquare,
  Trash2,
  Play,
  Download,
  Search,
  Filter,
  Upload,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UploadedVideo } from '@/app/types/video';
import { getUploadedVideos, deleteVideo } from '@/app/actions/video-service';
import Link from 'next/link';
import SmartHeader from '@/components/smart-header';
import DynamicHistorySidebar from '@/components/dynamic-history-sidebar';
import ToastNotification, { type Toast } from '@/components/toast-notification';

// 토스트 알림을 위한 import 제거 (useToast 대신 자체 토스트 시스템 사용)
// import { useToast } from '@/components/ui/use-toast';

export default function UploadedVideoPage() {
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date');
  const [currentPage, setCurrentPage] = useState(1);
  const [videosPerPage] = useState(5); // 페이지당 5개 비디오
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string>();
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // useToast 훅 제거 - 자체 토스트 시스템 사용
  // const { toast } = useToast();

  // 토스트 알림 함수
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  // 중복 토스트 방지 함수
  const addToastIfNotExists = (toast: Omit<Toast, 'id'>) => {
    // 같은 타입과 제목의 토스트가 이미 있는지 확인
    const existingToast = toasts.find(
      (existingToast) =>
        existingToast.type === toast.type && existingToast.title === toast.title
    );

    if (!existingToast) {
      addToast(toast);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    loadVideos();
  }, []);

  // 모바일 감지 useEffect
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 모바일에서 히스토리 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isMobile && historyOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isMobile, historyOpen]);

  // 검색이나 필터 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterEvent, sortBy]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const response = await getUploadedVideos();
      if (response.success) {
        setVideos(response.data);
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setLoading(false);
    }
  };

  // 히스토리 새로고침 핸들러 함수
  const handleHistoryRefresh = async () => {
    try {
      // 중복 방지로 로딩 토스트 추가
      addToastIfNotExists({
        type: 'info',
        title: '히스토리 새로고침',
        message: '히스토리를 불러오는 중...',
        duration: 1500,
      });

      // 트리거 값을 변경하여 DynamicHistorySidebar에서 새로고침 실행
      setHistoryRefreshTrigger((prev) => prev + 1);

      // 잠시 대기 후 성공 토스트 표시 (로딩 토스트와 겹치지 않도록)
      setTimeout(() => {
        addToastIfNotExists({
          type: 'success',
          title: '새로고침 완료',
          message: '히스토리가 성공적으로 새로고침되었습니다.',
          duration: 2000,
        });
      }, 1000);
    } catch (error) {
      console.error('History refresh error:', error);
      addToast({
        type: 'error',
        title: '새로고침 실패',
        message: '히스토리 새로고침 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  // 히스토리 선택 핸들러 함수
  const handleSelectHistory = (historyItem: any) => {
    try {
      setCurrentHistoryId(historyItem.id);

      if (historyItem.videoInfo?.url) {
        // 비디오 URL에서 비디오 ID 추출
        const videoId = historyItem.videoInfo.url.split('/').pop();
        if (videoId) {
          window.location.href = `/uploaded_video/${videoId}`;
        }
      }

      // 히스토리 선택 후 사이드바 닫기
      setHistoryOpen(false);

      // 히스토리 로드 토스트
      addToast({
        type: 'info',
        title: '히스토리 로드',
        message: `"${historyItem.title}" 대화를 불러왔습니다.`,
        duration: 2000,
      });
    } catch (error) {
      console.error('History selection error:', error);
      addToast({
        type: 'error',
        title: '히스토리 로드 실패',
        message: '히스토리를 불러오는 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  // 히스토리 닫기 함수
  const handleCloseHistory = () => {
    setHistoryOpen(false);
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 이미 삭제 중인 경우 리턴
    if (deletingVideoId) return;

    if (confirm('이 비디오와 모든 관련 세션을 삭제하시겠습니까?')) {
      try {
        // 삭제 시작 - 로딩 상태 설정
        setDeletingVideoId(videoId);

        const success = await deleteVideo(videoId);

        if (success) {
          // UI에서 비디오 제거
          setVideos((prev) => prev.filter((video) => video.id !== videoId));
          setHistoryRefreshTrigger((prev) => prev + 1);
        }
      } catch (error) {
        console.error('Delete video error:', error);
      } finally {
        // 로딩 상태 해제
        setDeletingVideoId(null);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 필터링 및 정렬
  const allFilteredAndSortedVideos = videos
    .filter((video) => {
      const matchesSearch =
        video.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filterEvent === 'all' ||
        (filterEvent === 'none' && !video.majorEvent) ||
        video.majorEvent === filterEvent;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return (
            new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
          );
        case 'name':
          return a.originalName.localeCompare(b.originalName);
        case 'size':
          return b.size - a.size;
        case 'duration':
          return b.duration - a.duration;
        default:
          return 0;
      }
    });

  // 현재 페이지에 표시할 비디오들
  const totalVideos = allFilteredAndSortedVideos.length;
  const totalPages = Math.ceil(totalVideos / videosPerPage);
  const startIndex = (currentPage - 1) * videosPerPage;
  const endIndex = startIndex + videosPerPage;
  const currentVideos = allFilteredAndSortedVideos.slice(startIndex, endIndex);

  // 페이지 변경 시 맨 위로 스크롤
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 로딩 상태 렌더링
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex flex-col">
        {/* Header */}
        <header className="bg-[#242a38] border-b border-[#2a3142] shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 flex items-center justify-center">
                  <img
                    src="/images/ds_logo_transparent.png"
                    alt="Deep Sentinel Logo"
                    className="w-full h-full object-contain scale-[1.7]"
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Deep Sentinel
                  </h1>
                  <span className="text-sm text-gray-400">업로드된 비디오</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Loading */}
        <main className="flex-1 container mx-auto py-8 px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[#2a3142] rounded w-1/4"></div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-[#2a3142] rounded"></div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // 삭제 중 상태 렌더링
  if (deletingVideoId) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-[#00e6b4] rounded-full mx-auto mb-4 animate-bounce"></div>
          <p className="text-white text-lg">삭제 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex flex-col">
      {/* Smart Header */}
      <SmartHeader
        currentPage="uploaded_video"
        historyOpen={historyOpen}
        onHistoryToggle={() => setHistoryOpen(!historyOpen)}
        onHistoryRefresh={handleHistoryRefresh}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      {/* Main Content - 헤더 높이만큼 패딩 추가 */}
      <main
        className={`flex-1 container mx-auto py-4 px-2 sm:py-8 sm:px-4 pt-32 sm:pt-28 transition-all duration-300 ${
          historyOpen && !isMobile
            ? 'blur-sm scale-95 opacity-75'
            : 'blur-0 scale-100 opacity-100'
        }`}
      >
        {/* 페이지 헤더 */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            업로드된 비디오
          </h2>
          <p className="text-sm sm:text-base text-gray-400">
            CCTV 영상 분석을 위해 업로드된 모든 비디오를 관리할 수 있습니다.
          </p>
        </div>

        {/* 검색 및 필터 */}
        <Card className="mb-6 bg-[#242a38] border-0 shadow-lg">
          <CardContent className="p-3 sm:p-6">
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-4 sm:gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="비디오 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-[#1a1f2c] border-[#2a3142] text-white w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:contents">
                <Select value={filterEvent} onValueChange={setFilterEvent}>
                  <SelectTrigger className="bg-[#1a1f2c] border-[#2a3142] text-white text-sm">
                    <Filter className="h-4 w-4 mr-1" />
                    <SelectValue placeholder="사건 필터" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#242a38] border-[#2a3142]">
                    <SelectItem value="all">모든 사건</SelectItem>
                    <SelectItem value="none">사건 없음</SelectItem>
                    <SelectItem value="도난">도난</SelectItem>
                    <SelectItem value="쓰러짐">쓰러짐</SelectItem>
                    <SelectItem value="폭행">폭행</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-[#1a1f2c] border-[#2a3142] text-white text-sm">
                    <SelectValue placeholder="정렬" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#242a38] border-[#2a3142]">
                    <SelectItem value="date">날짜순</SelectItem>
                    <SelectItem value="name">이름순</SelectItem>
                    <SelectItem value="size">크기순</SelectItem>
                    <SelectItem value="duration">시간순</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center text-xs sm:text-sm text-gray-400 justify-center sm:justify-start">
                <Video className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  총 {totalVideos}개 ({currentPage}/{totalPages})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 비디오 목록 */}
        <div className="space-y-4">
          {currentVideos.length === 0 ? (
            <Card className="bg-[#242a38] border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <Upload className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  업로드된 비디오가 없습니다
                </h3>
                <p className="text-gray-400 mb-6">
                  CCTV 영상을 업로드하여 분석을 시작하세요.
                </p>
                <Link href="/">
                  <Button className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]">
                    <Upload className="h-4 w-4 mr-2" />
                    비디오 업로드하기
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            currentVideos.map((video) => (
              <Card
                key={video.id}
                className="bg-[#242a38] border-0 shadow-lg hover:bg-[#2a3142] transition-colors"
              >
                <CardContent className="p-3 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-6">
                    {/* 썸네일 */}
                    <div className="w-full sm:w-48 flex-shrink-0">
                      <Link href={`/uploaded_video/${video.id}/sessions`}>
                        <div className="w-full h-32 sm:w-48 sm:h-28 bg-[#1a1f2c] rounded-lg overflow-hidden border border-[#2a3142] hover:border-[#00e6b4] transition-colors cursor-pointer">
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="h-8 w-8 text-gray-500" />
                          </div>
                        </div>
                      </Link>
                    </div>

                    {/* 비디오 정보 */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
                        <div className="min-w-0 flex-1">
                          <Link href={`/uploaded_video/${video.id}/sessions`}>
                            <h3 className="text-base sm:text-lg font-semibold text-white mb-1 truncate hover:text-[#00e6b4] transition-colors cursor-pointer">
                              {video.originalName}
                            </h3>
                          </Link>
                          {video.description && (
                            <p className="text-sm text-gray-400 mb-2 line-clamp-2">
                              {video.description}
                            </p>
                          )}
                        </div>

                        {/* 주요 사건 배지 */}
                        {video.majorEvent && (
                          <Badge
                            className={`flex-shrink-0 text-xs ${
                              video.majorEvent === '도난'
                                ? 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                                : video.majorEvent === '쓰러짐'
                                ? 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30'
                                : video.majorEvent === '폭행'
                                ? 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30'
                                : 'bg-gray-500 bg-opacity-20 text-gray-400 border border-gray-500 border-opacity-30'
                            }`}
                          >
                            {video.majorEvent}
                          </Badge>
                        )}
                      </div>

                      {/* 메타데이터 */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4">
                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">
                            {formatDuration(video.duration)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400">
                          <HardDrive className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">
                            {formatFileSize(video.size)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400 col-span-2 sm:col-span-1">
                          <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">
                            {formatDate(video.uploadDate)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-400 col-span-2 sm:col-span-1">
                          <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate">
                            {video.chatCount}개 채팅
                          </span>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="flex gap-2">
                          <Link
                            href={`/uploaded_video/${video.id}/sessions`}
                            className="flex-1 sm:flex-none"
                          >
                            <Button
                              size="sm"
                              className="bg-[#6c5ce7] hover:bg-[#5a4fcf] text-white w-full sm:w-auto text-xs sm:text-sm"
                            >
                              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                              세션
                            </Button>
                          </Link>

                          <Link
                            href={`/uploaded_video/${video.id}`}
                            className="flex-1 sm:flex-none"
                          >
                            <Button
                              size="sm"
                              className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c] w-full sm:w-auto text-xs sm:text-sm"
                            >
                              <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                              분석
                            </Button>
                          </Link>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] flex-1 sm:flex-none text-xs sm:text-sm"
                            onClick={() =>
                              window.open(video.filePath, '_blank')
                            }
                          >
                            <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                            다운로드
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#2a3142] text-gray-300 hover:text-red-400 hover:border-red-400 flex-1 sm:flex-none text-xs sm:text-sm"
                            onClick={(e) => handleDeleteVideo(video.id, e)}
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                            삭제
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <Card className="mt-6 bg-[#242a38] border-0 shadow-lg">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs sm:text-sm text-gray-400 order-2 sm:order-1">
                  {startIndex + 1}-{Math.min(endIndex, totalVideos)} /{' '}
                  {totalVideos}개
                </div>

                <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2">
                  {/* 이전 페이지 버튼 */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm px-2 sm:px-3"
                  >
                    이전
                  </Button>

                  {/* 페이지 번호들 - 모바일에서는 더 적게 표시 */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (page) => {
                        // 모바일에서는 현재 페이지 주변 1개씩만 표시
                        const isMobileView = window.innerWidth <= 640;
                        const showRange = isMobileView ? 1 : 2;
                        const showPage =
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - showRange &&
                            page <= currentPage + showRange);

                        if (!showPage) {
                          if (
                            page === currentPage - (showRange + 1) ||
                            page === currentPage + (showRange + 1)
                          ) {
                            return (
                              <span
                                key={page}
                                className="px-1 text-gray-500 text-xs"
                              >
                                ...
                              </span>
                            );
                          }
                          return null;
                        }

                        return (
                          <Button
                            key={page}
                            variant={
                              currentPage === page ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => handlePageChange(page)}
                            className={`text-xs sm:text-sm px-2 sm:px-3 min-w-[32px] sm:min-w-[36px] ${
                              currentPage === page
                                ? 'bg-[#00e6b4] text-[#1a1f2c] hover:bg-[#00c49c]'
                                : 'border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4]'
                            }`}
                          >
                            {page}
                          </Button>
                        );
                      }
                    )}
                  </div>

                  {/* 다음 페이지 버튼 */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm px-2 sm:px-3"
                  >
                    다음
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* History Sidebar - 모바일에서는 전체 화면으로 */}
      {isMobile ? (
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

          <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
            <DynamicHistorySidebar
              onSelectHistory={handleSelectHistory}
              currentHistoryId={currentHistoryId}
              onClose={handleCloseHistory}
              refreshTrigger={historyRefreshTrigger}
              onHistoryRefresh={handleHistoryRefresh}
            />
          </div>
        </div>
      ) : (
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
          <DynamicHistorySidebar
            onSelectHistory={handleSelectHistory}
            currentHistoryId={currentHistoryId}
            onClose={handleCloseHistory}
            refreshTrigger={historyRefreshTrigger}
            onHistoryRefresh={handleHistoryRefresh}
          />
        </div>
      )}

      {/* History Backdrop - 데스크톱에서만 표시 */}
      {historyOpen && !isMobile && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm bg-gradient-to-r from-[#1a1f2c]/20 via-[#00e6b4]/5 to-[#3694ff]/10"
          style={{
            top: '73px',
            height: 'calc(100vh - 73px)',
          }}
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* 토스트 알림 */}
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Footer */}
      <footer
        className={`bg-[#242a38] border-t border-[#2a3142] mt-auto transition-all duration-300 ${
          historyOpen ? 'blur-sm opacity-75' : 'blur-0 opacity-100'
        }`}
      >
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-[#00e6b4] mb-3">
              AI 기반 CCTV 영상 분석 플랫폼
            </h2>
            <p className="text-gray-400 text-lg">
              실시간 이벤트 감지 • 스마트 보안 솔루션 • Deep Sentinel
            </p>
          </div>

          <Separator className="bg-[#2a3142] my-6" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-gray-400">
              <span>© 2024 Deep Sentinel. All rights reserved.</span>
            </div>

            <div className="flex items-center gap-2 text-gray-300">
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
                Contact
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
