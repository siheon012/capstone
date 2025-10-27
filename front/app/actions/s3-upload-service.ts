/**
 * S3 기반 비디오 업로드 서비스
 * JWT + Pre-signed URL을 통한 무상태 업로드
 */

export interface S3UploadConfig {
  upload_token: string;
  presigned_url: string;
  s3_key: string;
  expires_in: number;
}

export interface VideoUploadMetadata {
  file_name: string;
  file_size: number;
  content_type: string;
  duration?: number;
  thumbnail_url?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

/**
 * JWT 토큰을 가져오는 함수 (실제 인증 시스템에 맞게 구현)
 */
function getAuthToken(): string {
  // 실제 구현에서는 localStorage, sessionStorage, 또는 secure cookie에서 가져옴
  return localStorage.getItem('auth_token') || 'demo_token';
}

/**
 * Step 1: 업로드 토큰 및 Pre-signed URL 요청
 */
export async function requestUploadUrl(
  metadata: VideoUploadMetadata
): Promise<S3UploadConfig> {
  try {
    const response = await fetch(`${API_BASE}/api/s3/upload/request/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(metadata)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '업로드 URL 요청에 실패했습니다.');
    }

    const data = await response.json();
    console.log('✅ 업로드 URL 요청 성공:', data);
    
    return data;
  } catch (error) {
    console.error('❌ 업로드 URL 요청 실패:', error);
    throw error;
  }
}

/**
 * Step 2: S3에 파일 직접 업로드
 */
export async function uploadToS3(
  file: File,
  config: S3UploadConfig,
  onProgress?: (progress: number) => void
): Promise<void> {
  try {
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          console.log('✅ S3 업로드 성공');
          resolve();
        } else {
          console.error('❌ S3 업로드 실패:', xhr.status, xhr.statusText);
          reject(new Error(`S3 업로드 실패: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        console.error('❌ S3 업로드 네트워크 오류');
        reject(new Error('S3 업로드 중 네트워크 오류가 발생했습니다.'));
      });

      xhr.open('PUT', config.presigned_url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  } catch (error) {
    console.error('❌ S3 업로드 오류:', error);
    throw error;
  }
}

/**
 * Step 3: 업로드 완료 확인
 */
export async function confirmUpload(
  config: S3UploadConfig,
  metadata: {
    duration?: number;
    thumbnail_url?: string;
    video_datetime?: string;
  }
): Promise<{ video_id: number; video: any }> {
  try {
    const response = await fetch(`${API_BASE}/api/s3/upload/confirm/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        upload_token: config.upload_token,
        s3_key: config.s3_key,
        ...metadata
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '업로드 확인에 실패했습니다.');
    }

    const data = await response.json();
    console.log('✅ 업로드 확인 성공:', data);
    
    return data;
  } catch (error) {
    console.error('❌ 업로드 확인 실패:', error);
    throw error;
  }
}

/**
 * 전체 업로드 프로세스를 관리하는 통합 함수
 */
export async function uploadVideoToS3(
  file: File,
  options?: {
    duration?: number;
    thumbnailUrl?: string;
    videoDateTime?: string;
    onProgress?: (stage: string, progress: number) => void;
  }
): Promise<{ video_id: number; video: any }> {
  const { duration, thumbnailUrl, videoDateTime, onProgress } = options || {};

  try {
    // Step 1: 업로드 URL 요청
    onProgress?.('Requesting upload URL...', 10);

    const metadata: VideoUploadMetadata = {
      file_name: file.name,
      file_size: file.size,
      content_type: file.type,
      duration: duration,
      thumbnail_url: thumbnailUrl
    };

    const config = await requestUploadUrl(metadata);

    // Step 2: S3 업로드
    onProgress?.('Uploading to S3...', 20);

    await uploadToS3(file, config, (uploadProgress) => {
      // 20% ~ 80% 구간을 S3 업로드 진행률로 할당
      const adjustedProgress = 20 + (uploadProgress * 0.6);
      onProgress?.(`Uploading... ${uploadProgress.toFixed(1)}%`, adjustedProgress);
    });

    // Step 3: 업로드 확인
    onProgress?.('Confirming upload...', 90);

    const result = await confirmUpload(config, {
      duration: duration || 0,
      thumbnail_url: thumbnailUrl,
      video_datetime: videoDateTime
    });

    onProgress?.('Upload completed!', 100);

    return result;

  } catch (error) {
    console.error('❌ 전체 업로드 프로세스 실패:', error);
    throw error;
  }
}

/**
 * 비디오 다운로드 URL 요청
 */
export async function getVideoDownloadUrl(videoId: number): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/api/s3/video/${videoId}/download/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '다운로드 URL 요청에 실패했습니다.');
    }

    const data = await response.json();
    return data.download_url;
    
  } catch (error) {
    console.error('❌ 다운로드 URL 요청 실패:', error);
    throw error;
  }
}
