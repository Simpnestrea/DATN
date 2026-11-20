// API THIẾT KẾ: /api/designs/* (bắt buộc đăng nhập, chỉ thao tác trên thiết kế của chính mình)
// - config hiện tại (bản nháp, tự đồng bộ) nằm trong Design; mỗi lần bấm Lưu = 1 Version (giữ 20 bản gần nhất)
// - revision: tăng sau mỗi lần ghi; trình duyệt gửi kèm revision nó đang giữ → khác nhau = tab/máy khác đã sửa (409)
// - chia sẻ (GĐ3): người khác chỉ thấy PHIÊN BẢN ĐÃ LƯU GẦN NHẤT, không bao giờ thấy bản nháp
import { Router } from 'express';
import { TYPE_CODES, parseConfig } from '@ngk/shared';
import { config } from '../config.js';
import { HttpError, bad, escapeRegex, fold, readImage, readMultiline, readObjectId, readText } from '../lib.js';
import { catalogLookup } from '../catalog.js';
import { AccessRequest, Comment, Design, Image, Like, Notification, Report, Version } from '../models.js';
import { requireAuth } from '../security.js';

export const designRouter = Router();
designRouter.use(requireAuth);

export const DEFAULT_NAME = 'Thiết kế chưa đặt tên';

export function readConfig(raw) {
  if (raw === undefined) throw bad('Thiếu dữ liệu thiết kế');
  const bytes = Buffer.byteLength(JSON.stringify(raw) ?? '');
  if (bytes > config.maxConfigBytes) throw new HttpError(413, 'Thiết kế quá lớn để lưu');
  // kiểm tra + chuẩn hoá y hệt trình duyệt (dùng chung @ngk/shared), theo danh mục hiện tại (đá mới thêm vẫn đúng loại)
  const parsed = parseConfig(raw, catalogLookup());
  if (!parsed.ok) throw bad(parsed.error, 'BAD_CONFIG');
  return parsed.config;
}
const readName = (v) => (v === undefined ? undefined : readText(v, { max: 80, label: 'Tên thiết kế' }) || DEFAULT_NAME);
const readNote = (v) => (v === undefined || v === null ? '' : readText(v, { max: 200, label: 'Ghi chú' }));
const readRevision = (v) => {
  if (!Number.isInteger(v) || v < 1) throw bad('Thiếu số phiên bản đang sửa (revision)');
  return v;
};

export const thumbUrl = (id) => (id ? `/api/images/${id}` : null);
export const remixCredit = (r) =>
  r?.design ? { designId: String(r.design), name: r.name, ownerName: r.ownerName, ownerHandle: r.ownerHandle ?? null } : null;
export const summary = (d) => ({
  id: String(d._id),
  name: d.name,
  type: d.type,
  thumbnailUrl: thumbUrl(d.thumbnail),
  revision: d.revision,
  versionCount: d.versionCount,
  lastSavedAt: d.lastSavedAt,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  // chia sẻ
  visibility: d.visibility,
  description: d.description ?? '',
  allowRemix: d.allowRemix !== false,
  allowComments: d.allowComments !== false,
  publishedAt: d.publishedAt ?? null,
  likeCount: d.likeCount ?? 0,
  remixCount: d.remixCount ?? 0,
  commentCount: d.commentCount ?? 0,
  remixOf: remixCredit(d.remixOf),
  // quản trị viên: đang bị ẩn khỏi cộng đồng (lý do) / được NGK chọn
  hidden: d.modHidden ? { at: d.modHidden.at, reason: d.modHidden.reason ?? '' } : null,
  featured: !!d.featuredAt,
});
const full = (d) => ({ ...summary(d), config: d.config });

async function ownDesign(req, projection) {
  const d = await Design.findOne({ _id: readObjectId(req.params.id), owner: req.user._id }, projection);
  if (!d) throw new HttpError(404, 'Không tìm thấy thiết kế');
  return d;
}

export async function checkQuota(userId) {
  if ((await Design.countDocuments({ owner: userId })) >= config.maxDesignsPerUser) {
    throw bad(`Tối đa ${config.maxDesignsPerUser} thiết kế mỗi tài khoản – hãy xoá bớt thiết kế cũ.`);
  }
}

