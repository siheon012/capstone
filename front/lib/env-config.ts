/**
 * 환경변수 관리 유틸리티
 * 로컬/클라우드 환경에 따른 동적 설정 관리
 */

// 환경 타입 정의
export type Environment = 'development' | 'production' | 'test';

// API 엔드포인트 설정
export interface ApiEndpoints {
  baseUrl: string;
  database: string;
  vectorSearch: string;
  tierManagement: string;
  analysisJobs: string;
  videoAnalysis: string;
}

// S3 설정
export interface S3Config {
  enabled: boolean;
  bucket: string;
  region: string;
  baseUrl?: string;
}

// 기능 플래그
export interface FeatureFlags {
  realtimeSearch: boolean;
  autoTierManagement: boolean;
  awsBatchAnalysis: boolean;
  vectorSearch: boolean;
  showTierInfo: boolean;
  showSearchStats: boolean;
  showS3Urls: boolean;
}

// 성능 설정
export interface PerformanceConfig {
  searchDebounceMs: number;
  searchMinQueryLength: number;
  searchMaxResults: number;
  maxFileSizeGB: number;
  supportedVideoTypes: string[];
  cache: {
    videoListMinutes: number;
    searchResultsMinutes: number;
    thumbnailsHours: number;
  };
  pagination: {
    videosPerPage: number;
    eventsPerPage: number;
    sessionsPerPage: number;
  };
}

// 환경변수 파싱 유틸리티
const getEnvVar = (key: string, defaultValue: string = ''): string => {
  return process.env[key] || defaultValue;
};

const getEnvBool = (key: string, defaultValue: boolean = false): boolean => {
  const value = process.env[key]?.toLowerCase();
  return value === 'true' || value === '1';
};

const getEnvNumber = (key: string, defaultValue: number = 0): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

const getEnvArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  return value ? value.split(',').map((item) => item.trim()) : defaultValue;
};

// 현재 환경 감지
export const getCurrentEnvironment = (): Environment => {
  return (process.env.NODE_ENV as Environment) || 'development';
};

// API 엔드포인트 설정
export const getApiEndpoints = (): ApiEndpoints => {
  // 프로덕션 환경에서는 환경변수, 개발 환경에서는 localhost
  const defaultUrl =
    getCurrentEnvironment() === 'production'
      ? getEnvVar('NEXT_PUBLIC_PRODUCTION_API_URL', '')
      : 'http://localhost:8001';
  const baseUrl = getEnvVar('NEXT_PUBLIC_API_URL', defaultUrl);

  return {
    baseUrl,
    database: getEnvVar('DJANGO_DB_URL', `${baseUrl}/db`),
    vectorSearch: getEnvVar(
      'NEXT_PUBLIC_VECTOR_SEARCH_URL',
      `${baseUrl}/api/video-analysis/vector-search/`
    ),
    tierManagement: getEnvVar(
      'NEXT_PUBLIC_TIER_MANAGEMENT_URL',
      `${baseUrl}/api/tier-management/`
    ),
    analysisJobs: getEnvVar(
      'NEXT_PUBLIC_ANALYSIS_JOBS_URL',
      `${baseUrl}/api/analysis-jobs/`
    ),
    videoAnalysis: getEnvVar(
      'NEXT_PUBLIC_VIDEO_ANALYSIS_URL',
      `${baseUrl}/api/video-analysis/`
    ),
  };
};

// S3 설정
export const getS3Config = (): S3Config => {
  const enabled = getEnvBool('USE_S3', false);
  const bucket = getEnvVar('NEXT_PUBLIC_S3_BUCKET', 'capstone-dev-bucket');
  const region = getEnvVar('NEXT_PUBLIC_S3_REGION', 'ap-northeast-2');

  return {
    enabled,
    bucket,
    region,
    baseUrl: enabled
      ? `https://${bucket}.s3.${region}.amazonaws.com`
      : undefined,
  };
};

// 기능 플래그 설정
export const getFeatureFlags = (): FeatureFlags => {
  const isDevelopment = getCurrentEnvironment() === 'development';

  return {
    realtimeSearch: getEnvBool(
      'NEXT_PUBLIC_ENABLE_REALTIME_SEARCH',
      !isDevelopment
    ),
    autoTierManagement: getEnvBool(
      'NEXT_PUBLIC_ENABLE_AUTO_TIER_MANAGEMENT',
      !isDevelopment
    ),
    awsBatchAnalysis: getEnvBool(
      'NEXT_PUBLIC_ENABLE_AWS_BATCH_ANALYSIS',
      false
    ),
    vectorSearch: getEnvBool(
      'NEXT_PUBLIC_ENABLE_VECTOR_SEARCH',
      !isDevelopment
    ),
    showTierInfo: getEnvBool('NEXT_PUBLIC_SHOW_TIER_INFO', true),
    showSearchStats: getEnvBool('NEXT_PUBLIC_SHOW_SEARCH_STATS', true),
    showS3Urls: getEnvBool('NEXT_PUBLIC_SHOW_S3_URLS', false),
  };
};

