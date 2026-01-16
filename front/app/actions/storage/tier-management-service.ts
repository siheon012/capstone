'use server';

import { getAppConfig } from '@/lib/env-config';

// 환경 설정
const config = getAppConfig();

// 티어 상태 타입
export type TierStatus = 'HOT' | 'WARM' | 'COLD';

// 티어 정보 타입
export interface TierInfo {
  status: TierStatus;
  last_accessed: string;
  access_count: number;
  search_count: number;
  tier_changed_at: string;
  storage_class: string;
  estimated_cost_per_gb: number;
}

// 비디오 티어 정보
export interface VideoTierInfo {
  video_id: number;
  video_name: string;
  file_size_gb: number;
  tier_info: TierInfo;
  s3_key?: string;
  migration_status?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// 티어 통계
export interface TierStats {
  total_videos: number;
  total_size_gb: number;
  tier_distribution: {
    hot: { count: number; size_gb: number; cost_per_month: number };
    warm: { count: number; size_gb: number; cost_per_month: number };
    cold: { count: number; size_gb: number; cost_per_month: number };
  };
  estimated_monthly_cost: number;
  potential_savings_per_month: number;
  last_updated: string;
}

// 티어 마이그레이션 요청
export interface TierMigrationRequest {
  video_ids: number[];
  target_tier: TierStatus;
  force?: boolean;
  reason?: string;
}

// 티어 마이그레이션 응답
export interface TierMigrationResponse {
  success: boolean;
  migration_job_id?: string;
  affected_videos: number;
  estimated_completion_time?: string;
  error?: string;
}

/**
 * 모든 비디오의 티어 정보 조회
 */
export async function getAllVideoTiers(): Promise<VideoTierInfo[]> {
  try {
    if (!config.features.showTierInfo) {
      return [];
    }

    console.log('📊 비디오 티어 정보 조회 시작');

    const response = await fetch(`${config.api.tierManagement}/videos/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`티어 정보 API 오류: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ 비디오 티어 정보 조회 완료:', {
      count: data.length,
    });

    return data;
  } catch (error) {
    console.error('❌ 비디오 티어 정보 조회 오류:', error);
    return [];
  }
}

/**
 * 특정 비디오의 티어 정보 조회
 */
