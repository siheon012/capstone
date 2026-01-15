'use server';

import { getAppConfig } from '@/lib/env-config';

// 환경 설정
const config = getAppConfig();

// 분석 작업 상태
export type AnalysisJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// 분석 유형
export type AnalysisType =
  | 'object_detection'
  | 'anomaly_detection'
  | 'face_recognition'
  | 'text_extraction'
  | 'full_analysis';

// 분석 작업 정보
export interface AnalysisJob {
  id: string;
  video_id: number;
  video_name: string;
  analysis_type: AnalysisType;
  status: AnalysisJobStatus;
  progress_percentage: number;
  started_at: string;
  completed_at?: string;
  estimated_completion?: string;
  error_message?: string;
  batch_job_id?: string;
  batch_queue: string;
  resource_requirements: {
    vcpus: number;
    memory_mb: number;
    gpu_count?: number;
  };
  results?: {
    objects_detected: number;
    anomalies_found: number;
    faces_detected: number;
    text_segments: number;
    confidence_scores: {
      avg: number;
      min: number;
      max: number;
    };
  };
}

// 분석 작업 요청
export interface AnalysisJobRequest {
  video_id: number;
  analysis_type: AnalysisType;
  priority?: 'low' | 'normal' | 'high';
  parameters?: {
    confidence_threshold?: number;
    detect_faces?: boolean;
    extract_text?: boolean;
    enable_tracking?: boolean;
    frame_sampling_rate?: number;
  };
}

// 분석 작업 응답
export interface AnalysisJobResponse {
  success: boolean;
  job_id?: string;
  estimated_duration_minutes?: number;
  queue_position?: number;
  error?: string;
}

// 분석 통계
export interface AnalysisStats {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  average_duration_minutes: number;
  queue_length: number;
  active_jobs: number;
  resource_utilization: {
    cpu_percent: number;
    memory_percent: number;
    gpu_percent?: number;
  };
}

/**
 * 새로운 분석 작업 생성
 */
export async function createAnalysisJob(
  request: AnalysisJobRequest
): Promise<AnalysisJobResponse> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return {
        success: false,
        error: 'AWS Batch 분석이 비활성화되어 있습니다.',
      };
    }

    console.log('🚀 분석 작업 생성 요청:', {
      video_id: request.video_id,
      analysis_type: request.analysis_type,
      priority: request.priority,
    });

    const response = await fetch(`${config.api.analysisJobs}/create/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`분석 작업 생성 API 오류: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ 분석 작업 생성 완료:', {
      job_id: data.job_id,
      estimated_duration: data.estimated_duration_minutes,
      queue_position: data.queue_position,
    });

    return {
      success: true,
      job_id: data.job_id,
      estimated_duration_minutes: data.estimated_duration_minutes,
      queue_position: data.queue_position,
    };
  } catch (error) {
    console.error('❌ 분석 작업 생성 오류:', error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 분석 작업 목록 조회
 */
export async function getAnalysisJobs(
  videoId?: number,
  status?: AnalysisJobStatus,
  limit: number = 50
): Promise<AnalysisJob[]> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return [];
    }

    const params = new URLSearchParams();
    if (videoId) params.append('video_id', videoId.toString());
    if (status) params.append('status', status);
    params.append('limit', limit.toString());

    const response = await fetch(`${config.api.analysisJobs}/?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`분석 작업 목록 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('❌ 분석 작업 목록 조회 오류:', error);
    return [];
  }
}

/**
 * 특정 분석 작업 상세 조회
 */
export async function getAnalysisJob(
  jobId: string
): Promise<AnalysisJob | null> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return null;
    }

    const response = await fetch(`${config.api.analysisJobs}/${jobId}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`분석 작업 조회 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 분석 작업 조회 오류:', error);
    return null;
  }
}

/**
 * 분석 작업 취소
 */
