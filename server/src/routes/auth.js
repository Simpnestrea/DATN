// API ĐĂNG NHẬP: /api/auth/*
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { config, mailConfigured } from '../config.js';
import { HttpError, bad, lockedError, maskEmail, publicUser, readEmail, readPassword, readText } from '../lib.js';
import { User } from '../models.js';
import { LOGIN_BLOCKED, REFRESH_COOKIE, authLimiter, loginFailLimiter, requireAuth } from '../security.js';
import { clearCookies, consumeToken, issueToken, refreshSession, revokeAll, revokeByRefreshToken, revokeSession, startSession } from '../sessions.js';
import { sendResetEmail, sendSecurityNotice, sendVerifyEmail } from '../mail.js';

export const BCRYPT_COST = 12;
// chốt chặn THỨ HAI cho dò mật khẩu từ nhiều địa chỉ IP cùng lúc (chốt thứ nhất: loginFailLimiter – 5 lần / IP / email)
const MAX_FAILS = 20;
const LOCK_MS = 15 * 60 * 1000;
// so sánh với mật khẩu giả khi email không tồn tại → thời gian phản hồi như nhau (không dò được email nào có tài khoản).
// CÙNG cost với mật khẩu thật (cost thấp hơn → nhanh hơn ~4 lần → đo thời gian là biết). Tính ở nền, không chặn lúc khởi động.
const DUMMY_HASH = bcrypt.hash('khong-phai-mat-khau-that-1', BCRYPT_COST);
/** Kiểm thử: mật khẩu giả dùng đúng cost. */
export const _dummyHash = () => DUMMY_HASH;

// ── Google ────────────────────────────────────────────────────────────────────────────────────────
let googleClient = null;
let verifyGoogle = async (credential) => {
  if (!config.googleClientId) throw new HttpError(503, 'Chưa bật đăng nhập Google trên máy chủ');
  googleClient ??= new OAuth2Client(config.googleClientId);
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  return ticket.getPayload();
};
/** Kiểm thử: thay hàm xác thực Google. */
export const _setGoogleVerifier = (fn) => {
  verifyGoogle = fn;
};

export async function googleIdentity(credential) {
  if (typeof credential !== 'string' || credential.length > 4096) throw bad('Thiếu thông tin đăng nhập Google');
  let p;
  try {
    p = await verifyGoogle(credential);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'Không xác thực được tài khoản Google');
  }
  if (!p?.sub || !p.email || p.email_verified !== true) throw new HttpError(401, 'Tài khoản Google chưa xác minh email');
  return { googleId: String(p.sub), email: p.email.toLowerCase(), name: p.name || p.email.split('@')[0], picture: p.picture || null };
}

const sendVerify = async (user) => sendVerifyEmail(user.email, user.displayName, await issueToken(user._id, 'verify', config.verifyTtlSec));
/** Lỗi gửi thư do người dùng tự bấm (gửi lại, đổi email) → báo rõ thay vì "máy chủ gặp lỗi". */
export const mailFailed = (e) => {
  console.error('[NGK] Gửi email thất bại:', e.message);
  return new HttpError(502, 'Không gửi được email lúc này – vui lòng thử lại sau ít phút.', 'MAIL_FAILED');
};

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  // khách → user: null (không báo lỗi, trang web biết là chưa đăng nhập); mã hết hạn → báo để trình duyệt gia hạn
  if (!req.user && req.tokenExpired) throw new HttpError(401, 'Phiên hết hạn', 'TOKEN_EXPIRED');
  res.json({ user: req.user ? publicUser(req.user) : null });
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const email = readEmail(req.body?.email);
  const password = readPassword(req.body?.password);
  const displayName = readText(req.body?.displayName ?? '', { max: 50, min: 2, label: 'Tên hiển thị' });
  if (await User.exists({ email })) throw new HttpError(409, 'Email này đã có tài khoản – hãy đăng nhập hoặc dùng “Quên mật khẩu”.');
  let user;
  try {
    user = await User.create({ email, displayName, passwordHash: await bcrypt.hash(password, BCRYPT_COST) });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'Email này đã có tài khoản – hãy đăng nhập hoặc dùng “Quên mật khẩu”.');
    throw e;
  }
  await startSession(req, res, user);
  // tài khoản đã tạo + đã đăng nhập: gửi thư lỗi thì vẫn trả thành công (bấm "Gửi lại email xác minh" ở trang Tài khoản)
  // – trước đây trả lỗi 500 dù tài khoản đã có, bấm đăng ký lại thì báo "email đã có tài khoản"
  const mail = await sendVerify(user).catch((e) => {
    console.error(`[NGK] Không gửi được thư xác minh tới ${maskEmail(user.email)}: ${e.message}`);
    return { failed: true };
  });
  res.status(201).json({ user: publicUser(user), devLink: mail.devLink, mailFailed: mail.failed === true });
});