// 성능 설정
export const getPerformanceConfig = (): PerformanceConfig => {
  const isDevelopment = getCurrentEnvironment() === 'development';

  return {
    searchDebounceMs: getEnvNumber(
      'NEXT_PUBLIC_SEARCH_DEBOUNCE_MS',
      isDevelopment ? 300 : 500
    ),
    searchMinQueryLength: getEnvNumber(
      'NEXT_PUBLIC_SEARCH_MIN_QUERY_LENGTH',
      isDevelopment ? 2 : 3
    ),
    searchMaxResults: getEnvNumber(
      'NEXT_PUBLIC_SEARCH_MAX_RESULTS',
      isDevelopment ? 50 : 100
    ),
    maxFileSizeGB: getEnvNumber('NEXT_PUBLIC_MAX_FILE_SIZE_GB', 10),
    supportedVideoTypes: getEnvArray('NEXT_PUBLIC_SUPPORTED_VIDEO_TYPES', [
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
    ]),
    cache: {
      videoListMinutes: getEnvNumber(
        'NEXT_PUBLIC_CACHE_VIDEO_LIST_MINUTES',
        isDevelopment ? 5 : 10
      ),
      searchResultsMinutes: getEnvNumber(
        'NEXT_PUBLIC_CACHE_SEARCH_RESULTS_MINUTES',
        isDevelopment ? 1 : 5
      ),
      thumbnailsHours: getEnvNumber(
        'NEXT_PUBLIC_CACHE_THUMBNAILS_HOURS',
        isDevelopment ? 24 : 168
      ),
    },
    pagination: {
      videosPerPage: getEnvNumber(
        'NEXT_PUBLIC_VIDEOS_PER_PAGE',
        isDevelopment ? 20 : 50
      ),
      eventsPerPage: getEnvNumber(
        'NEXT_PUBLIC_EVENTS_PER_PAGE',
        isDevelopment ? 100 : 200
      ),
      sessionsPerPage: getEnvNumber(
        'NEXT_PUBLIC_SESSIONS_PER_PAGE',
        isDevelopment ? 50 : 100
      ),
    },
  };
};

// 로깅 설정
export const getLoggingConfig = () => {
  const isDevelopment = getCurrentEnvironment() === 'development';

  return {
    level: getEnvVar('NEXT_PUBLIC_LOG_LEVEL', isDevelopment ? 'info' : 'error'),
    enableDebugPanel: getEnvBool(
      'NEXT_PUBLIC_ENABLE_DEBUG_PANEL',
      isDevelopment
    ),
    logApiCalls: getEnvBool('NEXT_PUBLIC_LOG_API_CALLS', isDevelopment),
    logSearchQueries: getEnvBool(
      'NEXT_PUBLIC_LOG_SEARCH_QUERIES',
      isDevelopment
    ),
  };
};

// 보안 설정
export const getSecurityConfig = () => {
  return {
    forceHttps: getEnvBool(
      'NEXT_PUBLIC_FORCE_HTTPS',
      getCurrentEnvironment() === 'production'
    ),
    apiTimeoutSeconds: getEnvNumber('NEXT_PUBLIC_API_TIMEOUT_SECONDS', 30),
    apiRetryCount: getEnvNumber('NEXT_PUBLIC_API_RETRY_COUNT', 3),
    apiRetryDelayMs: getEnvNumber('NEXT_PUBLIC_API_RETRY_DELAY_MS', 1000),
  };
};

// 전체 앱 설정 객체
export interface AppConfig {
  environment: Environment;
  api: ApiEndpoints;
  s3: S3Config;
  features: FeatureFlags;
  performance: PerformanceConfig;
  logging: ReturnType<typeof getLoggingConfig>;
  security: ReturnType<typeof getSecurityConfig>;
}

// 앱 설정 싱글톤
let appConfig: AppConfig | null = null;

export const getAppConfig = (): AppConfig => {
  if (!appConfig) {
    appConfig = {
      environment: getCurrentEnvironment(),
      api: getApiEndpoints(),
      s3: getS3Config(),
      features: getFeatureFlags(),
      performance: getPerformanceConfig(),
      logging: getLoggingConfig(),
      security: getSecurityConfig(),
    };
  }

  return appConfig;
};

// 환경변수 유효성 검사
export const validateEnvironment = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = getAppConfig();

  // 필수 환경변수 검사
  if (!config.api.baseUrl) {
    errors.push('NEXT_PUBLIC_API_URL이 설정되지 않았습니다.');
  }

  if (config.s3.enabled && !config.s3.bucket) {
    errors.push(
      'S3가 활성화되었지만 NEXT_PUBLIC_S3_BUCKET이 설정되지 않았습니다.'
    );
  }

  if (config.performance.maxFileSizeGB <= 0) {
    errors.push('최대 파일 크기는 0보다 커야 합니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// 디버그 정보 출력 (개발 환경에서만)
export const logEnvironmentInfo = () => {
  if (getCurrentEnvironment() === 'development') {
    const config = getAppConfig();
    console.log('🌍 Environment Configuration:', {
      environment: config.environment,
      api: config.api,
      s3: config.s3,
      features: config.features,
      performance: config.performance,
    });

    const validation = validateEnvironment();
    if (!validation.valid) {
      console.warn('⚠️ Environment validation errors:', validation.errors);
    } else {
      console.log('✅ Environment validation passed');
    }
  }
};
