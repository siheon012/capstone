"use server"

// 비디오 분석 결과 타입 정의
export type VideoAnalysisResult = {
  objectDetections: {
    timestamp: number
    objects: {
      type: string
      confidence: number
      boundingBox: { x: number; y: number; width: number; height: number }
    }[]
  }[]
  events: {
    timestamp: number
    type: string
    description: string
  }[]
}

// 비디오 분석 요청 함수
export async function analyzeVideo(videoId: string): Promise<VideoAnalysisResult> {
  try {
    // 실제 구현에서는 여기서 컴퓨터 비전 API를 호출합니다
    const response = await fetch(`${process.env.VISION_API_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VISION_API_KEY}`,
      },
      body: JSON.stringify({ videoId }),
    })

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Video analysis error:", error)
    // 오류 발생 시 빈 결과 반환
    return { objectDetections: [], events: [] }
  }
}

// 채팅 응답 타입 정의
export type ChatResponse = {
  answer: string
  relevantTimestamps: number[]
}

// 채팅 질의 함수
export async function queryChatbot(
  videoId: string,
  question: string,
  analysisResults: VideoAnalysisResult,
): Promise<ChatResponse> {
  try {
    console.log("🔄 API 호출 시작:", {
      videoId,
      question,
      url: "http://localhost:8088/api/prompt/",
      timestamp: new Date().toISOString()
    });

    // Django 백엔드의 process_prompt API 호출
    const response = await fetch(`http://localhost:8088/api/prompt/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: question,
        session_id: null, // 새 세션으로 시작
      }),
    })

    console.log("📡 API 응답 상태:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API 에러 응답:", errorText);
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    console.log("✅ API 성공 응답:", result);
    
    // 백엔드 응답을 ChatResponse 형식으로 변환
    return {
      answer: result.response,
      relevantTimestamps: result.event ? [result.event.timestamp] : [],
    }
  } catch (error) {
    console.error("❌ Chatbot query error:", error)
    console.error("🔍 Error details:", {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // 오류 발생 시 기본 응답 반환
    return {
      answer: "죄송합니다. 질문에 답변하는 중 오류가 발생했습니다.",
      relevantTimestamps: [],
    }
  }
}

// 비디오 업로드 함수
export async function uploadVideo(formData: FormData): Promise<{ videoId: string; url: string }> {
  try {
    // 실제 구현에서는 여기서 비디오를 스토리지에 업로드합니다
    const response = await fetch(`${process.env.STORAGE_API_URL}/upload`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${process.env.STORAGE_API_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Upload error: ${response.status}`)
    }

    const result = await response.json()

    // 업로드 후 분석 시작 (비동기로 처리)
    analyzeVideo(result.videoId).catch(console.error)

    return result
  } catch (error) {
    console.error("Video upload error:", error)
    throw new Error("비디오 업로드 중 오류가 발생했습니다.")
  }
}
