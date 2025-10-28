import { Event, EventResponse, EventDetailResponse } from '@/app/types/event';
import { getAppConfig } from '@/lib/env-config';

// 환경 설정
const config = getAppConfig();

// API URL 설정 - 모바일 환경 고려
const getApiBaseUrl = () => {
  // 서버 사이드에서는 환경설정 사용
  if (typeof window === 'undefined') {
    return config.api.baseUrl;
  }

  // 클라이언트 사이드에서는 현재 호스트 기반으로 동적 설정
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // HTTPS로 접속한 경우 HTTPS 사용, 아니면 HTTP 사용
    const protocol = window.location.protocol; // 'https:' 또는 'http:'
    // deepsentinel.cloud는 포트 없이 사용 (HTTPS는 443, HTTP는 80이 기본)
    return `${protocol}//${hostname}`;
  }

  return config.api.baseUrl;
};

const API_BASE_URL = getApiBaseUrl();

export async function getEvents(videoId?: string): Promise<EventResponse> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = videoId
      ? `${baseUrl}/db/events/?video=${videoId}`
      : `${baseUrl}/db/events/`;

    console.log('[EventService] 🔥 Fetching events from:', url);
    console.log(
      '[EventService] 🔥 Video ID parameter:',
      videoId,
      'type:',
      typeof videoId
    );
    console.log(
      '[EventService] 🔥 Current hostname:',
      typeof window !== 'undefined' ? window.location.hostname : 'server-side'
    );

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // 모바일에서 CORS 문제 방지
      mode: 'cors',
    });

    console.log('[EventService] 📡 Response status:', response.status);
    console.log('[EventService] 📡 Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EventService] ❌ HTTP error response:', errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    const data = await response.json();
    console.log('[EventService] 📦 Events response:', data);
    console.log(
      '[EventService] 📦 Number of events returned:',
      data.results?.length || data.length || 0
    );

    return {
      success: true,
      data: data.results || data, // DRF pagination 지원
    };
  } catch (error) {
    console.error('[EventService] ❌ Error fetching events:', error);
    console.error('[EventService] ❌ Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      data: [],
      error:
        error instanceof Error
          ? error.message
          : '이벤트를 불러오는 중 오류가 발생했습니다.',
    };
  }
}

export async function getEvent(eventId: string): Promise<EventDetailResponse> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/db/events/${eventId}/`;

    console.log('[EventService] Fetching event from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EventService] HTTP error response:', errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    const data = await response.json();
    console.log('[EventService] Event response:', data);

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('[EventService] Error fetching event:', error);
    return {
      success: false,
      data: {} as Event,
      error:
        error instanceof Error
          ? error.message
          : '이벤트를 불러오는 중 오류가 발생했습니다.',
    };
  }
}

export async function getEventsByTimeRange(
  videoId: string,
  startTime: number,
  endTime: number
): Promise<EventResponse> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/db/events/?video=${videoId}&timestamp__gte=${startTime}&timestamp__lte=${endTime}`;

    console.log('[EventService] Fetching events by time range:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EventService] HTTP error response:', errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    const data = await response.json();
    console.log('[EventService] Events by time range response:', data);

    return {
      success: true,
      data: data.results || data,
    };
  } catch (error) {
    console.error('[EventService] Error fetching events by time range:', error);
    return {
      success: false,
      data: [],
      error:
        error instanceof Error
          ? error.message
          : '시간 범위별 이벤트를 불러오는 중 오류가 발생했습니다.',
    };
  }
}

export async function getEventsByType(
  videoId: string,
  eventType: string
): Promise<EventResponse> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/db/events/?video=${videoId}&event_type=${eventType}`;

    console.log('[EventService] Fetching events by type:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EventService] HTTP error response:', errorText);
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    const data = await response.json();
    console.log('[EventService] Events by type response:', data);

    return {
      success: true,
      data: data.results || data,
    };
  } catch (error) {
    console.error('[EventService] Error fetching events by type:', error);
    return {
      success: false,
      data: [],
      error:
        error instanceof Error
          ? error.message
          : '타입별 이벤트를 불러오는 중 오류가 발생했습니다.',
    };
  }
}
