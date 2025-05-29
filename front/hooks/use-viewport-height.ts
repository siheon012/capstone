'use client';

import { useState, useEffect } from 'react';

/**
 * 모바일 브라우저의 동적 뷰포트 높이를 추적하는 커스텀 훅
 * iOS Safari, Chrome 등에서 주소창/하단 UI가 변화할 때를 감지
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // 초기 설정
    const updateViewportHeight = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      
      // 모바일 감지
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent.toLowerCase()
      );
      const isSmallScreen = vw <= 768;
      const mobile = isMobileDevice || isSmallScreen;
      
      setIsMobile(mobile);
      setViewportHeight(vh);
      
      // CSS 변수로 실제 뷰포트 높이 설정
      document.documentElement.style.setProperty('--actual-vh', `${vh}px`);
      
      // 디버깅 정보 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        console.log('Viewport updated:', {
          innerHeight: vh,
          innerWidth: vw,
          screenHeight: window.screen.height,
          isMobile: mobile,
          userAgent: navigator.userAgent,
        });
      }
    };

    // 초기 실행
    updateViewportHeight();

    // 리사이즈 이벤트 리스너
    const handleResize = () => {
      // 디바운스를 위한 타이머
      clearTimeout((window as any).viewportTimer);
      (window as any).viewportTimer = setTimeout(updateViewportHeight, 100);
    };

    // 방향 전환 감지
    const handleOrientationChange = () => {
      // 방향 전환 후 약간의 지연을 두고 실행
      setTimeout(updateViewportHeight, 300);
    };

    // 스크롤 감지 (모바일에서 주소창 변화 감지)
    const handleScroll = () => {
      if (isMobile) {
        clearTimeout((window as any).scrollTimer);
        (window as any).scrollTimer = setTimeout(updateViewportHeight, 50);
      }
    };

    // Visual Viewport API 지원 확인 (더 정확한 뷰포트 추적)
    const handleVisualViewportChange = () => {
      if ('visualViewport' in window) {
        const visualViewport = window.visualViewport!;
        setViewportHeight(visualViewport.height);
        document.documentElement.style.setProperty('--actual-vh', `${visualViewport.height}px`);
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Visual Viewport API 지원 시 사용
    if ('visualViewport' in window) {
      window.visualViewport!.addEventListener('resize', handleVisualViewportChange);
    }

    // 페이지 가시성 변화 감지 (앱 전환 등)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(updateViewportHeight, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 정리 함수
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if ('visualViewport' in window) {
        window.visualViewport!.removeEventListener('resize', handleVisualViewportChange);
      }
      
      // 타이머 정리
      clearTimeout((window as any).viewportTimer);
      clearTimeout((window as any).scrollTimer);
    };
  }, [isMobile]);

  return {
    viewportHeight,
    isMobile,
    // 안전한 높이 계산 (모바일 브라우저 UI 고려)
    safeHeight: isMobile ? Math.max(viewportHeight - 60, 400) : viewportHeight,
    // CSS 변수로 사용할 수 있는 값
    cssHeight: `${viewportHeight}px`,
    cssVar: 'var(--actual-vh, 100vh)',
  };
}

/**
 * 모바일 브라우저 안전 영역을 고려한 스타일을 생성하는 유틸리티
 */
export function getMobileSafeStyles(isMobile: boolean, viewportHeight: number) {
  if (!isMobile) {
    return {};
  }

  return {
    height: `${viewportHeight}px`,
    maxHeight: `${viewportHeight}px`,
    paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
    marginBottom: 'max(env(keyboard-inset-height, 0px), env(safe-area-inset-bottom, 0px))',
    minHeight: 'var(--actual-vh, 100vh)',
  };
}
