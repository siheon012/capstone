import type { UploadedVideo, VideoListResponse } from '@/app/types/video';
import { API_BASE_URL, API_ENDPOINTS } from '@/lib/api-config';

// 업로드된 비디오 목록 가져오기 (클라이언트용)
export async function getUploadedVideos(): Promise<VideoListResponse> {
  try {
    console.log('Django API에서 비디오 목록 가져오는 중...');

    const url = `${API_BASE_URL}${API_ENDPOINTS.videos}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const djangoVideos = await response.json();

    // Django 모델을 UploadedVideo 형태로 변환
    const videos: UploadedVideo[] = (djangoVideos || []).map((video: any) => ({
      id: video.video_id.toString(),
      name: video.name,
      // ✅ S3 URL 우선 사용, fallback으로 로컬 경로
      filePath:
        video.current_s3_url ||
        video.file_path ||
        `/uploads/videos/${video.name}`,
      // Duration NaN 처리
      duration:
        isNaN(video.duration) ||
        video.duration === null ||
        video.duration === undefined
          ? 0
          : video.duration,
      size: video.size || video.file_size,
      uploadDate: new Date(video.upload_date || video.created_at),
      // thumbnail_url 우선 사용 (S3 presigned URL)
      thumbnail:
        video.thumbnail_url ||
        video.computed_thumbnail_path ||
        video.thumbnail_path,
      chatCount: video.chat_count,
      majorEvent: video.major_event,
      // recorded_at 필드를 time_in_video로 매핑
      timeInVideo: video.recorded_at
        ? new Date(video.recorded_at)
        : video.time_in_video
        ? new Date(video.time_in_video)
        : null,
      // summary 필드 추가
      summary: video.summary || null,
    }));

    console.log(`✅ Django에서 ${videos.length}개 비디오 로드 완료`);

    return { success: true, data: videos };
  } catch (error) {
    console.error('❌ 비디오 목록 가져오기 오류:', error);
    return {
      success: false,
      data: [],
      error: '비디오 목록을 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 비디오 이벤트 통계 가져오기 (클라이언트용)
export async function getVideoEventStats(videoId: string): Promise<{
  success: boolean;
  data?: {
    mostFrequentEvent: {
      eventType: string;
      count: number;
    } | null;
    totalEvents: number;
  };
  error?: string;
}> {
  try {
    const url = `${API_BASE_URL}${API_ENDPOINTS.eventStats(videoId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const rawData = await response.json();
    
    // 특이 사건 타입 정의 (interaction 제외)
    const specialEventTypes = ['theft', 'collapse', 'sitting', 'violence'];
    
    // stats 배열에서 특이 사건만 필터링
    const specialEvents = (rawData.stats || []).filter((stat: any) => 
      specialEventTypes.includes(stat.event_type)
    );
    
    // 특이 사건 중 가장 많이 발생한 이벤트 찾기
    let mostFrequentSpecialEvent = null;
    if (specialEvents.length > 0) {
      // count 기준으로 내림차순 정렬 후 첫 번째 항목 선택
      const sortedEvents = specialEvents.sort((a: any, b: any) => b.count - a.count);
      mostFrequentSpecialEvent = {
        eventType: sortedEvents[0].event_type,
        count: sortedEvents[0].count,
      };
    }
    
    // 백엔드 snake_case를 프론트엔드 camelCase로 변환
    const data = {
      mostFrequentEvent: mostFrequentSpecialEvent,
      totalEvents: rawData.stats?.length || 0,
    };
    
    return { success: true, data };
  } catch (error) {
    console.error('❌ 이벤트 통계 가져오기 오류:', error);
    return {
      success: false,
      error: '이벤트 통계를 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 비디오 삭제 (클라이언트용)
export async function deleteVideo(videoId: string): Promise<boolean> {
  try {
    console.log(`🗑️ 비디오 삭제 시작: ${videoId}`);

    const url = `${API_BASE_URL}${API_ENDPOINTS.videoDetail(videoId)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    console.log(`✅ 비디오 삭제 완료: ${videoId}`);
    return true;
  } catch (error) {
    console.error(`❌ 비디오 삭제 실패: ${videoId}`, error);
    return false;
  }
}

// 중복 비디오 체크 함수 (클라이언트용)
export async function checkDuplicateVideo(
  file: File,
  videoDuration?: number
): Promise<{
  isDuplicate: boolean;
  duplicateVideo?: UploadedVideo;
  error?: string;
}> {
  try {
    console.log('⚠️ [Duplicate Check] 중복 체크 시작:', {
      fileName: file.name,
      fileSize: file.size,
      videoDuration,
    });

    // Django API에서 기존 비디오들을 가져와서 비교
    const videosResponse = await getUploadedVideos();
    if (!videosResponse.success) {
      console.error(
        '⚠️ [Duplicate Check] 비디오 목록 가져오기 실패:',
        videosResponse.error
      );
      return { isDuplicate: false, error: videosResponse.error };
    }

    console.log(
      '⚠️ [Duplicate Check] 기존 비디오 개수:',
      videosResponse.data?.length || 0
    );

    // 업로드할 파일명을 정규화
    const fileNameWithoutExt = file.name.substring(
      0,
      file.name.lastIndexOf('.')
    );
    const normalizedFileName = fileNameWithoutExt
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const normalizedFullFileName = `${normalizedFileName}.${fileExtension}`;

    console.log('⚠️ [Duplicate Check] 파일명 정규화:', {
      originalFileName: file.name,
      normalizedFileName: normalizedFullFileName,
    });

    // 각 비디오에 대해 중복 검사 실행
    for (const video of videosResponse.data || []) {
      const videoNameWithoutExt = video.name.substring(
        0,
        video.name.lastIndexOf('.')
      );
      const normalizedVideoFileName = videoNameWithoutExt
        .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s\-_]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
      const videoFileExtension = video.name.split('.').pop() || 'mp4';
      const normalizedVideoFullFileName = `${normalizedVideoFileName}.${videoFileExtension}`;

      // 1차: 정규화된 파일명과 크기로 기본 중복 확인
      if (
        normalizedVideoFullFileName === normalizedFullFileName &&
        video.size === file.size
      ) {
        console.log(
          '⚠️ [Duplicate Check] 파일명과 크기 일치, duration 체크 중...'
        );

        // duration이 제공된 경우 3가지 조건 모두 확인
        if (videoDuration !== undefined && video.duration > 0) {
          const durationDiff = Math.abs(video.duration - videoDuration);
          console.log('⚠️ [Duplicate Check] Duration 비교:', {
            videoDuration: video.duration,
            uploadDuration: videoDuration,
            diff: durationDiff,
          });

          if (durationDiff <= 0.5) {
            console.log('⚠️ [Duplicate Check] 중복 비디오 발견!');
            return {
              isDuplicate: true,
              duplicateVideo: video,
            };
          }
        } else {
          // duration이 없거나 0인 경우 파일명과 크기만으로 중복 판단
          console.log(
            '⚠️ [Duplicate Check] Duration 정보 없음, 파일명과 크기로만 중복 판단'
          );
          return {
            isDuplicate: true,
            duplicateVideo: video,
          };
        }
      }
    }

    console.log('⚠️ [Duplicate Check] 중복 비디오 없음');
    return { isDuplicate: false };
  } catch (error) {
    console.error('⚠️ [Duplicate Check] 중복 확인 실패:', error);
    return { isDuplicate: false, error: '중복 확인 중 오류가 발생했습니다.' };
  }
}
