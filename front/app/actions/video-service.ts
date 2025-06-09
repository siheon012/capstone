'use server';

import type { UploadedVideo, VideoListResponse } from '@/app/types/video';
import { mkdir, writeFile, readdir, unlink, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { deleteSessionsByVideoId } from './session-service';

// Django API URL 설정
const DJANGO_API_BASE = process.env.DJANGO_API_URL || 'http://localhost:8088/api';
const DJANGO_DB_BASE = process.env.DJANGO_DB_URL || 'http://localhost:8088/db';

// Django Video API 통신 함수들
async function createVideoInDjango(videoData: {
  name: string;
  duration: number;
  size: number;
  thumbnail_path: string;
  video_file_path: string;
  time_in_video?: string;
}): Promise<{ success: boolean; video?: any; error?: string }> {
  try {
    const response = await fetch(`${DJANGO_API_BASE}/videos/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: videoData.name,
        duration: videoData.duration,
        size: videoData.size,
        thumbnail_path: videoData.thumbnail_path,
        video_file: videoData.video_file_path, // Django의 video_file 필드에 경로 저장
        chat_count: 0,
        major_event: null,
        ...(videoData.time_in_video && { time_in_video: videoData.time_in_video }),
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return { success: true, video: result };
    } else {
      const error = await response.text();
      console.error('Django API error:', error);
      return { success: false, error: `Django API 오류: ${response.status}` };
    }
  } catch (error) {
    console.error('Django API 통신 실패:', error);
    return { success: false, error: 'Django API 통신에 실패했습니다.' };
  }
}

async function getVideosFromDjango(): Promise<{ success: boolean; videos?: any[]; error?: string }> {
  try {
    const response = await fetch(`${DJANGO_API_BASE}/videos/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const videos = await response.json();
      return { success: true, videos };
    } else {
      const error = await response.text();
      console.error('Django API error:', error);
      return { success: false, error: `Django API 오류: ${response.status}` };
    }
  } catch (error) {
    console.error('Django API 통신 실패:', error);
    return { success: false, error: 'Django API 통신에 실패했습니다.' };
  }
}

async function deleteVideoFromDjango(videoId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${DJANGO_API_BASE}/videos/${videoId}/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { success: true };
    } else {
      const error = await response.text();
      console.error('Django API error:', error);
      return { success: false, error: `Django API 오류: ${response.status}` };
    }
  } catch (error) {
    console.error('Django API 통신 실패:', error);
    return { success: false, error: 'Django API 통신에 실패했습니다.' };
  }
}

// 썸네일 생성을 위한 추가 함수
async function createVideoThumbnail(
  videoBuffer: Buffer,
  fileName: string
): Promise<string | null> {
  try {
    // 클라이언트 사이드에서 캔버스를 사용해 썸네일을 생성하는 방식으로 변경
    // 서버 사이드에서는 비디오 처리가 복잡하므로 일단 기본 썸네일 경로 반환
    const thumbnailFileName = fileName.replace(/\.[^/.]+$/, '.png');
    return `/uploads/thumbnails/${thumbnailFileName}`;
  } catch (error) {
    console.error('Thumbnail creation failed:', error);
    return null;
  }
}

// 업로드 디렉토리 설정
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'videos');
const METADATA_DIR = join(process.cwd(), 'public', 'uploads', 'metadata');
const THUMBNAIL_DIR = join(process.cwd(), 'public', 'uploads', 'thumbnails');

