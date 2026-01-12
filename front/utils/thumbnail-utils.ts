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
      captureTime: timeInSeconds,
      fileSizeGB: (file.size / (1024 * 1024 * 1024)).toFixed(2),
    });

    // 파일 유효성 검사
    if (!file || !file.type.startsWith('video/')) {
      console.error('❌ [Thumbnail] 유효하지 않은 비디오 파일:', file?.type);
      resolve(null);
      return;
    }

    // 대용량 파일 경고
    const isLargeFile = file.size > 2 * 1024 * 1024 * 1024; // 2GB 이상
    if (isLargeFile) {
      console.warn(
        '⚠️ [Thumbnail] 대용량 파일 감지, 썸네일 생성에 시간이 걸릴 수 있습니다:',
        {
          fileSizeGB: (file.size / (1024 * 1024 * 1024)).toFixed(2),
        }
      );
    }

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('❌ [Thumbnail] Canvas context 생성 실패');
      resolve(null);
      return;
    }

    // 대용량 파일의 경우 타임아웃을 더 길게 설정
    const timeoutDuration = isLargeFile ? 60000 : 30000; // 대용량: 60초, 일반: 30초
    const timeoutId = setTimeout(() => {
      console.error('❌ [Thumbnail] 썸네일 생성 타임아웃:', {
        timeoutSeconds: timeoutDuration / 1000,
        fileSize: file.size,
      });
      cleanup();
      resolve(null);
    }, timeoutDuration);

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

    // 대용량 파일 처리를 위한 추가 설정
    video.controls = false;
    video.autoplay = false;
    video.loop = false;

    // 메모리 사용량 최적화를 위한 설정
    if (isLargeFile) {
      video.preload = 'none'; // 대용량 파일은 메타데이터만 로드
    }

    video.onloadedmetadata = () => {
      console.log('📊 [Thumbnail] 비디오 메타데이터 로드됨:', {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
      });

      // 비디오 크기 유효성 검사
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error('❌ [Thumbnail] 비디오 크기가 유효하지 않음');
        cleanup();
        resolve(null);
        return;
      }

      // 비디오가 요청된 시간보다 짧으면 중간 지점으로 설정
      const captureTime = Math.min(
        timeInSeconds,
        Math.max(1, video.duration / 2)
      );
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
          height: canvas.height,
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
                type: blob.type,
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
        fileName: file.name,
        fileSize: file.size,
      });

      // 에러 코드별 상세 정보
      if (errorInfo) {
        const errorMessages = {
          1: 'MEDIA_ERR_ABORTED: 미디어 재생이 중단됨',
          2: 'MEDIA_ERR_NETWORK: 네트워크 오류',
          3: 'MEDIA_ERR_DECODE: 미디어 디코딩 오류 (코덱 지원 문제)',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 지원되지 않는 미디어 형식',
        };
        console.error(
          '📋 [Thumbnail] 오류 상세:',
          errorMessages[errorInfo.code as keyof typeof errorMessages] ||
            '알 수 없는 오류'
        );

        // 대용량 파일 처리 시 추가 정보
        if (file.size > 1024 * 1024 * 1024) {
          // 1GB 이상
          console.error('💾 [Thumbnail] 대용량 파일 감지:', {
            fileSizeGB: (file.size / (1024 * 1024 * 1024)).toFixed(2),
            possibleCause: '메모리 부족 또는 브라우저 제한',
          });
        }
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
      // 대용량 파일 처리를 위한 추가 검사
      if (isLargeFile) {
        console.warn('⚠️ [Thumbnail] 대용량 파일 ObjectURL 생성 중...');
      }

      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      console.log('🔗 [Thumbnail] ObjectURL 생성 성공:', {
        urlLength: objectUrl.length,
        fileSize: file.size,
      });

      // 대용량 파일의 경우 메타데이터 로드 강제 시작
      if (isLargeFile) {
        video.load();
      }
    } catch (error) {
      console.error('❌ [Thumbnail] ObjectURL 생성 실패:', error);
      cleanup();
      resolve(null);
    }
  });
}

/**
 * 썸네일 이미지를 S3에 업로드하는 함수
 * @param thumbnailBlob - 썸네일 이미지 Blob
 * @param fileName - 저장할 파일명 (확장자 제외)
 * @returns Promise<string | null> - S3 썸네일 URL 또는 null
 */
export async function uploadThumbnail(
  thumbnailBlob: Blob,
  fileName: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    const thumbnailFileName = `${fileName.replace(/\.[^/.]+$/, '')}.png`;
    formData.append('thumbnail', thumbnailBlob, thumbnailFileName);
    formData.append('fileName', thumbnailFileName);

    // 상대 경로 사용 (Next.js rewrites를 통해 ALB로 프록시됨, Mixed Content 해결)
    console.log('🖼️ [Thumbnail Upload] S3 업로드 시작:', {
      fileName: thumbnailFileName,
      endpoint: '/api/s3/upload/thumbnail/',
      blobSize: thumbnailBlob.size,
    });

    const response = await fetch('/api/s3/upload/thumbnail/', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ [Thumbnail Upload] S3 업로드 성공:', {
        thumbnailUrl: result.thumbnail_url,
        s3Key: result.s3_key,
      });
      return result.thumbnail_url; // S3 Pre-signed URL 반환
    } else {
      const errorText = await response.text();
      console.error('❌ [Thumbnail Upload] 업로드 실패:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return null;
    }
  } catch (error) {
    console.error('❌ [Thumbnail Upload] 업로드 중 오류:', error);
    return null;
  }
}

