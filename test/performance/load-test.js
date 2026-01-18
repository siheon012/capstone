import http from 'k6/http';
import { check, sleep } from 'k6';

// 테스트 설정 (시나리오)
export const options = {
  // 1. 부하 단계 설정
  stages: [
    { duration: '30s', target: 20 }, // 처음 30초 동안 사용자 0 -> 20명으로 서서히 증가
    { duration: '1m', target: 20 }, // 1분 동안 20명 유지 (평소 트래픽)
    { duration: '30s', target: 50 }, // 30초 동안 50명으로 증가 (피크 타임)
    { duration: '1m', target: 50 }, // 1분 동안 50명 유지
    { duration: '30s', target: 0 }, // 30초 동안 0명으로 감소 (테스트 종료)
  ],
  // 2. 임계치 설정 (이거 넘으면 실패로 간주)
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95%의 요청이 500ms 안에 끝나야 함
    http_req_failed: ['rate<0.01'], // 에러율은 1% 미만이어야 함
  },
};

// 가상 사용자(VU)가 수행할 행동
export default function () {
  // 👇 여기에 테스트하고 싶은 API 주소를 넣으세요 (ALB 주소 또는 로컬 주소)
  const BASE_URL = 'MY_PAGE'; // 일단 로컬 테스트용

  // 1. 메인 페이지 접속 (Health Check)
  const res = http.get(`${BASE_URL}/api/health`);

  // 2. 응답 확인
  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1); // 1초 쉬고 다시 요청 (실제 사용자처럼 행동)
}