// 디렉토리 생성 함수
async function ensureUploadDir() {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }
    if (!existsSync(METADATA_DIR)) {
      await mkdir(METADATA_DIR, { recursive: true });
    }
    if (!existsSync(THUMBNAIL_DIR)) {
      await mkdir(THUMBNAIL_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

// 중복 비디오 체크 함수
export async function checkDuplicateVideo(
  file: File,
  videoDuration?: number
): Promise<{
  isDuplicate: boolean;
  duplicateVideo?: UploadedVideo;
  error?: string;
}> {
  try {
    console.log('중복 체크 시작:', {
      fileName: file.name,
      fileSize: file.size,
      videoDuration,
    });

    // Django API에서 기존 비디오들을 가져와서 비교
    const videosResponse = await getVideosFromDjango();
    if (!videosResponse.success) {
      return { isDuplicate: false, error: videosResponse.error };
    }

    console.log('기존 비디오 개수:', videosResponse.videos?.length || 0);

    // 업로드할 파일명을 정규화 (saveVideoFile과 동일한 로직)
    const fileNameWithoutExt = file.name.substring(
      0,
      file.name.lastIndexOf('.')
    );
    const normalizedFileName = fileNameWithoutExt
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s\-_]/g, '') // 안전하지 않은 문자 제거 (언더스코어와 하이픈 허용)
      .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
      .substring(0, 50); // 이름 길이 제한
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const normalizedFullFileName = `${normalizedFileName}.${fileExtension}`;

    console.log('파일명 정규화:', {
      originalFileName: file.name,
      normalizedFileName: normalizedFullFileName,
    });

    // 각 비디오에 대해 중복 검사 실행
    for (const video of videosResponse.videos || []) {
      // Django에서 가져온 비디오의 name도 정규화해서 비교
      const videoFileNameWithoutExt = video.name.substring(
        0,
        video.name.lastIndexOf('.')
      );
      const normalizedVideoFileName = videoFileNameWithoutExt
        .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s\-_]/g, '') // 안전하지 않은 문자 제거 (언더스코어와 하이픈 허용)
        .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
        .substring(0, 50); // 이름 길이 제한
      const videoFileExtension = video.name.split('.').pop() || 'mp4';
      const normalizedVideoFullFileName = `${normalizedVideoFileName}.${videoFileExtension}`;

      console.log('비교 중:', {
        videoName: video.name,
        normalizedVideoFileName: normalizedVideoFullFileName,
        uploadFileName: file.name,
        normalizedUploadFileName: normalizedFullFileName,
        videoSize: video.size,
        videoDuration: video.duration,
        fileNameMatch: normalizedVideoFullFileName === normalizedFullFileName,
        fileSizeMatch: video.size === file.size,
      });

      // 1차: 정규화된 파일명과 크기로 기본 중복 확인
      if (
        normalizedVideoFullFileName === normalizedFullFileName &&
        video.size === file.size
      ) {
        console.log('파일명과 크기 일치됨, duration 체크 중...');

        // duration이 제공된 경우 3가지 조건 모두 확인
        if (videoDuration !== undefined && video.duration > 0) {
          // duration 비교 시 0.5초 오차범위 허용
          const durationDiff = Math.abs(video.duration - videoDuration);
          console.log('Duration 비교:', {
            videoDuration: video.duration,
            uploadDuration: videoDuration,
            diff: durationDiff,
          });

          if (durationDiff <= 0.5) {
            console.log('중복 비디오 발견!');
            // Django 모델을 UploadedVideo 형태로 변환
            return {
              isDuplicate: true,
              duplicateVideo: {
                id: video.video_id.toString(),
                name: video.name,
                filePath: video.file_path || `/uploads/videos/${video.name}`,
                duration: video.duration,
                size: video.size,
                uploadDate: new Date(video.upload_date),
                thumbnail: video.computed_thumbnail_path || video.thumbnail_path,
                chatCount: video.chat_count,
                majorEvent: video.major_event,
              },
            };
          }
        } else {
          // duration이 없거나 0인 경우 파일명과 크기만으로 중복 판단
          console.log('Duration 정보 없음, 파일명과 크기로만 중복 판단');
          return {
            isDuplicate: true,
            duplicateVideo: {
              id: video.video_id.toString(),
              name: video.name,
              filePath: video.file_path || `/uploads/videos/${video.name}`,
              duration: video.duration,
              size: video.size,
              uploadDate: new Date(video.upload_date),
              thumbnail: video.computed_thumbnail_path || video.thumbnail_path,
              chatCount: video.chat_count,
              majorEvent: video.major_event,
            },
          };
        }
      }
    }

    console.log('중복 비디오 없음');
    return { isDuplicate: false };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { isDuplicate: false, error: '중복 확인 중 오류가 발생했습니다.' };
  }
}

