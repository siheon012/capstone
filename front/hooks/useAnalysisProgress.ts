import { useRef } from 'react';
import {
  getAnalysisProgress,
  getAnalysisResult,
} from '@/app/actions/ai-service';
import { getUploadedVideos } from '@/app/actions/video-service-client';
import type { UploadedVideo } from '@/app/types/video';

interface UseAnalysisProgressProps {
  analysisProgress: number;
  setAnalysisProgress: (progress: number) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setMessages: React.Dispatch<
    React.SetStateAction<
      { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
    >
  >;
  setVideo: (video: UploadedVideo | null) => void;
  videoFileName: string;
  addToast: (toast: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration: number;
  }) => void;
}

export const useAnalysisProgress = ({
  analysisProgress,
  setAnalysisProgress,
  setIsAnalyzing,
  setMessages,
  setVideo,
  videoFileName,
  addToast,
}: UseAnalysisProgressProps) => {
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopProgressPolling = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
      console.log('🛑 [Progress Polling] 폴링 중단됨');
    }
  };

  const startProgressPolling = (currentVideoId: string) => {
    console.log('📊 [Progress Polling] DB 진행률 폴링 시작:', currentVideoId);

    // DB 진행률 폴링으로만 애니메이션 제어
    let progressRetryCount = 0;
    const maxProgressRetries = 10; // 재시도 횟수 증가
    let hasProgressStarted = false; // 분석이 실제로 시작되었는지 추적
    let initialCheckCount = 0; // 초기 체크 횟수
    const maxInitialChecks = 150; // 최대 300초(5분) 동안 분석 시작 대기 (2초 * 150)

    // 기존 interval이 남아 있다면 정리
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    progressIntervalRef.current = setInterval(async () => {
      if (!currentVideoId) {
        console.log('🛑 [Progress Polling] videoId가 없어 폴링 중단');
        stopProgressPolling();
        return;
      }

      try {
        console.log(
          '🔄 [Progress Polling] 진행률 API 호출 시도:',
          currentVideoId
        );

        console.log('✅ [Progress Polling] ai-service import 성공');

        const progressData = await getAnalysisProgress(currentVideoId);
        console.log('✅ [Progress Polling] 진행률 데이터 수신:', progressData);

        // 성공적으로 진행률을 가져온 경우 재시도 카운트 리셋
        progressRetryCount = 0;
        initialCheckCount++;

        console.log('📊 [Progress Polling] DB 진행률 업데이트:', {
          videoId: currentVideoId,
          progress: progressData.progress,
          status: progressData.status,
          is_completed: progressData.is_completed,
          is_failed: progressData.is_failed,
          hasProgressStarted,
          initialCheckCount,
          currentAnalysisProgress: analysisProgress,
          timestamp: new Date().toISOString(),
        });

        // 분석이 시작되었는지 확인 (status가 'processing'이거나 progress가 0보다 크면)
        if (
          !hasProgressStarted &&
          (progressData.status === 'processing' || progressData.progress > 0)
        ) {
          hasProgressStarted = true;
          console.log('🎬 [Progress Polling] 분석 시작 감지됨');
        }

        // 분석이 시작된 경우에만 진행률 업데이트
        if (hasProgressStarted) {
          setAnalysisProgress(progressData.progress);
        } else {
          // 분석이 아직 시작되지 않았으면 0% 유지
          console.log('⏳ [Progress Polling] 분석 아직 시작 안됨, 0% 유지');

          // 너무 오래 기다린 경우 강제로 시작 처리 (AI 서버가 응답하지 않을 수 있음)
          if (initialCheckCount >= maxInitialChecks) {
            console.warn(
              '⚠️ [Progress Polling] 너무 오래 기다렸음, 강제로 분석 시작 처리'
            );
            hasProgressStarted = true;
            setAnalysisProgress(5); // 5%로 시작하여 사용자에게 진행 중임을 표시
          }
        }

        // 분석 완료 또는 실패 시 폴링 중단
        if (progressData.is_completed || progressData.is_failed) {
          console.log('🏁 [Progress Polling] 분석 종료 감지, 폴링 중단:', {
            videoId: currentVideoId,
            is_completed: progressData.is_completed,
            is_failed: progressData.is_failed,
          });

          stopProgressPolling();

          if (progressData.is_completed) {
            setAnalysisProgress(100);

            // 분석 완료 시 결과 조회 및 메시지 업데이트
            setTimeout(async () => {
              console.log('✨ [Progress Polling] 분석 애니메이션 종료');
              setIsAnalyzing(false);

              try {
                // 분석 결과 조회
                const analysisResult = await getAnalysisResult(currentVideoId);

                const eventsCount = analysisResult?.events?.length || 0;
                const successMessage =
                  eventsCount > 0
                    ? `"${videoFileName}" 영상 분석이 완료되었습니다. ${eventsCount}개의 이벤트가 감지되었습니다. 이제 영상을 재생하고 내용에 대해 질문할 수 있습니다.`
                    : `"${videoFileName}" 영상 분석이 완료되었습니다. 특별한 이벤트는 감지되지 않았지만 영상 내용에 대해 질문할 수 있습니다.`;

                setMessages([
                  {
                    role: 'assistant',
                    content: successMessage,
                  },
                ]);

                addToast({
                  type: 'success',
                  title: '분석 완료',
                  message: `영상 분석이 완료되었습니다.`,
                  duration: 3000,
                });

                // 비디오 정보 로드하여 EventTimeline에서 사용할 수 있도록 설정
                try {
                  const videoResponse = await getUploadedVideos();
                  if (videoResponse.success) {
                    const currentVideo = videoResponse.data.find(
                      (v: UploadedVideo) => v.id === currentVideoId
                    );
                    if (currentVideo) {
                      setVideo(currentVideo);
                    }
                  }
                } catch (videoError) {
                  console.error('❌ 비디오 정보 로드 실패:', videoError);
                }
              } catch (resultError) {
                console.error(
                  '❌ [Progress Polling] 분석 결과 조회 실패:',
                  resultError
                );
                setMessages([
                  {
                    role: 'assistant',
                    content:
                      '영상 분석이 완료되었지만 결과를 가져오는 중 오류가 발생했습니다.',
                  },
                ]);
              }
            }, 1500); // 1.5초 동안 100% 상태 유지
          } else if (progressData.is_failed) {
            // 분석 실패 처리
            setIsAnalyzing(false);
            setAnalysisProgress(0);

            setMessages([
              {
                role: 'assistant',
                content:
                  '영상 분석 중 오류가 발생했습니다. 나중에 다시 시도해주세요.',
              },
            ]);

            addToast({
              type: 'error',
              title: '분석 실패',
              message: '영상 분석에 실패했습니다.',
              duration: 5000,
            });
          }
        }
      } catch (progressError) {
        progressRetryCount++;
        console.error('⚠️ [Progress Polling] 진행률 조회 실패:', {
          videoId: currentVideoId,
          error:
            progressError instanceof Error
              ? progressError.message
              : String(progressError),
          errorStack:
            progressError instanceof Error ? progressError.stack : undefined,
          retryCount: progressRetryCount,
          maxRetries: maxProgressRetries,
          timestamp: new Date().toISOString(),
        });

        // 네트워크 에러인지 확인
        if (
          progressError instanceof Error &&
          progressError.message.includes('fetch')
        ) {
          console.error('🌐 [Progress Polling] 네트워크 연결 문제 감지');
        }

        // 최대 재시도 횟수 초과 시에만 알림
        if (progressRetryCount >= maxProgressRetries) {
          console.error(
            '💥 [Progress Polling] 진행률 폴링 최대 재시도 초과, 폴링 중단'
          );
          stopProgressPolling();

          // 실패 시 애니메이션 종료
          setIsAnalyzing(false);
          setAnalysisProgress(0);

          addToast({
            type: 'error',
            title: '진행률 조회 실패',
            message: '분석 진행률을 가져올 수 없습니다. 다시 시도해주세요.',
            duration: 3000,
          });
        }
      }
    }, 2000); // 2초마다 폴링 (서버 부하 감소)
  };

  return {
    startProgressPolling,
    stopProgressPolling,
  };
};
