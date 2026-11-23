// API CỘNG ĐỒNG (GĐ3):
//  /api/public/*  – ai cũng xem được (khách): Khám phá, trang thiết kế, bình luận, bản remix, hồ sơ
//  còn lại        – cần đăng nhập: thích, remix, bình luận, báo cáo, thông báo
// Quy tắc xem: chủ thiết kế luôn xem được; người khác chỉ khi thiết kế "Có liên kết" / "Công khai" và đã Lưu ít nhất
// một lần. Thiết kế riêng tư trả 404 (không lộ là có tồn tại). Người xem thấy PHIÊN BẢN ĐÃ LƯU GẦN NHẤT.
import { Router } from 'express';
import { TYPE_CODES } from '@ngk/shared';
import { AUTHOR_FIELDS, HttpError, authorInfo, bad, escapeRegex, fold, readMultiline, readObjectId, readPage } from '../lib.js';
import { AccessRequest, Comment, Design, Image, Like, Notification, Report, User, Version } from '../models.js';
import { accessStatus } from '../access.js';
import { perUserLimiter, requireAuth } from '../security.js';
import { notify } from '../notify.js';
import { shareMeta } from '../share.js';
import { checkQuota, createDesign, remixCredit, thumbUrl } from './designs.js';

export const communityRouter = Router();

const PAGE = 24;
const pageOf = (q) => readPage(q, 500);
const commentLimiter = perUserLimiter('comment', 60 * 1000, 6, 'Bạn bình luận hơi nhanh – đợi một chút rồi gửi tiếp nhé.');
const actionLimiter = perUserLimiter('action', 60 * 1000, 60, 'Thao tác quá nhanh – vui lòng chậm lại.');

// các trường viewable() luôn cần để quyết định quyền xem
const VIEW_FIELDS = { owner: 1, visibility: 1, lastVersion: 1, ownerLocked: 1, modHidden: 1 };

/**
 * Thiết kế mà người đang xem được phép xem (hoặc 404). Thiết kế bị quản trị viên ẩn / chủ bị khoá → người khác không xem
 * được, trừ quản trị viên (cần xem để xét xử lý). Thiết kế RIÊNG TƯ thì quản trị viên cũng không xem được.
 */
async function viewable(req, id, projection = { config: 0 }) {
  const inclusive = Object.values(projection).some((v) => v === 1);
  const d = await Design.findById(readObjectId(id), inclusive ? { ...projection, ...VIEW_FIELDS } : projection);
  const mine = !!(d && req.user && d.owner.equals(req.user._id));
  const admin = req.user?.role === 'admin';
  if (!d || (!mine && (d.visibility === 'private' || !d.lastVersion || ((d.ownerLocked || d.modHidden) && !admin)))) throw new HttpError(404, 'Không tìm thấy thiết kế');
  return { d, mine };
}

/** Thông tin tác giả (Map id → authorInfo). `.locked` = tập id đang bị khoá (bình luận của họ được ẩn). */
async function authors(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const users = uniq.length ? await User.find({ _id: { $in: uniq } }, { ...AUTHOR_FIELDS, lockedAt: 1 }) : [];
  const map = new Map(users.map((u) => [String(u._id), authorInfo(u)]));
  map.locked = new Set(users.filter((u) => u.lockedAt).map((u) => String(u._id)));
  return map;
}
async function likedSet(user, designIds) {
  if (!user || !designIds.length) return new Set();
  const likes = await Like.find({ user: user._id, design: { $in: designIds } }, { design: 1 });
  return new Set(likes.map((l) => String(l.design)));
}

/** Thẻ thiết kế (Khám phá / hồ sơ / danh sách remix). */
function card(d, owners, liked) {
  return {
    id: String(d._id),
    name: d.name,
    type: d.savedType ?? d.type,
    thumbnailUrl: thumbUrl(d.thumbnail),
    likeCount: d.likeCount ?? 0,
    remixCount: d.remixCount ?? 0,
    commentCount: d.commentCount ?? 0,
    publishedAt: d.publishedAt ?? d.createdAt,
    visibility: d.visibility,
    owner: owners.get(String(d.owner)) ?? authorInfo(null),
    liked: liked.has(String(d._id)),
    remixOf: remixCredit(d.remixOf),
    featured: !!d.featuredAt,
  };
}
async function cards(req, list) {
  const [owners, liked] = await Promise.all([authors(list.map((d) => d.owner)), likedSet(req.user, list.map((d) => d._id))]);
  return list.map((d) => card(d, owners, liked));
}

