// Client-side API service (Server Actions 제거하여 403 에러 방지)
import type { ChatSession } from '@/app/types/session';

// API Base URL 설정 - 클라이언트에서 상대 경로 사용
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side: SSR 시 사용
    return process.env.NEXT_PUBLIC_API_URL || '';
  }
  // Client-side: 상대 경로 사용 (ALB가 /api/*, /db/* 를 Backend로 라우팅)
  return '';
};

// 비디오 분석 결과 타입 정의
export type VideoAnalysisResult = {
  objectDetections: {
    timestamp: number;
    objects: {
      type: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
    }[];
  }[];
  events: {
    timestamp: number;
    type: string;
    description: string;
  }[];
};

// 비디오 분석 시작 함수 (비동기 처리)
export async function startAnalyzeVideo(
  videoId: string
): Promise<{ success: boolean; message: string }> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const analysisUrl = apiBaseUrl
      ? `${apiBaseUrl}/api/video-analysis/submit-analysis`
      : '/api/video-analysis/submit-analysis';

    console.log('🔄 영상 분석 시작 API 호출:', {
      videoId,
      url: analysisUrl,
      timestamp: new Date().toISOString(),
    });

    // 먼저 Django에서 비디오 정보를 가져와서 파일 경로 확인
    const videoInfoUrl = apiBaseUrl
      ? `${apiBaseUrl}/db/videos/${videoId}/`
      : `/db/videos/${videoId}/`;

    const videoInfoResponse = await fetch(videoInfoUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!videoInfoResponse.ok) {
      throw new Error(
        `비디오 정보를 가져올 수 없습니다. (${videoInfoResponse.status})`
      );
    }

    const videoInfo = await videoInfoResponse.json();
    console.log('📝 [AI Service] Django에서 비디오 정보 조회:', {
      videoId,
      videoInfo: {
        name: videoInfo.name,
        video_file: videoInfo.video_file,
        file_path: videoInfo.file_path,
      },
    });

    // 비디오 파일 경로 결정 (우선순위: video_file > file_path > name 기반)
    let videoPath = '';
    if (videoInfo.video_file) {
      videoPath = videoInfo.video_file;
    } else if (videoInfo.file_path) {
      videoPath = videoInfo.file_path;
    } else {
      videoPath = `/uploads/videos/${videoInfo.name}`;
    }

    // 상대 경로를 절대 경로로 변환 (AI 모델에서 접근 가능하도록)
    let containerPath = '';
    if (videoPath.startsWith('/uploads/')) {
      // Docker 컨테이너 내부 경로로 변환
      // 호스트의 /home/uns/code/project/front/public/uploads/videos -> 컨테이너의 /workspace
      const fileName = videoPath.split('/').pop();
      containerPath = `/workspace/${fileName}`;
    } else if (
      videoPath.includes('/home/uns/code/project/front/public/uploads/videos/')
    ) {
      // 이미 절대 경로인 경우 컨테이너 경로로 변환
      const fileName = videoPath.split('/').pop();
      containerPath = `/workspace/${fileName}`;
    } else {
      // 기본값: videoInfo.name을 사용
      containerPath = `/workspace/${videoInfo.name}`;
    }

    videoPath = containerPath;

    console.log('📍 [AI Service] 비디오 파일 경로:', videoPath);

    // 서버(백엔드)를 통해 분석 작업 제출 (AWS Batch 등으로 라우팅)
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: parseInt(videoId, 10), // 정수형으로 변환
        analysis_types: ['default'],
      }),
    });

    console.log('📡 영상 분석 시작 API 응답 상태:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        videoId,
        url: analysisUrl,
        errorBody: errorText,
        timestamp: new Date().toISOString(),
      };

      console.error('❌ [AI Service] 영상 분석 시작 API 에러:', errorDetails);

      // HTTP 상태 코드별 에러 메시지
      let errorMessage = `Vision API error: ${response.status}`;

      switch (response.status) {
        case 400:
          errorMessage = '잘못된 요청입니다. 비디오 ID를 확인해주세요.';
          break;
        case 404:
          errorMessage = '비디오 파일을 찾을 수 없습니다.';
          break;
        case 500:
          errorMessage = 'AI 분석 서버에 오류가 발생했습니다.';
          break;
        case 503:
          errorMessage = 'AI 분석 서버가 일시적으로 사용할 수 없습니다.';
          break;
        case 408:
          errorMessage = '분석 요청 시간이 초과되었습니다.';
          break;
        default:
          errorMessage = `서버 오류 (${response.status}): ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('✅ [AI Service] 영상 분석 시작 성공 응답:', {
      videoId,
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
    });

    return {
      success: result.success || true,
      message: result.message || '영상 분석이 시작되었습니다.',
    };
  } catch (error) {
    const errorDetails = {
      videoId,
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    console.error('❌ [AI Service] Video analysis start error:', errorDetails);

    // 네트워크 에러 처리
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(
        '🌐 [AI Service] 네트워크 연결 오류 - AI 서버에 접근할 수 없습니다'
      );
      throw new Error(
        'AI 분석 서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.'
      );
    }

    throw error;
  }
}

// 비디오 분석 결과 조회 함수 (기존 analyzeVideo를 분리)
export async function getAnalysisResult(
  videoId: string
): Promise<VideoAnalysisResult> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    console.log('🔍 [AI Service] 분석 결과 조회 시작:', videoId);

    const eventsUrl = apiBaseUrl
      ? `${apiBaseUrl}/db/events/?video=${videoId}`
      : `/db/events/?video=${videoId}`;

    const eventsResponse = await fetch(eventsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      const events = Array.isArray(eventsData)
        ? eventsData
        : eventsData.results || [];

      console.log('📊 [AI Service] 분석 결과 조회 완료:', {
        videoId,
        eventsCount: events.length,
        events: events.slice(0, 3), // 처음 3개만 로깅
      });

      // DB에서 가져온 실제 데이터를 VideoAnalysisResult 형식으로 변환
      const analysisResult: VideoAnalysisResult = {
        objectDetections: events.map((event: any) => ({
          timestamp: event.timestamp,
          objects: [
            {
              type: event.event_type,
              confidence:
                event.gender_score >= 1
                  ? event.gender_score / 100
                  : event.gender_score, // 0-1 범위로 정규화
              boundingBox: {
                x: 0, // AI 모델에서 제공되지 않는 정보
                y: 0,
                width: 0,
                height: 0,
              },
            },
          ],
        })),
        events: events.map((event: any) => ({
          timestamp: event.timestamp,
          type: event.event_type,
          description: `${event.action_detected} - ${event.location} (${
            event.gender
          }, ${event.age}세)${
            event.scene_analysis ? ' - ' + event.scene_analysis : ''
          }`,
        })),
      };

      return analysisResult;
    } else {
      console.warn('⚠️ [AI Service] 분석 결과 조회 실패:', {
        videoId,
        status: eventsResponse.status,
        statusText: eventsResponse.statusText,
      });

      // 빈 결과 반환
      return {
        objectDetections: [],
        events: [],
      };
    }
  } catch (error) {
    console.error('❌ [AI Service] 분석 결과 조회 중 오류:', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // 빈 결과 반환
    return {
      objectDetections: [],
      events: [],
    };
  }
}

// 비디오 분석 요청 함수 (기존 - 호환성 유지)
export async function analyzeVideo(
  videoId: string
): Promise<VideoAnalysisResult> {
  const apiBaseUrl = getApiBaseUrl();
  const analysisUrl = apiBaseUrl
    ? `${apiBaseUrl}/api/video-analysis/submit-analysis`
    : '/api/video-analysis/submit-analysis';
  const videoInfoUrl = apiBaseUrl
    ? `${apiBaseUrl}/db/videos/${videoId}/`
    : `/db/videos/${videoId}/`;

  try {
    console.log('🔄 영상 분석 API 호출 시작:', {
      videoId,
      url: analysisUrl,
      timestamp: new Date().toISOString(),
    });

    // 먼저 Django에서 비디오 정보를 가져와서 파일 경로 확인
    const videoInfoResponse = await fetch(videoInfoUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!videoInfoResponse.ok) {
      throw new Error(
        `비디오 정보를 가져올 수 없습니다. (${videoInfoResponse.status})`
      );
    }

    const videoInfo = await videoInfoResponse.json();
    console.log('📝 [AI Service] Django에서 비디오 정보 조회:', {
      videoId,
      videoInfo: {
        name: videoInfo.name,
        video_file: videoInfo.video_file,
        file_path: videoInfo.file_path,
      },
    });

    // 비디오 파일 경로 결정 (우선순위: video_file > file_path > name 기반)
    let videoPath = '';
    if (videoInfo.video_file) {
      videoPath = videoInfo.video_file;
    } else if (videoInfo.file_path) {
      videoPath = videoInfo.file_path;
    } else {
      videoPath = `/uploads/videos/${videoInfo.name}`;
    }

    // 상대 경로를 절대 경로로 변환 (AI 모델에서 접근 가능하도록)
    let containerPath = '';
    if (videoPath.startsWith('/uploads/')) {
      // Docker 컨테이너 내부 경로로 변환
      // 호스트의 /home/uns/code/project/front/public/uploads/videos -> 컨테이너의 /workspace
      const fileName = videoPath.split('/').pop();
      containerPath = `/workspace/${fileName}`;
    } else if (
      videoPath.includes('/home/uns/code/project/front/public/uploads/videos/')
    ) {
      // 이미 절대 경로인 경우 컨테이너 경로로 변환
      const fileName = videoPath.split('/').pop();
      containerPath = `/workspace/${fileName}`;
    } else {
      // 기본값: videoInfo.name을 사용
      containerPath = `/workspace/${videoInfo.name}`;
    }

    videoPath = containerPath;

    console.log('📍 [AI Service] 비디오 파일 경로:', videoPath);

    // Submit analysis request via backend API (which will route to Batch/AI)
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: parseInt(videoId, 10),
        analysis_types: ['default'],
      }),
    });

    console.log('📡 영상 분석 API 응답 상태:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        videoId,
        url: analysisUrl,
        errorBody: errorText,
        timestamp: new Date().toISOString(),
      };

      console.error('❌ [AI Service] 영상 분석 API 에러:', errorDetails);

      // HTTP 상태 코드별 에러 메시지
      let errorMessage = `Vision API error: ${response.status}`;

      switch (response.status) {
        case 400:
          errorMessage = '잘못된 요청입니다. 비디오 ID를 확인해주세요.';
          break;
        case 404:
          errorMessage = '비디오 파일을 찾을 수 없습니다.';
          break;
        case 500:
          errorMessage = 'AI 분석 서버에 오류가 발생했습니다.';
          break;
        case 503:
          errorMessage = 'AI 분석 서버가 일시적으로 사용할 수 없습니다.';
          break;
        case 408:
          errorMessage = '분석 요청 시간이 초과되었습니다.';
          break;
        default:
          errorMessage = `서버 오류 (${response.status}): ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('✅ [AI Service] 영상 분석 API 성공 응답:', {
      videoId,
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
    });

    // AI 모델이 직접 데이터베이스에 저장하므로,
    // 여기서는 성공 메시지만 받고 실제 데이터는 DB에서 조회
    if (result.success) {
      console.log('📝 [AI Service] AI 모델이 Events 테이블에 데이터 저장 완료');

      // 저장된 이벤트들을 조회하여 반환 (선택적)
      try {
        console.log('🔍 [AI Service] 저장된 이벤트 데이터 조회 시작:', videoId);

        const eventsUrl = apiBaseUrl
          ? `${apiBaseUrl}/db/events/?video=${videoId}`
          : `/db/events/?video=${videoId}`;

        const eventsResponse = await fetch(eventsUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          const events = Array.isArray(eventsData)
            ? eventsData
            : eventsData.results || [];

          console.log('📊 [AI Service] 저장된 이벤트 데이터 조회 완료:', {
            videoId,
            eventsCount: events.length,
            events: events.slice(0, 3), // 처음 3개만 로깅
          });

          // DB에서 가져온 실제 데이터를 VideoAnalysisResult 형식으로 변환
          const analysisResult: VideoAnalysisResult = {
            objectDetections: events.map((event: any) => ({
              timestamp: event.timestamp,
              objects: [
                {
                  type: event.event_type,
                  confidence:
                    event.gender_score >= 1
                      ? event.gender_score / 100
                      : event.gender_score, // 0-1 범위로 정규화
                  boundingBox: {
                    x: 0, // AI 모델에서 제공되지 않는 정보
                    y: 0,
                    width: 0,
                    height: 0,
                  },
                },
              ],
            })),
            events: events.map((event: any) => ({
              timestamp: event.timestamp,
              type: event.event_type,
              description: `${event.action_detected} - ${event.location} (${
                event.gender
              }, ${event.age}세)${
                event.scene_analysis ? ' - ' + event.scene_analysis : ''
              }`,
            })),
          };

          return analysisResult;
        } else {
          console.warn('⚠️ [AI Service] 이벤트 데이터 조회 실패:', {
            videoId,
            status: eventsResponse.status,
            statusText: eventsResponse.statusText,
          });
        }
      } catch (dbError) {
        console.error('❌ [AI Service] 이벤트 데이터 조회 중 오류:', {
          videoId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
          stack: dbError instanceof Error ? dbError.stack : undefined,
        });
        console.warn('⚠️ 저장된 이벤트 조회 실패:', dbError);
      }
    }

    // AI 모델 응답을 VideoAnalysisResult 형식으로 변환 (fallback)
    const analysisResult: VideoAnalysisResult = {
      objectDetections:
        result.object_detections?.map((detection: any) => ({
          timestamp: detection.timestamp,
          objects:
            detection.objects?.map((obj: any) => ({
              type: obj.type || obj.label,
              confidence: obj.confidence,
              boundingBox: {
                x: obj.bbox?.x || obj.x || 0,
                y: obj.bbox?.y || obj.y || 0,
                width: obj.bbox?.width || obj.w || 0,
                height: obj.bbox?.height || obj.h || 0,
              },
            })) || [],
        })) || [],
      events:
        result.events?.map((event: any) => ({
          timestamp: event.timestamp,
          type: event.type || event.event_type,
          description: event.description,
        })) || [],
    };

    return analysisResult;
  } catch (error) {
    const errorDetails = {
      videoId,
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    console.error('❌ [AI Service] Video analysis error:', errorDetails);

    // 네트워크 에러 처리
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(
        '🌐 [AI Service] 네트워크 연결 오류 - AI 서버에 접근할 수 없습니다'
      );
      throw new Error(
        'AI 분석 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.'
      );
    }

    // 타임아웃 에러 처리
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error('⏱️ [AI Service] 요청 시간 초과');
      throw new Error(
        '분석 요청 시간이 초과되었습니다. 파일 크기가 클 수 있습니다.'
      );
    }

    // JSON 파싱 에러 처리
    if (error instanceof SyntaxError) {
      console.error('📄 [AI Service] 응답 파싱 오류');
      throw new Error(
        '서버 응답을 처리할 수 없습니다. 서버 오류일 수 있습니다.'
      );
    }

    // 기타 에러는 그대로 전파
    throw error;
  }
}

