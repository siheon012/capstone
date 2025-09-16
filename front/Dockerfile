# Next.js Frontend Dockerfile
FROM node:18-alpine

WORKDIR /app

# package.json과 yarn.lock 복사
COPY package*.json yarn.lock ./

# 의존성 설치
RUN yarn install --frozen-lockfile

# 애플리케이션 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 환경에 따라 다른 명령 실행
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then yarn build && yarn start; else yarn dev; fi"]
