/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
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
  // API 프록시 설정 (Mixed Content 오류 해결)
  async rewrites() {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://capstone-alb-175357648.ap-northeast-2.elb.amazonaws.com';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/db/:path*',
        destination: `${apiUrl}/db/:path*`,
      },
    ];
  },
};

export default nextConfig;
