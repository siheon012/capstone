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
    await ensureUploadDir(); // 디렉토리 확실히 생성
    const metadataPath = join(METADATA_DIR, `${videoData.id}.json`);
    console.log(`💾 메타데이터 저장 중: ${metadataPath}`);
    console.log(`📂 메타데이터 디렉토리: ${METADATA_DIR}`);
    console.log(`🆔 비디오 ID: ${videoData.id}`);
    
    await writeFile(metadataPath, JSON.stringify(videoData, null, 2));
    console.log(`✅ 메타데이터 저장 완료: ${metadataPath}`);
    console.log(`📊 저장된 데이터:`, videoData);
  } catch (error) {
    console.error('❌ 메타데이터 저장 실패:', error);
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

    // 메타데이터 파일들을 먼저 읽어서 파일명과 매핑
    const metadataFiles = await readdir(METADATA_DIR);
    const metadataMap = new Map<string, UploadedVideo>();
    
    console.log(`📂 메타데이터 파일 개수: ${metadataFiles.length}`);
    
    for (const metaFile of metadataFiles) {
      if (metaFile.endsWith('.json')) {
        try {
          const metaPath = join(METADATA_DIR, metaFile);
          const metaData = await readFile(metaPath, 'utf-8');
          const videoData = JSON.parse(metaData) as UploadedVideo;
          metadataMap.set(videoData.name, videoData);
          console.log(`📄 메타데이터 로드: ${videoData.name} -> ID: ${videoData.id}`);
        } catch (error) {
          console.error(`❌ 메타데이터 파일 읽기 실패: ${metaFile}`, error);
        }
      }
    }

    // 각 비디오에 대한 메타데이터 수집
    const videos: UploadedVideo[] = await Promise.all(
      videoFiles.map(async (fileName: string) => {
        const filePath = join(UPLOAD_DIR, fileName);
        const fileStats = await stat(filePath);

        // 메타데이터에서 실제 비디오 정보 찾기
        const videoMetadata = metadataMap.get(fileName);
        
        if (videoMetadata) {
          // 메타데이터가 있으면 그것을 사용하고 파일 정보만 업데이트
          console.log(`✅ 메타데이터 발견: ${fileName} -> ID: ${videoMetadata.id}`);
          return {
            ...videoMetadata,
            size: fileStats.size,
            uploadDate: fileStats.birthtime,
            filePath: `/uploads/videos/${fileName}`,
          };
        }

        // 메타데이터가 없는 경우 (하위 호환성) - 파일 생성 시간을 ID로 사용
        console.warn(`⚠️ 메타데이터 없음: ${fileName}, 파일 시간으로 ID 생성`);
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
  console.log(`🗑️ 비디오 삭제 시작: ${videoId}`);
  try {
    // 먼저 모든 비디오 목록을 가져와서 해당 ID의 비디오 찾기
    const videosResponse = await getUploadedVideos();
    if (!videosResponse.success) {
      console.error('❌ 비디오 목록 조회 실패');
      return false;
    }

    // videoId에 해당하는 비디오 찾기
    const targetVideo = videosResponse.data.find(
      (video) => video.id === videoId
    );
    if (!targetVideo) {
      console.error(`❌ 비디오를 찾을 수 없음: ${videoId}`);
      return false;
    }

    console.log(`📹 삭제할 비디오:`, {
      id: targetVideo.id,
      name: targetVideo.name,
      originalName: targetVideo.originalName,
      filePath: targetVideo.filePath
    });

    // 1. 비디오 파일 삭제
    const fileName = targetVideo.name;
    const filePath = join(UPLOAD_DIR, fileName);
    
    console.log(`📁 비디오 파일 삭제: ${filePath}`);

    if (existsSync(filePath)) {
      await unlink(filePath);
      console.log(`✅ 비디오 파일 삭제 완료`);
    } else {
      console.warn(`⚠️ 비디오 파일이 존재하지 않음: ${filePath}`);
    }

    // 2. 메타데이터 파일 삭제 - 모든 메타데이터 파일을 검사해서 매칭되는 것 삭제
    let metadataDeleted = false;
    let matchedFiles: string[] = [];
    
    try {
      const metadataFiles = await readdir(METADATA_DIR);
      console.log(`🔍 메타데이터 파일 ${metadataFiles.length}개 검사 시작`);
      console.log(`🎯 찾는 조건: ID='${videoId}' 또는 파일명='${fileName}'`);

      for (const metaFile of metadataFiles) {
        if (metaFile.endsWith('.json')) {
          try {
            const metaPath = join(METADATA_DIR, metaFile);
            console.log(`📄 검사 중: ${metaFile}`);
            
            const metaData = await readFile(metaPath, 'utf-8');
            const videoData = JSON.parse(metaData) as UploadedVideo;
            
            console.log(`   - 메타데이터 ID: '${videoData.id}'`);
            console.log(`   - 메타데이터 파일명: '${videoData.name}'`);
            
            // ID 또는 파일명이 일치하는 메타데이터 찾기
            const idMatch = videoData.id === videoId;
            const nameMatch = videoData.name === fileName;
            
            if (idMatch || nameMatch) {
              console.log(`🎯 매칭된 메타데이터 발견!`);
              console.log(`   - 파일: ${metaFile}`);
              console.log(`   - ID 매칭: ${idMatch} (${videoData.id} === ${videoId})`);
              console.log(`   - 파일명 매칭: ${nameMatch} (${videoData.name} === ${fileName})`);
              
              await unlink(metaPath);
              console.log(`✅ 메타데이터 삭제 완료: ${metaFile}`);
              matchedFiles.push(metaFile);
              metadataDeleted = true;
            } else {
              console.log(`   - 매칭 안됨`);
            }
          } catch (error) {
            console.error(`❌ 메타데이터 파일 읽기 실패: ${metaFile}`, error);
          }
        }
      }

      if (!metadataDeleted) {
        console.warn(`⚠️ 삭제할 메타데이터를 찾을 수 없음`);
        console.warn(`   조건: ID='${videoId}' 또는 파일명='${fileName}'`);
        
        // 백업 방법: ID를 파일명으로 한 메타데이터 파일 직접 삭제 시도
        const directMetaPath = join(METADATA_DIR, `${videoId}.json`);
        console.log(`🔄 백업 삭제 시도: ${directMetaPath}`);
        
        if (existsSync(directMetaPath)) {
          try {
            await unlink(directMetaPath);
            console.log(`✅ 백업 방법으로 메타데이터 삭제 성공: ${videoId}.json`);
            metadataDeleted = true;
          } catch (error) {
            console.error(`❌ 백업 삭제 실패:`, error);
          }
        } else {
          console.log(`❌ 백업 파일도 존재하지 않음: ${videoId}.json`);
        }
      } else {
        console.log(`🎉 메타데이터 삭제 성공: ${matchedFiles.join(', ')}`);
      }
    } catch (metadataError) {
      console.error('❌ 메타데이터 디렉토리 읽기 실패:', metadataError);
    }

    // 3. 관련 세션 삭제
    try {
      await deleteSessionsByVideoId(videoId);
      console.log(`✅ 관련 세션 삭제 완료`);
    } catch (sessionError) {
      console.error('❌ 세션 삭제 실패:', sessionError);
    }

    // 4. 최종 결과 확인
    const wasVideoDeleted = !existsSync(filePath);
    console.log(`📊 삭제 결과 요약:`);
    console.log(`   - 비디오 파일 삭제: ${wasVideoDeleted ? '✅ 성공' : '❌ 실패'}`);
    console.log(`   - 메타데이터 삭제: ${metadataDeleted ? '✅ 성공' : '❌ 실패'}`);

    if (wasVideoDeleted && metadataDeleted) {
      console.log(`🎉 비디오 삭제 작업 완료: ${videoId}`);
      return true;
    } else {
      console.error(`⚠️ 일부 삭제 실패 - 비디오: ${wasVideoDeleted}, 메타데이터: ${metadataDeleted}`);
      return false;
    }
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
    // TODO: 데이터베이스 업데이트
    console.log('Video metadata updated:', videoId, updates);
    return true;
  } catch (error) {
    console.error('Video metadata update error:', error);
    return false;
  }
}

// 고아 메타데이터 파일 정리 함수
async function cleanupOrphanedMetadata(): Promise<void> {
  try {
    const metadataFiles = await readdir(METADATA_DIR);
    const videoFiles = await readdir(UPLOAD_DIR);
    
    // 비디오 파일만 필터링
    const existingVideoFiles = new Set(videoFiles.filter(
      (file: string) =>
        file.endsWith('.mp4') ||
        file.endsWith('.webm') ||
        file.endsWith('.ogg') ||
        file.endsWith('.mov')
    ));
    
    console.log(`🧹 고아 메타데이터 정리 시작`);
    console.log(`📹 존재하는 비디오 파일: ${Array.from(existingVideoFiles).join(', ')}`);
    
    for (const metaFile of metadataFiles) {
      if (metaFile.endsWith('.json')) {
        try {
          const metaPath = join(METADATA_DIR, metaFile);
          const metaData = await readFile(metaPath, 'utf-8');
          const videoData = JSON.parse(metaData) as UploadedVideo;
          
          // 해당하는 비디오 파일이 존재하지 않으면 메타데이터 삭제
          if (!existingVideoFiles.has(videoData.name)) {
            console.log(`🗑️ 고아 메타데이터 발견: ${metaFile} (비디오 파일: ${videoData.name})`);
            await unlink(metaPath);
            console.log(`✅ 고아 메타데이터 삭제 완료: ${metaFile}`);
          }
        } catch (error) {
          console.error(`❌ 메타데이터 파일 처리 실패: ${metaFile}`, error);
        }
      }
    }
    
    console.log(`🎉 고아 메타데이터 정리 완료`);
  } catch (error) {
    console.error('❌ 고아 메타데이터 정리 실패:', error);
  }
}

// 비디오 목록을 가져올 때 고아 메타데이터 정리도 함께 실행
export async function getAllVideos(): Promise<VideoListResponse> {
  try {
    // 고아 메타데이터 정리 실행
    await cleanupOrphanedMetadata();
    
    // 일반적인 비디오 목록 반환
    return await getUploadedVideos();
  } catch (error) {
    console.error('Failed to get all videos:', error);
    return {
      success: false,
      data: [],
      error: '비디오 목록을 불러오는 중 오류가 발생했습니다.',
    };
  }
}