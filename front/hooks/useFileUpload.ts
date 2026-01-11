import { useState } from 'react';
import { uploadVideoToS3 } from '@/app/actions/s3-upload-service';

interface UseFileUploadProps {
  setVideoSrc: (src: string | null) => void;
  setVideoFileName: (name: string) => void;
  setVideoId: (id: string | null) => void;
  setVideo: (video: any) => void;
  setVideoLoading: (loading: boolean) => void;
  setVideoError: (error: string | null) => void;
  setIsDuplicateVideo: (isDuplicate: boolean) => void;
  setIsUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setUploadStage: (stage: string) => void;
  setUploadStartTime: (time: number | null) => void;
  setDragDropVisible: (visible: boolean) => void;
  setCurrentHistoryId: (id: string | undefined) => void;
  setCurrentSession: (session: any) => void;
  setTimeMarkers: (markers: number[]) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalysisProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  isMobile: boolean;
  isDuplicateVideo: boolean;
  uploadStartTime: number | null;
  startProgressPolling: (videoId: string) => void;
  startActualAIAnalysis: (videoId: string, file: File) => void;
  addToast: (toast: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration: number;
  }) => void;
}

// HTML5 Video API를 사용하여 비디오 duration 추출 함수
const getVideoDurationFromFile = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Video duration extraction timeout'));
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);

      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        resolve(video.duration);
      } else {
        reject(new Error('Invalid video duration'));
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
};

