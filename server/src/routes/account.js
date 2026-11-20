// API TÀI KHOẢN: /api/account/* (bắt buộc đăng nhập) + phục vụ ảnh /api/images/:id
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { AUTHOR_FIELDS, HttpError, authorInfo, bad, maskEmail, publicUser, readEmail, readHandle, readImage, readMultiline, readObjectId, readPassword, readText } from '../lib.js';
import { AccessRequest, Design, Image, Notification, Session, User } from '../models.js';
import { GRANT_MS, accessStatus } from '../access.js';
import { notify } from '../notify.js';
import { authLimiter, requireAuth } from '../security.js';
import { issueToken, revokeAll } from '../sessions.js';
import { sendEmailChange, sendSecurityNotice } from '../mail.js';
import { BCRYPT_COST, googleIdentity, mailFailed } from './auth.js';

export const accountRouter = Router();
accountRouter.use(requireAuth);

/** Tài khoản chỉ đăng nhập bằng Google: thao tác nhạy cảm cần phiên vừa đăng nhập trong khoảng này. */
export const REAUTH_MS = 10 * 60 * 1000;

/**
 * THAO TÁC NHẠY CẢM (đổi mật khẩu / email, gắn / gỡ Google): xác nhận lại đúng chủ tài khoản.
 *  - có mật khẩu → phải nhập đúng mật khẩu hiện tại;
 *  - chỉ đăng nhập Google (chưa có mật khẩu) → phiên phải vừa đăng nhập trong 10 phút. Trước đây không cần gì: ai lấy được
 *    phiên đăng nhập cũ (máy dùng chung quên đăng xuất…) đặt được mật khẩu / đổi email → chiếm hẳn tài khoản.
 */
async function confirmOwner(req, password) {
  const user = req.user;
  if (user.passwordHash) {
    if (typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 200), user.passwordHash))) {
      throw new HttpError(403, 'Mật khẩu hiện tại không đúng', 'BAD_PASSWORD');
    }
    return;
  }
  const session = await Session.findById(req.sessionId, { createdAt: 1 });
  if (!session || Date.now() - session.createdAt.getTime() > REAUTH_MS) {
    throw new HttpError(403, 'Vì an toàn, hãy đăng xuất rồi đăng nhập lại bằng Google, sau đó làm lại thao tác này trong vòng 10 phút.', 'REAUTH_REQUIRED');
  }
}

/** Hồ sơ: tên hiển thị, tên riêng (/@ten-rieng – không trùng), giới thiệu. Gửi trường nào đổi trường đó. */
accountRouter.patch('/profile', async (req, res) => {
  const b = req.body ?? {};
  if (b.displayName !== undefined) req.user.displayName = readText(b.displayName, { max: 50, min: 2, label: 'Tên hiển thị' });
  if (b.bio !== undefined) req.user.bio = b.bio === null ? '' : readMultiline(b.bio, { max: 300, label: 'Giới thiệu' });
  if (b.handle !== undefined) {
    const handle = readHandle(b.handle);
    if (handle !== req.user.handle && (await User.exists({ handle, _id: { $ne: req.user._id } }))) {
      throw new HttpError(409, 'Tên riêng này đã có người dùng – hãy chọn tên khác.');
    }
    req.user.handle = handle;
  }
  try {
    await req.user.save();
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'Tên riêng này đã có người dùng – hãy chọn tên khác.');
    throw e;
  }
  res.json({ user: publicUser(req.user) });
});

/** Kiểm tra nhanh tên riêng còn trống không (gõ tới đâu báo tới đó). */
accountRouter.get('/handle-available', async (req, res) => {
  let handle;
  try {
    handle = readHandle(String(req.query.handle ?? ''));
  } catch (e) {
    return res.json({ available: false, reason: e.message });
  }
  const taken = handle !== req.user.handle && (await User.exists({ handle }));
  res.json({ available: !taken, handle, reason: taken ? 'Tên riêng này đã có người dùng' : null });
});

accountRouter.put('/avatar', async (req, res) => {
  const { mime, data } = readImage(req.body?.image, 200 * 1024);
  const img = await Image.create({ owner: req.user._id, kind: 'avatar', mime, data, size: data.length });
  const old = req.user.avatarImage;
  req.user.avatarImage = img._id;
  await req.user.save();
  if (old) await Image.deleteOne({ _id: old, owner: req.user._id });
  res.json({ user: publicUser(req.user) });
});

