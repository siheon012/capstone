# Next.js Frontend Dockerfile
FROM node:18-alpine

WORKDIR /app

# package.json과 yarn.lock 복사
COPY package*.json yarn.lock ./

# 의존성 설치
RUN yarn install --frozen-lockfile

# 애플리케이션 코드 복사
COPY . .

# Next.js 빌드
RUN yarn build

# 포트 노출
EXPOSE 3000

# 실행 명령
CMD ["yarn", "start"]