authRouter.post('/login', authLimiter, loginFailLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
  const user = email ? await User.findOne({ email }) : null;
  if (user?.lockUntil && user.lockUntil > new Date()) throw new HttpError(429, LOGIN_BLOCKED, 'TOO_MANY_ATTEMPTS');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !user.passwordHash || !ok) {
    if (user) {
      const fails = user.failedLogins + 1;
      if (fails >= MAX_FAILS) console.warn(`[NGK][bảo mật] ${MAX_FAILS} lần đăng nhập sai → khoá tạm 15 phút: ${maskEmail(user.email)}`);
      await User.updateOne({ _id: user._id }, fails >= MAX_FAILS ? { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails });
    }
    const googleOnly = user && !user.passwordHash && user.googleId;
    throw new HttpError(401, googleOnly ? 'Tài khoản này đăng nhập bằng Google – bấm “Tiếp tục với Google”.' : 'Email hoặc mật khẩu không đúng');
  }
  if (user.failedLogins || user.lockUntil) await User.updateOne({ _id: user._id }, { failedLogins: 0, lockUntil: null });
  await startSession(req, res, user);
  res.json({ user: publicUser(user) });
});

authRouter.post('/google', authLimiter, async (req, res) => {
  const g = await googleIdentity(req.body?.credential);
  let user = await User.findOne({ googleId: g.googleId });
  if (!user) {
    user = await User.findOne({ email: g.email });
    if (user) {
      if (!user.emailVerified) {
        // CHỐNG CHIẾM TÀI KHOẢN TRƯỚC: ai đó đăng ký sẵn bằng email này nhưng chưa từng xác minh → chủ thật của email
        // (Google đã xác minh) giành lại tài khoản: huỷ mật khẩu cũ + mọi phiên của người kia.
        user.passwordHash = null;
        await revokeAll(user._id);
      }
      user.googleId = g.googleId;
      user.emailVerified = true;
      user.googlePicture ??= g.picture;
      await user.save();
    } else {
      user = await User.create({ email: g.email, emailVerified: true, googleId: g.googleId, displayName: g.name.slice(0, 50), googlePicture: g.picture });
    }
  }
  await startSession(req, res, user);
  res.json({ user: publicUser(user) });
});