accountRouter.delete('/avatar', async (req, res) => {
  const old = req.user.avatarImage;
  req.user.avatarImage = null;
  await req.user.save();
  if (old) await Image.deleteOne({ _id: old, owner: req.user._id });
  res.json({ user: publicUser(req.user) });
});

/** Đổi mật khẩu (có mật khẩu → cần mật khẩu cũ) hoặc đặt mật khẩu cho tài khoản Google. */
accountRouter.post('/password', authLimiter, async (req, res) => {
  const hadPassword = !!req.user.passwordHash;
  await confirmOwner(req, req.body?.current);
  const next = readPassword(req.body?.next);
  req.user.passwordHash = await bcrypt.hash(next, BCRYPT_COST);
  await req.user.save();
  await revokeAll(req.user._id, req.sessionId); // đăng xuất các thiết bị khác, giữ phiên hiện tại
  sendSecurityNotice(
    req.user.email,
    req.user.displayName,
    hadPassword ? 'Mật khẩu đã được đổi' : 'Đã đặt mật khẩu',
    hadPassword ? 'mật khẩu tài khoản NGK của bạn vừa được đổi; các thiết bị khác đã bị đăng xuất.' : 'tài khoản NGK của bạn vừa được đặt mật khẩu – từ nay đăng nhập được bằng email + mật khẩu.',
  );
  res.json({ user: publicUser(req.user) });
});

/** Đổi email: gửi link xác nhận tới email MỚI; email cũ giữ nguyên cho tới khi xác nhận. */
accountRouter.post('/email', authLimiter, async (req, res) => {
  await confirmOwner(req, req.body?.password);
  const email = readEmail(req.body?.email);
  if (email === req.user.email) throw bad('Đây đã là email hiện tại của bạn');
  if (await User.exists({ email })) throw new HttpError(409, 'Email này đã được tài khoản khác dùng');
  const token = await issueToken(req.user._id, 'email-change', config.verifyTtlSec, email);
  const mail = await sendEmailChange(email, req.user.displayName, token).catch((e) => {
    throw mailFailed(e);
  });
  res.json({ ok: true, pendingEmail: email, devLink: mail.devLink });
});

/** Gắn Google: cần mật khẩu hiện tại (kẻ giữ được phiên đăng nhập không gắn được Google CỦA HỌ để vào lại mãi). */
accountRouter.post('/google', authLimiter, async (req, res) => {
  await confirmOwner(req, req.body?.password);
  const g = await googleIdentity(req.body?.credential);
  // đã gắn một tài khoản Google → không cho THAY bằng tài khoản khác (tài khoản chỉ dùng Google sẽ mất quyền đăng nhập)
  if (req.user.googleId && req.user.googleId !== g.googleId) {
    throw new HttpError(409, 'Tài khoản đã gắn với một tài khoản Google khác – hãy gỡ liên kết cũ trước.', 'GOOGLE_ALREADY_LINKED');
  }
  const other = await User.findOne({ googleId: g.googleId });
  if (other && !other._id.equals(req.user._id)) throw new HttpError(409, 'Tài khoản Google này đã gắn với một tài khoản NGK khác');
  req.user.googleId = g.googleId;
  req.user.googlePicture ??= g.picture;
  await req.user.save();
  sendSecurityNotice(req.user.email, req.user.displayName, 'Đã liên kết Google', `tài khoản NGK của bạn vừa được liên kết với tài khoản Google ${maskEmail(g.email)} – từ nay đăng nhập được bằng Google.`);
  res.json({ user: publicUser(req.user) });
});

accountRouter.delete('/google', authLimiter, async (req, res) => {
  if (!req.user.passwordHash) throw bad('Hãy đặt mật khẩu trước khi gỡ Google – nếu không bạn sẽ không đăng nhập lại được.');
  await confirmOwner(req, req.body?.password);
  req.user.googleId = undefined;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});