// 비디오 파일 저장
// 로컬 시스템에 직접 저장하고 메타데이터는 Django에 저장하는 구현
export async function saveVideoFile(
  formData: FormData,
  videoDuration?: number,
  thumbnailPath?: string,
  videoDateTime?: string
): Promise<{
  success: boolean;
  videoId?: string;
  filePath?: string;
  error?: string;
  isDuplicate?: boolean;
  duplicateVideoId?: string;
}> {
  console.log('saveVideoFile 함수 시작');
  console.log('videoDuration:', videoDuration);
  console.log('thumbnailPath:', thumbnailPath);
  console.log('videoDateTime:', videoDateTime);

  try {
    const file = formData.get('video') as File;
    if (!file) {
      return { success: false, error: '파일이 없습니다.' };
    }

    console.log('파일 정보:', {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    // 파일 검증
    if (!file.type.startsWith('video/')) {
      return { success: false, error: '비디오 파일만 업로드 가능합니다.' };
    }

    // 파일 크기 제한
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: '파일 크기는 5GB를 초과할 수 없습니다.',
      };
    }

    // 중복 확인 (duration이 있을 때만 정확한 중복 검사)
    console.log('중복 체크 실행 중...');
    const duplicateCheck = await checkDuplicateVideo(file, videoDuration);
    console.log('중복 체크 결과:', duplicateCheck);

    if (duplicateCheck.isDuplicate && duplicateCheck.duplicateVideo) {
      console.log('중복 비디오 발견, 업로드 중단');
      return {
        success: false,
        isDuplicate: true,
        videoId: duplicateCheck.duplicateVideo.id,
        duplicateVideoId: duplicateCheck.duplicateVideo.id,
        filePath: duplicateCheck.duplicateVideo.filePath,
        error: '이미 업로드된 동영상입니다.',
      };
    }

    // 원본 파일명 기반 파일명 생성 (언더스코어와 하이픈 허용)
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const originalNameWithoutExt = file.name.substring(
      0,
      file.name.lastIndexOf('.')
    );
    const safeFileName = originalNameWithoutExt
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s\-_]/g, '') // 안전하지 않은 문자 제거 (언더스코어와 하이픈 허용)
      .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
      .substring(0, 50); // 이름 길이 제한

    // 파일명 충돌 확인 및 처리 - (1), (2) 형태로 번호 추가
    await ensureUploadDir();
    const files = await readdir(UPLOAD_DIR);
    let fileName = '';
    let counter = 0;

    do {
      if (counter === 0) {
        // 첫 시도에는 원본 이름 그대로
        fileName = `${safeFileName}.${fileExtension}`;
      } else {
        // 충돌 시 (1), (2) 형태로 번호 추가
        fileName = `${safeFileName}(${counter}).${fileExtension}`;
      }
      counter++;
    } while (files.includes(fileName) && counter < 100); // 100번 시도 제한

    // 파일 저장 경로
    const filePath = join(UPLOAD_DIR, fileName);

    // 파일 스트림으로 변환
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 파일 시스템에 비동기적으로 저장
    await writeFile(filePath, buffer);

    console.log('비디오 파일이 로컬에 저장되었습니다:', filePath);

    // 비디오 길이 (클라이언트에서 전달받거나 기본값 0)
    const duration = videoDuration ? Math.round(videoDuration) : 0;

    // 썸네일 경로 생성 (클라이언트에서 전달받거나 기본값)
    const finalThumbnailPath =
      thumbnailPath ||
      `/uploads/thumbnails/${fileName.replace(/\.[^/.]+$/, '')}.png`;

    // Django API에 비디오 메타데이터 저장
    const djangoResult = await createVideoInDjango({
      name: fileName, // 실제 저장된 파일명을 name으로 사용
      duration: duration,
      size: file.size,
      thumbnail_path: finalThumbnailPath,
      video_file_path: `/uploads/videos/${fileName}`, // 웹 경로
      time_in_video: videoDateTime, // 비디오 촬영 시간
    });

    if (!djangoResult.success) {
      // Django 저장 실패 시 로컬 파일 삭제
      try {
        await unlink(filePath);
        console.log('Django 저장 실패로 인한 로컬 파일 삭제 완료');
      } catch (cleanupError) {
        console.error('로컬 파일 정리 실패:', cleanupError);
      }
      
      return { 
        success: false, 
        error: `Django 저장 실패: ${djangoResult.error}` 
      };
    }

    console.log('비디오 메타데이터가 Django에 저장되었습니다:', djangoResult.video);

    return {
      success: true,
      videoId: djangoResult.video.video_id.toString(),
      filePath: `/uploads/videos/${fileName}`, // 웹 접근 경로 반환
    };
  } catch (error) {
    console.error('Video save error:', error);
    return { success: false, error: '파일 저장 중 오류가 발생했습니다.' };
  }
}