export const PUBLIC = { visibility: 'public', lastVersion: { $gt: 0 }, ownerLocked: { $ne: true }, modHidden: null };
const CARD_FIELDS = { config: 0 };

// ═══ KHÁM PHÁ ═══════════════════════════════════════════════════════════════════════════════════════
communityRouter.get('/public/designs', async (req, res) => {
  const filter = { ...PUBLIC };
  if (typeof req.query.type === 'string' && TYPE_CODES.includes(req.query.type)) filter.savedType = req.query.type;
  const featured = req.query.featured === '1'; // chỉ thiết kế được NGK chọn
  if (featured) filter.featuredAt = { $ne: null };
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().slice(0, 60) : '';
  if (q) {
    // tìm theo tên thiết kế HOẶC tên / tên riêng của tác giả (không dấu)
    const rx = escapeRegex(q);
    const owners = await User.find({ $or: [{ nameNorm: { $regex: rx } }, { handle: { $regex: rx } }] }, { _id: 1 }).limit(200);
    filter.$or = [{ nameNorm: { $regex: rx } }, { owner: { $in: owners.map((u) => u._id) } }];
  }
  const page = pageOf(req.query.page);
  const sort = ['new', 'top', 'trending'].includes(req.query.sort) ? req.query.sort : 'new';
  let list;
  if (sort === 'trending') {
    // NỔI BẬT TUẦN: số lượt thích trong 7 ngày gần nhất (hoà → tổng lượt thích → mới hơn)
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    list = await Design.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'likes',
          let: { d: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$design', '$$d'] }, createdAt: { $gte: since } } }, { $count: 'n' }],
          as: 'week',
        },
      },
      { $addFields: { weekLikes: { $ifNull: [{ $first: '$week.n' }, 0] } } },
      { $sort: { weekLikes: -1, likeCount: -1, publishedAt: -1, _id: -1 } },
      { $skip: (page - 1) * PAGE },
      { $limit: PAGE },
      { $project: { config: 0, week: 0 } },
    ]);
  } else {
    // NGK chọn + Mới nhất → mới được chọn trước
    const order = sort === 'top' ? { likeCount: -1, publishedAt: -1, _id: -1 } : featured ? { featuredAt: -1, _id: -1 } : { publishedAt: -1, _id: -1 };
    list = await Design.find(filter, CARD_FIELDS).sort(order).skip((page - 1) * PAGE).limit(PAGE).lean();
  }
  const total = await Design.countDocuments(filter);
  res.json({ items: await cards(req, list), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
});

// ═══ TRANG THIẾT KẾ ═════════════════════════════════════════════════════════════════════════════════
communityRouter.get('/public/designs/:id', async (req, res) => {
  const { d, mine } = await viewable(req, req.params.id);
  const admin = req.user?.role === 'admin';
  const v = await Version.findOne({ design: d._id, n: d.lastVersion });
  if (!v) throw new HttpError(404, 'Không tìm thấy thiết kế');
  const [owners, liked] = await Promise.all([authors([d.owner]), likedSet(req.user, [d._id])]);
  // bản gốc của remix còn xem được không (bị xoá / chuyển riêng tư → chỉ hiện tên, không có liên kết)
  let remixOf = remixCredit(d.remixOf);
  if (remixOf) {
    const orig = await Design.findById(d.remixOf.design, VIEW_FIELDS);
    const origMine = Boolean(orig && req.user && orig.owner.equals(req.user._id));
    const canOpen = Boolean(orig && orig.lastVersion > 0 && (origMine || (orig.visibility !== 'private' && !orig.ownerLocked && !orig.modHidden)));
    remixOf = { ...remixOf, available: canOpen };
  }
  res.json({
    design: {
      ...card(d, owners, liked),
      remixOf,
      description: d.description ?? '',
      config: v.config,
      versionN: v.n,
      savedAt: v.createdAt,
      allowRemix: d.allowRemix !== false,
      allowComments: d.allowComments !== false,
      isOwner: mine,
      // chủ + quản trị viên: thiết kế đang bị ẩn khỏi cộng đồng vì sao (người khác không bao giờ tới được đây)
      moderation:
        (mine || admin) && (d.modHidden || d.ownerLocked)
          ? { hidden: !!d.modHidden, reason: d.modHidden?.reason ?? '', at: d.modHidden?.at ?? null, ownerLocked: admin && !!d.ownerLocked }
          : null,
    },
  });
});

