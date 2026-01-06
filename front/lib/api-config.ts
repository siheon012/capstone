/**
 * API 설정 (Isomorphic - SSR/CSR 모두 안전)
 */

// Production: ALB가 /api/* 경로를 Backend로 라우팅
// Development: next.config.mjs의 rewrites가 localhost:8000으로 프록시
export const API_BASE_URL =
  typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '' // SSR: 환경변수 또는 빈 문자열
    : ''; // CSR: 항상 상대 경로 (Same-origin)

/**
 * API 엔드포인트 상수
 */
export const API_ENDPOINTS = {
  // 비디오 관리
  videos: '/db/videos/',
  videoDetail: (videoId: string) => `/db/videos/${videoId}/`,

  // 이벤트 관리
  events: '/db/events/',
  eventStats: (videoId: string) =>
    `/db/events/video-stats/?video_id=${videoId}`,

  // 세션 관리
  sessions: '/db/prompt-sessions/',
  sessionDetail: (sessionId: string) => `/db/prompt-sessions/${sessionId}/`,

  // 비디오 분석
  videoAnalysis: '/api/video-analysis/',
  vectorSearch: '/api/video-analysis/vector-search/',

  // 관리자
  admin: '/admin/',
} as const;
