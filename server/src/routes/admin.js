// API QUẢN TRỊ (GĐ4) – chỉ tài khoản có vai trò admin. Người thường gọi → 404 (không lộ là có API này).
// Mọi thao tác thay đổi dữ liệu đều ghi NHẬT KÝ QUẢN TRỊ TRƯỚC khi làm: không bao giờ có thao tác không để lại dấu vết.
// Quyền riêng tư: thiết kế RIÊNG TƯ chỉ hiện loại + ngày tạo; xem nội dung phải được chủ thiết kế đồng ý (7 ngày, chỉ đọc).
import { Router } from 'express';
import { JEWELRY_TYPES, TYPE_CODES } from '@ngk/shared';
import { AUTHOR_FIELDS, HttpError, authorInfo, bad, escapeRegex, excerpt, fold, readObjectId, readPage, readText } from '../lib.js';
import { AccessRequest, AdminLog, Comment, Design, Like, OneTimeToken, Report, Session, User } from '../models.js';
import { perUserLimiter, requireAdmin, requireAuth } from '../security.js';
import { revokeAll } from '../sessions.js';
import { logAdmin, userLabel } from '../adminLog.js';
import { deleteUserCascade } from '../userCascade.js';
import { notify } from '../notify.js';
import { accessStatus, activeGrant, latestRequests } from '../access.js';
import { thumbUrl } from './designs.js';
import { adminCatalogRouter } from './adminCatalog.js';
import { adminStatsRouter } from './adminStats.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);
adminRouter.use('/catalog', adminCatalogRouter); // danh mục kim loại / đá quý (4c)
adminRouter.use('/stats', adminStatsRouter); // trang Tổng quan (4c)

const writeLimiter = perUserLimiter('admin', 60 * 1000, 60, 'Thao tác quá nhanh – vui lòng chậm lại.');
const pageOf = (q) => readPage(q, 1000);
const pick = (obj, key) => (typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined);
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? 'Trang sức';

// ── nhãn trong nhật ký (lưu sẵn – đối tượng bị xoá / đổi tên vẫn đọc được). Thiết kế riêng tư: KHÔNG ghi tên ──
const designLabel = (d, owner) =>
  d.visibility === 'private'
    ? `Thiết kế riêng tư (${typeName(d.savedType ?? d.type)}) – ${owner ? userLabel(owner) : 'tài khoản đã xoá'}`
    : `“${d.name}” – ${owner ? userLabel(owner) : 'tài khoản đã xoá'}`;
const commentLabel = (author, d) =>
  `Bình luận của ${author ? userLabel(author) : 'tài khoản đã xoá'} ở ${!d ? 'một thiết kế đã xoá' : d.visibility === 'private' ? 'một thiết kế riêng tư' : `“${d.name}”`}`;

/** Thông tin rút gọn một tài khoản (cho bảng quản trị – không có email, không có mật khẩu). */
const userBrief = (u) => (u ? { ...authorInfo(u), locked: !!u.lockedAt, role: u.role } : authorInfo(null));
const BRIEF_FIELDS = { ...AUTHOR_FIELDS, lockedAt: 1, role: 1 };
async function usersMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const users = uniq.length ? await User.find({ _id: { $in: uniq } }, BRIEF_FIELDS).lean() : [];
  return new Map(users.map((u) => [String(u._id), u]));
}

/** Một thiết kế trong bảng quản trị. RIÊNG TƯ (vd. chủ chuyển về riêng tư sau khi bị báo cáo): không tên, không ảnh. */
function designBrief(d, users, openReports = 0) {
  const owner = userBrief(users.get(String(d.owner)));
  const base = { id: String(d._id), type: d.savedType ?? d.type, visibility: d.visibility, owner, hidden: d.modHidden ? { at: d.modHidden.at, reason: d.modHidden.reason ?? '' } : null, openReports };
  if (d.visibility === 'private') return { ...base, masked: true };
  return {
    ...base,
    name: d.name,
    thumbnailUrl: thumbUrl(d.thumbnail),
    likeCount: d.likeCount ?? 0,
    commentCount: d.commentCount ?? 0,
    publishedAt: d.publishedAt ?? null,
    createdAt: d.createdAt,
    ownerLocked: !!d.ownerLocked,
    featured: !!d.featuredAt,
    saved: d.lastVersion > 0,
  };
}
const DESIGN_BRIEF_FIELDS = { config: 0 };