communityRouter.get('/public/designs/:id/remixes', async (req, res) => {
  const { d } = await viewable(req, req.params.id, { _id: 1, owner: 1, visibility: 1, lastVersion: 1 });
  const list = await Design.find({ ...PUBLIC, 'remixOf.design': d._id }, CARD_FIELDS).sort({ publishedAt: -1 }).limit(12).lean();
  res.json({ items: await cards(req, list) });
});

// thẻ xem trước khi dán link lên Facebook / Zalo: đúng dữ liệu máy chủ chèn vào HTML trang /thiet-ke/:id (share.js). Chạy
// trên máy thì Facebook / Zalo không vào được localhost để đọc → hộp Chia sẻ dùng API này để xem trước thẻ
communityRouter.get('/public/designs/:id/share-card', async (req, res) => {
  const meta = await shareMeta(req.params.id);
  if (!meta) throw new HttpError(404, 'Không tìm thấy thiết kế');
  res.json(meta);
});

// ═══ THÍCH ══════════════════════════════════════════════════════════════════════════════════════════
communityRouter.post('/designs/:id/like', requireAuth, actionLimiter, async (req, res) => {
  const { d } = await viewable(req, req.params.id, { owner: 1, visibility: 1, lastVersion: 1 });
  const r = await Like.updateOne({ user: req.user._id, design: d._id }, { $setOnInsert: { user: req.user._id, design: d._id } }, { upsert: true });
  let likeCount;
  if (r.upsertedCount) {
    likeCount = (await Design.findByIdAndUpdate(d._id, { $inc: { likeCount: 1 } }, { returnDocument: 'after', projection: { likeCount: 1 } })).likeCount;
    await notify({ to: d.owner, actor: req.user._id, type: 'like', design: d._id });
  } else likeCount = (await Design.findById(d._id, { likeCount: 1 })).likeCount;
  res.json({ liked: true, likeCount });
});

communityRouter.delete('/designs/:id/like', requireAuth, actionLimiter, async (req, res) => {
  const id = readObjectId(req.params.id);
  const r = await Like.deleteOne({ user: req.user._id, design: id });
  const d = r.deletedCount
    ? await Design.findOneAndUpdate({ _id: id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } }, { returnDocument: 'after', projection: { likeCount: 1 } })
    : await Design.findById(id, { likeCount: 1 });
  res.json({ liked: false, likeCount: d?.likeCount ?? 0 });
});

// ═══ REMIX ══════════════════════════════════════════════════════════════════════════════════════════
communityRouter.post('/designs/:id/remix', requireAuth, actionLimiter, async (req, res) => {
  const { d, mine } = await viewable(req, req.params.id);
  if (mine) throw bad('Đây là thiết kế của bạn – hãy dùng “Nhân bản” trong Thiết kế của tôi.');
  if (d.allowRemix === false) throw new HttpError(403, 'Tác giả không cho phép remix thiết kế này.', 'REMIX_DISABLED');
  await checkQuota(req.user._id);
  const v = await Version.findOne({ design: d._id, n: d.lastVersion });
  if (!v) throw new HttpError(404, 'Không tìm thấy thiết kế');
  const owner = await User.findById(d.owner, AUTHOR_FIELDS);
  const img = v.thumbnail ? await Image.findById(v.thumbnail) : null;
  const name = [...`Remix – ${d.name}`].slice(0, 80).join('');
  const { design } = await createDesign({
    owner: req.user._id,
    name,
    config: v.config,
    note: `Remix từ “${d.name}” của ${owner?.displayName ?? 'một tác giả'}`,
    image: img ? { mime: img.mime, data: img.data } : null,
    remixOf: { design: d._id, owner: d.owner, name: d.name, ownerName: owner?.displayName ?? '', ownerHandle: owner?.handle ?? null },
  });
  await Design.updateOne({ _id: d._id }, { $inc: { remixCount: 1 } });
  await notify({ to: d.owner, actor: req.user._id, type: 'remix', design: d._id, remix: design._id });
  res.status(201).json({ design: { id: String(design._id), name: design.name } });
});

