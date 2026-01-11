'use client';

import { useState } from 'react';
import type { UploadedVideo } from '@/app/types/video';
import { getUploadedVideos } from '@/app/actions/video-service-client';

interface UseSummaryOptions {
  onSuccess?: (summary: string) => void;
  onError?: (error: string) => void;
}

export function useSummary(options?: UseSummaryOptions) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateSummary = async (
    video: UploadedVideo | null,
    setVideo?: (video: UploadedVideo) => void
  ): Promise<{ success: boolean; summary?: string; error?: string }> => {
    console.log('🔥 [useSummary] 함수 호출됨');
    console.log('📹 [useSummary] video 객체:', video);

    if (!video) {
      console.error('❌ [useSummary] video 객체가 없습니다!');
      const error = '비디오 정보를 불러올 수 없습니다.';
      options?.onError?.(error);
      return { success: false, error };
    }

    try {
      setIsGenerating(true);
      console.log('⏳ [useSummary] isGenerating = true');

      // Summary가 없거나 실패한 경우 자동 생성
      const shouldRegenerate =
        !video.summary ||
        video.summary.includes('분석할 이벤트가 없습니다') ||
        video.summary.includes('감지된 이벤트가 없습니다') ||
        (video.summary.includes('총 ') &&
          video.summary.includes('개의 이벤트가 감지되었습니다')) ||
        video.summary.includes('실패') ||
        video.summary.trim().length < 100;

      console.log('📋 [useSummary] shouldRegenerate:', shouldRegenerate);
      console.log('📋 [useSummary] 기존 summary:', video.summary);

      let finalSummary = video.summary;

      if (shouldRegenerate) {
        console.log('📦 [useSummary] ai-service 임포트 중...');
        const { generateVideoSummary } = await import(
          '@/app/actions/ai-service'
        );
        console.log('📞 [useSummary] generateVideoSummary 호출:', video.id);
        const result = await generateVideoSummary(video.id);
        console.log('✅ [useSummary] API 응답:', result);

        if (!result.success || !result.summary) {
          throw new Error(result.error || 'Summary 생성 실패');
        }

        console.log(
          '[useSummary] Summary 생성 완료:',
          result.summary.substring(0, 100)
        );

        // 비디오 정보 새로고침
        if (setVideo) {
          const videosResponse = await getUploadedVideos();
          if (videosResponse.success) {
            const updatedVideo = videosResponse.data.find(
              (v) => v.id === video.id
            );
            if (updatedVideo) {
              setVideo(updatedVideo);
              finalSummary = updatedVideo.summary;
            }
          }
        }

        // 생성된 summary가 없으면 결과에서 직접 사용
        if (!finalSummary) {
          console.log('📝 [useSummary] result.summary를 사용');
          finalSummary = result.summary;
        }
      } else {
        console.log('✅ [useSummary] Summary가 이미 있음, 바로 사용');
      }

      console.log('📤 [useSummary] Summary 준비 완료');
      console.log('📄 [useSummary] summary 길이:', finalSummary?.length);

      // summary가 없으면 에러
      if (!finalSummary) {
        throw new Error('Summary가 생성되지 않았습니다.');
      }

      options?.onSuccess?.(finalSummary);
      return { success: true, summary: finalSummary };
    } catch (error) {
      console.error('[useSummary] Summary 생성 오류:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Summary 생성 중 오류 발생';
      options?.onError?.(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsGenerating(false);
    }
  };

  const formatSummary = (summary: string): string => {
    return summary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // 번호가 있는 항목 처리 (1., 2., 등)
        if (/^\d+\./.test(line)) {
          return `\n${line}`;
        }
        // 대시로 시작하는 항목 처리 (-, •, 등)
        if (/^[-•*]/.test(line)) {
          return `  ${line}`;
        }
        // 일반 텍스트
        return line;
      })
      .join('\n');
  };

  return {
    isGenerating,
    generateSummary,
    formatSummary,
  };
}
