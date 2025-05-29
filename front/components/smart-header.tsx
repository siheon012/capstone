'use client';

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  History,
  Github,
  Store,
  Menu,
  X,
  Video,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

interface SmartHeaderProps {
  currentPage?: 'home' | 'uploaded_video' | 'video_detail' | 'sessions';
  historyOpen?: boolean;
  onHistoryToggle?: () => void;
  onHistoryRefresh?: () => void;
  mobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
  children?: React.ReactNode;
}

export default function SmartHeader({
  currentPage = 'home',
  historyOpen = false,
  onHistoryToggle,
  onHistoryRefresh,
  mobileMenuOpen = false,
  onMobileMenuToggle,
  children,
}: SmartHeaderProps) {
  // 디버깅을 위한 콘솔 로그 추가
  console.log('SmartHeader 상태:', { historyOpen, mobileMenuOpen });

  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;

      // 페이지 최상단에 있는지 확인
      setIsAtTop(scrollY < 10);

      // 스크롤 방향 감지
      if (Math.abs(scrollY - lastScrollY) < 5) {
        ticking = false;
        return;
      }

      if (scrollY > lastScrollY && scrollY > 100) {
        // 아래로 스크롤 중이고 100px 이상 스크롤했을 때 헤더 숨기기
        setIsVisible(false);
      } else {
        // 위로 스크롤 중이거나 상단 근처일 때 헤더 보이기
        setIsVisible(true);
      }

      setLastScrollY(scrollY);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    // 초기 스크롤 위치 설정
    setLastScrollY(window.scrollY);
    setIsAtTop(window.scrollY < 10);

    window.addEventListener('scroll', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [lastScrollY]);

  // 히스토리가 열렸을 때 배경 스크롤 방지
  useEffect(() => {
    if (historyOpen) {
      // 현재 스크롤 위치 저장
      const scrollY = window.scrollY;

      // iOS와 모바일 브라우저 감지
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ) || window.innerWidth <= 768;

      // 실제 뷰포트 높이 계산 (모바일 브라우저 UI 고려)
      const viewportHeight = window.innerHeight;
      document.documentElement.style.setProperty(
        '--actual-vh',
        `${viewportHeight}px`
      );

      // body 스크롤 막기 - 모바일 최적화
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.height = isMobile ? `${viewportHeight}px` : '100%';
      document.body.style.overflow = 'hidden';

      // iOS Safari 추가 최적화
      if (isIOS || isMobile) {
        (document.body.style as any).webkitOverflowScrolling = 'touch';
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.style.height = `${viewportHeight}px`;
      }

      // 터치 이벤트 차단 (iOS Safari 대응)
      const preventTouch = (e: TouchEvent) => {
        if (e.target && !(e.target as Element).closest('.history-content')) {
          e.preventDefault();
        }
      };

      // passive: false로 설정하여 preventDefault가 동작하도록 함
      document.addEventListener('touchmove', preventTouch, { passive: false });
      document.addEventListener('touchstart', preventTouch, { passive: false });

      return () => {
        // 스크롤 복원
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.overflow = '';
        (document.body.style as any).webkitOverflowScrolling = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.height = '';

        // CSS 변수 정리
        document.documentElement.style.removeProperty('--actual-vh');

        // 스크롤 위치 복원
        window.scrollTo(0, scrollY);

        // 터치 이벤트 리스너 제거
        document.removeEventListener('touchmove', preventTouch);
        document.removeEventListener('touchstart', preventTouch);
      };
    }
  }, [historyOpen]);

  // 모바일 메뉴나 히스토리가 열려있을 때는 항상 헤더 보이기
  const shouldShowHeader =
    isVisible || isAtTop || mobileMenuOpen || historyOpen;

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 bg-[#242a38] border-b border-[#2a3142] shadow-lg transition-transform duration-300 ease-in-out ${
        shouldShowHeader ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{
        backdropFilter: 'blur(10px)',
        backgroundColor: isAtTop ? '#242a38' : 'rgba(36, 42, 56, 0.95)',
      }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <Link
            href="/"
            className="flex items-center gap-3 md:gap-6 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Adobe%20Express%20-%20file-z6kXCSxAQt4ISVmQRZCDhYxUILirrx.png"
                alt="Deep Sentinel Logo"
                className="w-full h-full object-contain scale-[1.7]"
              />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-white">
                Deep Sentinel
              </h1>
              <span className="text-xs md:text-sm text-gray-400 hidden sm:block">
                CCTV Analysis Platform
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4">
            {/* History 버튼 - 모든 페이지에서 표시 */}
            {onHistoryToggle && (
              <Button
                variant="ghost"
                size="sm"
                className={`text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c] ${
                  historyOpen ? 'text-[#00e6b4] bg-[#1a1f2c]' : ''
                }`}
                onClick={onHistoryToggle}
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
              onClick={() => window.open('https://github.com', '_blank')}
            >
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
              onClick={() => window.open('#', '_blank')}
            >
              <Store className="h-4 w-4 mr-2" />
              Store
            </Button>
            <Link href="/uploaded_video">
              <Button
                variant="ghost"
                size="sm"
                className={`text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c] ${
                  currentPage === 'uploaded_video' || currentPage === 'sessions'
                    ? 'text-[#00e6b4] bg-[#1a1f2c]'
                    : ''
                }`}
              >
                <Video className="h-4 w-4 mr-2" />
                비디오 업로드
              </Button>
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            {historyOpen ? (
              // 히스토리가 열려있을 때: 새로고침 버튼만 표시 (X 버튼 제거)
              <>
                {onHistoryRefresh && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-300 hover:text-[#00e6b4] transition-colors"
                    onClick={onHistoryRefresh}
                    title="히스토리 새로고침"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                )}
              </>
            ) : (
              // 히스토리가 닫혀있을 때: 히스토리 버튼과 메뉴 버튼
              <>
                {onHistoryToggle && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-300 hover:text-[#00e6b4] transition-colors"
                    onClick={() => {
                      onHistoryToggle();
                      // 히스토리 열 때는 모바일 메뉴를 명시적으로 닫기
                      if (onMobileMenuToggle && mobileMenuOpen) {
                        onMobileMenuToggle();
                      }
                    }}
                  >
                    <History className="h-5 w-5" />
                  </Button>
                )}
                {onMobileMenuToggle && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-300 hover:text-[#00e6b4] transition-colors"
                    onClick={onMobileMenuToggle}
                  >
                    {mobileMenuOpen ? (
                      <X className="h-5 w-5" />
                    ) : (
                      <Menu className="h-5 w-5" />
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && !historyOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-[#2a3142] pt-4">
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={() => {
                  window.open('https://github.com', '_blank');
                  if (onMobileMenuToggle) {
                    onMobileMenuToggle();
                  }
                }}
              >
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c]"
                onClick={() => {
                  window.open('#', '_blank');
                  if (onMobileMenuToggle) {
                    onMobileMenuToggle();
                  }
                }}
              >
                <Store className="h-4 w-4 mr-2" />
                Store
              </Button>
              <Link href="/uploaded_video">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`justify-start text-gray-300 hover:text-[#00e6b4] hover:bg-[#1a1f2c] ${
                    currentPage === 'uploaded_video' ||
                    currentPage === 'sessions'
                      ? 'text-[#00e6b4] bg-[#1a1f2c]'
                      : ''
                  }`}
                  onClick={() => {
                    if (onMobileMenuToggle) {
                      onMobileMenuToggle();
                    }
                  }}
                >
                  <Video className="h-4 w-4 mr-2" />
                  비디오 업로드
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* 추가 컨텐츠 (필요한 경우) */}
        {children}
      </div>
    </header>
  );
}
