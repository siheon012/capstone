// utils/s3-upload.ts
import { getAppConfig } from '@/lib/env-config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// 환경 설정
const config = getAppConfig();

// S3 클라이언트 초기화
const createS3Client = () => {
  if (!config.s3.enabled) {
    return null;
  }

  return new S3Client({
    region: config.s3.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
};

export const uploadToS3 = async (file: File, key: string): Promise<string> => {
  // S3가 활성화되지 않은 경우 로컬 업로드
  if (!config.s3.enabled) {
    console.log('S3가 비활성화되어 로컬 업로드 사용');
    return `/uploads/${key}`;
  }

  try {
    const s3Client = createS3Client();
    if (!s3Client) {
      throw new Error('S3 클라이언트를 초기화할 수 없습니다.');
    }

    console.log('🚀 S3 업로드 시작:', {
      key,
      size: file.size,
      type: file.type,
    });

    const params = {
      Bucket: config.s3.bucket,
      Key: key,
      Body: file,
      ContentType: file.type,
      // 메타데이터 추가
      Metadata: {
        originalName: file.name,
        uploadTime: new Date().toISOString(),
        fileSize: file.size.toString(),
      },
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const fileUrl = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;

    console.log('✅ S3 업로드 완료:', fileUrl);
    return fileUrl;
  } catch (error) {
    console.error('❌ S3 업로드 오류:', error);

    // S3 업로드 실패 시 로컬 업로드로 fallback
    console.log('🔄 로컬 업로드로 fallback');
    return `/uploads/${key}`;
  }
};

/**
 * S3에서 사전 서명된 URL 생성 (업로드용)
 */
export const generatePresignedUploadUrl = async (
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; fileUrl: string } | null> => {
  if (!config.s3.enabled) {
    return null;
  }

  try {
    const s3Client = createS3Client();
    if (!s3Client) {
      throw new Error('S3 클라이언트를 초기화할 수 없습니다.');
    }

    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    const fileUrl = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl };
  } catch (error) {
    console.error('❌ 사전 서명된 URL 생성 오류:', error);
    return null;
  }
};

/**
 * S3에서 사전 서명된 URL 생성 (다운로드용)
 */
export const generatePresignedDownloadUrl = async (
  key: string,
  expiresIn: number = 3600
): Promise<string | null> => {
  if (!config.s3.enabled) {
    return null;
  }

  try {
    const s3Client = createS3Client();
    if (!s3Client) {
      throw new Error('S3 클라이언트를 초기화할 수 없습니다.');
    }

    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return downloadUrl;
  } catch (error) {
    console.error('❌ 다운로드 URL 생성 오류:', error);
    return null;
  }
};

/**
 * 파일 크기 검증
 */
export const validateFileSize = (
  file: File
): { valid: boolean; error?: string } => {
  const maxSizeBytes = config.performance.maxFileSizeGB * 1024 * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `파일 크기가 ${
        config.performance.maxFileSizeGB
      }GB를 초과합니다. (현재: ${(file.size / 1024 / 1024 / 1024).toFixed(
        2
      )}GB)`,
    };
  }

  return { valid: true };
};

/**
 * 파일 타입 검증
 */
export const validateFileType = (
  file: File
): { valid: boolean; error?: string } => {
  if (!config.performance.supportedVideoTypes.includes(file.type)) {
    return {
      valid: false,
      error: `지원되지 않는 파일 형식입니다. 지원 형식: ${config.performance.supportedVideoTypes.join(
        ', '
      )}`,
    };
  }

  return { valid: true };
};

/**
 * S3 키 생성 유틸리티
 */
export const generateS3Key = (
  fileName: string,
  folder: string = 'videos'
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${folder}/${timestamp}_${cleanFileName}`;
};

/**
 * 파일 업로드 진행률 추적
 */
export const uploadWithProgress = async (
  file: File,
  key: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  if (!config.s3.enabled) {
    // 로컬 업로드는 진행률 추적 없이 즉시 완료
    if (onProgress) onProgress(100);
    return `/uploads/${key}`;
  }

  try {
    const s3Client = createS3Client();
    if (!s3Client) {
      throw new Error('S3 클라이언트를 초기화할 수 없습니다.');
    }

    // TODO: 실제 진행률 추적을 위해서는 multipart upload 사용 필요
    // 현재는 간단한 시뮬레이션
    if (onProgress) {
      const intervals = [10, 30, 50, 70, 90];
      let index = 0;

      const progressInterval = setInterval(() => {
        if (index < intervals.length) {
          onProgress(intervals[index]);
          index++;
        } else {
          clearInterval(progressInterval);
        }
      }, 200);
    }

    const result = await uploadToS3(file, key);

    if (onProgress) onProgress(100);
    return result;
  } catch (error) {
    console.error('❌ 진행률 추적 업로드 오류:', error);
    throw error;
  }
};
