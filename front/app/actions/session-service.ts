'use server';

import type { ChatSession } from '@/app/types/session';

// 세션 타입 정의
export type SessionResponse = {
  success: boolean;
  data: ChatSession[];
  error?: string;
};

// 모든 세션 가져오기
export async function getAllSessions(): Promise<SessionResponse> {
  try {
    // 더미 데이터 반환 (실제로는 데이터베이스에서 가져와야 함)
    const dummyData: ChatSession[] = [
      {
        id: 'session_1',
        title: '주차장_CCTV_2024년1월1일.mp4의 1번째 채팅',
        createdAt: new Date('2024-01-15T10:30:00'),
        messages: [
          { role: 'user', content: '주차장에서 차량 도난 사건이 있었나요?' },
          {
            role: 'assistant',
            content: '15:30 시점에서 의심스러운 활동이 감지되었습니다.',
            timestamp: 930,
          },
        ],
        videoInfo: {
          name: '주차장_CCTV_2024년1월1일.mp4',
          duration: 3600,
          url: '/uploads/videos/parking_lot_20240101.mp4',
        },
        videoId: 'video_1704067200_abc123',
        eventType: '도난',
      },
      {
        id: 'session_2',
        title: '주차장_CCTV_2024년1월1일.mp4의 2번째 채팅',
        createdAt: new Date('2024-01-15T11:45:00'),
        messages: [
          { role: 'user', content: '주차장에 몇 대의 차량이 있나요?' },
          {
            role: 'assistant',
            content: '현재 주차장에는 총 12대의 차량이 있습니다.',
            timestamp: 1200,
          },
        ],
        videoInfo: {
          name: '주차장_CCTV_2024년1월1일.mp4',
          duration: 3600,
          url: '/uploads/videos/parking_lot_20240101.mp4',
        },
        videoId: 'video_1704067200_abc123',
        eventType: null,
      },
      {
        id: 'session_3',
        title: '매장입구_CCTV_2024년1월2일.mp4의 1번째 채팅',
        createdAt: new Date('2024-01-14T14:20:00'),
        messages: [
          { role: 'user', content: '매장 입구에 사람이 몇 명 들어왔나요?' },
          {
            role: 'assistant',
            content: '총 47명의 고객이 입장했습니다.',
            timestamp: 1200,
          },
        ],
        videoInfo: {
          name: '매장입구_CCTV_2024년1월2일.mp4',
          duration: 7200,
          url: '/uploads/videos/store_entrance_20240102.mp4',
        },
        videoId: 'video_1704153600_def456',
        eventType: null,
      },
      {
        id: 'session_4',
        title: '사무실복도_CCTV_2024년1월3일.mp4의 1번째 채팅',
        createdAt: new Date('2024-01-13T09:15:00'),
        messages: [
          { role: 'user', content: '야간에 사무실에 누가 있었나요?' },
          {
            role: 'assistant',
            content: '22:45에 청소 직원이 입장했습니다.',
            timestamp: 2700,
          },
        ],
        videoInfo: {
          name: '사무실복도_CCTV_2024년1월3일.mp4',
          duration: 1800,
          url: '/uploads/videos/office_hallway_20240103.mp4',
        },
        videoId: 'video_1704240000_ghi789',
        eventType: '쓰러짐',
      },
      {
        id: 'session_5',
        title: '창고_CCTV_2024년1월4일.mp4의 1번째 채팅',
        createdAt: new Date('2024-01-12T16:45:00'),
        messages: [
          { role: 'user', content: '연기나 화재 징후가 있었나요?' },
          {
            role: 'assistant',
            content: '16:20에 연기가 감지되었습니다.',
            timestamp: 1180,
          },
        ],
        videoInfo: {
          name: '창고_CCTV_2024년1월4일.mp4',
          duration: 5400,
          url: '/uploads/videos/warehouse_20240104.mp4',
        },
        videoId: 'video_1704326400_jkl012',
        eventType: '폭행',
      },
    ];

    return { success: true, data: dummyData };
  } catch (error) {
    console.error('Sessions fetch error:', error);
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
    const allSessions = await getAllSessions();
    if (!allSessions.success) {
      return allSessions;
    }

    const videoSessions = allSessions.data.filter(
      (session) => session.videoId === videoId
    );
    return { success: true, data: videoSessions };
  } catch (error) {
    console.error('Video sessions fetch error:', error);
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
    const allSessions = await getAllSessions();
    if (!allSessions.success) {
      return null;
    }

    return allSessions.data.find((session) => session.id === sessionId) || null;
  } catch (error) {
    console.error('Session fetch error:', error);
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