/**
 * 대용량 파일이나 썸네일 생성 실패 시 기본 썸네일을 생성하는 함수
 * @param fileName - 파일명
 * @param fileType - 파일 타입
 * @returns Promise<Blob | null> - 기본 썸네일 Blob
 */
export async function generateDefaultThumbnail(
  fileName: string,
  fileType: string
): Promise<Blob | null> {
  return new Promise((resolve) => {
    console.log('🖼️ [Default Thumbnail] 기본 썸네일 생성 중:', {
      fileName,
      fileType,
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('❌ [Default Thumbnail] Canvas context 생성 실패');
      resolve(null);
      return;
    }

    // 캔버스 크기 설정 (16:9 비율)
    canvas.width = 320;
    canvas.height = 180;

    // 배경 그라디언트
    const gradient = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height
    );
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 비디오 아이콘 그리기
    ctx.fillStyle = '#64748b';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎬', canvas.width / 2, canvas.height / 2 - 10);

    // 파일 정보 텍스트
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px Arial';
    ctx.fillText('Video File', canvas.width / 2, canvas.height / 2 + 30);

    // 파일 타입 표시
    const fileExt = fileName.split('.').pop()?.toUpperCase() || 'VIDEO';
    ctx.font = '10px Arial';
    ctx.fillText(fileExt, canvas.width / 2, canvas.height / 2 + 45);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          console.log('✅ [Default Thumbnail] 기본 썸네일 생성 성공');
        } else {
          console.error('❌ [Default Thumbnail] 기본 썸네일 생성 실패');
        }
        resolve(blob);
      },
      'image/png',
      0.8
    );
  });
}

/**
 * 썸네일 생성 시도 함수 (실패 시 기본 썸네일로 대체)
 * @param file - 비디오 파일
 * @param timeInSeconds - 캡처 시간
 * @returns Promise<Blob | null> - 썸네일 Blob
 */
export async function generateThumbnailWithFallback(
  file: File,
  timeInSeconds: number = 5
): Promise<Blob | null> {
  console.log('🔄 [Thumbnail Fallback] 썸네일 생성 시도 시작');

  try {
    // 먼저 일반 썸네일 생성 시도
    const thumbnail = await generateVideoThumbnail(file, timeInSeconds);

    if (thumbnail) {
      console.log('✅ [Thumbnail Fallback] 일반 썸네일 생성 성공');
      return thumbnail;
    }

    // 실패 시 기본 썸네일 생성
    console.warn(
      '⚠️ [Thumbnail Fallback] 일반 썸네일 생성 실패, 기본 썸네일 생성 중...'
    );
    const defaultThumbnail = await generateDefaultThumbnail(
      file.name,
      file.type
    );

    if (defaultThumbnail) {
      console.log('✅ [Thumbnail Fallback] 기본 썸네일 생성 성공');
    } else {
      console.error('❌ [Thumbnail Fallback] 기본 썸네일 생성도 실패');
    }

    return defaultThumbnail;
  } catch (error) {
    console.error('❌ [Thumbnail Fallback] 썸네일 생성 중 오류:', error);

    // 최후의 수단으로 기본 썸네일 시도
    try {
      return await generateDefaultThumbnail(file.name, file.type);
    } catch (fallbackError) {
      console.error(
        '❌ [Thumbnail Fallback] 기본 썸네일 생성 중 오류:',
        fallbackError
      );
      return null;
    }
  }
}

/**
 * 썸네일 생성 및 업로드 (대체 옵션 포함)
 * @param file - 비디오 파일
 * @param fileName - 저장할 파일명
 * @param timeInSeconds - 캡처 시간
 * @returns Promise<string | null> - S3 썸네일 URL 또는 null
 */
export async function createAndUploadThumbnailWithFallback(
  file: File,
  fileName: string,
  timeInSeconds: number = 5
): Promise<string | null> {
  console.log(
    '🎬 [Thumbnail Upload Fallback] 썸네일 생성 및 S3 업로드 시작 (대체 옵션 포함)'
  );

  try {
    // 대체 옵션이 포함된 썸네일 생성
    const thumbnailBlob = await generateThumbnailWithFallback(
      file,
      timeInSeconds
    );

    if (!thumbnailBlob) {
      console.error('❌ [Thumbnail Upload Fallback] 썸네일 생성 완전 실패');
      return null;
    }

    // 썸네일 S3 업로드 및 URL 반환
    const thumbnailUrl = await uploadThumbnail(thumbnailBlob, fileName);

    if (thumbnailUrl) {
      console.log(
        '✅ [Thumbnail Upload Fallback] 썸네일 S3 업로드 성공:',
        thumbnailUrl
      );
      return thumbnailUrl;
    } else {
      console.error('❌ [Thumbnail Upload Fallback] 썸네일 S3 업로드 실패');
      return null;
    }
  } catch (error) {
    console.error('❌ [Thumbnail Upload Fallback] 전체 프로세스 실패:', error);
    return null;
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