/** Đóng mọi báo cáo đang chờ về một nội dung. @returns số báo cáo đã đóng */
async function closeReports(req, targetType, target, resolution) {
  const r = await Report.updateMany(
    { targetType, target, status: 'open' },
    { status: resolution === 'dismiss' ? 'dismissed' : 'resolved', resolution, handledBy: req.user._id, handledAt: new Date() },
  );
  return r.modifiedCount;
}
/** Số báo cáo đang chờ cho từng nội dung. @returns Map id → số */
async function openReportCounts(targetType, ids) {
  if (!ids.length) return new Map();
  const rows = await Report.aggregate([{ $match: { targetType, status: 'open', target: { $in: ids } } }, { $group: { _id: '$target', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

// ═══ TỔNG HỢP (số trên thanh bên) ═══════════════════════════════════════════════════════════════════
adminRouter.get('/summary', async (req, res) => {
  const [users, admins, locked, demo, unverified, openReports, targets] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ lockedAt: { $ne: null } }),
    User.countDocuments({ demo: true }),
    User.countDocuments({ emailVerified: false }),
    Report.countDocuments({ status: 'open' }),
    Report.aggregate([{ $match: { status: 'open' } }, { $group: { _id: { t: '$targetType', id: '$target' } } }, { $count: 'n' }]),
  ]);
  res.json({ users, admins, locked, demo, unverified, openReports, openTargets: targets[0]?.n ?? 0 });
});

// ═══ NGƯỜI DÙNG ═════════════════════════════════════════════════════════════════════════════════════
const USER_FILTERS = {
  admin: { role: 'admin' },
  locked: { lockedAt: { $ne: null } },
  demo: { demo: true },
  unverified: { emailVerified: false },
};
const USER_SORTS = {
  new: { createdAt: -1, _id: -1 },
  old: { createdAt: 1, _id: 1 },
  name: { nameNorm: 1, _id: 1 },
  active: { lastSeenAt: -1, createdAt: -1, _id: -1 }, // chưa từng hoạt động (null) xếp cuối
  designs: { designCount: -1, createdAt: -1, _id: -1 },
};
const USERS_PER_PAGE = 25;
// đếm thiết kế của từng người (tổng + công khai)
const DESIGN_COUNTS = [
  { $lookup: { from: 'designs', localField: '_id', foreignField: 'owner', as: 'ds', pipeline: [{ $project: { visibility: 1 } }] } },
  {
    $addFields: {
      designCount: { $size: '$ds' },
      publicCount: { $size: { $filter: { input: '$ds', cond: { $eq: ['$$this.visibility', 'public'] } } } },
    },
  },
  { $project: { ds: 0 } },
];

/** Một dòng trong bảng người dùng (không bao giờ có mật khẩu băm). */
function userRow(u) {
  return {
    id: String(u._id),
    displayName: u.displayName,
    email: u.email,
    handle: u.handle ?? null,
    avatarUrl: authorInfo(u).avatarUrl,
    role: u.role,
    demo: u.demo === true,
    emailVerified: !!u.emailVerified,
    googleLinked: !!u.googleId,
    locked: u.lockedAt ? { at: u.lockedAt, reason: u.lockReason ?? '' } : null,
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt ?? null,
    designs: u.designCount ?? 0,
    publicDesigns: u.publicCount ?? 0,
  };
}

/** Tìm người theo tên / tên riêng / email (không dấu) → danh sách id (dùng cho ô tìm ở các trang quản trị). */
async function userIdsMatching(q) {
  const rx = escapeRegex(q.replace(/^@/, ''));
  const users = await User.find({ $or: [{ nameNorm: { $regex: rx } }, { handle: { $regex: rx } }, { email: { $regex: rx } }] }, { _id: 1 }).limit(300);
  return users.map((u) => u._id);
}

adminRouter.get('/users', async (req, res) => {
  const filter = { ...(pick(USER_FILTERS, req.query.f) ?? {}) };
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().replace(/^@/, '').slice(0, 80) : '';
  if (q) {
    // tìm không dấu theo tên, tên riêng hoặc email
    const rx = escapeRegex(q);
    filter.$or = [{ nameNorm: { $regex: rx } }, { handle: { $regex: rx } }, { email: { $regex: rx } }];
  }
  const sortKey = pick(USER_SORTS, req.query.sort) ? req.query.sort : 'new';
  const page = pageOf(req.query.page);
  const window = [{ $skip: (page - 1) * USERS_PER_PAGE }, { $limit: USERS_PER_PAGE }];
  const pipeline =
    sortKey === 'designs'
      ? [{ $match: filter }, { $project: { passwordHash: 0 } }, ...DESIGN_COUNTS, { $sort: USER_SORTS.designs }, ...window]
      : [{ $match: filter }, { $project: { passwordHash: 0 } }, { $sort: USER_SORTS[sortKey] }, ...window, ...DESIGN_COUNTS];
  const [list, total] = await Promise.all([User.aggregate(pipeline), User.countDocuments(filter)]);
  res.json({ items: list.map(userRow), total, page, pages: Math.max(1, Math.ceil(total / USERS_PER_PAGE)) });
});

/**
 * Thiết kế trong trang chi tiết người dùng. RIÊNG TƯ: chỉ loại + ngày tạo (không tên, không ảnh) – trừ khi chủ đã đồng ý
 * cho chính quản trị viên này xem (còn hạn). Kèm trạng thái yêu cầu xin xem gần nhất của quản trị viên này.
 */
function designRow(d, request) {
  const base = { id: String(d._id), type: d.savedType ?? d.type, visibility: d.visibility, createdAt: d.createdAt };
  if (d.visibility === 'private') {
    const status = request ? accessStatus(request) : null;
    const access = request ? { id: String(request._id), status, expiresAt: request.expiresAt ?? null, createdAt: request.createdAt } : null;
    if (status === 'approved') return { ...base, masked: false, access, name: d.name, thumbnailUrl: thumbUrl(d.thumbnail) };
    return { ...base, masked: true, access };
  }
  return {
    ...base,
    name: d.name,
    thumbnailUrl: thumbUrl(d.thumbnail),
    likeCount: d.likeCount ?? 0,
    commentCount: d.commentCount ?? 0,
    publishedAt: d.publishedAt ?? null,
    saved: d.lastVersion > 0, // chưa Lưu lần nào → người khác chưa xem được
    hidden: d.modHidden ? { at: d.modHidden.at, reason: d.modHidden.reason ?? '' } : null,
    featured: !!d.featuredAt,
  };
}

const logOut = (l) => ({
  id: String(l._id),
  at: l.createdAt,
  action: l.action,
  actor: l.actor ? String(l.actor) : null,
  actorName: l.actorName,
  targetType: l.targetType,
  target: l.target ? String(l.target) : null,
  targetLabel: l.targetLabel,
  reason: l.reason,
  meta: l.meta ?? null,
});

adminRouter.get('/users/:id', async (req, res) => {
  const u = await User.findById(readObjectId(req.params.id)).lean();
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng – có thể tài khoản đã bị xoá');
  const designs = await Design.find({ owner: u._id }, { config: 0 }).sort({ createdAt: -1 }).lean();
  const designIds = designs.map((d) => d._id);
  const commentIds = await Comment.distinct('_id', { author: u._id });
  const [likesGiven, comments, reportsMade, reportsAgainst, sessions, lockedBy, logs, requests] = await Promise.all([
    Like.countDocuments({ user: u._id }),
    Comment.countDocuments({ author: u._id, deleted: false }),
    Report.countDocuments({ reporter: u._id }),
    Report.countDocuments({ $or: [{ targetType: 'design', target: { $in: designIds } }, { targetType: 'comment', target: { $in: commentIds } }] }),
    Session.countDocuments({ user: u._id, expiresAt: { $gt: new Date() } }),
    u.lockedBy ? User.findById(u.lockedBy, { displayName: 1 }).lean() : null,
    AdminLog.find({ target: u._id }).sort({ createdAt: -1, _id: -1 }).limit(30).lean(),
    latestRequests(
      req.user._id,
      designs.filter((d) => d.visibility === 'private').map((d) => d._id),
    ),
  ]);
  const count = (v) => designs.filter((d) => d.visibility === v).length;
  res.json({
    user: {
      ...userRow({ ...u, designCount: designs.length, publicCount: count('public') }),
      bio: u.bio ?? '',
      hasPassword: !!u.passwordHash,
      lastLoginAt: u.lastLoginAt ?? null,
      locked: u.lockedAt ? { at: u.lockedAt, reason: u.lockReason ?? '', by: lockedBy?.displayName ?? null } : null,
      isMe: u._id.equals(req.user._id),
    },
    stats: {
      designs: designs.length,
      public: count('public'),
      unlisted: count('unlisted'),
      private: count('private'),
      likesReceived: designs.reduce((s, d) => s + (d.likeCount ?? 0), 0),
      likesGiven,
      comments,
      reportsAgainst,
      reportsMade,
      sessions,
    },
    designs: designs.map((d) => designRow(d, requests.get(String(d._id)))),
    logs: logs.map(logOut),
  });
});

/** Tài khoản bị khoá / xoá: không phải chính mình, không phải quản trị viên khác. */
async function targetUser(req) {
  const u = await User.findById(readObjectId(req.params.id));
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng – có thể tài khoản đã bị xoá');
  if (u._id.equals(req.user._id)) throw new HttpError(403, 'Không thể làm thao tác này với chính tài khoản của bạn.', 'SELF');
  if (u.role === 'admin') {
    throw new HttpError(403, 'Không thể khoá hay xoá quản trị viên – hãy thu quyền admin bằng lệnh trên máy chủ trước.', 'TARGET_ADMIN');
  }
  return u;
}

adminRouter.post('/users/:id/lock', writeLimiter, async (req, res) => {
  const u = await targetUser(req);
  if (u.lockedAt) throw new HttpError(409, 'Tài khoản này đang bị khoá rồi.');
  const reason = readText(req.body?.reason ?? '', { min: 4, max: 300, label: 'Lý do khoá' });
  // khoá từ hàng chờ báo cáo → đóng luôn các báo cáo về nội dung đó
  const from = req.body?.closeReports;
  const fromReport = from && ['design', 'comment'].includes(from.targetType) && isId(from.targetId) ? from : null;
  await logAdmin(req.user, { action: 'user.lock', targetType: 'user', target: u._id, targetLabel: userLabel(u), reason, meta: fromReport ? { fromReport: true } : null });
  await User.updateOne({ _id: u._id }, { lockedAt: new Date(), lockReason: reason, lockedBy: req.user._id });
  // đăng xuất mọi nơi + huỷ link đặt lại mật khẩu còn hạn; nội dung công khai tạm ẩn
  await Promise.all([
    revokeAll(u._id),
    OneTimeToken.deleteMany({ user: u._id }),
    Design.updateMany({ owner: u._id }, { ownerLocked: true }, { timestamps: false }),
  ]);
  const closed = fromReport ? await closeReports(req, fromReport.targetType, fromReport.targetId, 'lock') : 0;
  res.json({ ok: true, closedReports: closed });
});

adminRouter.post('/users/:id/unlock', writeLimiter, async (req, res) => {
  const u = await User.findById(readObjectId(req.params.id));
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng – có thể tài khoản đã bị xoá');
  if (!u.lockedAt) throw new HttpError(409, 'Tài khoản này không bị khoá.');
  const note = readText(req.body?.note ?? '', { max: 300, label: 'Ghi chú' });
  await logAdmin(req.user, { action: 'user.unlock', targetType: 'user', target: u._id, targetLabel: userLabel(u), reason: note });
  await User.updateOne({ _id: u._id }, { lockedAt: null, lockReason: '', lockedBy: null });
  await Design.updateMany({ owner: u._id }, { ownerLocked: false }, { timestamps: false });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', writeLimiter, async (req, res) => {
  const u = await targetUser(req);
  const confirm = typeof req.body?.confirmEmail === 'string' ? req.body.confirmEmail.trim().toLowerCase() : '';
  if (confirm !== u.email) throw bad('Email xác nhận không khớp – gõ đúng email của tài khoản để xoá.', 'CONFIRM_MISMATCH');
  const reason = readText(req.body?.reason ?? '', { min: 4, max: 300, label: 'Lý do xoá' });
  const designs = await Design.countDocuments({ owner: u._id });
  await logAdmin(req.user, { action: 'user.delete', targetType: 'user', target: u._id, targetLabel: userLabel(u), reason, meta: { designs } });
  await deleteUserCascade(u._id);
  res.json({ ok: true, designs });
});

// ═══ BÁO CÁO: hàng chờ gộp theo nội dung (1 thiết kế bị 5 người báo = 1 mục) ═══════════════════════════
const REPORTS_PER_PAGE = 20;

/** Nội dung bị báo cáo (thiết kế / bình luận) – null nếu đã bị xoá. */
async function reportTargets(rows) {
  const designIds = rows.map((r) => r.design).filter(Boolean);
  const commentIds = rows.filter((r) => r.targetType === 'comment').map((r) => r.target);
  const [designs, comments] = await Promise.all([
    Design.find({ _id: { $in: designIds } }, DESIGN_BRIEF_FIELDS).lean(),
    Comment.find({ _id: { $in: commentIds } }).lean(),
  ]);
  const dmap = new Map(designs.map((d) => [String(d._id), d]));
  const cmap = new Map(comments.map((c) => [String(c._id), c]));
  const users = await usersMap([...designs.map((d) => d.owner), ...comments.map((c) => c.author), ...rows.flatMap((r) => r.reporters ?? [])]);
  const target = (r) => {
    const d = dmap.get(String(r.design));
    if (r.targetType === 'design') return d ? designBrief(d, users) : null;
    const c = cmap.get(String(r.target));
    if (!c || c.deleted) return null;
    return {
      id: String(c._id),
      body: c.body, // quản trị viên thấy nội dung gốc, kể cả đã bị gỡ
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      removed: c.modRemoved ? { at: c.modRemoved.at, reason: c.modRemoved.reason ?? '' } : null,
      author: userBrief(users.get(String(c.author))),
      design: d ? designBrief(d, users) : null,
    };
  };
  return { target, users };
}

adminRouter.get('/reports', async (req, res) => {
  const page = pageOf(req.query.page);
  if (req.query.status === 'handled') {
    // ĐÃ XỬ LÝ: từng báo cáo, mới xử lý trước
    const filter = { status: { $ne: 'open' } };
    const [list, total] = await Promise.all([
      Report.find(filter).sort({ handledAt: -1, updatedAt: -1 }).skip((page - 1) * REPORTS_PER_PAGE).limit(REPORTS_PER_PAGE).lean(),
      Report.countDocuments(filter),
    ]);
    const { target, users } = await reportTargets(list.map((r) => ({ ...r, reporters: [r.reporter, r.handledBy] })));
    res.json({
      items: list.map((r) => ({
        id: String(r._id),
        targetType: r.targetType,
        targetId: String(r.target),
        target: target(r),
        reason: r.reason,
        note: r.note,
        reporter: userBrief(users.get(String(r.reporter))),
        createdAt: r.createdAt,
        status: r.status,
        resolution: r.resolution,
        handledAt: r.handledAt,
        handledBy: r.handledBy ? (users.get(String(r.handledBy))?.displayName ?? 'Tài khoản đã xoá') : null,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / REPORTS_PER_PAGE)),
    });
    return;
  }
  // ĐANG CHỜ: gộp theo nội dung – nhiều báo cáo nhất trước, rồi mới nhất trước
  const [agg] = await Report.aggregate([
    { $match: { status: 'open' } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { t: '$targetType', id: '$target' },
        design: { $first: '$design' },
        count: { $sum: 1 },
        reasons: { $push: '$reason' },
        notes: { $push: { note: '$note', reason: '$reason', reporter: '$reporter', at: '$createdAt' } },
        reporters: { $push: '$reporter' },
        firstAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1, lastAt: -1 } },
    { $facet: { items: [{ $skip: (page - 1) * REPORTS_PER_PAGE }, { $limit: REPORTS_PER_PAGE }], total: [{ $count: 'n' }] } },
  ]);
  const rows = agg.items.map((g) => ({ ...g, targetType: g._id.t, target: g._id.id }));
  const { target, users } = await reportTargets(rows);
  const total = agg.total[0]?.n ?? 0;
  res.json({
    items: rows.map((g) => {
      const reasons = {};
      for (const r of g.reasons) reasons[r] = (reasons[r] ?? 0) + 1;
      return {
        key: `${g.targetType}:${g.target}`,
        targetType: g.targetType,
        targetId: String(g.target),
        count: g.count,
        firstAt: g.firstAt,
        lastAt: g.lastAt,
        reasons: Object.entries(reasons)
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
        notes: g.notes
          .filter((n) => n.note)
          .slice(0, 5)
          .map((n) => ({ note: n.note, reason: n.reason, at: n.at, reporter: users.get(String(n.reporter))?.displayName ?? 'Tài khoản đã xoá' })),
        target: target(g),
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / REPORTS_PER_PAGE)),
  });
});

/** Bỏ qua (không vi phạm) / đóng vì nội dung không còn. Ẩn thiết kế, gỡ bình luận, khoá người đăng tự đóng báo cáo. */
adminRouter.post('/reports/close', writeLimiter, async (req, res) => {
  const { targetType, resolution } = req.body ?? {};
  if (!['design', 'comment'].includes(targetType)) throw bad('Loại nội dung không hợp lệ');
  if (!['dismiss', 'gone'].includes(resolution)) throw bad('Cách xử lý không hợp lệ');
  const id = readObjectId(req.body?.targetId);
  const note = readText(req.body?.note ?? '', { max: 300, label: 'Ghi chú' });
  const open = await Report.countDocuments({ targetType, target: id, status: 'open' });
  if (!open) throw new HttpError(409, 'Không còn báo cáo nào đang chờ cho nội dung này.');
  let label = 'Nội dung đã bị xoá';
  if (targetType === 'design') {
    const d = await Design.findById(id, DESIGN_BRIEF_FIELDS);
    if (d) label = designLabel(d, await User.findById(d.owner, { displayName: 1, email: 1 }));
  } else {
    const c = await Comment.findById(id);
    if (c) label = commentLabel(await User.findById(c.author, { displayName: 1, email: 1 }), await Design.findById(c.design, { name: 1, visibility: 1 }));
  }
  await logAdmin(req.user, { action: resolution === 'dismiss' ? 'report.dismiss' : 'report.close', targetType, target: id, targetLabel: label, reason: note, meta: { reports: open } });
  const closed = await closeReports(req, targetType, id, resolution);
  res.json({ ok: true, closed });
});

// ═══ THIẾT KẾ: duyệt nội dung chia sẻ (Công khai / Có liên kết – không bao giờ có thiết kế riêng tư) ═══════
const DESIGN_STATUS = {
  visible: { modHidden: null, ownerLocked: { $ne: true } },
  hidden: { modHidden: { $ne: null } },
  featured: { featuredAt: { $ne: null } },
  locked: { ownerLocked: true },
};
const DESIGNS_PER_PAGE = 24;

adminRouter.get('/designs', async (req, res) => {
  const filter = { visibility: { $in: ['public', 'unlisted'] }, ...(pick(DESIGN_STATUS, req.query.status) ?? {}) };
  if (req.query.status === 'reported') filter._id = { $in: await Report.distinct('target', { targetType: 'design', status: 'open' }) };
  if (typeof req.query.type === 'string' && TYPE_CODES.includes(req.query.type)) filter.savedType = req.query.type;
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().slice(0, 80) : '';
  if (q) filter.$or = [{ nameNorm: { $regex: escapeRegex(q) } }, { owner: { $in: await userIdsMatching(q) } }];
  const page = pageOf(req.query.page);
  const sort = ['new', 'likes', 'reports'].includes(req.query.sort) ? req.query.sort : 'new';
  let list;
  if (sort === 'reports') {
    list = await Design.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'reports',
          let: { d: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$target', '$$d'] }, targetType: 'design', status: 'open' } }, { $count: 'n' }],
          as: 'r',
        },
      },
      { $addFields: { openReports: { $ifNull: [{ $first: '$r.n' }, 0] } } },
      { $sort: { openReports: -1, publishedAt: -1, _id: -1 } },
      { $skip: (page - 1) * DESIGNS_PER_PAGE },
      { $limit: DESIGNS_PER_PAGE },
      { $project: { config: 0, r: 0 } },
    ]);
  } else {
    const order = sort === 'likes' ? { likeCount: -1, _id: -1 } : { publishedAt: -1, createdAt: -1, _id: -1 };
    list = await Design.find(filter, DESIGN_BRIEF_FIELDS).sort(order).skip((page - 1) * DESIGNS_PER_PAGE).limit(DESIGNS_PER_PAGE).lean();
  }
  const [total, users, counts] = await Promise.all([
    Design.countDocuments(filter),
    usersMap(list.map((d) => d.owner)),
    openReportCounts('design', list.map((d) => d._id)),
  ]);
  res.json({ items: list.map((d) => designBrief(d, users, counts.get(String(d._id)) ?? 0)), total, page, pages: Math.max(1, Math.ceil(total / DESIGNS_PER_PAGE)) });
});

