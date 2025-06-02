export type UploadedVideo = {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  size: number;
  uploadDate: Date;
  thumbnail?: string;
  chatCount: number;
  majorEvent?: '도난' | '쓰러짐' | '폭행' | null;
  description?: string;
};

export type VideoListResponse = {
  success: boolean;
  data: UploadedVideo[];
  error?: string;
};
