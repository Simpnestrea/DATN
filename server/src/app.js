// Ứng dụng Express: ghép lớp bảo vệ + các nhóm API. Tách khỏi index.js để kiểm thử gọi trực tiếp.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config.js';
import { HttpError } from './lib.js';
import { apiLimiter, csrfGuard, loadUser, sanitizeBody } from './security.js';
import { authRouter } from './routes/auth.js';
import { accountRouter, imageRouter } from './routes/account.js';
import { designRouter } from './routes/designs.js';
import { communityRouter } from './routes/community.js';
import { adminRouter } from './routes/admin.js';
import { injectMeta, shareMeta } from './share.js';
import { getCatalog } from './catalog.js';

/** API được gửi thân lớn: tạo thiết kế, đồng bộ nháp, lưu phiên bản, ảnh đại diện. */
const BIG_BODY = /^\/(?:designs(?:\/[a-f0-9]{24}\/(?:draft|versions))?|account\/avatar)\/?$/i;

/**
 * @param opts.serveClient phục vụ trang web đã build (mặc định: chỉ ở production)
 * @param opts.clientDist  thư mục bản build (kiểm thử dùng thư mục tạm)
 */
export function createApp({ serveClient, clientDist } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // không có proxy nào đứng trước (chạy thẳng trên máy) → KHÔNG tin header X-Forwarded-For: người gọi API tự đặt header
  // này được, tin nó là đổi được "IP" của mình để lách giới hạn số lần gọi
  app.set('trust proxy', false);

  app.use(
    helmet({
      // CSP cho trang web (bản demo: máy chủ phục vụ luôn trang web đã build)
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: null, // chạy http://localhost – không có https để chuyển lên
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
          frameSrc: ['https://accounts.google.com'],
          connectSrc: ["'self'", 'https://accounts.google.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          workerSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // cửa sổ đăng nhập Google
      hsts: false, // HSTS chỉ có tác dụng khi chạy https (trình duyệt bỏ qua nếu nhận qua http://localhost)
    }),
  );

  const api = express.Router();
  api.use(apiLimiter);
  // thân yêu cầu JSON: 2 MB chỉ cho các API lưu thiết kế (cấu hình + ảnh) và ảnh đại diện; mọi API khác (đăng nhập, bình
  // luận, hồ sơ…) tối đa 64 KB → kẻ xấu không đẩy được vài MB dữ liệu vào trước khi bị kiểm tra
  const bigJson = express.json({ limit: '2mb' });
  const smallJson = express.json({ limit: '64kb' });
  api.use((req, res, next) => (BIG_BODY.test(req.path) ? bigJson : smallJson)(req, res, next));
  api.use(cookieParser());
  api.use(csrfGuard);
  api.use(sanitizeBody);
  api.use(loadUser);
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); // dữ liệu cá nhân – không lưu đệm (trừ ảnh, tự đặt lại)
    next();
  });

  api.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  api.get('/config', (req, res) => res.json({ googleClientId: config.googleClientId || null }));
  // danh mục chất liệu / đá quý / kiểu dáng / mẫu gợi ý (ai cũng xem được – Studio cần cả khi chưa đăng nhập)
  api.get('/catalog', async (req, res, next) => {
    try {
      // không đổi thì trình duyệt dùng lại bản đã tải (hỏi lại máy chủ bằng ETag → 304, không tải lại cả danh mục)
      res.set('Cache-Control', 'no-cache');
      res.json(await getCatalog());
    } catch (e) {
      next(e);
    }
  });
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use(communityRouter); // trước designRouter: /designs/:id/like|remix|comments không bắt buộc là chủ thiết kế
  api.use('/designs', designRouter);
  api.use('/images', imageRouter);
  api.use('/admin', adminRouter); // chỉ quản trị viên (người khác: 404)
  api.use((req, res, next) => next(new HttpError(404, 'Không tìm thấy API')));
  app.use('/api', api);

  // bản demo (npm run demo): phục vụ luôn trang web đã build → web + API chung một địa chỉ http://localhost:PORT
  const dist = clientDist ?? path.resolve(import.meta.dirname, '../../client/dist');
  if ((serveClient ?? config.isProd) && fs.existsSync(path.join(dist, 'index.html'))) {
    // đọc lại khi bản build đổi (npm run build lúc bản demo đang chạy) – giữ bản cũ thì trang trỏ tới tệp JS đã bị xoá → trang trắng
    const indexFile = path.join(dist, 'index.html');
    let cached = { mtime: 0, html: '' };
    const indexHtml = () => {
      try {
        const { mtimeMs } = fs.statSync(indexFile);
        if (mtimeMs !== cached.mtime) cached = { mtime: mtimeMs, html: fs.readFileSync(indexFile, 'utf8') };
      } catch {
        // đang build dở (tệp chưa ghi xong) → dùng bản đang có
      }
      return cached.html;
    };
    // /assets/… có mã băm trong tên (Vite) → nội dung không bao giờ đổi → đệm 1 năm; file khác (favicon…) đệm 1 ngày
    app.use('/assets', express.static(path.join(dist, 'assets'), { index: false, maxAge: '1y', immutable: true }));
    app.use(
      express.static(dist, {
        index: false,
        maxAge: '1d',
        setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache'),
      }),
    );
    // /assets/… không tồn tại (tab mở từ bản build trước xin chunk cũ) → 404 thật, KHÔNG trả trang web với mã 200
    // (trình duyệt sẽ báo lỗi khó hiểu); trang web tự tải lại một lần khi gặp lỗi này – xem client/src/main.jsx
    app.use('/assets', (req, res) => res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Không tìm thấy tệp'));
    // trang thiết kế: chèn sẵn thẻ xem trước (Facebook / Zalo đọc HTML, không chạy JavaScript) – Facebook / Zalo không vào
    // được localhost nên hộp Chia sẻ hiện đúng thẻ này để xem trước (GET /api/public/designs/:id/share-card)
    app.get('/thiet-ke/:id', async (req, res, next) => {
      try {
        const meta = await shareMeta(req.params.id);
        res.set('Cache-Control', 'no-cache').type('html').send(meta ? injectMeta(indexHtml(), meta) : indexHtml());
      } catch (e) {
        next(e);
      }
    });
    app.get(/^(?!\/api\/).*/, (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml()));
  }

  // lỗi → JSON tiếng Việt; lỗi không lường trước: ghi log, không lộ chi tiết
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không đúng định dạng JSON' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    if (err.name === 'CastError') return res.status(404).json({ error: 'Không tìm thấy' });
    console.error('[NGK] Lỗi máy chủ:', err);
    res.status(500).json({ error: 'Máy chủ gặp lỗi – vui lòng thử lại sau' });
  });
  return app;
}

/**
 * MỞ CỔNG CHỈ CHO CHÍNH MÁY NÀY: 127.0.0.1 (IPv4) + ::1 (IPv6 – "localhost" trên Windows thường thử IPv6 trước; máy tắt
 * IPv6 thì bỏ qua). Không mở trên mọi địa chỉ ("::" – mặc định của Node): khi đó máy khác cùng Wi-Fi / mạng LAN cũng gọi
 * được API (kể cả lấy link đặt lại mật khẩu của hộp thư demo).
 * @returns {Promise<import('node:http').Server[]>}
 */
export async function listenLocal(app, port) {
  const open = (host) =>
    new Promise((resolve, reject) => {
      const server = http.createServer(app);
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(server);
      });
    });
  const servers = [await open('127.0.0.1')];
  try {
    servers.push(await open('::1'));
  } catch (e) {
    if (e.code !== 'EADDRNOTAVAIL' && e.code !== 'EAFNOSUPPORT') {
      servers[0].close();
      throw e;
    }
  }
  return servers;
}