export const useFileUpload = ({
  setVideoSrc,
  setVideoFileName,
  setVideoId,
  setVideo,
  setVideoLoading,
  setVideoError,
  setIsDuplicateVideo,
  setIsUploading,
  setUploadProgress,
  setUploadStage,
  setUploadStartTime,
  setDragDropVisible,
  setCurrentHistoryId,
  setCurrentSession,
  setTimeMarkers,
  setIsAnalyzing,
  setAnalysisProgress,
  setDuration,
  isMobile,
  isDuplicateVideo,
  uploadStartTime,
  startProgressPolling,
  startActualAIAnalysis,
  addToast,
}: UseFileUploadProps) => {
  const handleFileUpload = async (file: File, videoDateTime?: string) => {
    try {
      console.log('🎬 [Upload Start] 파일 업로드 시작:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        videoDateTime,
      });

      setVideoLoading(true);
      setVideoError(null);
      setIsDuplicateVideo(false);

      setIsUploading(true);
      setUploadProgress(0);
      setUploadStartTime(Date.now());

      // Validate file type (0-10%)
      setUploadStage('파일 형식을 확인하는 중...');
      setUploadProgress(5);

      console.log('📋 [File Validation] 파일 형식 검증 중:', file.type);

      const validVideoTypes = [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/avi',
        'video/mov',
        'video/quicktime',
      ];

      if (!validVideoTypes.includes(file.type)) {
        console.error(
          '❌ [File Validation] 지원하지 않는 파일 형식:',
          file.type
        );
        setIsUploading(false);
        setVideoLoading(false);
        setDragDropVisible(false);
        addToast({
          type: 'error',
          title: '지원하지 않는 파일 형식',
          message: 'MP4, WebM, OGG 형식의 비디오 파일만 지원됩니다.',
          duration: 3000,
        });
        return;
      }
      console.log('✅ [File Validation] 파일 형식 검증 통과:', file.type);

      // Validate file size (10-20%)
      setUploadStage('파일 크기를 확인하는 중...');
      setUploadProgress(15);

      console.log('📏 [Size Validation] 파일 크기 검증 중:', {
        size: file.size,
        sizeInMB: (file.size / (1024 * 1024)).toFixed(2) + 'MB',
      });

      const maxSize = 5 * 1024 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error(
          '❌ [Size Validation] 파일 크기 초과:',
          file.size,
          'max:',
          maxSize
        );
        setIsUploading(false);
        setVideoLoading(false);
        setDragDropVisible(false);
        addToast({
          type: 'error',
          title: '파일 크기 초과',
          message: '2GB 이하의 파일만 업로드할 수 있습니다.',
          duration: 3000,
        });
        return;
      }
      console.log('✅ [Size Validation] 파일 크기 검증 통과');

      // Extract video duration (20-40%)
      setUploadStage('비디오 메타데이터를 추출하는 중...');
      setUploadProgress(25);

      console.log('🎞️ [Duration Extraction] 비디오 duration 추출 시작');
      let videoDuration: number | undefined = undefined;
      try {
        videoDuration = await getVideoDurationFromFile(file);
        console.log('✅ [Duration Extraction] 성공:', videoDuration, '초');
        setUploadProgress(40);
      } catch (durationError) {
        console.warn('⚠️ [Duration Extraction] 실패:', durationError);
        setUploadProgress(40);
      }

      // Duplicate check (40-50%)
      setUploadStage('중복 파일을 확인하는 중...');
      setUploadProgress(45);

      console.log('🔍 [Duplicate Check] 중복 비디오 확인 중...');
      let serverSaveResult = null;
      try {
        const { checkDuplicateVideo } = await import(
          '@/app/actions/video-service-client'
        );
        const duplicateCheck = await checkDuplicateVideo(file, videoDuration);

        if (duplicateCheck.isDuplicate && duplicateCheck.duplicateVideo) {
          console.log(
            '🔄 [Duplicate] 중복 비디오 발견:',
            duplicateCheck.duplicateVideo.id
          );

          serverSaveResult = {
            success: false,
            isDuplicate: true,
            videoId: duplicateCheck.duplicateVideo.id,
            duplicateVideoId: duplicateCheck.duplicateVideo.id,
            error: '이미 업로드된 동영상입니다.',
          };

          setVideoId(duplicateCheck.duplicateVideo.id);
          setIsDuplicateVideo(true);
          setUploadProgress(100);
          setUploadStage('중복 비디오 감지됨');
          setIsUploading(false);
          setVideoLoading(false);
          setDragDropVisible(false);

          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setTimeout(() => {
              const uploadSection = document.getElementById('upload-section');
              if (uploadSection) {
                uploadSection.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }
            }, 100);
          }

          addToast({
            type: 'warning',
            title: '중복 동영상',
            message: '이미 업로드된 동영상입니다.',
            duration: 3000,
          });

          console.log('🔄 [Duplicate] 중복 처리 완료, 업로드 중단');
          return;
        }

        console.log('✅ [Duplicate Check] 중복 없음, 업로드 진행');
        setUploadProgress(50);
      } catch (duplicateError) {
        console.warn('⚠️ [Duplicate Check] 중복 확인 실패:', duplicateError);
        setUploadProgress(50);
      }

      // Thumbnail generation (50-70%)
      setUploadStage('썸네일을 생성하는 중...');
      setUploadProgress(55);

      console.log('🖼️ [Thumbnail] 썸네일 생성 시작');
      let thumbnailPath: string | null = null;
      try {
        const { createAndUploadThumbnailWithFallback } = await import(
          '@/utils/thumbnail-utils'
        );
        thumbnailPath = await createAndUploadThumbnailWithFallback(
          file,
          file.name
        );
        if (thumbnailPath) {
          console.log('✅ [Thumbnail] 생성 및 업로드 성공:', thumbnailPath);
        } else {
          console.warn('⚠️ [Thumbnail] 생성 실패, 썸네일 없이 진행');
        }
        setUploadProgress(70);
      } catch (thumbnailError) {
        console.warn('❌ [Thumbnail] 오류 발생:', thumbnailError);
        setUploadProgress(70);
      }

      // S3 upload (70-95%)
      setUploadStage('S3에 업로드 중...');
      setUploadProgress(75);

      console.log('🚀 [S3 Upload] S3 업로드 시작...');
      try {
        const uploadResult = await uploadVideoToS3(file, {
          duration: videoDuration,
          thumbnailUrl: thumbnailPath || undefined,
          videoDateTime: videoDateTime,
          onProgress: (stage, progress) => {
            console.log(`📊 [S3 Progress] ${stage}: ${progress}%`);
            setUploadStage(stage);
            setUploadProgress(75 + progress * 0.2);
          },
        });

        console.log('✅ [S3 Upload] S3 업로드 완료:', uploadResult);

        serverSaveResult = {
          success: true,
          videoId: uploadResult.video_id.toString(),
          video: uploadResult.video,
        };

        setUploadProgress(95);

        if (serverSaveResult.success && serverSaveResult.videoId) {
          setVideoId(serverSaveResult.videoId);
          console.log(
            '🆔 [New Video] 새 비디오 ID 설정:',
            serverSaveResult.videoId
          );
        }

        console.log('✅ [Server Save] 저장 성공:', serverSaveResult.videoId);
      } catch (serverError) {
        console.error('❌ [S3 Upload] 예외 발생:', serverError);
        setIsUploading(false);
        setVideoLoading(false);
        setDragDropVisible(false);
        addToast({
          type: 'error',
          title: '업로드 실패',
          message: '파일 업로드 중 오류가 발생했습니다.',
          duration: 4000,
        });
        return;
      }

      // Prepare video (80-90%)
      setUploadStage('비디오를 준비하는 중...');
      setUploadProgress(85);

      const objectUrl = URL.createObjectURL(file);

      const testVideo = document.createElement('video');
      testVideo.muted = true;
      testVideo.playsInline = true;
      testVideo.preload = 'metadata';

      const loadPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            console.warn('Video loading timeout, but continuing...');
            resolve(objectUrl);
          },
          isMobile ? 15000 : 10000
        );

        testVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
          console.log('Video metadata loaded successfully');
          resolve(objectUrl);
        };

        testVideo.oncanplay = () => {
          clearTimeout(timeout);
          console.log('Video can play');
          resolve(objectUrl);
        };

        testVideo.onerror = (e) => {
          clearTimeout(timeout);
          console.warn('Video validation failed, but continuing:', e);
          resolve(objectUrl);
        };

        testVideo.src = objectUrl;
      });

      try {
        const validUrl = await loadPromise;

        setUploadStage('업로드를 완료하는 중...');
        setUploadProgress(95);

        setVideoSrc(validUrl as string);
        setVideoFileName(file.name);
        setCurrentHistoryId(undefined);
        setCurrentSession(null);
        setTimeMarkers([]);
        
        // Duration 설정 (추출한 값이 있으면 사용, 없으면 0)
        if (videoDuration && videoDuration > 0) {
          setDuration(videoDuration);
          console.log('✅ [Duration] Duration 상태 설정:', videoDuration);
        } else {
          console.warn('⚠️ [Duration] Duration이 없어 0으로 설정');
          setDuration(0);
        }

        let currentVideoId = null;

        if (serverSaveResult?.success && serverSaveResult.videoId) {
          currentVideoId = serverSaveResult.videoId;
          setVideoId(currentVideoId);
          if (serverSaveResult.video) {
            setVideo(serverSaveResult.video);
          }
          console.log('✅ [New Video] Video ID captured for AI chat:', {
            currentVideoId,
            type: typeof currentVideoId,
            stringValue: String(currentVideoId),
          });
        } else {
          console.error('❌ [Critical] Video ID를 찾을 수 없음');
        }

        setUploadProgress(100);

        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          setUploadStage('');
          setVideoLoading(false);
          setDragDropVisible(false);

          setTimeout(() => {
            if (!currentVideoId) {
              console.error(
                '❌ [Critical Error] currentVideoId가 null이므로 분석을 시작할 수 없습니다'
              );
              addToast({
                type: 'error',
                title: '분석 시작 실패',
                message: 'Video ID를 찾을 수 없어 분석을 시작할 수 없습니다.',
                duration: 4000,
              });
              return;
            }

            console.log('✨ [Animation] 분석 애니메이션 시작');
            setIsAnalyzing(true);
            setAnalysisProgress(0);

            startProgressPolling(currentVideoId);
            startActualAIAnalysis(currentVideoId, file);
          }, 500);
        }, 200);

        const uploadEndTime = Date.now();
        const uploadDuration = uploadStartTime
          ? (uploadEndTime - uploadStartTime) / 1000
          : 0;
        console.log(`Upload completed in ${uploadDuration.toFixed(1)} seconds`);

        addToast({
          type: isDuplicateVideo ? 'warning' : 'success',
          title: isDuplicateVideo ? '중복 영상 감지' : '업로드 완료',
          message: isDuplicateVideo
            ? `${file.name} 파일이 이미 업로드된 영상입니다. 기존 파일을 사용합니다.`
            : `${file.name} 파일이 성공적으로 업로드되었습니다.`,
          duration: 3000,
        });
      } catch (validationError) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('비디오 파일이 손상되었거나 지원되지 않는 형식입니다.');
      }
    } catch (error) {
      console.error('File upload error:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setVideoLoading(false);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      setDragDropVisible(false);
      setVideoError(
        error instanceof Error
          ? error.message
          : '파일 업로드 중 오류가 발생했습니다.'
      );
      addToast({
        type: 'error',
        title: '업로드 실패',
        message:
          error instanceof Error
            ? error.message
            : '파일 업로드 중 오류가 발생했습니다.',
        duration: 3000,
      });
    }
  };

  return {
    handleFileUpload,
  };
};
