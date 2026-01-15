export type ChatSession = {
  id: string;
  title: string;
  createdAt: Date | string;
  updatedAt?: Date | string; // 선택적 필드로 변경 (없을 수 있음)
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }[];
  videoInfo?: {
    name: string;
    duration: number;
    url: string;
  };
  videoId: string;
  eventType?: 'theft' | 'collapse' | 'violence' | null;
  interactionCount?: number; // 실제 상호작용 개수
  session_number?: number; // 비디오별 세션 번호 (백엔드에서 계산)
  main_event?: {
    id: number;
    timestamp: number;
    event_type: string;
    scene_analysis: string | null;
  } | null;
  detected_events?: {
    event_type: string;
    action_detected: string;
    timestamp: number;
    location: string;
    prompt: string;
  }[]; // 프롬프트에서 찾은 이벤트들
};