// ═══ BÌNH LUẬN ══════════════════════════════════════════════════════════════════════════════════════
function commentOut(c, req, designOwner, users) {
  const mine = !!(req.user && c.author.equals(req.user._id));
  const ownerOfDesign = !!(req.user && designOwner.equals(req.user._id));
  if (!c.deleted && c.modRemoved) {
    // bị quản trị viên gỡ: không ai thấy nội dung; riêng người viết được biết lý do
    return {
      id: String(c._id),
      parentId: c.parent ? String(c.parent) : null,
      body: '',
      deleted: false,
      removed: true,
      removedReason: mine ? c.modRemoved.reason : undefined,
      createdAt: c.createdAt,
      editedAt: null,
      replyCount: c.replyCount,
      author: null,
      canEdit: false,
      canDelete: mine || ownerOfDesign,
      canReport: false,
    };
  }
  if (!c.deleted && users.locked?.has(String(c.author))) {
    // người viết đang bị khoá → ẩn nội dung (hiện lại khi được mở khoá)
    return {
      id: String(c._id),
      parentId: c.parent ? String(c.parent) : null,
      body: '',
      deleted: false,
      hidden: true,
      createdAt: c.createdAt,
      editedAt: null,
      replyCount: c.replyCount,
      author: null,
      canEdit: false,
      canDelete: false,
      canReport: false,
    };
  }
  return {
    id: String(c._id),
    parentId: c.parent ? String(c.parent) : null,
    body: c.deleted ? '' : c.body,
    deleted: c.deleted,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    replyCount: c.replyCount,
    author: c.deleted ? null : (users.get(String(c.author)) ?? authorInfo(null)),
    canEdit: mine && !c.deleted,
    canDelete: (mine || ownerOfDesign) && !c.deleted,
    canReport: !!req.user && !mine && !c.deleted,
  };
}

communityRouter.get('/public/designs/:id/comments', async (req, res) => {
  const { d } = await viewable(req, req.params.id, { owner: 1, visibility: 1, lastVersion: 1, allowComments: 1, commentCount: 1 });
  const page = pageOf(req.query.page);
  const per = 20;
  const top = await Comment.find({ design: d._id, parent: null }).sort({ createdAt: -1 }).skip((page - 1) * per).limit(per);
  // có `design` trong điều kiện → dùng được index { design, parent, createdAt } (thiếu nó MongoDB phải quét cả bảng bình luận)
  const replies = top.length ? await Comment.find({ design: d._id, parent: { $in: top.map((c) => c._id) } }).sort({ createdAt: 1 }).limit(2000) : [];
  const users = await authors([...top, ...replies].map((c) => c.author));
  const topTotal = await Comment.countDocuments({ design: d._id, parent: null });
  res.json({
    items: top.map((c) => ({
      ...commentOut(c, req, d.owner, users),
      replies: replies.filter((r) => r.parent.equals(c._id)).map((r) => commentOut(r, req, d.owner, users)),
    })),
    total: d.commentCount ?? 0,
    page,
    pages: Math.max(1, Math.ceil(topTotal / per)),
    allowComments: d.allowComments !== false,
  });
});

communityRouter.post('/designs/:id/comments', requireAuth, commentLimiter, async (req, res) => {
  if (!req.user.emailVerified) throw new HttpError(403, 'Hãy xác minh email để bình luận.', 'EMAIL_UNVERIFIED');
  const { d } = await viewable(req, req.params.id, { owner: 1, visibility: 1, lastVersion: 1, allowComments: 1 });
  if (d.allowComments === false) throw new HttpError(403, 'Tác giả đã tắt bình luận cho thiết kế này.', 'COMMENTS_OFF');
  const body = readMultiline(req.body?.body, { max: 1000, min: 1, label: 'Bình luận' });
  let parent = null;
  if (req.body?.parentId) {
    parent = await Comment.findOne({ _id: readObjectId(req.body.parentId), design: d._id });
    if (!parent) throw new HttpError(404, 'Bình luận được trả lời không còn tồn tại');
    if (parent.parent) parent = await Comment.findById(parent.parent); // trả lời 1 cấp: trả lời câu trả lời → vào cùng chuỗi
    if (!parent || parent.modRemoved) throw new HttpError(404, 'Bình luận được trả lời không còn tồn tại');
  }
  const c = await Comment.create({ design: d._id, author: req.user._id, parent: parent?._id ?? null, body });
  await Design.updateOne({ _id: d._id }, { $inc: { commentCount: 1 } });
  if (parent) {
    await Comment.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } });
    if (!parent.deleted) await notify({ to: parent.author, actor: req.user._id, type: 'reply', design: d._id, comment: c._id, preview: body });
  }
  // chủ thiết kế nhận "bình luận mới" (trừ khi chính họ là người được trả lời – đã nhận "trả lời" ở trên)
  if (!parent || !parent.author.equals(d.owner)) await notify({ to: d.owner, actor: req.user._id, type: 'comment', design: d._id, comment: c._id, preview: body });
  const users = await authors([req.user._id]);
  res.status(201).json({ comment: { ...commentOut(c, req, d.owner, users), replies: [] } });
});