authRouter.post('/refresh', async (req, res) => {
  // tài khoản bị khoá giữa chừng → không gia hạn (phiên coi như đã hết)
  const user = await refreshSession(req, res, async (id) => {
    const u = await User.findById(id);
    return u && !u.lockedAt ? u : null;
  });
  if (!user) {
    clearCookies(res);
    throw new HttpError(401, 'Phiên đăng nhập đã hết – vui lòng đăng nhập lại', 'SESSION_ENDED');
  }
  await User.updateOne({ _id: user._id }, { lastSeenAt: new Date() }, { timestamps: false });
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  // thu hồi theo id phiên trong mã truy cập (còn hạn) VÀ theo mã gia hạn (mã truy cập đã hết hạn / bị trình duyệt xoá)
  await Promise.all([revokeSession(req.sessionId), revokeByRefreshToken(req.cookies?.[REFRESH_COOKIE])]);
  clearCookies(res);
  res.json({ ok: true });
});

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const t = await consumeToken(req.body?.token, ['verify', 'email-change']);
  if (!t) throw bad('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 'BAD_TOKEN');
  const user = await User.findById(t.user);
  if (!user) throw bad('Tài khoản không còn tồn tại', 'BAD_TOKEN');
  const oldEmail = user.email;
  if (t.kind === 'email-change') {
    if (await User.exists({ email: t.data, _id: { $ne: user._id } })) throw new HttpError(409, 'Email này đã được tài khoản khác dùng');
    user.email = t.data;
  }
  user.emailVerified = true;
  await user.save();
  // báo về địa chỉ CŨ: kẻ chiếm được phiên đăng nhập mà đổi email thì chủ thật vẫn biết ngay
  if (t.kind === 'email-change') sendSecurityNotice(oldEmail, user.displayName, 'Email đăng nhập đã đổi', `email đăng nhập tài khoản NGK của bạn vừa được đổi thành ${maskEmail(user.email)}.`);
  res.json({ user: publicUser(user), changedEmail: t.kind === 'email-change' });
});

authRouter.post('/resend-verification', authLimiter, requireAuth, async (req, res) => {
  if (req.user.emailVerified) return res.json({ ok: true, already: true });
  const mail = await sendVerify(req.user).catch((e) => {
    throw mailFailed(e);
  });
  res.json({ ok: true, devLink: mail.devLink });
});

authRouter.post('/forgot', authLimiter, async (req, res) => {
  const email = readEmail(req.body?.email);
  const user = await User.findOne({ email });
  let devLink;
  // tài khoản mẫu / bị khoá: coi như không có (không cấp mã đặt lại → không vòng qua được lệnh khoá)
  if (user && !user.demo && !user.lockedAt) {
    const sending = issueToken(user._id, 'reset', config.resetTtlSec).then((token) => sendResetEmail(user.email, user.displayName, token));
    // gửi Gmail thật: KHÔNG đợi gửi thư (vài trăm ms) → thời gian trả lời như nhau dù email có tài khoản hay không;
    // hộp thư demo (chưa cấu hình Gmail): đợi để trả link về cho trang web hiển thị
    if (config.isTest || !mailConfigured()) devLink = (await sending).devLink;
    else sending.catch((e) => console.error(`[NGK] Không gửi được thư đặt lại mật khẩu tới ${maskEmail(user.email)}: ${e.message}`));
  }
  // luôn trả lời giống nhau – không lộ email nào có tài khoản
  res.json({ ok: true, devLink });
});

authRouter.post('/reset', authLimiter, async (req, res) => {
  const password = readPassword(req.body?.password);
  const t = await consumeToken(req.body?.token, ['reset']);
  if (!t) throw bad('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'BAD_TOKEN');
  const user = await User.findById(t.user);
  if (!user) throw bad('Tài khoản không còn tồn tại', 'BAD_TOKEN');
  if (user.demo) throw bad('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'BAD_TOKEN');
  if (user.lockedAt) throw lockedError(user);
  user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  user.emailVerified = true; // đã chứng minh sở hữu email (mở được thư)
  user.failedLogins = 0;
  user.lockUntil = null;
  await user.save();
  await revokeAll(user._id); // đăng xuất mọi nơi (kẻ đang giữ phiên cũ bị đá ra)
  await startSession(req, res, user);
  sendSecurityNotice(user.email, user.displayName, 'Mật khẩu đã được đặt lại', 'mật khẩu tài khoản NGK của bạn vừa được đặt lại bằng liên kết “Quên mật khẩu”; các thiết bị khác đã bị đăng xuất.');
  res.json({ user: publicUser(user) });
});