// 채팅 응답 타입 정의
export type ChatResponse = {
  answer: string;
  relevantTimestamps: number[];
};

// 채팅 질의 함수
export async function queryChatbot(
  videoId: string,
  question: string,
  analysisResults: VideoAnalysisResult
): Promise<ChatResponse> {
  try {
    const requestData = {
      prompt: question,
      session_id: null, // 새 세션으로 시작
      video_id: videoId, // video_id 추가
    };

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    if (API_URL === undefined || API_URL === null) {
      throw new Error('NEXT_PUBLIC_API_URL 환경변수가 설정되지 않았습니다.');
    }

    console.log('🔄 API 호출 시작:', {
      videoId,
      question,
      url: `${API_URL}/api/prompt/`,
      timestamp: new Date().toISOString(),
      requestData,
    });

    // Django 백엔드의 process_prompt API 호출
    const response = await fetch(`${API_URL}/api/prompt/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    console.log('📡 API 응답 상태:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 에러 응답:', errorText);
      throw new Error(`Backend API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ API 성공 응답:', result);

    // 백엔드 응답을 ChatResponse 형식으로 변환
    return {
      answer: result.response,
      relevantTimestamps: result.event ? [result.event.timestamp] : [],
    };
  } catch (error) {
    console.error('❌ Chatbot query error:', error);
    console.error('🔍 Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // 오류 발생 시 기본 응답 반환
    return {
      answer: '죄송합니다. 질문에 답변하는 중 오류가 발생했습니다.',
      relevantTimestamps: [],
    };
  }
}

// 비디오 업로드 함수
export async function uploadVideo(
  formData: FormData
): Promise<{ videoId: string; url: string }> {
  try {
    // 실제 구현에서는 여기서 비디오를 스토리지에 업로드합니다
    const response = await fetch(`${process.env.STORAGE_API_URL}/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${process.env.STORAGE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Upload error: ${response.status}`);
    }

    const result = await response.json();

    // 업로드 후 분석 시작 (비동기로 처리)
    analyzeVideo(result.videoId).catch(console.error);

    return result;
  } catch (error) {
    console.error('Video upload error:', error);
    throw new Error('비디오 업로드 중 오류가 발생했습니다.');
  }
}

// 메시지 전송 응답 타입 정의
export type MessageResponse = {
  success: boolean;
  reply?: string;
  error?: string;
  timestamp?: number;
  session?: ChatSession;
  analysis_type?: string;
  event_count?: number;
  events?: Array<{
    id: number;
    timestamp: number;
    event_type: string;
    action_detected: string;
    location: string;
  }>;
};

// 세션 기반 메시지 전송 함수 (기존 Text2SQL 방식)
export async function sendMessage(
  message: string,
  videoId: string,
  sessionId?: string | null
): Promise<MessageResponse> {
  const apiBaseUrl = getApiBaseUrl();
  const url = apiBaseUrl ? `${apiBaseUrl}/api/prompt/` : '/api/prompt/';

  try {
    console.log('🔄 sendMessage API 호출 시작:', {
      message,
      videoId,
      sessionId,
      url,
      timestamp: new Date().toISOString(),
    });

    // Django 백엔드의 process_prompt API 호출
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: message,
        video_id: videoId,
        session_id: sessionId,
      }),
    });

    console.log('📡 sendMessage API 응답 상태:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ sendMessage API 에러 응답:', errorText);
      return {
        success: false,
        error: `Backend API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log('✅ sendMessage API 성공 응답:', result);

    // 백엔드 응답을 MessageResponse 형식으로 변환
    return {
      success: true,
      reply: result.response,
      timestamp: result.event?.timestamp || null,
      session: result.session_id
        ? {
            id: result.session_id,
            title: result.session_title || `프롬프트 세션`,
            videoId: videoId,
            createdAt: new Date(),
            messages: [],
            eventType: result.event?.event_type || null,
          }
        : undefined,
    };
  } catch (error) {
    console.error('❌ sendMessage error:', error);
    console.error('🔍 Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: '메시지 전송 중 오류가 발생했습니다.',
    };
  }
}

// VLM 기반 메시지 전송 함수 (새로 추가)
export async function sendVlmMessage(
  message: string,
  videoId: string,
  sessionId?: string | null
): Promise<MessageResponse> {
  const apiBaseUrl = getApiBaseUrl();
  const url = apiBaseUrl ? `${apiBaseUrl}/api/vlm-chat/` : '/api/vlm-chat/';

  try {
    console.log('🎥 sendVlmMessage API 호출 시작:', {
      message,
      videoId,
      sessionId,
      url,
      timestamp: new Date().toISOString(),
    });

    // Django 백엔드의 VLM 채팅 API 호출
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: message,
        video_id: videoId,
        session_id: sessionId,
      }),
    });

    console.log('📡 sendVlmMessage API 응답 상태:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ sendVlmMessage API 에러 응답:', errorText);
      return {
        success: false,
        error: `VLM API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log('✅ sendVlmMessage API 성공 응답:', result);

    // 백엔드 응답을 MessageResponse 형식으로 변환
    return {
      success: true,
      reply: result.response,
      timestamp: result.events?.[0]?.timestamp,
      analysis_type: result.analysis_type,
      event_count: result.event_count,
      events: result.events,
      session: result.session_id
        ? {
            id: result.session_id,
            title: `VLM 분석 - ${videoId}`,
            videoId: videoId,
            createdAt: new Date(),
            messages: [],
            eventType: result.events?.[0]?.event_type || null,
          }
        : undefined,
    };
  } catch (error) {
    console.error('❌ sendVlmMessage error:', error);
    console.error('🔍 Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: 'VLM 메시지 전송 중 오류가 발생했습니다.',
    };
  }
}