async function loadDesign(req) {
  const d = await Design.findById(readObjectId(req.params.id), DESIGN_BRIEF_FIELDS);
  if (!d) throw new HttpError(404, 'Không tìm thấy thiết kế – có thể đã bị xoá');
  return { d, owner: await User.findById(d.owner, { displayName: 1, email: 1, demo: 1, lockedAt: 1 }) };
}

adminRouter.post('/designs/:id/hide', writeLimiter, async (req, res) => {
  const { d, owner } = await loadDesign(req);
  if (d.modHidden) throw new HttpError(409, 'Thiết kế này đang bị ẩn rồi.');
  const reason = readText(req.body?.reason ?? '', { min: 4, max: 300, label: 'Lý do ẩn' });
  await logAdmin(req.user, { action: 'design.hide', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner), reason });
  // ẩn = rút khỏi cộng đồng (chủ vẫn giữ + chỉnh sửa được); bỏ luôn "NGK chọn"
  await Design.updateOne({ _id: d._id }, { modHidden: { at: new Date(), reason, by: req.user._id }, featuredAt: null, featuredBy: null }, { timestamps: false });
  const closed = await closeReports(req, 'design', d._id, 'hide');
  await notify({ to: d.owner, actor: req.user._id, type: 'moderation', kind: 'design-hidden', design: d._id, reason });
  res.json({ ok: true, closedReports: closed });
});

