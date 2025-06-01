'use server';

import type { UploadedVideo, VideoListResponse } from '@/app/types/video';
import { mkdir, writeFile, readdir, unlink, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { deleteSessionsByVideoId } from './session-service';

// 업로드 디렉토리 설정
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'videos');
const METADATA_DIR = join(process.cwd(), 'public', 'uploads', 'metadata');

// 디렉토리 생성 함수
async function ensureUploadDir() {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }
    if (!existsSync(METADATA_DIR)) {
      await mkdir(METADATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

// 메타데이터 저장 함수
async function saveVideoMetadata(videoData: UploadedVideo): Promise<void> {
  try {
    const metadataPath = join(METADATA_DIR, `${videoData.id}.json`);
    await writeFile(metadataPath, JSON.stringify(videoData, null, 2));
    console.log('Video metadata saved:', metadataPath);
  } catch (error) {
    console.error('Failed to save video metadata:', error);
  }
}

// 메타데이터 로드 함수
async function loadVideoMetadata(
  videoId: string
): Promise<UploadedVideo | null> {
  try {
    const metadataPath = join(METADATA_DIR, `${videoId}.json`);
    if (!existsSync(metadataPath)) {
      return null;
    }
    const data = await readFile(metadataPath, 'utf-8');
    return JSON.parse(data) as UploadedVideo;
  } catch (error) {
    console.error('Failed to load video metadata:', error);
    return null;
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

    // 디렉토리 존재 확인
    await ensureUploadDir();

    // 먼저 기존 비디오들을 가져와서 비교
    const videosResponse = await getUploadedVideos();
    if (!videosResponse.success) {
      return { isDuplicate: false, error: videosResponse.error };
    }

    console.log('기존 비디오 개수:', videosResponse.data.length);

    // 업로드할 파일명을 정규화 (saveVideoFile과 동일한 로직)
    const fileNameWithoutExt = file.name.substring(
      0,
      file.name.lastIndexOf('.')
    );
    const normalizedFileName = fileNameWithoutExt
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '') // 안전하지 않은 문자 제거
      .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
      .substring(0, 50); // 이름 길이 제한
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const normalizedFullFileName = `${normalizedFileName}.${fileExtension}`;

    console.log('파일명 정규화:', {
      originalFileName: file.name,
      normalizedFileName: normalizedFullFileName,
    });

    // 각 비디오에 대해 중복 검사 실행
    for (const video of videosResponse.data) {
      // 기존 비디오의 originalName도 정규화해서 비교
      const videoFileNameWithoutExt = video.originalName.substring(
        0,
        video.originalName.lastIndexOf('.')
      );
      const normalizedVideoFileName = videoFileNameWithoutExt
        .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '') // 안전하지 않은 문자 제거
        .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
        .substring(0, 50); // 이름 길이 제한
      const videoFileExtension = video.originalName.split('.').pop() || 'mp4';
      const normalizedVideoFullFileName = `${normalizedVideoFileName}.${videoFileExtension}`;

      console.log('비교 중:', {
        videoOriginalName: video.originalName,
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
            return {
              isDuplicate: true,
              duplicateVideo: video,
            };
          }
        } else {
          // duration이 없거나 0인 경우 파일명과 크기만으로 중복 판단
          console.log('Duration 정보 없음, 파일명과 크기로만 중복 판단');
          return {
            isDuplicate: true,
            duplicateVideo: video,
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
// 로컬 시스템에 직접 저장하는 구현
export async function saveVideoFile(
  formData: FormData,
  videoDuration?: number
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

    // 파일 크기 제한 (2GB)
    const maxSize = 2 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: '파일 크기는 2GB를 초과할 수 없습니다.',
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

    // 원본 파일명 기반 파일명 생성 (특수문자 제거 후 공백은 언더스코어로 대체)
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const originalNameWithoutExt = file.name.substring(
      0,
      file.name.lastIndexOf('.')
    );
    const safeOriginalName = originalNameWithoutExt
      .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '') // 안전하지 않은 문자 제거
      .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
      .substring(0, 50); // 이름 길이 제한

    // 파일명 충돌 확인 및 처리 - (1), (2) 형태로 번호 추가
    const files = await readdir(UPLOAD_DIR);
    const videoId = timestamp.toString();
    let fileName = '';
    let counter = 0;

    do {
      if (counter === 0) {
        // 첫 시도에는 원본 이름 그대로
        fileName = `${safeOriginalName}.${fileExtension}`;
      } else {
        // 충돌 시 (1), (2) 형태로 번호 추가
        fileName = `${safeOriginalName}(${counter}).${fileExtension}`;
      }
      counter++;
    } while (files.includes(fileName) && counter < 100); // 100번 시도 제한

    // 업로드 디렉토리 준비
    await ensureUploadDir();

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

    // 비디오 메타데이터 (데이터베이스 대신 JSON 파일로 저장)
    const videoData: UploadedVideo = {
      id: videoId,
      name: fileName,
      originalName: file.name,
      filePath: `/uploads/videos/${fileName}`, // 웹 경로
      duration: duration,
      size: file.size,
      uploadDate: new Date(),
      chatCount: 0,
      majorEvent: null,
    };

    // 메타데이터를 JSON 파일로 저장
    await saveVideoMetadata(videoData);
    console.log('비디오 메타데이터가 저장되었습니다:', videoData);

    return {
      success: true,
      videoId,
      filePath: `/uploads/videos/${fileName}`, // 웹 접근 경로 반환
    };
  } catch (error) {
    console.error('Video save error:', error);
    return { success: false, error: '파일 저장 중 오류가 발생했습니다.' };
  }
}

// 업로드된 비디오 목록 가져오기
export async function getUploadedVideos(): Promise<VideoListResponse> {
  try {
    // 디렉토리 존재 확인
    await ensureUploadDir();

    // 이미 import된 readdir과 stat 함수를 사용하므로 별도의 설정 필요 없음

    // 비디오 디렉토리 읽기
    const files = await readdir(UPLOAD_DIR);

    // 비디오 파일만 필터링
    const videoFiles = files.filter(
      (file: string) =>
        file.endsWith('.mp4') ||
        file.endsWith('.webm') ||
        file.endsWith('.ogg') ||
        file.endsWith('.mov')
    );

    // 각 비디오에 대한 메타데이터 수집
    const videos: UploadedVideo[] = await Promise.all(
      videoFiles.map(async (fileName: string) => {
        const filePath = join(UPLOAD_DIR, fileName);
        const fileStats = await stat(filePath);

        // 파일명에서 ID 추출 - timestamp 기반으로 생성
        const nameParts = fileName.split('.');
        const extension = nameParts.pop() || 'mp4';

        // ID는 파일 생성 시간 기반으로 생성
        const id = fileStats.birthtime.getTime().toString();

        // 원본 파일명 추출 - (숫자) 패턴 제거하여 원본 이름 복원
        let originalName = fileName;

        // 파일명에서 확장자 분리
        const lastDotIndex = fileName.lastIndexOf('.');
        const fileExtension =
          lastDotIndex > -1 ? fileName.substring(lastDotIndex) : '';
        const baseNameWithoutExt =
          lastDotIndex > -1 ? fileName.substring(0, lastDotIndex) : fileName;

        // (숫자) 패턴이 끝에 있는지 확인하여 제거
        const numberPattern = /\((\d+)\)$/;
        const match = baseNameWithoutExt.match(numberPattern);
        if (match) {
          // "이름(숫자)" 형태에서 "(숫자)" 부분 제거
          const baseName = baseNameWithoutExt.replace(numberPattern, '');
          originalName = baseName + fileExtension;
        }

        // 언더스코어를 공백으로 복원하고 안전 문자 처리 복원
        originalName = originalName.replace(/_/g, ' ');

        // 메타데이터 JSON 파일에서 실제 정보 로드 시도
        const metadata = await loadVideoMetadata(id);

        if (metadata) {
          // 메타데이터가 있으면 그것을 사용
          return {
            ...metadata,
            // 파일 시스템에서 가져온 정보로 일부 업데이트 (변경될 수 있는 정보들)
            size: fileStats.size,
            uploadDate: fileStats.birthtime,
            filePath: `/uploads/videos/${fileName}`, // 웹에서 접근 가능한 경로
          };
        }

        // 메타데이터가 없으면 기본값으로 생성 (하위 호환성)
        const duration = 0;

        return {
          id,
          name: fileName,
          originalName: originalName,
          filePath: `/uploads/videos/${fileName}`, // 웹에서 접근 가능한 경로
          duration: duration,
          size: fileStats.size,
          uploadDate: fileStats.birthtime,
          thumbnail: '/placeholder.svg?height=120&width=200',
          chatCount: 0, // 실제 구현에서는 DB 조회
          majorEvent: null, // 실제 구현에서는 분석 결과에서 가져옴
          description: `업로드된 비디오: ${fileName}`, // 실제 구현에서는 사용자 입력 또는 분석 결과
        };
      })
    );

    // 최신 비디오가 먼저 오도록 정렬
    videos.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime());

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
  try {
    // 먼저 모든 비디오 목록을 가져와서 해당 ID의 비디오 찾기
    const videosResponse = await getUploadedVideos();
    if (!videosResponse.success) {
      console.error('비디오 목록 조회 실패');
      return false;
    }

    // videoId에 해당하는 비디오 찾기
    const targetVideo = videosResponse.data.find(
      (video) => video.id === videoId
    );
    if (!targetVideo) {
      console.error(`비디오를 찾을 수 없음: ${videoId}`);
      return false;
    }

    // 파일 경로에서 실제 파일명 추출
    // filePath 형태: "/uploads/videos/filename.mp4"
    const fileName = targetVideo.name; // name 필드에 실제 파일명이 저장됨
    const filePath = join(UPLOAD_DIR, fileName);

    // 파일 존재 확인
    if (!existsSync(filePath)) {
      console.error(`파일이 존재하지 않음: ${filePath}`);
      return false;
    }

    // 파일 삭제
    await unlink(filePath);

    // 메타데이터 JSON 파일 삭제
    try {
      const metadataPath = join(METADATA_DIR, `${videoId}.json`);
      if (existsSync(metadataPath)) {
        await unlink(metadataPath);
        console.log(`메타데이터 삭제 완료: ${metadataPath}`);
      }
    } catch (metadataError) {
      console.error('메타데이터 삭제 중 오류 발생:', metadataError);
      // 메타데이터 삭제 실패해도 비디오 파일은 삭제되었으므로 계속 진행
    }

    console.log(`비디오 삭제 완료: ${videoId}, 파일: ${filePath}`);

    // 관련 세션들도 함께 삭제
    try {
      await deleteSessionsByVideoId(videoId);
      console.log(`비디오 ${videoId}의 관련 세션들 삭제 완료`);
    } catch (sessionError) {
      console.error('세션 삭제 중 오류 발생:', sessionError);
      // 파일은 이미 삭제되었으므로 세션 삭제 실패해도 전체 작업은 성공으로 처리
    }

    return true;
  } catch (error) {
    console.error('비디오 삭제 오류:', error);
    return false;
  }
}

// 비디오 메타데이터 업데이트
export async function updateVideoMetadata(
  videoId: string,
  updates: Partial<UploadedVideo>
): Promise<boolean> {
  try {
    // TODO: 데이터베이스 업데이트
    console.log('Video metadata updated:', videoId, updates);
    return true;
  } catch (error) {
    console.error('Video metadata update error:', error);
    return false;
  }
}