// 실제 분석 진행률 조회 함수
export async function getAnalysisProgress(videoId: string): Promise<{
  progress: number;
  status: string;
  is_completed: boolean;
  is_failed: boolean;
}> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  if (API_URL === undefined || API_URL === null) {
    throw new Error('NEXT_PUBLIC_API_URL 환경변수가 설정되지 않았습니다.');
  }

  try {
    console.log('🔍 [AI Service] 진행률 조회 시작:', {
      videoId,
      url: `${API_URL}/db/videos/${videoId}/progress/`,
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(`${API_URL}/db/videos/${videoId}/progress/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('📡 [AI Service] 진행률 API 응답 상태:', {
      videoId,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = {
        videoId,
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        timestamp: new Date().toISOString(),
      };

      console.error('❌ [AI Service] 진행률 API 에러:', errorDetails);

      // HTTP 상태 코드별 처리
      let errorMessage = `Progress API error: ${response.status}`;

      switch (response.status) {
        case 404:
          errorMessage = '비디오를 찾을 수 없습니다.';
          break;
        case 500:
          errorMessage = '서버 내부 오류가 발생했습니다.';
          break;
        case 503:
          errorMessage = '서비스를 일시적으로 사용할 수 없습니다.';
          break;
        default:
          errorMessage = `서버 오류 (${response.status}): ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();

    console.log('✅ [AI Service] 진행률 조회 성공:', {
      videoId,
      progress: result.progress,
      status: result.status,
      is_completed: result.is_completed,
      is_failed: result.is_failed,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const errorDetails = {
      videoId,
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    console.error('❌ [AI Service] 진행률 조회 실패:', errorDetails);

    // 네트워크 에러인지 확인
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(
        '🌐 [AI Service] 네트워크 연결 문제 - 백엔드 서버에 접근할 수 없습니다'
      );
    }

    // 실패 시 기본값 반환
    return {
      progress: 0,
      status: 'failed',
      is_completed: false,
      is_failed: true,
    };
  }
}

// 비디오 요약 생성 함수
export async function generateVideoSummary(videoId: string): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
}> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl === undefined || apiUrl === null) {
      throw new Error('NEXT_PUBLIC_API_URL 환경변수가 설정되지 않았습니다.');
    }

    console.log('🔄 비디오 요약 생성 API 호출:', {
      videoId,
      url: `${apiUrl}/api/videos/${videoId}/summary/`,
      timestamp: new Date().toISOString(),
    });

    // Backend Summary API 호출 (Bedrock VLM 사용)
    const response = await fetch(`${apiUrl}/api/videos/${videoId}/summary/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary_type: 'events', // 이벤트 기반 요약
        async: false, // 동기 처리 - summary가 완성될 때까지 기다림
      }),
    });

    console.log('📡 비디오 요약 API 응답 상태:', {
      videoId,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 비디오 요약 API 에러:', {
        videoId,
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });

      return {
        success: false,
        error: `요약 생성 실패: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log('✅ 비디오 요약 API 성공 응답:', {
      videoId,
      summary: result.summary?.substring(0, 100) + '...',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      summary: result.summary,
    };
  } catch (error) {
    console.error('❌ 비디오 요약 생성 오류:', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      error: '요약 생성 중 오류가 발생했습니다.',
    };
  }
}
