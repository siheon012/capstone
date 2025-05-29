export type ChatSession = {
  id: string
  title: string
  createdAt: Date
  messages: {
    role: "user" | "assistant"
    content: string
    timestamp?: number
  }[]
  videoInfo?: {
    name: string
    duration: number
    url: string
  }
  videoId: string
  eventType?: "도난" | "쓰러짐" | "폭행" | null
}
