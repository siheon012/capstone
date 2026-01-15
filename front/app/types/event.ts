export interface Event {
  id: string;
  video: string; // video ID
  timestamp: number; // 영상 시작점부터의 초 단위 시간
  timestamp_display: string; // MM:SS 형식의 사용자 친화적 시간
  absolute_time: string | null; // 실제 발생 시각 (ISO 형식)
  absolute_time_display: string; // 사용자 친화적 절대 시간 표시
  obj_id: number;
  age: number;
  gender: string;
  gender_score: number;
  confidence: number;
  location: string;
  area_of_interest: number;
  action_detected: string;
  event_type: string;
  scene_analysis: string | null;
  orientataion: string | null;
}

export interface EventResponse {
  success: boolean;
  data: Event[];
  error?: string;
}

export interface EventDetailResponse {
  success: boolean;
  data: Event;
  error?: string;
}

// 실제 시각 계산을 위한 유틸리티 함수들
export const calculateAbsoluteTime = (
  videoStartTime: Date | string | null,
  eventTimestamp: number
): Date | null => {
  if (!videoStartTime) return null;

  const videoDate =
    typeof videoStartTime === 'string'
      ? new Date(videoStartTime)
      : videoStartTime;
  if (isNaN(videoDate.getTime())) return null;

  return new Date(videoDate.getTime() + eventTimestamp * 1000);
};

export const formatAbsoluteTime = (
  videoStartTime: Date | string | null,
  eventTimestamp: number
): string => {
  const absoluteTime = calculateAbsoluteTime(videoStartTime, eventTimestamp);

  if (!absoluteTime) return '시간 정보 없음';

  return absoluteTime.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRelativeTime = (timestamp: number): string => {
  const minutes = Math.floor(timestamp / 60);
  const seconds = Math.floor(timestamp % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};
