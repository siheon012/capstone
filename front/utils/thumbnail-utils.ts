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
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Canvas context를 생성할 수 없습니다.');
      resolve(null);
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // 비디오가 요청된 시간보다 짧으면 중간 지점으로 설정
      const captureTime = Math.min(timeInSeconds, video.duration / 2);
      video.currentTime = captureTime;
    };

    video.onseeked = () => {
      try {
        // 캔버스 크기를 비디오 크기에 맞게 설정
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 비디오 프레임을 캔버스에 그리기
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 캔버스를 Blob으로 변환
        canvas.toBlob(
          (blob) => {
            // 메모리 정리
            video.remove();
            canvas.remove();
            URL.revokeObjectURL(video.src);
            resolve(blob);
          },
          'image/png',
          0.8
        );
      } catch (error) {
        console.error('썸네일 생성 중 오류:', error);
        video.remove();
        canvas.remove();
        URL.revokeObjectURL(video.src);
        resolve(null);
      }
    };

    video.onerror = () => {
      console.error('비디오 로드 중 오류 발생');
      video.remove();
      canvas.remove();
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    // 비디오 소스 설정
    video.src = URL.createObjectURL(file);
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
