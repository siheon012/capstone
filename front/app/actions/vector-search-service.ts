'use server';

import { getAppConfig } from '@/lib/env-config';

// 환경 설정
const config = getAppConfig();

// 벡터 검색 요청 타입
export interface VectorSearchRequest {
  query: string;
  video_id?: number;
  limit?: number;
  similarity_threshold?: number;
  search_type?: 'semantic' | 'hybrid' | 'keyword';
}

// 벡터 검색 결과 타입
export interface VectorSearchResult {
  id: number;
  video_id: number;
  video_name: string;
  segment_start: number;
  segment_end: number;
  content: string;
  similarity_score: number;
  tier_status: 'HOT' | 'WARM' | 'COLD';
  thumbnail_url?: string;
  s3_url?: string;
}

// 검색 응답 타입
export interface VectorSearchResponse {
  success: boolean;
  results: VectorSearchResult[];
  total_count: number;
  search_time_ms: number;
  query_embedding?: number[];
  error?: string;
}

// 검색 통계 타입
export interface SearchStats {
  total_searches: number;
  avg_response_time_ms: number;
  popular_queries: Array<{
    query: string;
    count: number;
    avg_results: number;
  }>;
  tier_distribution: {
    hot: number;
    warm: number;
    cold: number;
  };
}

/**
 * 벡터 검색 실행
 */
export async function performVectorSearch(
  request: VectorSearchRequest
): Promise<VectorSearchResponse> {
  try {
    if (!config.features.vectorSearch) {
      return {
        success: false,
        results: [],
        total_count: 0,
        search_time_ms: 0,
        error: '벡터 검색이 비활성화되어 있습니다.',
      };
    }

    console.log('🔍 벡터 검색 요청:', {
      query: request.query,
      video_id: request.video_id,
      limit: request.limit,
      search_type: request.search_type,
      url: config.api.vectorSearch,
    });

    const searchParams = {
      query: request.query,
      video_id: request.video_id,
      limit: request.limit || config.performance.searchMaxResults,
      similarity_threshold: request.similarity_threshold || 0.7,
      search_type: request.search_type || 'semantic',
    };

    const response = await fetch(config.api.vectorSearch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchParams),
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`벡터 검색 API 오류: ${response.status}`);
    }

    const data = await response.json();

    // S3 URL 생성 (필요한 경우)
    if (config.s3.enabled && config.features.showS3Urls) {
      data.results = data.results.map((result: VectorSearchResult) => ({
        ...result,
        s3_url:
          result.s3_url ||
          (config.s3.baseUrl
            ? `${config.s3.baseUrl}/videos/${result.video_id}/`
            : undefined),
      }));
    }

    console.log('✅ 벡터 검색 완료:', {
      results_count: data.results?.length || 0,
      search_time: data.search_time_ms,
      total_count: data.total_count,
    });

    return {
      success: true,
      results: data.results || [],
      total_count: data.total_count || 0,
      search_time_ms: data.search_time_ms || 0,
      query_embedding: data.query_embedding,
    };
  } catch (error) {
    console.error('❌ 벡터 검색 오류:', error);

    return {
      success: false,
      results: [],
      total_count: 0,
      search_time_ms: 0,
      error:
        error instanceof Error
          ? error.message
          : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 검색 통계 조회
 */
export async function getSearchStats(): Promise<SearchStats | null> {
  try {
    if (!config.features.showSearchStats) {
      return null;
    }

    const response = await fetch(`${config.api.vectorSearch}/stats/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`검색 통계 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 검색 통계 조회 오류:', error);
    return null;
  }
}

/**
 * 유사한 비디오 추천
 */
export async function getSimilarVideos(
  videoId: number,
  limit: number = 5
): Promise<VectorSearchResult[]> {
  try {
    if (!config.features.vectorSearch) {
      return [];
    }

    const response = await fetch(
      `${config.api.videoAnalysis}/${videoId}/similar/`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.security.apiTimeoutSeconds * 1000),
      }
    );

    if (!response.ok) {
      throw new Error(`유사 비디오 API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('❌ 유사 비디오 조회 오류:', error);
    return [];
  }
}

/**
 * 디바운스된 검색 (실시간 검색용)
 */
let searchTimeout: NodeJS.Timeout | null = null;

export async function debouncedVectorSearch(
  request: VectorSearchRequest,
  callback: (result: VectorSearchResponse) => void
): Promise<void> {
  if (!config.features.realtimeSearch) {
    return;
  }

  // 이전 타이머 취소
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // 최소 쿼리 길이 확인
  if (request.query.length < config.performance.searchMinQueryLength) {
    callback({
      success: true,
      results: [],
      total_count: 0,
      search_time_ms: 0,
    });
    return;
  }

  // 디바운스 타이머 설정
  searchTimeout = setTimeout(async () => {
    try {
      const result = await performVectorSearch(request);
      callback(result);
    } catch (error) {
      callback({
        success: false,
        results: [],
        total_count: 0,
        search_time_ms: 0,
        error: error instanceof Error ? error.message : '검색 오류',
      });
    }
  }, config.performance.searchDebounceMs);
}

/**
 * 검색 캐시 관리
 */
const searchCache = new Map<
  string,
  { result: VectorSearchResponse; timestamp: number }
>();

export async function cachedVectorSearch(
  request: VectorSearchRequest
): Promise<VectorSearchResponse> {
  const cacheKey = JSON.stringify(request);
  const cached = searchCache.get(cacheKey);
  const now = Date.now();

  // 캐시된 결과가 있고 유효기간 내인 경우
  if (
    cached &&
    now - cached.timestamp <
      config.performance.cache.searchResultsMinutes * 60 * 1000
  ) {
    console.log('🔄 캐시된 검색 결과 사용:', cacheKey);
    return cached.result;
  }

  // 새로운 검색 실행
  const result = await performVectorSearch(request);

  // 성공한 결과만 캐시
  if (result.success) {
    searchCache.set(cacheKey, { result, timestamp: now });

    // 캐시 크기 제한 (최대 100개)
    if (searchCache.size > 100) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) {
        searchCache.delete(oldestKey);
      }
    }
  }

  return result;
}

/**
 * 검색 캐시 초기화
 */
export function clearSearchCache(): void {
  searchCache.clear();
  console.log('🗑️ 검색 캐시 초기화 완료');
}