adminRouter.post('/designs/:id/restore', writeLimiter, async (req, res) => {
  const { d, owner } = await loadDesign(req);
  if (!d.modHidden) throw new HttpError(409, 'Thiết kế này không bị ẩn.');
  const note = readText(req.body?.note ?? '', { max: 300, label: 'Ghi chú' });
  await logAdmin(req.user, { action: 'design.restore', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner), reason: note });
  await Design.updateOne({ _id: d._id }, { modHidden: null }, { timestamps: false });
  await notify({ to: d.owner, actor: req.user._id, type: 'moderation', kind: 'design-restored', design: d._id, reason: note });
  res.json({ ok: true });
});

adminRouter.post('/designs/:id/feature', writeLimiter, async (req, res) => {
  const { d, owner } = await loadDesign(req);
  if (d.visibility !== 'public' || !d.lastVersion) throw bad('Chỉ chọn được thiết kế đang Công khai.', 'NOT_PUBLIC');
  if (d.modHidden || d.ownerLocked) throw bad('Thiết kế đang bị ẩn khỏi cộng đồng – không chọn được.', 'HIDDEN');
  if (d.featuredAt) throw new HttpError(409, 'Thiết kế này đã được NGK chọn rồi.');
  await logAdmin(req.user, { action: 'design.feature', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner) });
  await Design.updateOne({ _id: d._id }, { featuredAt: new Date(), featuredBy: req.user._id }, { timestamps: false });
  await notify({ to: d.owner, actor: req.user._id, type: 'featured', design: d._id });
  res.json({ ok: true });
});

