// LỚP BẢO VỆ: chống CSRF, lọc dữ liệu nguy hiểm, giới hạn số lần gọi, xác thực phiên đăng nhập.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './lib.js';
import { Session, User } from './models.js';

/**
 * CHỐNG CSRF (cookie được trình duyệt tự gửi kèm): mọi yêu cầu GHI phải
 *  1) có header X-NGK: 1 – trang web khác không gửi được header tự đặt nếu không qua CORS (mà ta không mở CORS);
 *  2) nếu trình duyệt gửi Origin thì Origin phải là trang web của mình.
 * Cookie còn đặt SameSite=Lax nên trang khác không gửi kèm cookie khi POST.
 */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.allowedOrigins.has(origin)) return next(new HttpError(403, 'Nguồn yêu cầu không được phép'));
  if (req.get('x-ngk') !== '1') return next(new HttpError(403, 'Thiếu header bảo vệ'));
  next();
}

/**
 * Lọc khoá nguy hiểm trong dữ liệu gửi lên: khoá bắt đầu bằng "$" (toán tử MongoDB) hoặc chứa "." / "__proto__"
 * → từ chối yêu cầu (chống chèn truy vấn NoSQL & ô nhiễm prototype).
 */
export function sanitizeBody(req, res, next) {
  const bad = (v, depth = 0) => {
    if (depth > 40) return true;
    if (Array.isArray(v)) return v.some((x) => bad(x, depth + 1));
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
        if (bad(v[k], depth + 1)) return true;
      }
    }
    return false;
  };
  if (bad(req.body)) return next(new HttpError(400, 'Dữ liệu chứa khoá không hợp lệ'));
  next();
}

// không có proxy (chạy trên máy): header X-Forwarded-For là do người gọi tự đặt, bị cố ý bỏ qua (app.js) → thư viện khỏi cảnh báo
const NO_PROXY = { xForwardedForHeader: false };

// GIỚI HẠN THEO IP: chạy trên máy nên mọi người dùng chung MỘT địa chỉ IP (127.0.0.1) → mức tính cho cả máy (gấp 10 mức
// cho một người dùng), để nhiều tài khoản thử trên cùng máy không chặn lẫn nhau. Dò mật khẩu vẫn bị chặn chặt theo cặp
// IP + email (loginFailLimiter); giới hạn theo tài khoản (perUserLimiter) giữ nguyên.
const limiter = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: NO_PROXY,
    handler: (req, res) => res.status(429).json({ error: message }),
  });
/** Đăng nhập / đăng ký / quên mật khẩu: 200 lần / 15 phút / địa chỉ IP. */
export const authLimiter = limiter(15 * 60 * 1000, 200, 'Thử quá nhiều lần – vui lòng đợi 15 phút rồi thử lại.');
/** Toàn bộ API: 6000 lần / phút / IP. */
export const apiLimiter = limiter(60 * 1000, 6000, 'Quá nhiều yêu cầu – vui lòng chậm lại.');

/** Thông báo chung khi bị chặn đăng nhập (giống hệt nhau dù email có tài khoản hay không). */
export const LOGIN_BLOCKED = 'Đăng nhập sai quá nhiều lần – vui lòng đợi 15 phút rồi thử lại, hoặc dùng “Quên mật khẩu” để đặt lại mật khẩu.';
const loginEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '');
/**
 * ĐĂNG NHẬP SAI: tối đa 5 lần / 15 phút cho MỖI CẶP (địa chỉ IP, email). Kẻ dò mật khẩu bị chặn, nhưng KHÔNG khoá được
 * tài khoản của người khác (chủ thật đăng nhập từ máy mình vẫn bình thường) – trước đây sai 5 lần là khoá cả tài khoản,
 * ai biết email cũng khoá được. Email có hay không có tài khoản đều bị chặn y hệt → không dò được email nào đã đăng ký.
 * Đăng nhập đúng không bị tính.
 */
export const loginFailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${loginEmail(req)}`,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: NO_PROXY,
  handler: (req, res) => res.status(429).json({ error: LOGIN_BLOCKED, code: 'TOO_MANY_ATTEMPTS' }),
});

/**
 * Giới hạn theo TÀI KHOẢN (đặt sau requireAuth). `name` tách bộ đếm giữa các nhóm thao tác.
 * @example perUserLimiter('comment', 60_000, 6, 'Bạn bình luận hơi nhanh…')
 */
export const perUserLimiter = (name, windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    keyGenerator: (req) => `${name}:${req.user._id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: NO_PROXY,
    handler: (req, res) => res.status(429).json({ error: message }),
  });

// ── PHIÊN ĐĂNG NHẬP ───────────────────────────────────────────────────────────────────────────────
export const ACCESS_COOKIE = 'ngk_at';
export const REFRESH_COOKIE = 'ngk_rt';
export const cookieBase = () => ({ httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/api' });

export const signAccess = (user, sessionId) =>
  jwt.sign({ sid: String(sessionId) }, config.jwtSecret, { subject: String(user._id), expiresIn: config.accessTtlSec, algorithm: 'HS256' });

/** Đọc người dùng từ mã truy cập (nếu có). Không bắt buộc đăng nhập. */
export async function loadUser(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    // phiên của mã này phải CÒN: đăng xuất / đổi mật khẩu / bị khoá đều thu hồi phiên → mã truy cập cũ hết hiệu lực NGAY
    // (không đợi 15 phút, và không "sống lại" khi tài khoản được mở khoá)
    const [user, live] = await Promise.all([User.findById(payload.sub), Session.exists({ _id: payload.sid, user: payload.sub })]);
    if (user && live && !user.lockedAt) {
      req.user = user;
      req.sessionId = payload.sid;
    }
  } catch (e) {
    if (e.name === 'TokenExpiredError') req.tokenExpired = true;
  }
  next();
}

/** Bắt buộc đăng nhập. Mã truy cập hết hạn → 401 TOKEN_EXPIRED (trình duyệt tự gia hạn rồi gửi lại). */
export function requireAuth(req, res, next) {
  if (req.user) return next();
  next(new HttpError(401, 'Vui lòng đăng nhập', req.tokenExpired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED'));
}

/**
 * Chỉ quản trị viên (vai trò đọc từ cơ sở dữ liệu ở MỖI yêu cầu → thu quyền có hiệu lực ngay).
 * Người thường → 404 như API không tồn tại (không lộ là có khu quản trị). Đặt sau requireAuth.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  next(new HttpError(404, 'Không tìm thấy API'));
}
