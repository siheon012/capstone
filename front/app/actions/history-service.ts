'use server';

import type { HistoryItem, HistoryResponse } from '@/app/types/history';
import { getAppConfig } from '@/lib/env-config';

// 환경 설정
const config = getAppConfig();

// 히스토리 목록 가져오기
export async function getHistoryList(): Promise<HistoryResponse> {
  try {
    const response = await fetch(`${config.apiUrl}/db/prompt-sessions/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('❌ Sessions fetch error:', response.status);
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const sessions = await response.json();
    console.log('✅ Sessions fetched:', sessions.length);
    console.log('📦 첫 번째 세션 원본 데이터:', sessions[0]);

    // 백엔드 데이터를 프론트엔드 형식으로 변환
    const historyItems: HistoryItem[] = sessions.map((session: any) => {
      const mappedItem = {
        id: session.session_id,
        title:
          session.display_title ||
          session.session_name ||
          `세션 ${session.session_id.substring(0, 8)}`,
        createdAt: new Date(session.created_at),
        messages: session.messages || [],
        videoInfo: session.videoInfo || null,
        eventType: session.main_event?.event_type || null,
        interactionCount: session.interactionCount || 0,
      };

      console.log('🔄 매핑된 히스토리 아이템:', {
        title: mappedItem.title,
        messageCount: mappedItem.messages.length,
        interactionCount: mappedItem.interactionCount,
        videoDuration: mappedItem.videoInfo?.duration,
      });

      return mappedItem;
    });

    return { success: true, data: historyItems };
  } catch (error) {
    console.error('❌ History fetch error:', error);
    return {
      success: false,
      data: [],
      error: '히스토리를 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 특정 히스토리 아이템 가져오기
export async function getHistoryItem(id: string): Promise<HistoryItem | null> {
  try {
    // TODO: DB 연결 후 실제 구현 예정
    // const response = await fetch(`${process.env.DATABASE_URL}/api/history/${id}`, {
    //   method: "GET",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${process.env.DATABASE_API_KEY}`,
    //   },
    // })

    // if (!response.ok) {
    //   throw new Error(`Database error: ${response.status}`)
    // }

    // return await response.json()

    // 현재는 더미 데이터에서 검색
    const historyResponse = await getHistoryList();
    if (historyResponse.success) {
      return historyResponse.data.find((item) => item.id === id) || null;
    }
    return null;
  } catch (error) {
    console.error('History item fetch error:', error);
    return null;
  }
}

// 새 히스토리 저장
export async function saveHistory(
  historyItem: Omit<HistoryItem, 'id' | 'createdAt'>
): Promise<string | null> {
  try {
    // TODO: DB 연결 후 실제 구현 예정
    // const response = await fetch(`${process.env.DATABASE_URL}/api/history`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${process.env.DATABASE_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     ...historyItem,
    //     createdAt: new Date(),
    //   }),
    // })

    // if (!response.ok) {
    //   throw new Error(`Database error: ${response.status}`)
    // }

    // const result = await response.json()
    // return result.id

    // 현재는 임시 ID 반환
    const tempId = `temp_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log('임시 히스토리 저장:', { id: tempId, ...historyItem });
    return tempId;
  } catch (error) {
    console.error('History save error:', error);
    return null;
  }
}

// 히스토리 삭제
export async function deleteHistory(id: string): Promise<boolean> {
  try {
    // TODO: DB 연결 후 실제 구현 예정
    // const response = await fetch(`${process.env.DATABASE_URL}/api/history/${id}`, {
    //   method: "DELETE",
    //   headers: {
    //     Authorization: `Bearer ${process.env.DATABASE_API_KEY}`,
    //   },
    // })

    // return response.ok

    // 현재는 항상 성공으로 처리
    console.log('임시 히스토리 삭제:', id);
    return true;
  } catch (error) {
    console.error('History delete error:', error);
    return false;
  }
}