adminRouter.post('/designs/:id/unfeature', writeLimiter, async (req, res) => {
  const { d, owner } = await loadDesign(req);
  if (!d.featuredAt) throw new HttpError(409, 'Thiết kế này không nằm trong NGK chọn.');
  await logAdmin(req.user, { action: 'design.unfeature', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner) });
  await Design.updateOne({ _id: d._id }, { featuredAt: null, featuredBy: null }, { timestamps: false });
  res.json({ ok: true });
});

// ── XIN QUYỀN XEM THIẾT KẾ RIÊNG TƯ (chủ thiết kế đồng ý mới xem được) ───────────────────────────────
adminRouter.post('/designs/:id/access-requests', writeLimiter, async (req, res) => {
  const { d, owner } = await loadDesign(req);
  if (d.visibility !== 'private') throw bad('Thiết kế này không ở chế độ riêng tư – mở trực tiếp được, không cần xin quyền.', 'NOT_PRIVATE');
  if (d.owner.equals(req.user._id)) throw bad('Đây là thiết kế của chính bạn.');
  if (!owner) throw new HttpError(404, 'Không tìm thấy chủ thiết kế');
  if (owner.demo) throw bad('Chủ thiết kế là tài khoản mẫu – không trả lời được yêu cầu.', 'DEMO_OWNER');
  if (owner.lockedAt) throw bad('Chủ thiết kế đang bị khoá – không đăng nhập được để trả lời.', 'OWNER_LOCKED');
  const reason = readText(req.body?.reason ?? '', { min: 10, max: 300, label: 'Lý do xin xem' });
  const last = await AccessRequest.findOne({ admin: req.user._id, design: d._id }).sort({ createdAt: -1 });
  if (last && last.status === 'pending') throw new HttpError(409, 'Bạn đã gửi yêu cầu – đang chờ chủ thiết kế trả lời.', 'PENDING');
  if (last && accessStatus(last) === 'approved') throw new HttpError(409, 'Bạn đang có quyền xem thiết kế này.', 'GRANTED');
  await logAdmin(req.user, { action: 'access.request', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner), reason });
  const r = await AccessRequest.create({ design: d._id, owner: d.owner, admin: req.user._id, reason });
  await notify({ to: d.owner, actor: req.user._id, type: 'access-request', design: d._id, request: r._id, reason });
  res.status(201).json({ request: { id: String(r._id), status: r.status, createdAt: r.createdAt, expiresAt: null } });
});

