// Cấu hình máy chủ từ biến môi trường (file server/.env – xem .env.example).
// NGK chỉ chạy trên CHÍNH MÁY NÀY (localhost) – không deploy lên Internet: `npm run dev` (chế độ dev) hoặc `npm run demo`
// (bản demo: build trang web rồi chạy máy chủ ở chế độ production, máy chủ phục vụ luôn trang web).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const envFile = path.resolve(import.meta.dirname, '../.env');
if (fs.existsSync(envFile) && process.env.NODE_ENV !== 'test') process.loadEnvFile(envFile);

const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
/** http://localhost:5173 → [http://localhost:5173, http://127.0.0.1:5173] – trình duyệt mở bằng địa chỉ nào cũng được. */
const bothLoopbackNames = (url) => {
  const m = LOCAL_URL.exec(url);
  return m ? ['localhost', '127.0.0.1'].map((host) => `http://${host}${m[2] ?? ''}`) : [url];
};

/** Che tài khoản + mật khẩu trong chuỗi kết nối trước khi in ra log: mongodb+srv://u:p@host → mongodb+srv://***@host */
export const maskUri = (uri) => String(uri ?? '').replace(/\/\/[^@/]*@/, '//***@');

/**
 * Xác định chế độ chạy từ biến môi trường (hàm thuần – kiểm thử được). Máy chủ chỉ mở cổng cho chính máy này
 * (`listenLocal` trong app.js) nên trang web luôn ở một địa chỉ http://localhost…:
 *  - CHẾ ĐỘ DEV (`npm run dev`): trang web do Vite phục vụ – APP_URL, mặc định http://localhost:5173;
 *  - BẢN DEMO (`npm run demo`, NODE_ENV=production): máy chủ phục vụ luôn trang web đã build → trang web là
 *    http://localhost:PORT (bỏ qua APP_URL), cookie `Secure`, CSP thật – giống bản chạy thật nhất có thể trên một máy;
 *  - KIỂM THỬ (NODE_ENV=test).
 * @returns các chế độ + `problems`: lỗi cấu hình khiến máy chủ web từ chối khởi động (lệnh chạy trên máy chủ không bị chặn)
 */
export function resolveEnv(e) {
  const env = e.NODE_ENV || 'development';
  const isProd = env === 'production';
  const isTest = env === 'test';
  const problems = [];
  const port = Number(e.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`PORT phải là số cổng 1–65535 (đang là "${e.PORT}").`);
  const appUrl = isProd ? `http://localhost:${port}` : (e.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  if (!isProd && !LOCAL_URL.test(appUrl)) {
    problems.push(`Chỉ chạy trên máy này – APP_URL phải là http://localhost:<cổng> hoặc http://127.0.0.1:<cổng> (đang là ${appUrl}).`);
  }
  const secret = e.JWT_SECRET ?? '';
  if (secret && secret.length < 32 && !isTest) {
    problems.push('JWT_SECRET quá ngắn (cần ≥ 32 ký tự) – xoá dòng này để dùng khoá ngẫu nhiên, hoặc tạo khoá mới (xem server/.env.example).');
  }
  return {
    env,
    isProd,
    isTest,
    devMode: !isProd && !isTest,
    port,
    appUrl,
    // nguồn được phép gọi API có cookie (chống CSRF): trang web + chính máy chủ, mở bằng localhost hay 127.0.0.1 đều được
    allowedOrigins: new Set([...bothLoopbackNames(appUrl), ...bothLoopbackNames(`http://localhost:${port}`)]),
    // trình duyệt nhận cookie Secure trên http://localhost (được coi là kết nối an toàn) → bản demo bật như bản thật
    secureCookies: isProd,
    problems,
  };
}

const mode = resolveEnv(process.env);

// thiếu khoá → khoá ngẫu nhiên mỗi lần chạy (khởi động lại máy chủ = phải đăng nhập lại); khoá quá ngắn: `problems` đã ghi lỗi
const envSecret = process.env.JWT_SECRET ?? '';
const jwtRandom = envSecret.length < 32;

export const config = {
  ...mode,
  mongoUri: process.env.MONGODB_URI ?? (mode.isTest ? 'mongodb://127.0.0.1:27017/ngk_test' : 'mongodb://127.0.0.1:27017/ngk'),
  jwtSecret: jwtRandom ? crypto.randomBytes(32).toString('hex') : envSecret,
  jwtRandom,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  gmail: {
    user: process.env.GMAIL_USER ?? '',
    appPassword: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
  },
  mailFrom: process.env.MAIL_FROM ?? '',
  // thời hạn
  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 3600,
  verifyTtlSec: 24 * 3600,
  resetTtlSec: 30 * 60,
  // giới hạn
  maxDesignsPerUser: 200,
  maxVersions: 20,
  maxConfigBytes: 1024 * 1024,
  maxImageBytes: 300 * 1024,
};

/** Đã cấu hình Gmail → gửi email thật; chưa → HỘP THƯ DEMO (link trong thư hiện ngay trên trang – xem mail.js). */
export const mailConfigured = () => !!(config.gmail.user && config.gmail.appPassword);