export async function cancelAnalysisJob(
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return {
        success: false,
        error: 'AWS Batch 분석이 비활성화되어 있습니다.',
      };
    }

    console.log('🛑 분석 작업 취소 요청:', jobId);

    const response = await fetch(
      `${config.api.analysisJobs}/${jobId}/cancel/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      throw new Error(`분석 작업 취소 API 오류: ${response.status}`);
    }

    console.log('✅ 분석 작업 취소 완료:', jobId);

    return { success: true };
  } catch (error) {
    console.error('❌ 분석 작업 취소 오류:', error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 분석 통계 조회
 */
export async function getAnalysisStats(): Promise<AnalysisStats | null> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return null;
    }

    const response = await fetch(`${config.api.analysisJobs}/stats/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`분석 통계 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 분석 통계 조회 오류:', error);
    return null;
  }
}

/**
 * 분석 작업 재시작
 */
export async function retryAnalysisJob(
  jobId: string
): Promise<{ success: boolean; new_job_id?: string; error?: string }> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return {
        success: false,
        error: 'AWS Batch 분석이 비활성화되어 있습니다.',
      };
    }

    console.log('🔄 분석 작업 재시작 요청:', jobId);

    const response = await fetch(`${config.api.analysisJobs}/${jobId}/retry/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`분석 작업 재시작 API 오류: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ 분석 작업 재시작 완료:', {
      original_job_id: jobId,
      new_job_id: data.new_job_id,
    });

    return {
      success: true,
      new_job_id: data.new_job_id,
    };
  } catch (error) {
    console.error('❌ 분석 작업 재시작 오류:', error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 분석 결과 다운로드
 */
export async function downloadAnalysisResults(
  jobId: string
): Promise<{ success: boolean; download_url?: string; error?: string }> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return {
        success: false,
        error: 'AWS Batch 분석이 비활성화되어 있습니다.',
      };
    }

    const response = await fetch(
      `${config.api.analysisJobs}/${jobId}/download/`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      throw new Error(`분석 결과 다운로드 API 오류: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      download_url: data.download_url,
    };
  } catch (error) {
    console.error('❌ 분석 결과 다운로드 오류:', error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 실시간 작업 상태 모니터링 (WebSocket 연결)
 */
export function subscribeToJobUpdates(
  jobId: string,
  onUpdate: (job: AnalysisJob) => void,
  onError: (error: string) => void
): () => void {
  if (!config.features.awsBatchAnalysis) {
    onError('AWS Batch 분석이 비활성화되어 있습니다.');
    return () => {};
  }

  // WebSocket 연결 설정 (실제 구현 시 WebSocket URL 사용)
  let ws: WebSocket | null = null;

  try {
    const wsUrl =
      config.api.baseUrl.replace('http', 'ws') + `/ws/analysis-jobs/${jobId}/`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('🔌 분석 작업 WebSocket 연결 성공:', jobId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch (error) {
        console.error('❌ WebSocket 메시지 파싱 오류:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 연결 오류:', error);
      onError('실시간 업데이트 연결에 실패했습니다.');
    };

    ws.onclose = () => {
      console.log('🔌 분석 작업 WebSocket 연결 종료:', jobId);
    };
  } catch (error) {
    console.error('❌ WebSocket 초기화 오류:', error);
    onError('실시간 업데이트를 시작할 수 없습니다.');
  }

  // 정리 함수 반환
  return () => {
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

/**
 * 분석 작업 우선순위 변경
 */
export async function changeJobPriority(
  jobId: string,
  priority: 'low' | 'normal' | 'high'
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.features.awsBatchAnalysis) {
      return {
        success: false,
        error: 'AWS Batch 분석이 비활성화되어 있습니다.',
      };
    }

    console.log('⚡ 분석 작업 우선순위 변경:', { jobId, priority });

    const response = await fetch(
      `${config.api.analysisJobs}/${jobId}/priority/`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priority }),
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      throw new Error(`우선순위 변경 API 오류: ${response.status}`);
    }

    console.log('✅ 분석 작업 우선순위 변경 완료:', { jobId, priority });

    return { success: true };
  } catch (error) {
    console.error('❌ 분석 작업 우선순위 변경 오류:', error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