/** Xem thiết kế RIÊNG TƯ đã được chủ đồng ý (bản hiện tại, chỉ đọc). Mỗi lần xem đều ghi nhật ký. */
adminRouter.get('/designs/:id/view', async (req, res) => {
  const d = await Design.findById(readObjectId(req.params.id));
  if (!d) throw new HttpError(404, 'Không tìm thấy thiết kế – có thể đã bị xoá');
  if (d.visibility !== 'private') throw bad('Thiết kế này không riêng tư – hãy mở trang thiết kế công khai.', 'NOT_PRIVATE');
  const grant = await activeGrant(req.user._id, d._id);
  if (!grant) throw new HttpError(403, 'Bạn chưa được chủ thiết kế cho phép xem (hoặc quyền xem đã hết hạn / bị thu hồi).', 'NO_GRANT');
  const owner = await User.findById(d.owner, { ...AUTHOR_FIELDS, email: 1 });
  await logAdmin(req.user, { action: 'access.view', targetType: 'design', target: d._id, targetLabel: designLabel(d, owner), meta: { request: String(grant._id) } });
  res.json({
    design: {
      id: String(d._id),
      name: d.name,
      type: d.type,
      config: d.config,
      description: d.description ?? '',
      thumbnailUrl: thumbUrl(d.thumbnail),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      lastSavedAt: d.lastSavedAt,
      versionCount: d.versionCount,
      owner: authorInfo(owner),
    },
    grant: { id: String(grant._id), expiresAt: grant.expiresAt, reason: grant.reason },
  });
});