// 업로드된 비디오 목록 가져오기
export async function getUploadedVideos(cleanupThumbnails: boolean = false): Promise<VideoListResponse> {
  try {
    console.log('Django API에서 비디오 목록 가져오는 중...');

    // Django API에서 비디오 목록 가져오기
    const djangoResult = await getVideosFromDjango();
    if (!djangoResult.success) {
      return {
        success: false,
        data: [],
        error: djangoResult.error || '비디오 목록을 불러오는 중 오류가 발생했습니다.',
      };
    }

    // Django 모델을 UploadedVideo 형태로 변환
    const videos: UploadedVideo[] = (djangoResult.videos || []).map((video: any) => ({
      id: video.video_id.toString(),
      name: video.name,
      filePath: video.file_path || `/uploads/videos/${video.name}`,
      duration: video.duration,
      size: video.size,
      uploadDate: new Date(video.upload_date),
      thumbnail: video.computed_thumbnail_path || video.thumbnail_path,
      chatCount: video.chat_count,
      majorEvent: video.major_event,
      // Django API의 time_in_video 필드를 올바르게 매핑
      timeInVideo: video.time_in_video ? new Date(video.time_in_video) : null,
    }));

    console.log(`✅ Django에서 ${videos.length}개 비디오 로드 완료`);

    // 옵션으로 고아 썸네일 정리 실행
    if (cleanupThumbnails) {
      try {
        const cleanupResult = await cleanupOrphanedThumbnails();
        if (cleanupResult.success && cleanupResult.deletedCount > 0) {
          console.log(`🧹 고아 썸네일 ${cleanupResult.deletedCount}개 정리 완료`);
        }
      } catch (cleanupError) {
        console.warn('⚠️ 고아 썸네일 정리 중 오류 발생:', cleanupError);
      }
    }

    return { success: true, data: videos };
  } catch (error) {
    console.error('Failed to get uploaded videos:', error);
    return {
      success: false,
      data: [],
      error: '비디오 목록을 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 비디오 삭제
export async function deleteVideo(videoId: string): Promise<boolean> {
  console.log(`🗑️ 비디오 삭제 시작: ${videoId}`);
  try {
    // 먼저 Django에서 비디오 정보를 가져와서 파일 경로 확인
    const videosResponse = await getVideosFromDjango();
    if (!videosResponse.success) {
      console.error('❌ 비디오 목록 조회 실패');
      return false;
    }

    // videoId에 해당하는 비디오 찾기
    const targetVideo = videosResponse.videos?.find(
      (video) => video.video_id.toString() === videoId
    );
    if (!targetVideo) {
      console.error(`❌ 비디오를 찾을 수 없음: ${videoId}`);
      return false;
    }

    console.log(`📹 삭제할 비디오:`, {
      id: targetVideo.video_id,
      name: targetVideo.name,
      file_path: targetVideo.file_path,
    });

    // 1. Django에서 비디오 삭제 (CASCADE로 관련 데이터도 함께 삭제됨)
    const djangoDeleteResult = await deleteVideoFromDjango(videoId);
    if (!djangoDeleteResult.success) {
      console.error(`❌ Django 비디오 삭제 실패: ${djangoDeleteResult.error}`);
      return false;
    }

    console.log(`✅ Django 비디오 삭제 완료`);

    // 2. 로컬 비디오 파일 삭제
    const fileName = targetVideo.name;
    const filePath = join(UPLOAD_DIR, fileName);

    console.log(`📁 로컬 비디오 파일 삭제: ${filePath}`);

    if (existsSync(filePath)) {
      await unlink(filePath);
      console.log(`✅ 로컬 비디오 파일 삭제 완료`);
    } else {
      console.warn(`⚠️ 로컬 비디오 파일이 존재하지 않음: ${filePath}`);
    }

    // 3. 썸네일 파일 삭제 - 더 강력한 로직
    let thumbnailDeleted = false;
    const possibleThumbnailPaths: string[] = [];

    // 가능한 썸네일 경로들을 모두 수집
    if (targetVideo.thumbnail_path) {
      const thumbnailWebPath = targetVideo.thumbnail_path; // e.g., "/uploads/thumbnails/filename.png"
      const thumbnailFileName = thumbnailWebPath.split('/').pop(); // "filename.png"
      if (thumbnailFileName) {
        possibleThumbnailPaths.push(join(THUMBNAIL_DIR, thumbnailFileName));
      }
    }

    // computed_thumbnail_path도 확인
    if (targetVideo.computed_thumbnail_path) {
      const computedThumbnailWebPath = targetVideo.computed_thumbnail_path;
      const computedThumbnailFileName = computedThumbnailWebPath.split('/').pop();
      if (computedThumbnailFileName) {
        possibleThumbnailPaths.push(join(THUMBNAIL_DIR, computedThumbnailFileName));
      }
    }

    // 파일명 기반 썸네일 경로들 추가
    const baseFileName = fileName.replace(/\.[^/.]+$/, ''); // 확장자 제거
    const thumbnailExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    
    for (const ext of thumbnailExtensions) {
      possibleThumbnailPaths.push(join(THUMBNAIL_DIR, `${baseFileName}${ext}`));
    }

    // 번호가 붙은 파일명들도 확인 (예: filename(1).png)
    const numberMatch = fileName.match(/^(.+?)(\(\d+\))\.([^.]+)$/);
    if (numberMatch) {
      const [, baseName, numberPart, extension] = numberMatch;
      for (const ext of thumbnailExtensions) {
        possibleThumbnailPaths.push(join(THUMBNAIL_DIR, `${baseName}${numberPart}${ext}`));
        possibleThumbnailPaths.push(join(THUMBNAIL_DIR, `${baseName}${ext}`)); // 번호 없는 버전도
      }
    }

    // 중복 제거
    const uniqueThumbnailPaths = [...new Set(possibleThumbnailPaths)];

    console.log(`🖼️ 썸네일 삭제 시도할 경로들:`, uniqueThumbnailPaths);

    // 모든 가능한 썸네일 파일 삭제
    for (const thumbnailPath of uniqueThumbnailPaths) {
      try {
        if (existsSync(thumbnailPath)) {
          await unlink(thumbnailPath);
          console.log(`✅ 썸네일 파일 삭제 완료: ${thumbnailPath}`);
          thumbnailDeleted = true;
        }
      } catch (deleteError) {
        console.error(`❌ 썸네일 파일 삭제 실패: ${thumbnailPath}`, deleteError);
      }
    }

    // 썸네일 디렉토리에서 관련된 모든 파일 찾아서 삭제 (마지막 수단)
    if (!thumbnailDeleted) {
      try {
        const thumbnailFiles = await readdir(THUMBNAIL_DIR);
        const baseNameForSearch = baseFileName.toLowerCase();
        
        for (const file of thumbnailFiles) {
          const fileLower = file.toLowerCase();
          // 파일명이 비슷한 썸네일들 찾기
          if (fileLower.includes(baseNameForSearch) || baseNameForSearch.includes(fileLower.replace(/\.[^.]+$/, ''))) {
            const fullPath = join(THUMBNAIL_DIR, file);
            try {
              await unlink(fullPath);
              console.log(`✅ 유사 썸네일 파일 삭제 완료: ${fullPath}`);
              thumbnailDeleted = true;
            } catch (deleteError) {
              console.error(`❌ 유사 썸네일 파일 삭제 실패: ${fullPath}`, deleteError);
            }
          }
        }
      } catch (readError) {
        console.error('❌ 썸네일 디렉토리 읽기 실패:', readError);
      }
    }

    // 4. 관련 세션 삭제 (프론트엔드 세션 데이터)
    try {
      await deleteSessionsByVideoId(videoId);
      console.log(`✅ 관련 세션 삭제 완료`);
    } catch (sessionError) {
      console.error('❌ 세션 삭제 실패:', sessionError);
    }

    // 5. 최종 결과 확인
    const wasVideoDeleted = !existsSync(filePath);
    console.log(`📊 삭제 결과 요약:`);
    console.log(`   - Django 비디오 삭제: ✅ 성공`);
    console.log(`   - 로컬 비디오 파일 삭제: ${wasVideoDeleted ? '✅ 성공' : '❌ 실패'}`);
    console.log(`   - 썸네일 삭제: ${thumbnailDeleted ? '✅ 성공' : '⚠️ 없음'}`);

    console.log(`🎉 비디오 삭제 작업 완료: ${videoId}`);
    return true;
  } catch (error) {
    console.error('❌ 비디오 삭제 오류:', error);
    return false;
  }
}

// 비디오 메타데이터 업데이트
export async function updateVideoMetadata(
  videoId: string,
  updates: Partial<UploadedVideo>
): Promise<boolean> {
  try {
    // Django API로 메타데이터 업데이트
    const response = await fetch(`${DJANGO_API_BASE}/videos/${videoId}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(updates.name && { name: updates.name }),
        ...(updates.duration && { duration: updates.duration }),
        ...(updates.size && { size: updates.size }),
        ...(updates.thumbnail && { thumbnail_path: updates.thumbnail }),
        ...(updates.chatCount && { chat_count: updates.chatCount }),
        ...(updates.majorEvent && { major_event: updates.majorEvent }),
      }),
    });

    if (response.ok) {
      console.log('Django 비디오 메타데이터 업데이트 성공:', videoId, updates);
      return true;
    } else {
      console.error('Django API error:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('Video metadata update error:', error);
    return false;
  }
}

// 모든 비디오 가져오기 (기존 getAllVideos 함수를 단순화)
export async function getAllVideos(cleanupThumbnails: boolean = true): Promise<VideoListResponse> {
  try {
    // Django API 기반으로 비디오 목록 반환하고 기본적으로 썸네일 정리 실행
    return await getUploadedVideos(cleanupThumbnails);
  } catch (error) {
    console.error('Failed to get all videos:', error);
    return {
      success: false,
      data: [],
      error: '비디오 목록을 불러오는 중 오류가 발생했습니다.',
    };
  }
}

// 고아 썸네일 파일 정리 함수
export async function cleanupOrphanedThumbnails(): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  try {
    console.log('🧹 고아 썸네일 파일 정리 시작...');

    // 1. Django에서 현재 비디오 목록 가져오기
    const videosResponse = await getVideosFromDjango();
    if (!videosResponse.success) {
      return { success: false, deletedCount: 0, error: videosResponse.error };
    }

    const videos = videosResponse.videos || [];
    const validThumbnails = new Set<string>();

    // 2. 유효한 썸네일 파일명들 수집
    for (const video of videos) {
      if (video.thumbnail_path) {
        const thumbnailFileName = video.thumbnail_path.split('/').pop();
        if (thumbnailFileName) {
          validThumbnails.add(thumbnailFileName);
        }
      }

      if (video.computed_thumbnail_path) {
        const computedThumbnailFileName = video.computed_thumbnail_path.split('/').pop();
        if (computedThumbnailFileName) {
          validThumbnails.add(computedThumbnailFileName);
        }
      }

      // 비디오 파일명 기반 썸네일도 유효한 것으로 간주
      const baseFileName = video.name.replace(/\.[^/.]+$/, '');
      const thumbnailExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
      for (const ext of thumbnailExtensions) {
        validThumbnails.add(`${baseFileName}${ext}`);
      }
    }

    console.log(`📋 유효한 썸네일 파일 ${validThumbnails.size}개 확인됨`);

    // 3. 썸네일 디렉토리의 모든 파일 확인
    if (!existsSync(THUMBNAIL_DIR)) {
      console.log('📁 썸네일 디렉토리가 존재하지 않음');
      return { success: true, deletedCount: 0 };
    }

    const thumbnailFiles = await readdir(THUMBNAIL_DIR);
    let deletedCount = 0;

    console.log(`📂 썸네일 디렉토리에 ${thumbnailFiles.length}개 파일 존재`);

    // 4. 고아 파일들 삭제
    for (const fileName of thumbnailFiles) {
      const fullPath = join(THUMBNAIL_DIR, fileName);
      
      // 파일인지 확인 (디렉토리 제외)
      try {
        const stats = await stat(fullPath);
        if (!stats.isFile()) {
          continue;
        }
      } catch (statError) {
        console.warn(`⚠️ 파일 정보 확인 실패: ${fullPath}`);
        continue;
      }

      // 유효한 썸네일인지 확인
      if (!validThumbnails.has(fileName)) {
        try {
          await unlink(fullPath);
          console.log(`🗑️ 고아 썸네일 삭제: ${fileName}`);
          deletedCount++;
        } catch (deleteError) {
          console.error(`❌ 고아 썸네일 삭제 실패: ${fileName}`, deleteError);
        }
      }
    }

    console.log(`✅ 고아 썸네일 정리 완료: ${deletedCount}개 파일 삭제됨`);

    return { success: true, deletedCount };
  } catch (error) {
    console.error('❌ 고아 썸네일 정리 실패:', error);
    return { success: false, deletedCount: 0, error: '고아 썸네일 정리 중 오류가 발생했습니다.' };
  }
}

// Event 테이블에서 비디오별 이벤트 타입 통계 가져오기
export async function getVideoEventStats(videoId: string): Promise<{
  success: boolean;
  data?: {
    videoId: string;
    mostFrequentEvent?: {
      eventType: string;
      count: number;
    };
    stats: Array<{
      event_type: string;
      count: number;
    }>;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${DJANGO_DB_BASE}/events/video-stats/?video_id=${videoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        data: {
          videoId: result.video_id,
          mostFrequentEvent: result.most_frequent_event ? {
            eventType: result.most_frequent_event.event_type,
            count: result.most_frequent_event.count,
          } : undefined,
          stats: result.stats,
        },
      };
    } else {
      const errorText = await response.text();
      console.error('Event stats API error:', errorText);
      return { success: false, error: `이벤트 통계 조회 실패: ${response.status}` };
    }
  } catch (error) {
    console.error('Event stats fetch error:', error);
    return { success: false, error: '이벤트 통계 조회 중 오류가 발생했습니다.' };
  }
}
