// utils/s3-upload.ts
// TODO: AWS SDK 설치 후 주석 해제
// import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/*
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});
*/

export const uploadToS3 = async (file: File, key: string): Promise<string> => {
  // TODO: AWS SDK 설치 후 구현
  console.warn('S3 업로드 기능은 아직 구현되지 않았습니다.');

  // 임시로 로컬 URL 반환
  return `/uploads/${key}`;

  /*
  const params = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: file.type,
    // ACL: 'public-read', // 최신 S3에서는 보안상 제거 권장
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    
    // S3 URL 생성
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return s3Url;
  } catch (error) {
    console.error('S3 업로드 실패:', error);
    throw error;
  }
  */
};

// 사용 예시
export const handleImageUpload = async (file: File): Promise<string> => {
  const fileName = `images/${Date.now()}-${file.name}`;
  const s3Url = await uploadToS3(file, fileName);

  // 데이터베이스에 S3 URL 저장
  return s3Url; // https://bucket-name.s3.region.amazonaws.com/images/...
};