/**
 * Giữ 20 phiên bản gần nhất: xoá các bản cũ hơn, kèm ảnh của chúng nếu không còn phiên bản nào (hay ảnh hiện tại của thiết
 * kế – `currentThumb`) dùng tới. @returns số phiên bản còn lại
 */
async function pruneVersions(designId, currentThumb) {
  const old = await Version.find({ design: designId }, { _id: 1, thumbnail: 1 }).sort({ n: -1 }).skip(config.maxVersions);
  if (old.length) {
    await Version.deleteMany({ _id: { $in: old.map((v) => v._id) } });
    const keep = await Version.distinct('thumbnail', { design: designId });
    const imgs = old.map((v) => v.thumbnail).filter((t) => t && !(currentThumb && t.equals(currentThumb)) && !keep.some((k) => k?.equals(t)));
    if (imgs.length) await Image.deleteMany({ _id: { $in: imgs } });
  }
  return Version.countDocuments({ design: designId });
}

/** Phiên bản mới (đánh số tiếp theo) rồi tỉa bớt bản cũ. */
async function addVersion(design, { config: cfg, name, note, thumbnail }) {
  const n = design.lastVersion + 1;
  await Version.create({ design: design._id, owner: design.owner, n, name, note, config: cfg, thumbnail });
  return { n, count: await pruneVersions(design._id, thumbnail) };
}

/**
 * Tạo thiết kế mới kèm phiên bản 1 (dùng cho: lưu lần đầu, nhân bản, remix).
 * @param image { mime, data } ảnh đại diện (đã kiểm tra) hoặc null
 */
export async function createDesign({ owner, name, config: cfg, note = '', image = null, remixOf = null }) {
  const design = new Design({ owner, name, nameNorm: fold(name), type: cfg.type, savedType: cfg.type, config: cfg, lastSavedAt: new Date(), remixOf });
  if (image) design.thumbnail = (await Image.create({ owner, kind: 'thumb', design: design._id, mime: image.mime, data: image.data, size: image.data.length }))._id;
  const v = await addVersion(design, { config: cfg, name, note, thumbnail: design.thumbnail });
  design.lastVersion = v.n;
  design.versionCount = v.count;
  await design.save();
  return { design, version: v.n };
}

/** Xoá thiết kế và mọi thứ gắn với nó (phiên bản, ảnh, lượt thích, bình luận, thông báo, báo cáo). */
export async function deleteDesignCascade(d) {
  await Promise.all([
    Version.deleteMany({ design: d._id }),
    Image.deleteMany({ design: d._id }),
    Like.deleteMany({ design: d._id }),
    Comment.deleteMany({ design: d._id }),
    Notification.deleteMany({ $or: [{ design: d._id }, { remix: d._id }] }),
    Report.deleteMany({ design: d._id }),
    AccessRequest.deleteMany({ design: d._id }),
  ]);
  await Design.deleteOne({ _id: d._id });
  // bản remix bị xoá → bớt 1 lượt remix của bản gốc (ghi công của các bản remix KHÁC vẫn giữ nguyên)
  if (d.remixOf?.design) await Design.updateOne({ _id: d.remixOf.design, remixCount: { $gt: 0 } }, { $inc: { remixCount: -1 } });
}