communityRouter.patch('/comments/:id', requireAuth, commentLimiter, async (req, res) => {
  const c = await Comment.findById(readObjectId(req.params.id));
  if (!c || c.deleted) throw new HttpError(404, 'Không tìm thấy bình luận');
  if (!c.author.equals(req.user._id)) throw new HttpError(403, 'Bạn chỉ sửa được bình luận của mình');
  if (c.modRemoved) throw new HttpError(403, 'Bình luận đã bị quản trị viên gỡ – không sửa được.', 'REMOVED');
  c.body = readMultiline(req.body?.body, { max: 1000, min: 1, label: 'Bình luận' });
  c.editedAt = new Date();
  await c.save();
  const d = await Design.findById(c.design, { owner: 1 });
  res.json({ comment: commentOut(c, req, d.owner, await authors([c.author])) });
});

communityRouter.delete('/comments/:id', requireAuth, async (req, res) => {
  const c = await Comment.findById(readObjectId(req.params.id));
  if (!c || c.deleted) throw new HttpError(404, 'Không tìm thấy bình luận');
  const d = await Design.findById(c.design, { owner: 1 });
  const allowed = c.author.equals(req.user._id) || d?.owner.equals(req.user._id) || req.user.role === 'admin';
  if (!allowed) throw new HttpError(403, 'Bạn không có quyền xoá bình luận này');
  let removed = c.modRemoved ? 0 : 1; // bị quản trị viên gỡ → đã trừ khỏi số bình luận lúc gỡ
  if (!c.parent && c.replyCount > 0) {
    // bình luận gốc còn câu trả lời → giữ chỗ "đã bị xoá" để chuỗi trả lời không mất ngữ cảnh
    c.deleted = true;
    c.body = '';
    await c.save();
  } else {
    await Comment.deleteOne({ _id: c._id });
    if (c.parent) {
      const p = await Comment.findByIdAndUpdate(c.parent, { $inc: { replyCount: -1 } }, { returnDocument: 'after' });
      // câu trả lời cuối cùng của một bình luận gốc đã xoá → dọn luôn chỗ giữ
      if (p?.deleted && p.replyCount <= 0) await Comment.deleteOne({ _id: p._id });
    }
  }
  await Notification.deleteMany({ comment: c._id });
  // nội dung đã mất → các báo cáo đang chờ về bình luận này tự đóng
  await Report.updateMany({ targetType: 'comment', target: c._id, status: 'open' }, { status: 'resolved', resolution: 'gone', handledAt: new Date() });
  if (removed) await Design.updateOne({ _id: c.design, commentCount: { $gte: removed } }, { $inc: { commentCount: -removed } });
  res.json({ ok: true, soft: c.deleted });
});

