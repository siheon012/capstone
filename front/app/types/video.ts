export type UploadedVideo = {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  size: number;
  uploadDate: Date;
  timeInVideo?: Date | null; // 영상의 실제 촬영 시각
  thumbnail?: string;
  chatCount: number;
  majorEvent?: '도난' | '쓰러짐' | '점거' | '폭행' | 'interaction' | null;
  description?: string;
  summary?: string; // AI 영상 분석 요약 (이모지, 특수기호 포함 가능)
};

export type VideoListResponse = {
  success: boolean;
  data: UploadedVideo[];
  error?: string;
};
