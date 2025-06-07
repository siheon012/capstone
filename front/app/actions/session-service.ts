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
      
      if (session.first_response) {
        messages.push({
          role: 'assistant' as const,
          content: session.first_response,
          timestamp: session.main_event?.timestamp || null,
        });
      }

      return {
        id: session.session_id,
        title: session.display_title || `${session.video?.name || '알 수 없는 비디오'}의 채팅`,
        createdAt: new Date(session.created_at),
        messages,
        videoInfo: session.video ? {
          name: session.video.name,
          duration: session.video.duration || 0,
          url: session.video.url || '',
        } : null,
        videoId: session.video?.video_id?.toString() || '',
        eventType: session.main_event?.event_type || null,
        interactionCount: session.interaction_count || 0,  // 실제 상호작용 개수 추가
        main_event: session.main_event ? {
          id: session.main_event.id,
          timestamp: session.main_event.timestamp,
          event_type: session.main_event.event_type,
          scene_analysis: session.main_event.scene_analysis
        } : null,
        detected_events: session.detected_events || [],  // 찾은 이벤트들 추가
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
      
      if (session.first_response) {
        messages.push({
          role: 'assistant' as const,
          content: session.first_response,
          timestamp: session.main_event?.timestamp || null,
        });
      }

      return {
        id: session.session_id,
        title: session.display_title || `${session.video?.name || '알 수 없는 비디오'}의 채팅`,
        createdAt: new Date(session.created_at),
        messages,
        videoInfo: session.video ? {
          name: session.video.name,
          duration: session.video.duration || 0,
          url: session.video.url || '',
        } : null,
        videoId: session.video?.video_id?.toString() || '',
        eventType: session.main_event?.event_type || null,
        interactionCount: session.interaction_count || 0,  // 실제 상호작용 개수 추가
        main_event: session.main_event ? {
          id: session.main_event.id,
          timestamp: session.main_event.timestamp,
          event_type: session.main_event.event_type,
          scene_analysis: session.main_event.scene_analysis
        } : null,
        detected_events: session.detected_events || [],  // 찾은 이벤트들 추가
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
    
    // 1. 기본 세션 정보 가져오기
    const sessionResponse = await fetch(`${API_BASE_URL}/prompt-sessions/${sessionId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!sessionResponse.ok) {
      if (sessionResponse.status === 404) {
        console.log('❌ 세션을 찾을 수 없음:', sessionId);
        return null;
      }
      throw new Error(`세션 API 호출 실패: ${sessionResponse.status}`);
    }

    const session = await sessionResponse.json();
    console.log('📦 기본 세션 정보:', session);

    // 2. 세션의 모든 상호작용(대화) 가져오기
    const interactionsResponse = await fetch(`${API_BASE_URL}/prompt/history/${sessionId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!interactionsResponse.ok) {
      throw new Error(`상호작용 API 호출 실패: ${interactionsResponse.status}`);
    }

    const interactions = await interactionsResponse.json();
    console.log('📦 세션의 모든 상호작용:', interactions);

    // 3. 상호작용 데이터를 messages 형태로 변환
    const messages = [];
    
    for (const interaction of interactions) {
      // 사용자 입력 추가
      if (interaction.input_prompt) {
        messages.push({
          role: 'user' as const,
          content: interaction.input_prompt,
        });
      }
      
      // AI 응답 추가
      if (interaction.output_response) {
        messages.push({
          role: 'assistant' as const,
          content: interaction.output_response,
          timestamp: interaction.event?.timestamp ? new Date(interaction.event.timestamp).getTime() / 1000 : undefined,
        });
      }
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
      videoId: session.video?.video_id?.toString() || '',
      eventType: session.main_event?.event_type || null,
      main_event: session.main_event ? {
        id: session.main_event.id,
        timestamp: session.main_event.timestamp,
        event_type: session.main_event.event_type,
        scene_analysis: session.main_event.scene_analysis
      } : null,
    };

    console.log('✅ 변환된 완전한 세션 데이터:', chatSession);
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
    console.log('🔥 세션 삭제 요청:', sessionId);
    
    const response = await fetch(`${API_BASE_URL}/prompt-sessions/${sessionId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('❌ 세션을 찾을 수 없음:', sessionId);
        return false;
      }
      throw new Error(`세션 삭제 API 호출 실패: ${response.status}`);
    }

    console.log('✅ 세션 삭제 성공:', sessionId);
    return true;
  } catch (error) {
    console.error('❌ Session delete error:', error);
    return false;
  }
}

// 비디오와 관련된 모든 세션 삭제
export async function deleteSessionsByVideoId(
  videoId: string
): Promise<boolean> {
  try {
    console.log('🔥 비디오 관련 세션들 삭제 시작:', videoId);
    
    // 1. 먼저 해당 비디오의 모든 세션을 가져옴
    const sessionsResponse = await getVideoSessions(videoId);
    if (!sessionsResponse.success) {
      console.error('❌ 비디오 세션 목록을 가져올 수 없음');
      return false;
    }

    // 2. 각 세션을 개별적으로 삭제
    const deletePromises = sessionsResponse.data.map(session => 
      deleteSession(session.id)
    );

    const results = await Promise.all(deletePromises);
    const allDeleted = results.every(result => result === true);

    if (allDeleted) {
      console.log('✅ 모든 비디오 관련 세션 삭제 성공:', videoId);
    } else {
      console.log('⚠️ 일부 세션 삭제 실패:', videoId);
    }

    return allDeleted;
  } catch (error) {
    console.error('❌ Sessions delete by video error:', error);
    return false;
  }
}
