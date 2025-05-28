export type HistoryItem = {
  id: string;
  title: string;
  createdAt: Date;
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
  eventType?: '도난' | '쓰러짐' | '폭행' | null; // 주요 사건 타입 추가
};

export type HistoryResponse = {
  success: boolean;
  data: HistoryItem[];
  error?: string;
};
