/**
 * 🎨 재밌는 스크롤바 효과 유틸리티
 * 동적 스크롤바 테마와 이펙트를 관리합니다
 */

export type ScrollbarTheme = 
  | 'default' 
  | 'cyberpunk' 
  | 'galaxy' 
  | 'party' 
  | 'elegant' 
  | 'gamer'
  | 'spring'
  | 'summer'
  | 'autumn' 
  | 'winter';

export interface ScrollbarEffectOptions {
  theme?: ScrollbarTheme;
  enableParticles?: boolean;
  enableSoundEffects?: boolean;
  speedBasedEffects?: boolean;
  celebrationMode?: boolean;
}

class ScrollbarEffectManager {
  private currentTheme: ScrollbarTheme = 'default';
  private scrollSpeed = 0;
  private lastScrollTime = 0;
  private particles: Array<{ x: number; y: number; life: number }> = [];
  private isScrolling = false;
  private scrollTimeout: NodeJS.Timeout | null = null;

  constructor(private options: ScrollbarEffectOptions = {}) {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // 스크롤 이벤트 리스너 등록
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateScrollEffects();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // 스크롤 시작/종료 감지
    window.addEventListener('scroll', this.handleScrollStart.bind(this), { passive: true });
  }

  private handleScrollStart() {
    // default 테마일 때는 동적 효과 비활성화
    if (this.currentTheme === 'default') {
      return;
    }
    
    const now = Date.now();
    this.scrollSpeed = now - this.lastScrollTime;
    this.lastScrollTime = now;
    
    // 스크롤 중 클래스 추가
    if (!this.isScrolling) {
      this.isScrolling = true;
      document.documentElement.classList.add('scrolling');
      
      // 빠른 스크롤 감지
      if (this.options.speedBasedEffects && this.scrollSpeed < 16) {
        document.documentElement.classList.add('fast-scroll');
      }
    }

    // 스크롤 종료 감지
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
      document.documentElement.classList.remove('scrolling', 'fast-scroll');
    }, 150);
  }

  private updateScrollEffects() {
    if (this.options.enableParticles) {
      this.updateParticles();
    }
    
    // 스크롤 진행률 기반 색상 변화
    const scrollProgress = this.getScrollProgress();
    this.updateScrollbarColorByProgress(scrollProgress);
  }

  private getScrollProgress(): number {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(scrollTop / scrollHeight, 1);
  }

  private updateScrollbarColorByProgress(progress: number) {
    const hue = Math.floor(progress * 360);
    const saturation = 70 + (progress * 30);
    const lightness = 50 + (Math.sin(progress * Math.PI) * 20);
    
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    
    // CSS 변수로 동적 색상 업데이트
    document.documentElement.style.setProperty('--dynamic-scrollbar-color', color);
  }

  private updateParticles() {
    // 간단한 파티클 시스템 (실제 DOM 조작 없이 개념만)
    this.particles = this.particles.filter(particle => {
      particle.life -= 0.02;
      return particle.life > 0;
    });

    // 새 파티클 생성 (스크롤 중일 때만)
    if (this.isScrolling && Math.random() < 0.3) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        life: 1
      });
    }
  }

  /**
   * 스크롤바 테마 변경
   */
  public setTheme(theme: ScrollbarTheme) {
    // 기존 테마 클래스 제거
    const themeClasses = ['scrollbar-cyberpunk', 'scrollbar-galaxy', 'scrollbar-party', 
                         'scrollbar-elegant', 'scrollbar-gamer', 'scrollbar-spring',
                         'scrollbar-summer', 'scrollbar-autumn', 'scrollbar-winter'];
    
    document.documentElement.classList.remove(...themeClasses);
    
    // 새 테마 적용 - default 테마는 아무 클래스도 추가하지 않음
    if (theme !== 'default') {
      document.documentElement.classList.add(`scrollbar-${theme}`);
    }
    
    this.currentTheme = theme;
    
    // default 테마일 때는 동적 효과도 비활성화
    if (theme === 'default') {
      document.documentElement.classList.remove('scrolling', 'fast-scroll');
    }
  }

  /**
   * 축하 모드 활성화 (특별한 이벤트용)
   */
  public activateCelebrationMode(duration = 5000) {
    document.documentElement.classList.add('scrollbar-celebration');
    
    setTimeout(() => {
      document.documentElement.classList.remove('scrollbar-celebration');
    }, duration);
  }

  /**
   * 계절에 맞는 테마 자동 설정
   */
  public setSeasonalTheme() {
    const month = new Date().getMonth();
    let seasonTheme: ScrollbarTheme;
    
    if (month >= 2 && month <= 4) {
      seasonTheme = 'spring';
    } else if (month >= 5 && month <= 7) {
      seasonTheme = 'summer';
    } else if (month >= 8 && month <= 10) {
      seasonTheme = 'autumn';
    } else {
      seasonTheme = 'winter';
    }
    
    this.setTheme(seasonTheme);
  }

  /**
   * 시간대에 맞는 테마 설정
   */
  public setTimeBasedTheme() {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 12) {
      this.setTheme('spring'); // 아침 - 상쾌한 느낌
    } else if (hour >= 12 && hour < 18) {
      this.setTheme('summer'); // 낮 - 활기찬 느낌
    } else if (hour >= 18 && hour < 21) {
      this.setTheme('autumn'); // 저녁 - 따뜻한 느낌
    } else {
      this.setTheme('galaxy'); // 밤 - 신비로운 느낌
    }
  }

  /**
   * 사용자 활동에 따른 동적 테마
   */
  public setActivityBasedTheme(activityLevel: 'low' | 'medium' | 'high') {
    switch (activityLevel) {
      case 'low':
        this.setTheme('elegant');
        break;
      case 'medium':
        this.setTheme('default');
        break;
      case 'high':
        this.setTheme('party');
        break;
    }
  }

  /**
   * 모바일 최적화 테마
   */
  public enableMobileOptimization() {
    if (typeof window !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       'ontouchstart' in window || 
                       window.innerWidth <= 768;
      
      if (isMobile) {
        document.documentElement.classList.add('mobile-scroll');
        document.body.classList.add('mobile-scrollbar-active');
        
        // 모바일에서 스크롤바 강제 표시 및 터치 최적화
        const style = document.createElement('style');
        style.textContent = `
          /* 기본 모바일 스크롤바 스타일 */
          .mobile-scrollbar-active :not(.no-custom-scrollbar)::-webkit-scrollbar {
            width: 10px !important;
            height: 10px !important;
            display: block !important;
            -webkit-appearance: none !important;
            background: rgba(26, 31, 44, 0.8) !important;
            border-radius: 5px !important;
          }
          
          .mobile-scrollbar-active :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, 
              #00e6b4 0%, 
              #4ecdc4 50%, 
              #96ceb4 100%
            ) !important;
            border-radius: 5px !important;
            border: 2px solid rgba(255, 255, 255, 0.3) !important;
            min-height: 40px !important;
            box-shadow: 0 2px 8px rgba(0, 230, 180, 0.4) !important;
          }
          
          .mobile-scrollbar-active :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb:active {
            background: linear-gradient(135deg, 
              #6c5ce7 0%, 
              #a29bfe 25%,
              #74b9ff 50%,
              #fd79a8 75%,
              #e84393 100%
            ) !important;
            transform: scale(1.1) !important;
            box-shadow: 0 4px 16px rgba(108, 92, 231, 0.6) !important;
          }
          
          .mobile-scrollbar-active :not(.no-custom-scrollbar)::-webkit-scrollbar-track {
            background: rgba(26, 31, 44, 0.6) !important;
            border-radius: 5px !important;
            border: 1px solid rgba(0, 230, 180, 0.2) !important;
          }
          
          /* 터치 스크롤 애니메이션 */
          .mobile-scrollbar-active.touch-scrolling :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb {
            animation: touchScrollPulse 0.6s ease-out !important;
          }
          
          @keyframes touchScrollPulse {
            0% { 
              transform: scale(1) !important; 
              box-shadow: 0 2px 8px rgba(0, 230, 180, 0.4) !important;
            }
            50% { 
              transform: scale(1.15) !important; 
              box-shadow: 0 6px 20px rgba(0, 230, 180, 0.8) !important;
            }
            100% { 
              transform: scale(1) !important; 
              box-shadow: 0 2px 8px rgba(0, 230, 180, 0.4) !important;
            }
          }
        `;
        
        document.head.appendChild(style);
        
        // 향상된 터치 스크롤 감지
        this.addAdvancedTouchScrollHighlight();
      }
    }
  }

  /**
   * 고급 터치 스크롤 하이라이트 기능
   */
  private addAdvancedTouchScrollHighlight() {
    let touchStartY = 0;
    let touchStartTime = 0;
    let isQuickFlick = false;
    
    // 터치 시작
    document.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      document.body.classList.add('touch-scrolling');
    }, { passive: true });
    
    // 터치 이동 (스크롤 감지)
    document.addEventListener('touchmove', (e) => {
      const touchMoveY = e.touches[0].clientY;
      const deltaY = Math.abs(touchMoveY - touchStartY);
      const deltaTime = Date.now() - touchStartTime;
      
      // 빠른 플링 제스처 감지 (100ms 안에 50px 이상 이동)
      if (deltaTime < 100 && deltaY > 50) {
        isQuickFlick = true;
        document.body.classList.add('quick-flick');
        
        // 빠른 플링 효과 스타일 추가
        if (!document.getElementById('quick-flick-style')) {
          const quickFlickStyle = document.createElement('style');
          quickFlickStyle.id = 'quick-flick-style';
          quickFlickStyle.textContent = `
            .quick-flick :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb {
              background: linear-gradient(135deg, 
                #ff6b6b 0%,
                #4ecdc4 25%, 
                #45b7d1 50%,
                #96ceb4 75%,
                #feca57 100%
              ) !important;
              animation: quickFlickGlow 0.8s ease-out !important;
            }
            
            @keyframes quickFlickGlow {
              0% { 
                box-shadow: 0 0 5px rgba(255, 107, 107, 0.3) !important;
              }
              50% { 
                box-shadow: 0 0 25px rgba(255, 107, 107, 0.8), 
                           0 0 35px rgba(78, 205, 196, 0.6) !important;
                transform: scale(1.2) !important;
              }
              100% { 
                box-shadow: 0 2px 8px rgba(0, 230, 180, 0.4) !important;
                transform: scale(1) !important;
              }
            }
          `;
          document.head.appendChild(quickFlickStyle);
        }
      }
    }, { passive: true });
    
    // 터치 종료
    document.addEventListener('touchend', () => {
      // 터치 효과 제거 (지연)
      setTimeout(() => {
        document.body.classList.remove('touch-scrolling');
        if (isQuickFlick) {
          setTimeout(() => {
            document.body.classList.remove('quick-flick');
            isQuickFlick = false;
          }, 800);
        }
      }, 200);
    }, { passive: true });
    
    // 관성 스크롤 감지 (iOS Safari)
    let isInertialScrolling = false;
    document.addEventListener('scroll', () => {
      if (!isInertialScrolling) {
        isInertialScrolling = true;
        document.body.classList.add('inertial-scrolling');
        
        // 관성 스크롤 효과 스타일
        if (!document.getElementById('inertial-scroll-style')) {
          const inertialStyle = document.createElement('style');
          inertialStyle.id = 'inertial-scroll-style';
          inertialStyle.textContent = `
            .inertial-scrolling :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb {
              animation: inertialScrollFade 1.5s ease-out !important;
            }
            
            @keyframes inertialScrollFade {
              0% { 
                opacity: 1 !important;
                background: linear-gradient(135deg, #00e6b4 0%, #4ecdc4 50%, #96ceb4 100%) !important;
              }
              50% { 
                opacity: 0.8 !important;
                background: linear-gradient(135deg, #74b9ff 0%, #0984e3 50%, #6c5ce7 100%) !important;
              }
              100% { 
                opacity: 1 !important;
                background: linear-gradient(135deg, #00e6b4 0%, #4ecdc4 50%, #96ceb4 100%) !important;
              }
            }
          `;
          document.head.appendChild(inertialStyle);
        }
        
        // 관성 스크롤 종료 감지
        setTimeout(() => {
          isInertialScrolling = false;
          document.body.classList.remove('inertial-scrolling');
        }, 1500);
      }
    }, { passive: true });
  }

  /**
   * 터치 스크롤 시 시각적 피드백 추가
   */
  private addTouchScrollHighlight() {
    let touchScrollTimeout: NodeJS.Timeout | null = null;
    
    const highlightScrollbar = () => {
      document.documentElement.classList.add('touch-scrolling');
      
      if (touchScrollTimeout) {
        clearTimeout(touchScrollTimeout);
      }
      
      touchScrollTimeout = setTimeout(() => {
        document.documentElement.classList.remove('touch-scrolling');
      }, 1000);
    };
    
    window.addEventListener('touchstart', highlightScrollbar, { passive: true });
    window.addEventListener('touchmove', highlightScrollbar, { passive: true });
    
    // CSS 스타일 추가
    const touchStyle = document.createElement('style');
    touchStyle.textContent = `
      .touch-scrolling :not(.no-custom-scrollbar)::-webkit-scrollbar-thumb {
        box-shadow: 
          0 0 15px rgba(0, 230, 180, 0.8),
          inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        transform: scale(1.1) !important;
      }
    `;
    document.head.appendChild(touchStyle);
  }

  /**
   * 리소스 정리
   */
  public destroy() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    // 이벤트 리스너 제거 등의 정리 작업
    document.documentElement.classList.remove(
      'scrolling', 'fast-scroll', 'mobile-scroll', 'scrollbar-celebration'
    );
  }
}

// 전역 인스턴스 생성
let scrollbarManager: ScrollbarEffectManager | null = null;

export const initScrollbarEffects = (options?: ScrollbarEffectOptions) => {
  if (typeof window === 'undefined') return null;
  
  if (scrollbarManager) {
    scrollbarManager.destroy();
  }
  
  scrollbarManager = new ScrollbarEffectManager(options);
  return scrollbarManager;
};

export const getScrollbarManager = () => scrollbarManager;

// 편의 함수들
export const setScrollbarTheme = (theme: ScrollbarTheme) => {
  scrollbarManager?.setTheme(theme);
};

export const activateScrollbarCelebration = (duration?: number) => {
  scrollbarManager?.activateCelebrationMode(duration);
};

export const enableSeasonalScrollbar = () => {
  scrollbarManager?.setSeasonalTheme();
};

export const enableTimeBasedScrollbar = () => {
  scrollbarManager?.setTimeBasedTheme();
};

// React Hook (옵션)
export const useScrollbarEffects = (options?: ScrollbarEffectOptions) => {
  if (typeof window === 'undefined') return null;
  
  const manager = initScrollbarEffects(options);
  
  // 컴포넌트 언마운트 시 정리
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      manager?.destroy();
    });
  }
  
  return manager;
};