// ═══ BÌNH LUẬN: duyệt chủ động (chỉ bình luận ở thiết kế đang chia sẻ) ═══════════════════════════════
const COMMENTS_PER_PAGE = 30;

adminRouter.get('/comments', async (req, res) => {
  const match = { deleted: false };
  if (req.query.status === 'removed') match.modRemoved = { $ne: null };
  else if (req.query.status === 'visible') match.modRemoved = null;
  else if (req.query.status === 'reported') match._id = { $in: await Report.distinct('target', { targetType: 'comment', status: 'open' }) };
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().slice(0, 80) : '';
  if (q) match.$or = [{ norm: { $regex: escapeRegex(q) } }, { author: { $in: await userIdsMatching(q) } }];
  const page = pageOf(req.query.page);
  const [agg] = await Comment.aggregate([
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $lookup: {
        from: 'designs',
        localField: 'design',
        foreignField: '_id',
        as: 'd',
        pipeline: [{ $project: { name: 1, thumbnail: 1, visibility: 1, owner: 1, type: 1, savedType: 1, modHidden: 1, ownerLocked: 1, lastVersion: 1 } }],
      },
    },
    { $unwind: '$d' },
    { $match: { 'd.visibility': { $ne: 'private' } } },
    { $facet: { items: [{ $skip: (page - 1) * COMMENTS_PER_PAGE }, { $limit: COMMENTS_PER_PAGE }], total: [{ $count: 'n' }] } },
  ]);
  const [users, counts] = await Promise.all([
    usersMap(agg.items.flatMap((c) => [c.author, c.d.owner])),
    openReportCounts('comment', agg.items.map((c) => c._id)),
  ]);
  const total = agg.total[0]?.n ?? 0;
  res.json({
    items: agg.items.map((c) => ({
      id: String(c._id),
      body: c.body,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      isReply: !!c.parent,
      removed: c.modRemoved ? { at: c.modRemoved.at, reason: c.modRemoved.reason ?? '' } : null,
      author: userBrief(users.get(String(c.author))),
      design: designBrief(c.d, users),
      openReports: counts.get(String(c._id)) ?? 0,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / COMMENTS_PER_PAGE)),
  });
});