// ═══ BÁO CÁO ════════════════════════════════════════════════════════════════════════════════════════
communityRouter.post('/reports', requireAuth, actionLimiter, async (req, res) => {
  const { targetType, targetId, reason } = req.body ?? {};
  if (!['design', 'comment'].includes(targetType)) throw bad('Loại nội dung không hợp lệ');
  if (!['spam', 'offensive', 'copyright', 'other'].includes(reason)) throw bad('Hãy chọn lý do báo cáo');
  const note = req.body?.note ? readMultiline(req.body.note, { max: 500, label: 'Ghi chú' }) : '';
  let designId;
  if (targetType === 'comment') {
    const c = await Comment.findById(readObjectId(targetId));
    if (!c || c.deleted || c.modRemoved) throw new HttpError(404, 'Không tìm thấy bình luận');
    if (c.author.equals(req.user._id)) throw bad('Bạn không thể báo cáo bình luận của chính mình');
    designId = c.design;
  } else designId = readObjectId(targetId);
  const { d, mine } = await viewable(req, String(designId), { owner: 1, visibility: 1, lastVersion: 1 });
  if (targetType === 'design' && mine) throw bad('Bạn không thể báo cáo thiết kế của chính mình');
  try {
    await Report.create({ reporter: req.user._id, targetType, target: targetType === 'design' ? d._id : targetId, design: d._id, reason, note });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'Bạn đã báo cáo nội dung này rồi – quản trị viên sẽ xem xét.');
    throw e;
  }
  res.status(201).json({ ok: true });
});

// ═══ HỒ SƠ CÔNG KHAI ════════════════════════════════════════════════════════════════════════════════
async function profileUser(handle) {
  const h = typeof handle === 'string' ? handle.toLowerCase().replace(/^@/, '') : '';
  const u = h ? await User.findOne({ handle: h }, { ...AUTHOR_FIELDS, bio: 1, createdAt: 1, lockedAt: 1 }) : null;
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng');
  if (u.lockedAt) throw new HttpError(404, 'Tài khoản này đang bị tạm khoá', 'LOCKED');
  return u;
}

communityRouter.get('/public/users/:handle', async (req, res) => {
  const u = await profileUser(req.params.handle);
  const [stats] = await Design.aggregate([{ $match: { ...PUBLIC, owner: u._id } }, { $group: { _id: null, designs: { $sum: 1 }, likes: { $sum: '$likeCount' } } }]);
  res.json({
    user: { ...authorInfo(u), bio: u.bio ?? '', joinedAt: u.createdAt, isMe: !!(req.user && req.user._id.equals(u._id)) },
    stats: { designs: stats?.designs ?? 0, likes: stats?.likes ?? 0 },
  });
});

communityRouter.get('/public/users/:handle/designs', async (req, res) => {
  const u = await profileUser(req.params.handle);
  const page = pageOf(req.query.page);
  const filter = { ...PUBLIC, owner: u._id };
  const [list, total] = await Promise.all([
    Design.find(filter, CARD_FIELDS).sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    Design.countDocuments(filter),
  ]);
  res.json({ items: await cards(req, list), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
});

communityRouter.get('/public/users/:handle/liked', async (req, res) => {
  const u = await profileUser(req.params.handle);
  const page = pageOf(req.query.page);
  // các lượt thích của người này, chỉ lấy thiết kế đang công khai, mới thích trước
  const rows = await Like.aggregate([
    { $match: { user: u._id } },
    { $sort: { createdAt: -1 } },
    { $lookup: { from: 'designs', localField: 'design', foreignField: '_id', as: 'd' } },
    { $unwind: '$d' },
    { $match: { 'd.visibility': 'public', 'd.lastVersion': { $gt: 0 }, 'd.ownerLocked': { $ne: true }, 'd.modHidden': null } },
    { $project: { 'd.config': 0 } },
    { $facet: { items: [{ $skip: (page - 1) * PAGE }, { $limit: PAGE }], total: [{ $count: 'n' }] } },
  ]);
  const list = rows[0].items.map((r) => r.d);
  const total = rows[0].total[0]?.n ?? 0;
  res.json({ items: await cards(req, list), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
});

const SYSTEM_ACTOR = { id: null, displayName: 'Quản trị viên NGK', handle: null, avatarUrl: null, system: true };
const requestOut = (r) => ({ id: String(r._id), status: accessStatus(r), expiresAt: r.expiresAt ?? null });

// ═══ THÔNG BÁO ══════════════════════════════════════════════════════════════════════════════════════
communityRouter.get('/notifications/unread-count', requireAuth, async (req, res) => {
  res.json({ count: await Notification.countDocuments({ user: req.user._id, read: false }) });
});

communityRouter.get('/notifications', requireAuth, async (req, res) => {
  const list = await Notification.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(40);
  const users = await authors(list.flatMap((n) => n.actors));
  const designs = await Design.find({ _id: { $in: list.map((n) => n.design) } }, { name: 1, thumbnail: 1, type: 1, savedType: 1 });
  const dmap = new Map(designs.map((d) => [String(d._id), d]));
  const requests = await AccessRequest.find({ _id: { $in: list.map((n) => n.request).filter(Boolean) } });
  const rmap = new Map(requests.map((r) => [String(r._id), r]));
  const designOut = (n) => {
    const d = dmap.get(String(n.design));
    if (!d) return null;
    // gửi quản trị viên về thiết kế RIÊNG TƯ của người khác → không lộ tên / ảnh
    if (n.type === 'access-result') return { id: String(d._id), type: d.savedType ?? d.type, masked: true };
    return { id: String(d._id), name: d.name, thumbnailUrl: thumbUrl(d.thumbnail), type: d.savedType ?? d.type };
  };
  res.json({
    items: list.map((n) => ({
      id: String(n._id),
      type: n.type,
      read: n.read,
      at: n.updatedAt,
      kind: n.kind ?? null,
      // kiểm duyệt / NGK chọn: hiện là "Quản trị viên NGK" (không lộ tên quản trị viên cụ thể)
      actors: n.type === 'moderation' || n.type === 'featured' ? [SYSTEM_ACTOR] : n.actors.map((a) => users.get(String(a)) ?? authorInfo(null)),
      actorCount: n.actorCount,
      design: designOut(n),
      commentId: n.comment ? String(n.comment) : null,
      remixId: n.remix ? String(n.remix) : null,
      preview: n.preview,
      reason: n.reason ?? '',
      request: n.request && rmap.has(String(n.request)) ? requestOut(rmap.get(String(n.request))) : null,
    })),
    unread: await Notification.countDocuments({ user: req.user._id, read: false }),
  });
});

communityRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  // timestamps: false → giữ nguyên thời điểm của thông báo (đánh dấu đã đọc không đưa nó lên đầu danh sách)
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true }, { timestamps: false });
  res.json({ ok: true });
});

communityRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  await Notification.updateOne({ _id: readObjectId(req.params.id), user: req.user._id }, { read: true }, { timestamps: false });
  res.json({ ok: true });
});

// ═══ TRANG CHỦ: số liệu cộng đồng + nhà thiết kế nổi bật ═══════════════════════════════════════════
communityRouter.get('/public/stats', async (req, res) => {
  const [members, agg] = await Promise.all([
    User.countDocuments({ lockedAt: null }),
    Design.aggregate([{ $match: PUBLIC }, { $group: { _id: null, designs: { $sum: 1 }, likes: { $sum: '$likeCount' }, comments: { $sum: '$commentCount' }, remixes: { $sum: '$remixCount' } } }]),
  ]);
  const a = agg[0] ?? {};
  res.json({ members, designs: a.designs ?? 0, likes: a.likes ?? 0, comments: a.comments ?? 0, remixes: a.remixes ?? 0 });
});

/** Nhà thiết kế nổi bật: tổng lượt thích trên các thiết kế công khai (kèm 3 thiết kế được thích nhất). */
communityRouter.get('/public/designers', async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number.parseInt(req.query.limit, 10) || 6));
  const rows = await Design.aggregate([
    { $match: PUBLIC },
    { $sort: { likeCount: -1, publishedAt: -1 } },
    { $group: { _id: '$owner', likes: { $sum: '$likeCount' }, designs: { $sum: 1 }, top: { $push: { id: '$_id', name: '$name', thumbnail: '$thumbnail' } } } },
    { $sort: { likes: -1, designs: -1, _id: 1 } },
    { $limit: limit },
    { $project: { likes: 1, designs: 1, top: { $slice: ['$top', 3] } } },
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) } }, { ...AUTHOR_FIELDS, bio: 1 });
  const umap = new Map(users.map((u) => [String(u._id), u]));
  res.json({
    items: rows
      .filter((r) => umap.has(String(r._id)))
      .map((r) => {
        const u = umap.get(String(r._id));
        return {
          user: { ...authorInfo(u), bio: u.bio ?? '' },
          likes: r.likes,
          designs: r.designs,
          top: r.top.map((t) => ({ id: String(t.id), name: t.name, thumbnailUrl: thumbUrl(t.thumbnail) })),
        };
      }),
  });
});