// ── ẢNH ───────────────────────────────────────────────────────────────────────────────────────────
export const imageRouter = Router();
imageRouter.get('/:id', async (req, res) => {
  const img = await Image.findById(readObjectId(req.params.id));
  if (!img) throw new HttpError(404, 'Không tìm thấy ảnh');
  // ảnh hồ sơ: công khai. Ảnh thiết kế: chủ thiết kế, hoặc thiết kế đang Công khai / Có liên kết (GĐ3) mà không bị quản trị
  // viên ẩn và chủ không bị khoá – cùng điều kiện với trang thiết kế (quản trị viên vẫn xem được để xét duyệt)
  if (img.kind === 'thumb') {
    const mine = req.user && img.owner.equals(req.user._id);
    const visible = { visibility: { $in: ['public', 'unlisted'] }, ...(req.user?.role === 'admin' ? {} : { modHidden: null, ownerLocked: { $ne: true } }) };
    const shared = !mine && img.design && (await Design.exists({ _id: img.design, ...visible }));
    if (!mine && !shared) throw new HttpError(404, 'Không tìm thấy ảnh');
  }
  res.set({
    'Content-Type': img.mime,
    'Cache-Control': img.kind === 'avatar' ? 'public, max-age=86400, immutable' : 'private, max-age=86400, immutable', // ảnh không bao giờ sửa (đổi ảnh = id mới)
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(img.data);
});

// ── QUYỀN XEM CỦA QUẢN TRỊ VIÊN với thiết kế riêng tư của tôi: xem yêu cầu, đồng ý / từ chối / thu hồi ─────
accountRouter.get('/access-requests', async (req, res) => {
  const list = await AccessRequest.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  const [admins, designs] = await Promise.all([
    User.find({ _id: { $in: list.map((r) => r.admin) } }, AUTHOR_FIELDS).lean(),
    Design.find({ _id: { $in: list.map((r) => r.design) } }, { name: 1, thumbnail: 1, type: 1, savedType: 1, visibility: 1 }).lean(),
  ]);
  const amap = new Map(admins.map((u) => [String(u._id), u]));
  const dmap = new Map(designs.map((d) => [String(d._id), d]));
  res.json({
    items: list
      .filter((r) => dmap.has(String(r.design)))
      .map((r) => {
        const d = dmap.get(String(r.design));
        return {
          id: String(r._id),
          status: accessStatus(r),
          reason: r.reason,
          createdAt: r.createdAt,
          respondedAt: r.respondedAt,
          expiresAt: r.expiresAt,
          admin: authorInfo(amap.get(String(r.admin))),
          design: { id: String(d._id), name: d.name, thumbnailUrl: d.thumbnail ? `/api/images/${d.thumbnail}` : null, type: d.savedType ?? d.type, visibility: d.visibility },
        };
      }),
  });
});

const ACCESS_ACTIONS = { approve: 'approved', decline: 'declined', revoke: 'revoked' };
accountRouter.post('/access-requests/:id/:action', async (req, res) => {
  const next = Object.hasOwn(ACCESS_ACTIONS, req.params.action) ? ACCESS_ACTIONS[req.params.action] : null;
  if (!next) throw new HttpError(404, 'Không tìm thấy API');
  const r = await AccessRequest.findOne({ _id: readObjectId(req.params.id), owner: req.user._id });
  if (!r) throw new HttpError(404, 'Không tìm thấy yêu cầu');
  const status = accessStatus(r);
  if (next === 'revoked' ? status !== 'approved' : status !== 'pending') {
    throw new HttpError(409, next === 'revoked' ? 'Quyền xem này không còn hiệu lực.' : 'Yêu cầu này đã được trả lời rồi.');
  }
  r.status = next;
  r.respondedAt = new Date();
  if (next === 'approved') r.expiresAt = new Date(Date.now() + GRANT_MS);
  if (next === 'revoked') r.expiresAt = new Date(); // hết hiệu lực ngay
  await r.save();
  await notify({ to: r.admin, actor: req.user._id, type: 'access-result', kind: next, design: r.design, request: r._id });
  // thông báo "xin xem" của chủ coi như đã đọc
  await Notification.updateMany({ user: req.user._id, request: r._id }, { read: true }, { timestamps: false });
  res.json({ request: { id: String(r._id), status: accessStatus(r), expiresAt: r.expiresAt } });
});