export async function getVideoTierInfo(
  videoId: number
): Promise<VideoTierInfo | null> {
  try {
    if (!config.features.showTierInfo) {
      return null;
    }

    const response = await fetch(
      `${config.api.tierManagement}/videos/${videoId}/`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`비디오 티어 정보 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 비디오 티어 정보 조회 오류:', error);
    return null;
  }
}

/**
 * 티어 통계 조회
 */
export async function getTierStats(): Promise<TierStats | null> {
  try {
    if (!config.features.showTierInfo) {
      return null;
    }

    const response = await fetch(`${config.api.tierManagement}/stats/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`티어 통계 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 티어 통계 조회 오류:', error);
    return null;
  }
}

/**
 * 수동 티어 마이그레이션
 */
export async function migrateTier(
  request: TierMigrationRequest
): Promise<TierMigrationResponse> {
  try {
    if (!config.features.autoTierManagement) {
      return {
        success: false,
        affected_videos: 0,
        error: '티어 관리가 비활성화되어 있습니다.',
      };
    }

    console.log('🔄 티어 마이그레이션 요청:', {
      video_count: request.video_ids.length,
      target_tier: request.target_tier,
      force: request.force,
    });

    const response = await fetch(`${config.api.tierManagement}/migrate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`티어 마이그레이션 API 오류: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ 티어 마이그레이션 요청 완료:', {
      job_id: data.migration_job_id,
      affected_videos: data.affected_videos,
    });

    return {
      success: true,
      migration_job_id: data.migration_job_id,
      affected_videos: data.affected_videos,
      estimated_completion_time: data.estimated_completion_time,
    };
  } catch (error) {
    console.error('❌ 티어 마이그레이션 오류:', error);

    return {
      success: false,
      affected_videos: 0,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 자동 티어 관리 활성화/비활성화
 */
export async function toggleAutoTierManagement(
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${config.api.tierManagement}/auto-management/`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      throw new Error(`자동 티어 관리 설정 API 오류: ${response.status}`);
    }

    console.log(`✅ 자동 티어 관리 ${enabled ? '활성화' : '비활성화'} 완료`);

    return { success: true };
  } catch (error) {
    console.error('❌ 자동 티어 관리 설정 오류:', error);

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
 * 티어 마이그레이션 작업 상태 조회
 */
export async function getMigrationJobStatus(jobId: string): Promise<{
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress_percentage: number;
  completed_videos: number;
  total_videos: number;
  error_message?: string;
  estimated_remaining_time?: string;
} | null> {
  try {
    const response = await fetch(
      `${config.api.tierManagement}/migration-jobs/${jobId}/`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`마이그레이션 작업 상태 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 마이그레이션 작업 상태 조회 오류:', error);
    return null;
  }
}

/**
 * 티어별 비용 계산
 */
export function calculateTierCosts(
  sizeGb: number,
  tierStatus: TierStatus
): {
  storage_cost_per_month: number;
  access_cost_per_request: number;
  estimated_monthly_cost: number;
} {
  // AWS S3 요금 기준 (2024년 기준, 실제 요금은 AWS 사이트 참조)
  const costs = {
    HOT: {
      storage_per_gb: 0.025, // Standard
      access_per_1000_requests: 0.0004,
    },
    WARM: {
      storage_per_gb: 0.0125, // Standard-IA
      access_per_1000_requests: 0.001,
    },
    COLD: {
      storage_per_gb: 0.004, // Glacier Instant Retrieval
      access_per_1000_requests: 0.02,
    },
  };

  const tierCost = costs[tierStatus];
  const storage_cost_per_month = sizeGb * tierCost.storage_per_gb;

  // 평균 접근 횟수 추정 (월 기준)
  const estimated_monthly_accesses = {
    HOT: 100,
    WARM: 10,
    COLD: 1,
  }[tierStatus];

  const access_cost_per_request = tierCost.access_per_1000_requests / 1000;
  const estimated_access_cost =
    estimated_monthly_accesses * access_cost_per_request;

  return {
    storage_cost_per_month,
    access_cost_per_request,
    estimated_monthly_cost: storage_cost_per_month + estimated_access_cost,
  };
}

/**
 * 티어 추천 알고리즘
 */
export function recommendTier(
  accessCount: number,
  searchCount: number,
  daysSinceLastAccess: number
): {
  recommended_tier: TierStatus;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score_hot = 0;
  let score_warm = 0;
  let score_cold = 0;

  // 접근 빈도 기반 점수
  if (accessCount > 50) {
    score_hot += 3;
    reasons.push('높은 접근 빈도');
  } else if (accessCount > 10) {
    score_warm += 2;
    reasons.push('중간 접근 빈도');
  } else {
    score_cold += 2;
    reasons.push('낮은 접근 빈도');
  }

  // 검색 빈도 기반 점수
  if (searchCount > 20) {
    score_hot += 2;
    reasons.push('높은 검색 빈도');
  } else if (searchCount > 5) {
    score_warm += 1;
    reasons.push('중간 검색 빈도');
  } else {
    score_cold += 1;
    reasons.push('낮은 검색 빈도');
  }

  // 최근 접근 시간 기반 점수
  if (daysSinceLastAccess < 7) {
    score_hot += 2;
    reasons.push('최근 접근');
  } else if (daysSinceLastAccess < 30) {
    score_warm += 2;
    reasons.push('한 달 내 접근');
  } else if (daysSinceLastAccess < 90) {
    score_warm += 1;
    reasons.push('3개월 내 접근');
  } else {
    score_cold += 3;
    reasons.push('장기간 미접근');
  }

  // 최고 점수 티어 결정
  const scores = { HOT: score_hot, WARM: score_warm, COLD: score_cold };
  const max_score = Math.max(score_hot, score_warm, score_cold);
  const recommended_tier = Object.keys(scores).find(
    (tier) => scores[tier as TierStatus] === max_score
  ) as TierStatus;

  // 신뢰도 계산 (최고 점수와 다른 점수들의 차이)
  const other_scores = Object.values(scores).filter(
    (score) => score !== max_score
  );
  const avg_other_score =
    other_scores.reduce((a, b) => a + b, 0) / other_scores.length;
  const confidence = Math.min(
    100,
    Math.round((max_score / (max_score + avg_other_score)) * 100)
  );

  return {
    recommended_tier,
    confidence,
    reasons,
  };
}