// ── danh sách ─────────────────────────────────────────────────────────────────────────────────────
designRouter.get('/', async (req, res) => {
  const filter = { owner: req.user._id };
  const q = typeof req.query.q === 'string' ? fold(req.query.q).trim().slice(0, 80) : '';
  if (q) filter.nameNorm = { $regex: escapeRegex(q) };
  if (typeof req.query.type === 'string' && TYPE_CODES.includes(req.query.type)) filter.type = req.query.type;
  const sorts = { updated: { updatedAt: -1 }, created: { createdAt: -1 }, name: { nameNorm: 1, _id: 1 } };
  const sort = sorts[req.query.sort] ?? sorts.updated;
  const limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [items, total] = await Promise.all([
    Design.find(filter, { config: 0 }).sort(sort).skip((page - 1) * limit).limit(limit),
    Design.countDocuments(filter),
  ]);
  res.json({ items: items.map(summary), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

// ── tạo mới (lần Lưu đầu tiên của một thiết kế) ───────────────────────────────────────────────────
designRouter.post('/', async (req, res) => {
  await checkQuota(req.user._id);
  const cfg = readConfig(req.body?.config);
  const name = readName(req.body?.name) ?? DEFAULT_NAME;
  const note = readNote(req.body?.note);
  const image = req.body?.thumbnail ? readImage(req.body.thumbnail) : null;
  // tách ra từ một thiết kế KHÁC CỦA CHÍNH MÌNH (ví dụ "Lưu thành thiết kế mới" khi xung đột) → giữ ghi công remix của nó.
  // Không nhận ghi công gửi thẳng từ trình duyệt (tránh tự khai ghi công giả).
  let remixOf = null;
  if (req.body?.fromDesign) {
    const src = await Design.findOne({ _id: readObjectId(req.body.fromDesign), owner: req.user._id }, { remixOf: 1 });
    remixOf = src?.remixOf ?? null;
  }
  const { design, version } = await createDesign({ owner: req.user._id, name, config: cfg, note, image, remixOf });
  res.status(201).json({ design: full(design), version });
});

designRouter.get('/:id', async (req, res) => {
  res.json({ design: full(await ownDesign(req)) });
});

// ── đồng bộ nháp (không tạo phiên bản) ────────────────────────────────────────────────────────────
designRouter.put('/:id/draft', async (req, res) => {
  const id = readObjectId(req.params.id);
  const cfg = readConfig(req.body?.config);
  const revision = readRevision(req.body?.revision);
  const name = readName(req.body?.name);
  const set = { config: cfg, type: cfg.type, ...(name ? { name, nameNorm: fold(name) } : {}) };
  const d = await Design.findOneAndUpdate({ _id: id, owner: req.user._id, revision }, { $set: set, $inc: { revision: 1 } }, { returnDocument: 'after', projection: { config: 0 } });
  if (!d) await conflictOr404(req, id);
  res.json({ design: summary(d) });
});

async function conflictOr404(req, id) {
  const cur = await Design.findOne({ _id: id, owner: req.user._id }, { revision: 1, updatedAt: 1 });
  if (!cur) throw new HttpError(404, 'Không tìm thấy thiết kế');
  const e = new HttpError(409, 'Thiết kế này vừa được sửa ở tab hoặc máy khác.', 'CONFLICT');
  e.extra = { revision: cur.revision, updatedAt: cur.updatedAt };
  throw e;
}

// ── lưu phiên bản ─────────────────────────────────────────────────────────────────────────────────
designRouter.post('/:id/versions', async (req, res) => {
  const id = readObjectId(req.params.id);
  const cfg = readConfig(req.body?.config);
  const revision = readRevision(req.body?.revision);
  const note = readNote(req.body?.note);
  const nameIn = readName(req.body?.name);
  const design = await Design.findOne({ _id: id, owner: req.user._id }, { config: 0 });
  if (!design) throw new HttpError(404, 'Không tìm thấy thiết kế');
  if (design.revision !== revision) await conflictOr404(req, id);
  const name = nameIn ?? design.name;
  const image = req.body?.thumbnail ? readImage(req.body.thumbnail) : null;
  const thumbnail = image
    ? (await Image.create({ owner: req.user._id, kind: 'thumb', design: id, mime: image.mime, data: image.data, size: image.data.length }))._id
    : design.thumbnail;
  // giữ chỗ trước (điều kiện revision) → 2 lần lưu song song không cùng lúc tạo phiên bản
  const locked = await Design.findOneAndUpdate(
    { _id: id, owner: req.user._id, revision },
    {
      $set: { config: cfg, type: cfg.type, savedType: cfg.type, name, nameNorm: fold(name), thumbnail, lastSavedAt: new Date() },
      $inc: { revision: 1, lastVersion: 1 },
    },
    { returnDocument: 'after', projection: { config: 0 } },
  );
  if (!locked) {
    // tab / máy khác vừa lưu trước → ảnh vừa tạo cho lần lưu này không ai dùng: xoá luôn (không để ảnh mồ côi trong CSDL)
    if (image) await Image.deleteOne({ _id: thumbnail });
    await conflictOr404(req, id);
  }
  const n = locked.lastVersion;
  await Version.create({ design: id, owner: req.user._id, n, name, note, config: cfg, thumbnail });
  locked.versionCount = await pruneVersions(id, thumbnail);
  await Design.updateOne({ _id: id }, { versionCount: locked.versionCount });
  res.status(201).json({ design: summary(locked), version: n });
});

designRouter.get('/:id/versions', async (req, res) => {
  const d = await ownDesign(req, { _id: 1 });
  const list = await Version.find({ design: d._id }, { config: 0 }).sort({ n: -1 });
  res.json({
    items: list.map((v) => ({ n: v.n, name: v.name, note: v.note, thumbnailUrl: thumbUrl(v.thumbnail), createdAt: v.createdAt })),
  });
});

designRouter.get('/:id/versions/:n', async (req, res) => {
  const d = await ownDesign(req, { _id: 1 });
  const n = Number.parseInt(req.params.n, 10);
  const v = Number.isInteger(n) ? await Version.findOne({ design: d._id, n }) : null;
  if (!v) throw new HttpError(404, 'Không tìm thấy phiên bản');
  res.json({ version: { n: v.n, name: v.name, note: v.note, config: v.config, thumbnailUrl: thumbUrl(v.thumbnail), createdAt: v.createdAt } });
});

// ── CHIA SẺ: chế độ hiển thị, mô tả, cho phép remix / bình luận ────────────────────────────────────
designRouter.patch('/:id/sharing', async (req, res) => {
  const d = await ownDesign(req, { config: 0 });
  const b = req.body ?? {};
  if (b.visibility !== undefined) {
    if (!['private', 'unlisted', 'public'].includes(b.visibility)) throw bad('Chế độ hiển thị không hợp lệ');
    if (b.visibility !== 'private') {
      if (d.modHidden) {
        throw new HttpError(403, 'Thiết kế đang bị quản trị viên ẩn khỏi cộng đồng – chưa chia sẻ lại được cho tới khi quản trị viên hiện lại.', 'MOD_HIDDEN');
      }
      if (!req.user.emailVerified) throw new HttpError(403, 'Hãy xác minh email trước khi chia sẻ thiết kế.', 'EMAIL_UNVERIFIED');
      if (!d.lastVersion) throw bad('Hãy Lưu thiết kế ít nhất một lần trước khi chia sẻ.');
    }
    // lần chuyển sang Công khai → tính là "mới đăng" ở Khám phá
    if (b.visibility === 'public' && d.visibility !== 'public') d.publishedAt = new Date();
    d.visibility = b.visibility;
  }
  if (b.description !== undefined) d.description = b.description === null ? '' : readMultiline(b.description, { max: 500, label: 'Mô tả' });
  for (const k of ['allowRemix', 'allowComments']) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== 'boolean') throw bad('Giá trị không hợp lệ');
    d[k] = b[k];
  }
  await d.save();
  res.json({ design: summary(d) });
});

// ── đổi tên / nhân bản / xoá ──────────────────────────────────────────────────────────────────────
designRouter.patch('/:id', async (req, res) => {
  const name = readName(req.body?.name) ?? DEFAULT_NAME;
  const d = await Design.findOneAndUpdate(
    { _id: readObjectId(req.params.id), owner: req.user._id },
    { $set: { name, nameNorm: fold(name) }, $inc: { revision: 1 } },
    { returnDocument: 'after', projection: { config: 0 } },
  );
  if (!d) throw new HttpError(404, 'Không tìm thấy thiết kế');
  res.json({ design: summary(d) });
});

designRouter.post('/:id/duplicate', async (req, res) => {
  await checkQuota(req.user._id);
  const src = await ownDesign(req);
  const name = [...`${src.name} (bản sao)`].slice(0, 80).join('');
  const img = src.thumbnail ? await Image.findById(src.thumbnail) : null;
  const { design } = await createDesign({
    owner: req.user._id,
    name,
    config: src.config,
    note: `Nhân bản từ “${src.name}”`,
    image: img ? { mime: img.mime, data: img.data } : null,
    remixOf: src.remixOf ?? null, // bản sao của một bản remix vẫn giữ ghi công tác giả gốc
  });
  res.status(201).json({ design: summary(design) });
});

designRouter.delete('/:id', async (req, res) => {
  const d = await ownDesign(req, { _id: 1, remixOf: 1 });
  await deleteDesignCascade(d);
  res.json({ ok: true });
});
