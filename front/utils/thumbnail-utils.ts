// 비디오 썸네일 생성 유틸리티

/**
 * 비디오 파일에서 썸네일을 생성하는 함수
 * @param file - 비디오 파일
 * @param timeInSeconds - 썸네일을 캡처할 시간 (기본값: 5초)
 * @returns Promise<Blob | null> - 생성된 썸네일 이미지 Blob
 */
export async function generateVideoThumbnail(
  file: File,
  timeInSeconds: number = 5
): Promise<Blob | null> {
  return new Promise((resolve) => {
    console.log('🎬 [Thumbnail] 비디오 썸네일 생성 시작:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      captureTime: timeInSeconds
    });

    // 파일 유효성 검사
    if (!file || !file.type.startsWith('video/')) {
      console.error('❌ [Thumbnail] 유효하지 않은 비디오 파일:', file?.type);
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('❌ [Thumbnail] Canvas context 생성 실패');
      resolve(null);
      return;
    }

    // 타임아웃 설정 (30초)
    const timeoutId = setTimeout(() => {
      console.error('❌ [Thumbnail] 썸네일 생성 타임아웃');
      cleanup();
      resolve(null);
    }, 30000);

    function cleanup() {
      clearTimeout(timeoutId);
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
      video.remove();
      canvas.remove();
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      console.log('📊 [Thumbnail] 비디오 메타데이터 로드됨:', {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState
      });

      // 비디오 크기 유효성 검사
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error('❌ [Thumbnail] 비디오 크기가 유효하지 않음');
        cleanup();
        resolve(null);
        return;
      }

      // 비디오가 요청된 시간보다 짧으면 중간 지점으로 설정
      const captureTime = Math.min(timeInSeconds, Math.max(1, video.duration / 2));
      console.log('⏰ [Thumbnail] 캡처 시간 설정:', captureTime);
      
      // currentTime 설정 전에 잠시 대기
      setTimeout(() => {
        video.currentTime = captureTime;
      }, 100);
    };

    video.onseeked = () => {
      try {
        console.log('🎯 [Thumbnail] 비디오 seek 완료, 캔버스에 그리기 시작');
        
        // 캔버스 크기를 비디오 크기에 맞게 설정
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        console.log('📐 [Thumbnail] 캔버스 크기 설정:', {
          width: canvas.width,
          height: canvas.height
        });

        // 비디오 프레임을 캔버스에 그리기
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        console.log('🖼️ [Thumbnail] 캔버스에 비디오 프레임 그리기 완료');

        // 캔버스를 Blob으로 변환
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log('✅ [Thumbnail] Blob 생성 성공:', {
                size: blob.size,
                type: blob.type
              });
            } else {
              console.error('❌ [Thumbnail] Blob 생성 실패');
            }
            
            // 메모리 정리
            cleanup();
            resolve(blob);
          },
          'image/png',
          0.8
        );
      } catch (error) {
        console.error('❌ [Thumbnail] 썸네일 생성 중 오류:', error);
        cleanup();
        resolve(null);
      }
    };

    video.onerror = (error) => {
      const errorInfo = video.error;
      console.error('❌ [Thumbnail] 비디오 로드 중 오류 발생:', {
        error: error,
        videoError: errorInfo,
        errorCode: errorInfo?.code,
        errorMessage: errorInfo?.message,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src?.substring(0, 50) + '...',
        fileType: file.type,
        fileName: file.name
      });
      
      // 에러 코드별 상세 정보
      if (errorInfo) {
        const errorMessages = {
          1: 'MEDIA_ERR_ABORTED: 미디어 재생이 중단됨',
          2: 'MEDIA_ERR_NETWORK: 네트워크 오류',
          3: 'MEDIA_ERR_DECODE: 미디어 디코딩 오류',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 지원되지 않는 미디어 형식'
        };
        console.error('📋 [Thumbnail] 오류 상세:', errorMessages[errorInfo.code as keyof typeof errorMessages] || '알 수 없는 오류');
      }
      
      cleanup();
      resolve(null);
    };

    // 추가적인 오류 처리
    video.onabort = () => {
      console.warn('⚠️ [Thumbnail] 비디오 로드가 중단됨');
      cleanup();
      resolve(null);
    };

    video.onstalled = () => {
      console.warn('⚠️ [Thumbnail] 비디오 로드가 지연됨');
    };

    // 비디오 소스 설정
    console.log('🔗 [Thumbnail] 비디오 소스 설정 중...');
    try {
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      console.log('🔗 [Thumbnail] ObjectURL 생성 성공');
    } catch (error) {
      console.error('❌ [Thumbnail] ObjectURL 생성 실패:', error);
      cleanup();
      resolve(null);
    }
  });
}

/**
 * 썸네일 이미지를 서버에 업로드하는 함수
 * @param thumbnailBlob - 썸네일 이미지 Blob
 * @param fileName - 저장할 파일명 (확장자 제외)
 * @returns Promise<boolean> - 업로드 성공 여부
 */
export async function uploadThumbnail(
  thumbnailBlob: Blob,
  fileName: string
): Promise<boolean> {
  try {
    const formData = new FormData();
    const thumbnailFileName = `${fileName.replace(/\.[^/.]+$/, '')}.png`;
    formData.append('thumbnail', thumbnailBlob, thumbnailFileName);
    formData.append('fileName', thumbnailFileName);

    const response = await fetch('/api/upload-thumbnail', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      console.log('썸네일 업로드 성공:', thumbnailFileName);
      return true;
    } else {
      console.error('썸네일 업로드 실패:', response.statusText);
      return false;
    }
  } catch (error) {
    console.error('썸네일 업로드 중 오류:', error);
    return false;
  }
}

/**
 * 비디오 파일에서 썸네일을 생성하고 업로드하는 통합 함수
 * @param file - 비디오 파일
 * @param fileName - 파일명
 * @param timeInSeconds - 썸네일 캡처 시간
 * @returns Promise<string | null> - 업로드된 썸네일 경로
 */
export async function createAndUploadThumbnail(
  file: File,
  fileName: string,
  timeInSeconds: number = 5
): Promise<string | null> {
  try {
    console.log('썸네일 생성 시작:', fileName);

    // 1. 썸네일 생성
    const thumbnailBlob = await generateVideoThumbnail(file, timeInSeconds);
    if (!thumbnailBlob) {
      console.error('썸네일 생성 실패');
      return null;
    }

    console.log('썸네일 생성 완료, 크기:', thumbnailBlob.size);

    // 2. 썸네일 업로드
    const uploadSuccess = await uploadThumbnail(thumbnailBlob, fileName);
    if (!uploadSuccess) {
      console.error('썸네일 업로드 실패');
      return null;
    }

    // 3. 썸네일 경로 반환
    const thumbnailPath = `/uploads/thumbnails/${fileName.replace(
      /\.[^/.]+$/,
      ''
    )}.png`;
    console.log('썸네일 업로드 성공:', thumbnailPath);
    return thumbnailPath;
  } catch (error) {
    console.error('썸네일 생성 및 업로드 실패:', error);
    return null;
  }
}
