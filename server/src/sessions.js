// PHIÊN ĐĂNG NHẬP: tạo / gia hạn (xoay vòng mã) / thu hồi; mã một lần (xác minh, đặt lại mật khẩu).
import { config } from './config.js';
import { HttpError, lockedError, randomToken, sha256 } from './lib.js';
import { OneTimeToken, Session, User } from './models.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieBase, signAccess } from './security.js';

const ROTATE_GRACE_MS = 30 * 1000; // 2 tab gia hạn cùng lúc bằng mã cũ trong 30 giây → không coi là bị đánh cắp

function setCookies(res, user, session, refreshToken) {
  res.cookie(ACCESS_COOKIE, signAccess(user, session._id), { ...cookieBase(), maxAge: config.accessTtlSec * 1000 });
  if (refreshToken) res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieBase(), path: '/api/auth', maxAge: config.refreshTtlSec * 1000 });
}

export function clearCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieBase());
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: '/api/auth' });
}

/** Đăng nhập thành công → tạo phiên mới + đặt cookie. */
export async function startSession(req, res, user) {
  // chốt chặn cuối cho MỌI cách đăng nhập (mật khẩu, Google, đặt lại mật khẩu…): tài khoản mẫu chỉ để minh hoạ
  if (user.demo) throw new HttpError(403, 'Đây là tài khoản mẫu (dữ liệu minh hoạ) – không đăng nhập được.', 'DEMO_ACCOUNT');
  if (user.lockedAt) throw lockedError(user);
  const token = randomToken(48);
  const session = await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + config.refreshTtlSec * 1000),
    userAgent: String(req.get('user-agent') ?? '').slice(0, 300),
  });
  setCookies(res, user, session, token);
  const now = new Date();
  await User.updateOne({ _id: user._id }, { lastLoginAt: now, lastSeenAt: now }, { timestamps: false });
  return session;
}

/**
 * Gia hạn: mã gia hạn hợp lệ → cấp mã truy cập mới + mã gia hạn MỚI (mã cũ hết dùng được).
 * Mã CŨ bị dùng lại sau thời gian ân hạn → có thể đã bị đánh cắp → thu hồi mọi phiên của tài khoản.
 * @returns userId hoặc null
 */
export async function refreshSession(req, res, loadUser) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token || typeof token !== 'string') return null;
  const hash = sha256(token);
  let session = await Session.findOne({ tokenHash: hash });
  if (session) {
    if (session.expiresAt < new Date()) return null;
    const next = randomToken(48);
    session = await Session.findOneAndUpdate(
      { _id: session._id, tokenHash: hash }, // điều kiện → 2 yêu cầu song song chỉ 1 cái xoay được
      { tokenHash: sha256(next), prevHash: hash, rotatedAt: new Date() },
      { returnDocument: 'after' },
    );
    if (!session) return refreshSession(req, res, loadUser); // bị yêu cầu khác xoay trước → xử lý như mã cũ
    const user = await loadUser(session.user);
    if (!user) return null;
    setCookies(res, user, session, next);
    return user;
  }
  const old = await Session.findOne({ prevHash: hash });
  if (!old) return null;
  if (old.rotatedAt && Date.now() - old.rotatedAt.getTime() < ROTATE_GRACE_MS) {
    // tab khác vừa gia hạn (cookie mới đã được đặt cho trình duyệt) → chỉ cấp mã truy cập
    const user = await loadUser(old.user);
    if (!user) return null;
    setCookies(res, user, old, null);
    return user;
  }
  // dấu hiệu mã gia hạn bị đánh cắp → ghi log để còn lần ra (không ghi mã, chỉ id tài khoản)
  console.warn(`[NGK][bảo mật] Mã gia hạn cũ bị dùng lại – thu hồi mọi phiên của tài khoản ${old.user}`);
  await Session.deleteMany({ user: old.user });
  return null;
}

export const revokeSession = (sessionId) => sessionId && Session.deleteOne({ _id: sessionId });
/**
 * Đăng xuất bằng MÃ GIA HẠN: sau 15 phút không thao tác, trình duyệt đã tự xoá mã truy cập (không còn biết id phiên),
 * nhưng mã gia hạn vẫn được gửi tới /api/auth → tìm phiên theo bản băm (mã hiện tại hoặc mã ngay trước) và thu hồi.
 */
export function revokeByRefreshToken(token) {
  if (typeof token !== 'string' || !token || token.length > 200) return null;
  const hash = sha256(token);
  return Session.deleteOne({ $or: [{ tokenHash: hash }, { prevHash: hash }] });
}
/** Thu hồi mọi phiên (trừ `keepId` – phiên hiện tại) – sau đổi / đặt lại mật khẩu. */
export const revokeAll = (userId, keepId = null) => Session.deleteMany({ user: userId, ...(keepId ? { _id: { $ne: keepId } } : {}) });

/** Tạo mã một lần (mỗi người / mỗi loại chỉ giữ mã mới nhất). @returns mã gốc (để gửi qua email) */
export async function issueToken(userId, kind, ttlSec, data = null) {
  await OneTimeToken.deleteMany({ user: userId, kind });
  const token = randomToken(32);
  await OneTimeToken.create({ user: userId, kind, hash: sha256(token), data, expiresAt: new Date(Date.now() + ttlSec * 1000) });
  return token;
}

/** Dùng mã một lần: đúng loại, còn hạn → xoá luôn (không dùng lại được). @returns bản ghi mã hoặc null */
export async function consumeToken(token, kinds) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const doc = await OneTimeToken.findOneAndDelete({ hash: sha256(token), kind: { $in: kinds } });
  if (!doc || doc.expiresAt < new Date()) return null;
  return doc;
}
