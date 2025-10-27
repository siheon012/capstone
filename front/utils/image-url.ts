// utils/image-url.ts

export const getImageUrl = (imagePath: string): string => {
  // 개발 환경
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:3000${imagePath}`;
  }

  // 프로덕션 환경 - S3 사용
  if (process.env.USE_S3 === 'true') {
    const s3BaseUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    return `${s3BaseUrl}${imagePath}`;
  }

  // 프로덕션 환경 - 로컬 파일
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  return `${baseUrl}${imagePath}`;
};

// 이미지 URL 유틸리티 함수들
export const getPlaceholderImage = (): string => {
  return getImageUrl('/images/placeholder.jpg');
};

export const getLogoImage = (): string => {
  return getImageUrl('/images/ds_logo.png');
};

export const getUploadDesignImage = (): string => {
  return getImageUrl('/images/upload-design.png');
};
