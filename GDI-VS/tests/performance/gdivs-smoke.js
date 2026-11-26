import http from 'k6/http';
import { check, sleep } from 'k6';

const base = (__ENV.BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const targetP95 = Number(__ENV.TARGET_P95_MS || 750); // provisional local smoke budget

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '60s', target: 15 },
    { duration: '30s', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: [`p(95)<${targetP95}`],
  },
};

export default function () {
  const path = ['/health', '/ready', '/metrics'][__ITER % 3];
  const response = http.get(`${base}${path}`, { tags: { endpoint: path } });
  check(response, { 'response is successful': (r) => r.status >= 200 && r.status < 400 });
  sleep(0.2);
}