async function loadComment(req) {
  const c = await Comment.findById(readObjectId(req.params.id));
  if (!c || c.deleted) throw new HttpError(404, 'Không tìm thấy bình luận – có thể đã bị xoá');
  const [author, d] = await Promise.all([User.findById(c.author, { displayName: 1, email: 1 }), Design.findById(c.design, { name: 1, visibility: 1 })]);
  return { c, label: commentLabel(author, d) };
}

adminRouter.post('/comments/:id/remove', writeLimiter, async (req, res) => {
  const { c, label } = await loadComment(req);
  if (c.modRemoved) throw new HttpError(409, 'Bình luận này đã bị gỡ rồi.');
  const reason = readText(req.body?.reason ?? '', { min: 4, max: 300, label: 'Lý do gỡ' });
  await logAdmin(req.user, { action: 'comment.remove', targetType: 'comment', target: c._id, targetLabel: label, reason, meta: { excerpt: excerpt(c.body, 120) } });
  await Comment.updateOne({ _id: c._id }, { modRemoved: { at: new Date(), reason, by: req.user._id } }, { timestamps: false });
  await Design.updateOne({ _id: c.design, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } }, { timestamps: false });
  const closed = await closeReports(req, 'comment', c._id, 'remove');
  await notify({ to: c.author, actor: req.user._id, type: 'moderation', kind: 'comment-removed', design: c.design, comment: c._id, preview: c.body, reason });
  res.json({ ok: true, closedReports: closed });
});

adminRouter.post('/comments/:id/restore', writeLimiter, async (req, res) => {
  const { c, label } = await loadComment(req);
  if (!c.modRemoved) throw new HttpError(409, 'Bình luận này không bị gỡ.');
  const note = readText(req.body?.note ?? '', { max: 300, label: 'Ghi chú' });
  await logAdmin(req.user, { action: 'comment.restore', targetType: 'comment', target: c._id, targetLabel: label, reason: note, meta: { excerpt: excerpt(c.body, 120) } });
  await Comment.updateOne({ _id: c._id }, { modRemoved: null }, { timestamps: false });
  await Design.updateOne({ _id: c.design }, { $inc: { commentCount: 1 } }, { timestamps: false });
  await notify({ to: c.author, actor: req.user._id, type: 'moderation', kind: 'comment-restored', design: c.design, comment: c._id, preview: c.body, reason: note });
  res.json({ ok: true });
});

// ═══ NHẬT KÝ QUẢN TRỊ (chỉ đọc) ═════════════════════════════════════════════════════════════════════
const LOGS_PER_PAGE = 30;
/** "2026-10-18" → đầu ngày giờ Việt Nam (+07:00); `next` = đầu ngày hôm sau (để lọc "đến hết ngày"). */
function parseDay(v, next = false) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (next) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

adminRouter.get('/logs', async (req, res) => {
  const filter = {};
  if (typeof req.query.action === 'string' && /^[a-z]+\.[a-z-]+$/.test(req.query.action)) filter.action = req.query.action;
  else if (typeof req.query.group === 'string' && /^[a-z]+$/.test(req.query.group)) filter.action = { $regex: `^${req.query.group}[.]` };
  if (req.query.actor === 'cli') filter.actor = null;
  else if (isId(req.query.actor)) filter.actor = req.query.actor;
  if (isId(req.query.target)) filter.target = req.query.target;
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().slice(0, 80) : '';
  if (q) filter.norm = { $regex: escapeRegex(q) };
  const from = parseDay(req.query.from);
  const to = parseDay(req.query.to, true);
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const page = pageOf(req.query.page);
  const [items, total] = await Promise.all([
    AdminLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * LOGS_PER_PAGE).limit(LOGS_PER_PAGE).lean(),
    AdminLog.countDocuments(filter),
  ]);
  res.json({ items: items.map(logOut), total, page, pages: Math.max(1, Math.ceil(total / LOGS_PER_PAGE)) });
});

/** Những người từng thao tác (bộ lọc "Người thực hiện"). */
adminRouter.get('/logs/actors', async (req, res) => {
  const ids = await AdminLog.distinct('actor');
  const users = await User.find({ _id: { $in: ids.filter(Boolean) } }, { displayName: 1 }).sort({ nameNorm: 1 }).lean();
  res.json({ items: users.map((u) => ({ id: String(u._id), name: u.displayName })), cli: ids.some((x) => x == null) });
});
