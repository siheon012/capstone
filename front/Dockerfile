# Next.js Frontend Dockerfile - Optimized Multi-stage Build

# ==========================================
# Base Stage: 공통 의존성 및 환경 설정
# ==========================================
FROM node:20-alpine AS base

# 보안을 위한 사용자 생성
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

WORKDIR /app

# Corepack 활성화 (yarn 안정적 사용)
RUN corepack enable && corepack prepare yarn@stable --activate

# ==========================================
# Dependencies Stage: 의존성 설치
# ==========================================
FROM base AS deps

# 의존성 파일만 복사 (Docker 캐시 최적화)
COPY package*.json yarn.lock* ./

# 의존성 설치 (yarn 1.22 호환)
RUN yarn install --network-timeout 300000

# ==========================================
# Builder Stage: 애플리케이션 빌드
# ==========================================
FROM base AS builder

WORKDIR /app

# 의존성 복사
COPY --from=deps /app/node_modules ./node_modules

# 소스코드 복사
COPY . .

# Next.js 환경 변수 설정
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# ECS/Fargate 배포 시 빌드 타임 환경 변수
# Terraform에서 ECS 태스크 정의로 주입됨
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# 애플리케이션 빌드
RUN yarn build

# ==========================================
# Development Stage: 개발 환경
# ==========================================
FROM base AS development

WORKDIR /app

# 의존성 복사
COPY --from=deps /app/node_modules ./node_modules

# 소스코드 복사
COPY . .

# 환경 변수 설정
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# 개발 서버용 포트
EXPOSE 3000

# nextjs 사용자로 실행
USER nextjs

# 개발 서버 실행
CMD ["yarn", "dev"]

# ==========================================
# Production Stage: 프로덕션 환경
# ==========================================
FROM base AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json yarn.lock* ./
RUN yarn install --production --network-timeout 300000 && yarn cache clean

# 빌드된 애플리케이션 복사
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next.js 설정 파일 복사
COPY --chown=nextjs:nodejs next.config.mjs ./

# 동적 업로드 디렉터리 생성 (권한 설정)
RUN mkdir -p /app/public/uploads /app/public/uploaded_video && \
    chown -R nextjs:nodejs /app/public/uploads /app/public/uploaded_video

# 환경 변수 설정
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# ECS/Fargate용 API URL 설정
# Terraform에서 ECS 태스크 정의로 주입됨
ENV NEXT_PUBLIC_API_URL=
ENV AWS_REGION=ap-northeast-2

# 프로덕션 서버용 포트
EXPOSE 3000

# 보안을 위해 nextjs 사용자로 실행
USER nextjs

# 헬스체크 추가 (더 상세한 체크)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 프로덕션 서버 실행
CMD ["yarn", "start"]
