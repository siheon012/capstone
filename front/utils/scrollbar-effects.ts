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

  /* 모바일 최적화 기능은 제거됨 - 모바일 브라우저에서 커스텀 스크롤바 지원이 제한적이므로 */

  /**
   * 리소스 정리
   */
  public destroy() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    // 이벤트 리스너 제거 등의 정리 작업
    document.documentElement.classList.remove(
      'scrolling', 'fast-scroll', 'scrollbar-celebration'
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