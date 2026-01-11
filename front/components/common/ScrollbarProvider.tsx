'use client';

import { useEffect } from 'react';
import { initScrollbarEffects, type ScrollbarTheme, type ScrollbarEffectOptions } from '@/utils/scrollbar-effects';

interface ScrollbarProviderProps {
  theme?: ScrollbarTheme;
  options?: ScrollbarEffectOptions;
  children?: React.ReactNode;
  autoSeasonal?: boolean;
  autoTimeBasedTheme?: boolean;
  enableCelebrationMode?: boolean;
}

/**
 * 🎨 스크롤바 효과 제공자 컴포넌트
 * 앱 전체에 재밌는 스크롤바 효과를 적용합니다
 */
export default function ScrollbarProvider({ 
  theme = 'default',
  options = {},
  children,
  autoSeasonal = false,
  autoTimeBasedTheme = false,
  enableCelebrationMode = false
}: ScrollbarProviderProps) {
  
  useEffect(() => {
    // 스크롤바 효과 매니저 초기화
    const manager = initScrollbarEffects({
      enableParticles: true,
      speedBasedEffects: true,
      celebrationMode: enableCelebrationMode,
      ...options
    });

    if (!manager) return;

    // 테마 설정
    if (autoSeasonal) {
      manager.setSeasonalTheme();
    } else if (autoTimeBasedTheme) {
      manager.setTimeBasedTheme();
    } else if (theme !== 'default') {
      manager.setTheme(theme);
    } else {
      // 명시적으로 default 테마 설정
      manager.setTheme('default');
    }

    // 모바일 최적화 제거됨 - 모바일 브라우저에서 커스텀 스크롤바 지원이 제한적이므로

    // 특별한 날 체크 - default 테마가 아닐 때만
    if (theme !== 'default' && !autoSeasonal && !autoTimeBasedTheme) {
      checkSpecialDays(manager);
    }

    // 정리 함수
    return () => {
      manager.destroy();
    };
  }, [theme, options, autoSeasonal, autoTimeBasedTheme, enableCelebrationMode]);

  return <>{children}</>;
}

/**
 * 특별한 날에 맞는 스크롤바 테마 적용
 */
function checkSpecialDays(manager: any) {
  const today = new Date();
  const month = today.getMonth() + 1;
  const date = today.getDate();

  // 크리스마스 시즌 (12월)
  if (month === 12) {
    document.documentElement.classList.add('scrollbar-winter');
    if (date === 25) {
      // 크리스마스 당일 - 축하 모드
      setTimeout(() => manager.activateCelebrationMode(10000), 1000);
    }
  }
  
  // 신정 (1월 1일)
  if (month === 1 && date === 1) {
    document.documentElement.classList.add('scrollbar-fireworks');
    setTimeout(() => manager.activateCelebrationMode(15000), 1000);
  }

  // 발렌타인 데이 (2월 14일)
  if (month === 2 && date === 14) {
    document.documentElement.classList.add('scrollbar-party');
  }

  // 할로윈 (10월 31일)
  if (month === 10 && date === 31) {
    document.documentElement.classList.add('scrollbar-cyberpunk');
  }

  // 크리스마스 이브 (12월 24일)
  if (month === 12 && date === 24) {
    document.documentElement.classList.add('scrollbar-galaxy');
  }
}

/**
 * 스크롤바 테마 선택 컴포넌트
 */
export function ScrollbarThemeSelector() {
  const themes: { value: ScrollbarTheme; label: string; emoji: string }[] = [
    { value: 'default', label: '기본', emoji: '⚪' },
    { value: 'cyberpunk', label: '사이버펑크', emoji: '🔮' },
    { value: 'galaxy', label: '갤럭시', emoji: '🌌' },
    { value: 'party', label: '파티', emoji: '🎉' },
    { value: 'elegant', label: '엘레간트', emoji: '✨' },
    { value: 'gamer', label: '게이머', emoji: '🎮' },
    { value: 'spring', label: '봄', emoji: '🌸' },
    { value: 'summer', label: '여름', emoji: '🌊' },
    { value: 'autumn', label: '가을', emoji: '🍁' },
    { value: 'winter', label: '겨울', emoji: '❄️' },
  ];

  const handleThemeChange = (theme: ScrollbarTheme) => {
    const manager = initScrollbarEffects();
    manager?.setTheme(theme);
    
    // 로컬 스토리지에 테마 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('scrollbar-theme', theme);
    }
  };

  const triggerCelebration = () => {
    const manager = initScrollbarEffects();
    manager?.activateCelebrationMode(5000);
  };

  return (
    <div className="p-4 bg-card rounded-lg border">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        🎨 스크롤바 테마 선택
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {themes.map((theme) => (
          <button
            key={theme.value}
            onClick={() => handleThemeChange(theme.value)}
            className="p-2 border rounded-md hover:bg-accent transition-colors flex flex-col items-center gap-1 text-sm"
          >
            <span className="text-lg">{theme.emoji}</span>
            <span>{theme.label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={triggerCelebration}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          🎆 축하 모드
        </button>
        
        <button
          onClick={() => {
            const manager = initScrollbarEffects();
            manager?.setSeasonalTheme();
          }}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors flex items-center gap-2"
        >
          🍃 계절 테마
        </button>
      </div>
    </div>
  );
}

/**
 * 스크롤바 효과 관련 훅
 */
export function useScrollbarTheme() {
  useEffect(() => {
    // 저장된 테마 불러오기
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('scrollbar-theme') as ScrollbarTheme;
      if (savedTheme) {
        const manager = initScrollbarEffects();
        manager?.setTheme(savedTheme);
      }
    }
  }, []);

  const setTheme = (theme: ScrollbarTheme) => {
    const manager = initScrollbarEffects();
    manager?.setTheme(theme);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('scrollbar-theme', theme);
    }
  };

  const triggerCelebration = (duration?: number) => {
    const manager = initScrollbarEffects();
    manager?.activateCelebrationMode(duration);
  };

  return { setTheme, triggerCelebration };
}