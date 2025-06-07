"use server"

import type { HistoryItem, HistoryResponse } from "@/app/types/history"

// 히스토리 목록 가져오기
export async function getHistoryList(): Promise<HistoryResponse> {
  try {
    // TODO: DB 연결 후 실제 구현 예정
    // const response = await fetch(`${process.env.DATABASE_URL}/api/history`, {
    //   method: "GET",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${process.env.DATABASE_API_KEY}`,
    //   },
    // })

    // if (!response.ok) {
    //   throw new Error(`Database error: ${response.status}`)
    // }

    // const data = await response.json()
    // return { success: true, data }

    // 현재는 더미 데이터만 반환
    const dummyData: HistoryItem[] = [
      {
        id: "1",
        title: "prompt_id : 1",
        createdAt: new Date("2024-01-15T10:30:00"),
        messages: [
          { role: "user", content: "주차장에서 차량 도난 사건이 있었나요?" },
          { role: "assistant", content: "15:30 시점에서 의심스러운 활동이 감지되었습니다.", timestamp: 930 },
        ],
        videoInfo: {
          name: "parking_lot_20240115.mp4",
          duration: 3600,
          url: "/videos/parking_lot.mp4",
        },
        eventType: "theft",
      },
      {
        id: "2",
        title: "prompt_id : 2",
        createdAt: new Date("2024-01-14T14:20:00"),
        messages: [
          { role: "user", content: "매장 입구에 사람이 몇 명 들어왔나요?" },
          { role: "assistant", content: "총 47명의 고객이 입장했습니다.", timestamp: 1200 },
        ],
        eventType: null,
      },
      {
        id: "3",
        title: "prompt_id : 3",
        createdAt: new Date("2024-01-13T09:15:00"),
        messages: [
          { role: "user", content: "야간에 사무실에 누가 있었나요?" },
          { role: "assistant", content: "22:45에 청소 직원이 입장했습니다.", timestamp: 2700 },
        ],
        eventType: "collapse",
      },
      {
        id: "4",
        title: "prompt_id : 4",
        createdAt: new Date("2024-01-12T16:45:00"),
        messages: [
          { role: "user", content: "연기나 화재 징후가 있었나요?" },
          { role: "assistant", content: "16:20에 연기가 감지되었습니다.", timestamp: 1180 },
        ],
        eventType: "violence",
      },
      {
        id: "5",
        title: "prompt_id : 5",
        createdAt: new Date("2024-01-11T11:30:00"),
        messages: [
          { role: "user", content: "매장에서 이상한 행동이 있었나요?" },
          { role: "assistant", content: "11:15에 의심스러운 행동이 감지되었습니다.", timestamp: 675 },
        ],
        eventType: "theft",
      },
    ]

    return { success: true, data: dummyData }
  } catch (error) {
    console.error("History fetch error:", error)
    return { success: false, data: [], error: "히스토리를 불러오는 중 오류가 발생했습니다." }
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
    const historyResponse = await getHistoryList()
    if (historyResponse.success) {
      return historyResponse.data.find((item) => item.id === id) || null
    }
    return null
  } catch (error) {
    console.error("History item fetch error:", error)
    return null
  }
}

// 새 히스토리 저장
export async function saveHistory(historyItem: Omit<HistoryItem, "id" | "createdAt">): Promise<string | null> {
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
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log("임시 히스토리 저장:", { id: tempId, ...historyItem })
    return tempId
  } catch (error) {
    console.error("History save error:", error)
    return null
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
    console.log("임시 히스토리 삭제:", id)
    return true
  } catch (error) {
    console.error("History delete error:", error)
    return false
  }
}
