import { sendVlmMessage, sendMessage } from '@/app/actions/ai-service';
import { saveHistory } from '@/app/actions/history-service';
import type { ChatSession } from '@/app/types/session';

interface UseChatMessageProps {
  videoSrc: string | null;
  videoId: string | null;
  videoFileName: string;
  currentSession: ChatSession | null;
  currentHistoryId: string | undefined;
  duration: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setMessages: React.Dispatch<
    React.SetStateAction<
      { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
    >
  >;
  setTimeMarkers: React.Dispatch<React.SetStateAction<number[]>>;
  setCurrentSession: (session: ChatSession | null) => void;
  setTooltipData: (
    data: {
      title: string;
      content: string;
      timestamp?: number;
    } | null
  ) => void;
  setCurrentHistoryId: (id: string | undefined) => void;
  formatTime: (seconds: number) => string;
  addToast: (toast: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration: number;
  }) => void;
}

export const useChatMessage = ({
  videoSrc,
  videoId,
  videoFileName,
  currentSession,
  currentHistoryId,
  duration,
  videoRef,
  setMessages,
  setTimeMarkers,
  setCurrentSession,
  setTooltipData,
  setCurrentHistoryId,
  formatTime,
  addToast,
}: UseChatMessageProps) => {
  const handleSendMessage = async (
    e: React.FormEvent,
    inputMessage: string,
    setInputMessage: (message: string) => void
  ) => {
    console.log('🚀🚀🚀 handleSendMessage 함수 호출됨!!!');
    e.preventDefault();
    console.log('🚀 handleSendMessage 시작:', {
      inputMessage: inputMessage.trim(),
      videoSrc: !!videoSrc,
      timestamp: new Date().toISOString(),
    });

    if (inputMessage.trim()) {
      const userMessage = inputMessage;
      console.log('✅ 메시지 전송 조건 만족, 사용자 메시지:', userMessage);

      // 사용자 메시지 추가
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

      // 정보 토스트
      addToast({
        type: 'info',
        title: '분석 중',
        message: 'AI가 영상을 분석하고 있습니다...',
        duration: 2000,
      });

      // 실제 AI 응답 호출
      setTimeout(async () => {
        console.log('⏰ setTimeout 실행됨, AI 서비스 호출 시작');
        try {
          let assistantMessage;
          let timestamp: number | undefined = undefined;

          if (videoSrc && videoId) {
            console.log('📹 비디오 있음, AI 서비스 호출 진행', {
              videoId,
              videoFileName,
              currentSessionId: currentSession?.id,
            });

            console.log('📦 sendVlmMessage, sendMessage 함수 로드됨');

            // VLM 키워드 감지 (영상 분석 관련 질문)
            const vlmKeywords = [
              '장면',
              '묘사',
              '설명',
              '상황',
              '타임라인',
              '시간',
              '언제',
              '위치',
              '어디',
              '왼쪽',
              '중간',
              '오른쪽',
              '행동',
              '무엇을',
              '어떤',
            ];
            const useVlm = vlmKeywords.some((keyword) =>
              userMessage.toLowerCase().includes(keyword)
            );

            let result;
            if (useVlm) {
              console.log('🎥 VLM 채팅 사용 (영상 분석 질문 감지)');
              result = await sendVlmMessage(
                userMessage,
                videoId,
                currentSession?.id || null
              );

              // VLM 실패 시 일반 메시지로 폴백
              if (!result.success) {
                console.log('⚠️ VLM 실패, 일반 채팅으로 폴백');
                result = await sendMessage(
                  userMessage,
                  videoId,
                  currentSession?.id || null
                );
              }
            } else {
              console.log('💬 일반 채팅 사용');
              result = await sendMessage(
                userMessage,
                videoId,
                currentSession?.id || null
              );
            }

            console.log('🎯 AI 서비스 결과:', result);

            if (result.success && result.reply) {
              // 타임스탬프가 있으면 추가
              if (result.timestamp) {
                timestamp = result.timestamp;
                setTimeMarkers((prev) => [...prev, result.timestamp!]);
              }

              assistantMessage = {
                role: 'assistant' as const,
                content: result.reply,
                ...(timestamp && { timestamp: timestamp }),
              };

              // 새 세션이 생성된 경우 현재 세션 업데이트
              if (result.session) {
                setCurrentSession(result.session);
                console.log('🔄 새 세션 생성됨:', result.session);
              }
              
              // 성공 토스트 (여기로 이동)
              addToast({
                type: 'success',
                title: '분석 완료',
                message: 'AI 분석이 완료되었습니다.',
                duration: 3000,
              });
            } else {
              // 에러 응답 처리
              assistantMessage = {
                role: 'assistant' as const,
                content:
                  result.error || '응답을 생성하는 중 오류가 발생했습니다.',
              };
              
              // 에러 토스트
              addToast({
                type: 'error',
                title: '분석 실패',
                message: result.error || 'AI 분석 중 오류가 발생했습니다.',
                duration: 3000,
              });
            }
          } else {
            console.log(
              '❌ 비디오 없음 또는 videoId 없음, 업로드 안내 메시지',
              { videoSrc: !!videoSrc, videoId }
            );
            assistantMessage = {
              role: 'assistant' as const,
              content: '분석을 위해 먼저 영상을 업로드해 주세요.',
            };
          }

          console.log('💬 최종 assistant 메시지:', assistantMessage);
          setMessages((prev) => [...prev, assistantMessage]);

          // 툴팁 표시
          if (timestamp) {
            setTooltipData({
              title: '분석 결과',
              content: `${formatTime(
                timestamp
              )} 시점에서 중요한 이벤트가 감지되었습니다. 클릭하여 해당 시점으로 이동할 수 있습니다.`,
              timestamp: timestamp,
            });
          }

          // 새로운 대화가 시작된 경우 히스토리 저장
          if (!currentHistoryId && videoSrc) {
            // prompt_id 형식으로 제목 생성 (실제로는 데이터베이스에서 다음 ID를 가져와야 함)
            const nextPromptId = Date.now() % 10000; // 임시로 타임스탬프 기반 ID 생성
            const videoDuration = duration || videoRef.current?.duration || 60;

            const historyData = {
              title: `prompt_id : ${nextPromptId}`,
              messages: [
                { role: 'user' as const, content: userMessage },
                assistantMessage,
              ],
              videoInfo: {
                name: videoFileName,
                duration: videoDuration,
                url: videoSrc,
              },
              eventType: null, // 초기에는 null, 나중에 AI 분석 결과에 따라 업데이트
            };

            const savedId = await saveHistory(historyData);
            if (savedId) {
              setCurrentHistoryId(savedId);
            }
          }
        } catch (error) {
          console.error('❌ Message handling error:', error);
          console.error('🔍 Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          addToast({
            type: 'error',
            title: '분석 실패',
            message: 'AI 분석 중 오류가 발생했습니다.',
            duration: 3000,
          });
        }
      }, 1000);

      setInputMessage('');
      console.log('🔄 입력 메시지 초기화됨');
    } else {
      console.log('⚠️ 입력 메시지가 비어있음');
    }
  };

  return {
    handleSendMessage,
  };
};
