/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5gb',
    },
  },
  // 프로덕션 빌드 시 console.log 자동 제거
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error', 'warn'], // error, warn은 유지
          }
        : false,
  },
  // API 프록시 설정 - 로컬 개발 환경에서만 Django로 리다이렉트
  async rewrites() {
    // Production: ALB가 /api/*, /db/*를 Backend로 라우팅하므로 rewrites 불필요
    // Development: localhost:3000 → localhost:8000으로 프록시
    if (process.env.NODE_ENV === 'development') {
      const djangoUrl =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      return [
        {
          source: '/api/:path*',
          destination: `${djangoUrl}/api/:path*`,
        },
        {
          source: '/db/:path*',
          destination: `${djangoUrl}/db/:path*`,
        },
        {
          source: '/admin/:path*',
          destination: `${djangoUrl}/admin/:path*`,
        },
      ];
    }
    // Production: 빈 배열 반환 (ALB가 처리)
    return [];
  },
};

export default nextConfig;
