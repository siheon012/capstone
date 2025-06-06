'use server';

import type { ChatSession } from '@/app/types/session';

// 세션 타입 정의
export type SessionResponse = {
  success: boolean;
  data: ChatSession[];
  error?: string;
};

// Django API 기본 URL
const API_BASE_URL = 'http://localhost:8088/api';

// 모든 세션 가져오기
export async function getAllSessions(): Promise<SessionResponse> {
  try {
    console.log('🔥 Django API에서 모든 세션 가져오기 시작');
    
    const response = await fetch(`${API_BASE_URL}/prompt-sessions/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const sessionData = await response.json();
    console.log('📦 Django API 응답:', sessionData);

    // Django API 응답을 ChatSession 타입으로 변환
    const sessions: ChatSession[] = sessionData.map((session: any) => {
      // 첫 번째 interaction을 기반으로 messages 구성
      const messages = [];
      
      if (session.first_prompt) {
        messages.push({
          role: 'user' as const,
          content: session.first_prompt,
        });
      }
      
      if (session.first_answer) {
        messages.push({
          role: 'assistant' as const,
          content: session.first_answer,
          timestamp: session.main_event?.timestamp || null,
        });
      }

      return {
        id: session.session_id,
        title: `${session.video?.name || '알 수 없는 비디오'}의 ${session.interaction_count}번째 채팅`,
        createdAt: new Date(session.created_at),
        messages,
        videoInfo: session.video ? {
          name: session.video.name,
          duration: session.video.duration || 0,
          url: session.video.url || '',
        } : null,
        videoId: session.video?.id?.toString() || '',
        eventType: session.main_event?.action_detected || null,
      };
    });

    console.log('✅ 변환된 세션 데이터:', sessions);
    return { success: true, data: sessions };
    
  } catch (error) {
    console.error('❌ Sessions fetch error:', error);
    return {
      success: false,
      data: [],
      error: '세션을 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 특정 비디오의 세션 가져오기
export async function getVideoSessions(
  videoId: string
): Promise<SessionResponse> {
  try {
    console.log('🔥 특정 비디오의 세션 가져오기:', videoId);
    
    const response = await fetch(`${API_BASE_URL}/prompt-sessions/?video=${videoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const sessionData = await response.json();
    console.log('📦 비디오별 세션 API 응답:', sessionData);

    // Django API 응답을 ChatSession 타입으로 변환
    const sessions: ChatSession[] = sessionData.map((session: any) => {
      // 첫 번째 interaction을 기반으로 messages 구성
      const messages = [];
      
      if (session.first_prompt) {
        messages.push({
          role: 'user' as const,
          content: session.first_prompt,
        });
      }
      
      if (session.first_answer) {
        messages.push({
          role: 'assistant' as const,
          content: session.first_answer,
          timestamp: session.main_event?.timestamp || null,
        });
      }

      return {
        id: session.session_id,
        title: `${session.video?.name || '알 수 없는 비디오'}의 ${session.interaction_count}번째 채팅`,
        createdAt: new Date(session.created_at),
        messages,
        videoInfo: session.video ? {
          name: session.video.name,
          duration: session.video.duration || 0,
          url: session.video.url || '',
        } : null,
        videoId: session.video?.id?.toString() || '',
        eventType: session.main_event?.action_detected || null,
      };
    });

    console.log('✅ 변환된 비디오별 세션 데이터:', sessions);
    return { success: true, data: sessions };
    
  } catch (error) {
    console.error('❌ Video sessions fetch error:', error);
    return {
      success: false,
      data: [],
      error: '비디오 세션을 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 특정 세션 가져오기
export async function getSession(
  sessionId: string
): Promise<ChatSession | null> {
  try {
    console.log('🔥 특정 세션 가져오기:', sessionId);
    
    const response = await fetch(`${API_BASE_URL}/prompt-sessions/${sessionId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('❌ 세션을 찾을 수 없음:', sessionId);
        return null;
      }
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const session = await response.json();
    console.log('📦 개별 세션 API 응답:', session);

    // Django API 응답을 ChatSession 타입으로 변환
    const messages = [];
    
    if (session.first_prompt) {
      messages.push({
        role: 'user' as const,
        content: session.first_prompt,
      });
    }
    
    if (session.first_answer) {
      messages.push({
        role: 'assistant' as const,
        content: session.first_answer,
        timestamp: session.main_event?.timestamp || null,
      });
    }

    const chatSession: ChatSession = {
      id: session.session_id,
      title: `${session.video?.name || '알 수 없는 비디오'}의 ${session.interaction_count}번째 채팅`,
      createdAt: new Date(session.created_at),
      messages,
      videoInfo: session.video ? {
        name: session.video.name,
        duration: session.video.duration || 0,
        url: session.video.url || '',
      } : undefined,
      videoId: session.video?.id?.toString() || '',
      eventType: session.main_event?.action_detected || null,
    };

    console.log('✅ 변환된 개별 세션 데이터:', chatSession);
    return chatSession;
    
  } catch (error) {
    console.error('❌ Session fetch error:', error);
    return null;
  }
}

// 새 세션 저장
export async function saveSession(
  session: Omit<ChatSession, 'id' | 'createdAt'>
): Promise<string | null> {
  try {
    // 실제로는 데이터베이스에 저장
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    console.log('세션 저장:', {
      id: sessionId,
      ...session,
      createdAt: new Date(),
    });
    return sessionId;
  } catch (error) {
    console.error('Session save error:', error);
    return null;
  }
}

// 세션 삭제
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    // 실제로는 데이터베이스에서 삭제
    console.log('세션 삭제:', sessionId);
    return true;
  } catch (error) {
    console.error('Session delete error:', error);
    return false;
  }
}

// 비디오와 관련된 모든 세션 삭제
export async function deleteSessionsByVideoId(
  videoId: string
): Promise<boolean> {
  try {
    // 실제로는 데이터베이스에서 videoId로 관련 세션들을 찾아서 삭제
    console.log('비디오 관련 세션들 삭제:', videoId);
    return true;
  } catch (error) {
    console.error('Sessions delete by video error:', error);
    return false;
  }
}
