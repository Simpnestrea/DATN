// KIỂM THỬ QUẢN TRỊ – PHẦN 4b: hàng chờ báo cáo, ẩn / hiện lại thiết kế, gỡ / khôi phục bình luận, "NGK chọn",
// duyệt thiết kế & bình luận, xin quyền xem thiết kế RIÊNG TƯ (chủ đồng ý / từ chối / thu hồi, hết hạn 7 ngày).
import './env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createDefaultConfig } from '@ngk/shared';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { AccessRequest, AdminLog, Comment, Design, Notification, Report, User } from '../src/models.js';
import { grantAdmin } from '../src/adminLog.js';

const app = createApp();
const H = { 'X-NGK': '1', Origin: 'http://localhost:5173' };
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');

const browser = () => {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set(H);
  return { agent, get: (u) => agent.get(u), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
};
const guest = () => browser();
let seq = 0;
async function user({ name } = {}) {
  const b = browser();
  const email = `m${++seq}@ngk.vn`;
  const r = await b.post('/api/auth/register').send({ email, password: 'matkhau123', displayName: name ?? `Thành viên ${seq}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await b.post('/api/auth/verify-email').send({ token: new URL(r.body.devLink).searchParams.get('token') });
  const me = (await b.get('/api/auth/me')).body.user;
  return Object.assign(b, { me });
}
async function admin(name = 'Kiểm Duyệt Viên') {
  const a = await user({ name });
  await grantAdmin(a.me.email, 'Kiểm thử');
  return a;
}
async function design(b, { name = 'Nhẫn thử', visibility = 'public' } = {}) {
  const r = await b.post('/api/designs').send({ name, config: createDefaultConfig('ring'), thumbnail: PNG });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (visibility !== 'private') assert.equal((await b.patch(`/api/designs/${r.body.design.id}/sharing`).send({ visibility })).status, 200);
  return r.body.design;
}
const comment = async (b, designId, body, parentId) => (await b.post(`/api/designs/${designId}/comments`).send({ body, ...(parentId ? { parentId } : {}) })).body.comment;
const explore = async (q) => (await guest().get(`/api/public/designs?q=${encodeURIComponent(q)}`)).body.items;
const notifs = async (b) => (await b.get('/api/notifications')).body.items;

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('hàng chờ báo cáo', () => {
  test('gộp theo nội dung, đếm lý do, ghi chú; số trên thanh bên; bỏ qua → đóng hết + ghi nhật ký', async () => {
    const a = await admin();
    const owner = await user({ name: 'Chủ Bị Báo Cáo' });
    const d = await design(owner, { name: 'Nhẫn bị báo cáo nhiều' });
    const r1 = await user();
    const r2 = await user();
    const r3 = await user();
    await r1.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'spam', note: 'Quảng cáo trá hình' });
    await r2.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'spam' });
    await r3.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'copyright', note: 'Giống hệt mẫu của tôi' });
    const c = await comment(owner, d.id, 'Bình luận gây tranh cãi');
    await r1.post('/api/reports').send({ targetType: 'comment', targetId: c.id, reason: 'offensive' });
    const s = (await a.get('/api/admin/summary')).body;
    assert.equal(s.openReports, 4);
    assert.equal(s.openTargets, 2);
    const q = (await a.get('/api/admin/reports')).body;
    assert.equal(q.items.length, 2);
    const g = q.items[0];
    assert.equal(g.targetType, 'design', 'nhiều báo cáo nhất đứng đầu');
    assert.equal(g.count, 3);
    assert.deepEqual(g.reasons, [{ reason: 'spam', count: 2 }, { reason: 'copyright', count: 1 }]);
    assert.deepEqual(g.notes.map((n) => n.note).sort(), ['Giống hệt mẫu của tôi', 'Quảng cáo trá hình']);
    assert.equal(g.target.name, 'Nhẫn bị báo cáo nhiều');
    assert.equal(g.target.owner.displayName, 'Chủ Bị Báo Cáo');
    const cg = q.items[1];
    assert.equal(cg.target.body, 'Bình luận gây tranh cãi');
    assert.equal(cg.target.design.name, 'Nhẫn bị báo cáo nhiều');
    // bỏ qua báo cáo về thiết kế
    const dis = await a.post('/api/admin/reports/close').send({ targetType: 'design', targetId: d.id, resolution: 'dismiss', note: 'Không vi phạm' });
    assert.equal(dis.status, 200);
    assert.equal(dis.body.closed, 3);
    assert.equal((await a.post('/api/admin/reports/close').send({ targetType: 'design', targetId: d.id, resolution: 'dismiss' })).status, 409);
    assert.equal(await Report.countDocuments({ target: d.id, status: 'dismissed', resolution: 'dismiss' }), 3);
    assert.equal((await a.get('/api/admin/summary')).body.openTargets, 1);
    const log = await AdminLog.findOne({ action: 'report.dismiss', target: d.id });
    assert.equal(log.reason, 'Không vi phạm');
    assert.equal(log.meta.reports, 3);
    const handled = (await a.get('/api/admin/reports?status=handled')).body.items;
    assert.equal(handled.length, 3);
    assert.ok(handled.every((h) => h.resolution === 'dismiss' && h.handledBy === 'Kiểm Duyệt Viên'));
    // người viết tự xoá bình luận bị báo cáo → báo cáo tự đóng (không còn trong hàng chờ)
    await owner.del(`/api/comments/${c.id}`);
    assert.equal((await a.get('/api/admin/summary')).body.openTargets, 0);
    assert.equal((await Report.findOne({ target: c.id })).resolution, 'gone');
  });

  test('khoá người đăng ngay từ hàng chờ → đóng luôn báo cáo của nội dung đó', async () => {
    const a = await admin();
    const bad = await user({ name: 'Kẻ Spam' });
    const d = await design(bad, { name: 'Spam spam' });
    const r = await user();
    await r.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'spam' });
    const lock = await a.post(`/api/admin/users/${bad.me.id}/lock`).send({ reason: 'Spam nhiều lần', closeReports: { targetType: 'design', targetId: d.id } });
    assert.equal(lock.status, 200);
    assert.equal(lock.body.closedReports, 1);
    assert.equal((await Report.findOne({ target: d.id })).resolution, 'lock');
  });
});

describe('ẩn / hiện lại thiết kế', () => {
  test('ẩn: biến mất khỏi cộng đồng, chủ vẫn mở (thấy lý do), không công khai lại được; báo cáo đóng; thông báo; hiện lại', async () => {
    const a = await admin();
    const owner = await user({ name: 'Chủ Thiết Kế Ẩn' });
    const d = await design(owner, { name: 'Nhẫn vi phạm bản quyền' });
    const other = await user();
    await other.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'copyright' });
    await a.post(`/api/admin/designs/${d.id}/feature`);
    assert.equal((await a.post(`/api/admin/designs/${d.id}/hide`).send({ reason: 'x' })).status, 400);
    const hide = await a.post(`/api/admin/designs/${d.id}/hide`).send({ reason: 'Sao chép thiết kế của người khác' });
    assert.equal(hide.status, 200);
    assert.equal(hide.body.closedReports, 1);
    assert.equal((await a.post(`/api/admin/designs/${d.id}/hide`).send({ reason: 'lần nữa' })).status, 409);
    // cộng đồng: không thấy ở đâu cả
    assert.equal((await explore('vi pham ban quyen')).length, 0);
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).status, 404);
    assert.equal((await other.post(`/api/designs/${d.id}/like`)).status, 404);
    assert.equal((await other.post(`/api/designs/${d.id}/remix`)).status, 404);
    assert.equal((await guest().get(`/api/public/users/${owner.me.handle}/designs`)).body.items.length, 0);
    // chủ: vẫn mở được + thấy lý do; "NGK chọn" bị gỡ; không chuyển lại Công khai / Có liên kết được
    const mine = (await owner.get(`/api/public/designs/${d.id}`)).body.design;
    assert.deepEqual([mine.moderation.hidden, mine.moderation.reason], [true, 'Sao chép thiết kế của người khác']);
    assert.equal(mine.featured, false);
    const own = (await owner.get(`/api/designs/${d.id}`)).body.design;
    assert.equal(own.hidden.reason, 'Sao chép thiết kế của người khác');
    const re = await owner.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'unlisted' });
    assert.equal(re.status, 403);
    assert.equal(re.body.code, 'MOD_HIDDEN');
    assert.equal((await owner.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'private' })).status, 200, 'chuyển riêng tư vẫn được');
    assert.equal((await owner.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'public' })).status, 403);
    // quản trị viên vẫn xem được để xét (khi thiết kế không riêng tư)
    await Design.updateOne({ _id: d.id }, { visibility: 'public' });
    assert.equal((await a.get(`/api/public/designs/${d.id}`)).status, 200);
    // thông báo cho chủ: người làm là "Quản trị viên NGK", kèm lý do
    const n = (await notifs(owner)).find((x) => x.type === 'moderation');
    assert.equal(n.kind, 'design-hidden');
    assert.equal(n.reason, 'Sao chép thiết kế của người khác');
    assert.equal(n.actors[0].displayName, 'Quản trị viên NGK');
    assert.equal(JSON.stringify(n).includes('Kiểm Duyệt Viên'), false, 'không lộ tên quản trị viên');
    // hiện lại
    assert.equal((await a.post(`/api/admin/designs/${d.id}/restore`).send({ note: 'Đã xác minh là bản gốc' })).status, 200);
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).status, 200);
    assert.equal((await explore('vi pham ban quyen')).length, 1);
    assert.equal((await owner.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'unlisted' })).status, 200);
    assert.equal((await notifs(owner)).filter((x) => x.type === 'moderation')[0].kind, 'design-restored');
    const logs = await AdminLog.find({ target: d.id }).sort({ createdAt: 1 });
    assert.deepEqual(logs.map((l) => l.action), ['design.feature', 'design.hide', 'design.restore']);
  });
});

describe('gỡ / khôi phục bình luận', () => {
  test('gỡ: mọi người thấy chỗ giữ, người viết biết lý do; số bình luận trừ đúng 1 lần; không trả lời / sửa / báo cáo được; khôi phục', async () => {
    const a = await admin();
    const owner = await user();
    const d = await design(owner, { name: 'Nơi có bình luận xấu' });
    const writer = await user({ name: 'Người Viết Bậy' });
    const bad = await comment(writer, d.id, 'Nội dung xúc phạm abc');
    await comment(owner, d.id, 'Trả lời lại', bad.id);
    await (await user()).post('/api/reports').send({ targetType: 'comment', targetId: bad.id, reason: 'offensive' });
    assert.equal((await Design.findById(d.id)).commentCount, 2);
    const rm = await a.post(`/api/admin/comments/${bad.id}/remove`).send({ reason: 'Ngôn từ xúc phạm' });
    assert.equal(rm.status, 200);
    assert.equal(rm.body.closedReports, 1);
    assert.equal((await Design.findById(d.id)).commentCount, 1);
    const pub = (await guest().get(`/api/public/designs/${d.id}/comments`)).body.items[0];
    assert.deepEqual([pub.removed, pub.body, pub.author, pub.removedReason], [true, '', null, undefined]);
    assert.equal(pub.replies.length, 1, 'trả lời vẫn còn (giữ mạch trò chuyện)');
    const mine = (await writer.get(`/api/public/designs/${d.id}/comments`)).body.items[0];
    assert.equal(mine.removedReason, 'Ngôn từ xúc phạm');
    assert.equal((await owner.post(`/api/designs/${d.id}/comments`).send({ body: 'trả lời', parentId: bad.id })).status, 404);
    assert.equal((await writer.patch(`/api/comments/${bad.id}`).send({ body: 'sửa lại' })).body.code, 'REMOVED');
    assert.equal((await owner.post('/api/reports').send({ targetType: 'comment', targetId: bad.id, reason: 'spam' })).status, 404);
    const n = (await notifs(writer)).find((x) => x.type === 'moderation');
    assert.equal(n.kind, 'comment-removed');
    assert.equal(n.preview, 'Nội dung xúc phạm abc');
    // khôi phục → hiện lại, đếm lại
    assert.equal((await a.post(`/api/admin/comments/${bad.id}/restore`).send({})).status, 200);
    assert.equal((await Design.findById(d.id)).commentCount, 2);
    assert.equal((await guest().get(`/api/public/designs/${d.id}/comments`)).body.items[0].body, 'Nội dung xúc phạm abc');
    // gỡ lần nữa rồi người viết tự xoá → không trừ số bình luận lần thứ hai
    await a.post(`/api/admin/comments/${bad.id}/remove`).send({ reason: 'Ngôn từ xúc phạm' });
    assert.equal((await Design.findById(d.id)).commentCount, 1);
    assert.equal((await writer.del(`/api/comments/${bad.id}`)).status, 200);
    assert.equal((await Design.findById(d.id)).commentCount, 1);
  });
});

describe('duyệt thiết kế & bình luận', () => {
  test('danh sách thiết kế: không bao giờ có thiết kế riêng tư; lọc đã ẩn / bị báo cáo / NGK chọn; tìm theo tác giả', async () => {
    const a = await admin();
    const t = await user({ name: 'Tác Giả Duyệt Thử' });
    const pub = await design(t, { name: 'Duyệt công khai' });
    const unl = await design(t, { name: 'Duyệt có liên kết', visibility: 'unlisted' });
    await design(t, { name: 'Duyệt riêng tư tuyệt mật', visibility: 'private' });
    let r = await a.get('/api/admin/designs?q=tac gia duyet thu');
    assert.deepEqual(r.body.items.map((x) => x.name).sort(), ['Duyệt công khai', 'Duyệt có liên kết'].sort());
    assert.equal(JSON.stringify((await a.get('/api/admin/designs')).body).includes('tuyệt mật'), false);
    await (await user()).post('/api/reports').send({ targetType: 'design', targetId: unl.id, reason: 'spam' });
    r = await a.get('/api/admin/designs?status=reported');
    assert.ok(r.body.items.some((x) => x.id === unl.id && x.openReports === 1));
    await a.post(`/api/admin/designs/${pub.id}/hide`).send({ reason: 'Thử ẩn' });
    r = await a.get('/api/admin/designs?status=hidden');
    assert.ok(r.body.items.some((x) => x.id === pub.id && x.hidden.reason === 'Thử ẩn'));
    r = await a.get('/api/admin/designs?status=visible&q=duyet');
    assert.equal(r.body.items.some((x) => x.id === pub.id), false);
  });
  test('danh sách bình luận: tìm không dấu, lọc đã gỡ; bỏ qua bình luận ở thiết kế riêng tư', async () => {
    const a = await admin();
    const o = await user();
    const d1 = await design(o, { name: 'Có bình luận' });
    const d2 = await design(o, { name: 'Sẽ thành riêng tư' });
    const w = await user({ name: 'Người Bình Luận' });
    const c1 = await comment(w, d1.id, 'Màu vàng hồng rất đẹp');
    await comment(w, d2.id, 'Bình luận ở thiết kế sắp riêng tư');
    await o.patch(`/api/designs/${d2.id}/sharing`).send({ visibility: 'private' });
    let r = await a.get('/api/admin/comments?q=mau vang hong');
    assert.deepEqual(r.body.items.map((x) => x.id), [c1.id]);
    assert.equal(r.body.items[0].author.displayName, 'Người Bình Luận');
    r = await a.get('/api/admin/comments?q=nguoi binh luan');
    assert.deepEqual(r.body.items.map((x) => x.id), [c1.id], 'bình luận ở thiết kế riêng tư không hiện');
    await a.post(`/api/admin/comments/${c1.id}/remove`).send({ reason: 'Thử gỡ' });
    r = await a.get('/api/admin/comments?status=removed');
    assert.ok(r.body.items.some((x) => x.id === c1.id && x.removed.reason === 'Thử gỡ' && x.body === 'Màu vàng hồng rất đẹp'));
  });
});

describe('NGK chọn', () => {
  test('chỉ thiết kế công khai; huy hiệu + lọc ở Khám phá; chủ nhận thông báo; bỏ chọn', async () => {
    const a = await admin();
    const o = await user({ name: 'Nhà Thiết Kế Giỏi' });
    const d = await design(o, { name: 'Kiệt tác vàng' });
    const u = await design(o, { name: 'Chỉ có liên kết', visibility: 'unlisted' });
    assert.equal((await a.post(`/api/admin/designs/${u.id}/feature`)).body.code, 'NOT_PUBLIC');
    assert.equal((await a.post(`/api/admin/designs/${d.id}/feature`)).status, 200);
    assert.equal((await a.post(`/api/admin/designs/${d.id}/feature`)).status, 409);
    const f = (await guest().get('/api/public/designs?featured=1')).body.items;
    assert.ok(f.length >= 1 && f.every((x) => x.featured) && f.some((x) => x.id === d.id));
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).body.design.featured, true);
    const n = (await notifs(o)).find((x) => x.type === 'featured');
    assert.equal(n.design.name, 'Kiệt tác vàng');
    assert.equal(n.actors[0].displayName, 'Quản trị viên NGK');
    assert.equal((await a.post(`/api/admin/designs/${d.id}/unfeature`)).status, 200);
    assert.equal((await guest().get('/api/public/designs?featured=1')).body.items.some((x) => x.id === d.id), false);
  });
});

describe('xin quyền xem thiết kế riêng tư', () => {
  test('quy tắc xin: chỉ thiết kế riêng tư, có lý do ≥ 10 ký tự, chủ không phải tài khoản mẫu / bị khoá, không gửi trùng', async () => {
    const a = await admin();
    const o = await user();
    const pub = await design(o, { name: 'Công khai' });
    const priv = await design(o, { name: 'Bí mật', visibility: 'private' });
    assert.equal((await a.post(`/api/admin/designs/${pub.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).body.code, 'NOT_PRIVATE');
    assert.equal((await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'ngắn' })).status, 400);
    assert.equal((await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).status, 201);
    assert.equal((await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).body.code, 'PENDING');
    const demoOwner = await user();
    const dd = await design(demoOwner, { visibility: 'private' });
    await User.updateOne({ _id: demoOwner.me.id }, { demo: true });
    assert.equal((await a.post(`/api/admin/designs/${dd.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).body.code, 'DEMO_OWNER');
    const lockedOwner = await user();
    const ld = await design(lockedOwner, { visibility: 'private' });
    await User.updateOne({ _id: lockedOwner.me.id }, { lockedAt: new Date() });
    assert.equal((await a.post(`/api/admin/designs/${ld.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).body.code, 'OWNER_LOCKED');
    // người thường không gọi được
    assert.equal((await o.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Kiểm tra báo cáo vi phạm' })).status, 404);
  });

  test('chủ đồng ý → admin xem (chỉ đọc, bản hiện tại, có nhật ký) trong 7 ngày; thu hồi / hết hạn → hết xem; từ chối', async () => {
    const a = await admin('Admin Xin Xem');
    const a2 = await admin('Admin Khác');
    const o = await user({ name: 'Chủ Riêng Tư' });
    const priv = await design(o, { name: 'Thiết kế bí mật nhất', visibility: 'private' });
    // bản nháp hiện tại khác phiên bản đã lưu → admin thấy bản hiện tại
    const draft = createDefaultConfig('ring');
    draft.size.ringSize = 17;
    const cur = (await o.get(`/api/designs/${priv.id}`)).body.design;
    assert.equal((await o.put(`/api/designs/${priv.id}/draft`).send({ config: draft, revision: cur.revision })).status, 200);

    // trước khi đồng ý: chi tiết người dùng che tên; xem → 403
    let det = (await a.get(`/api/admin/users/${o.me.id}`)).body.designs.find((x) => x.id === priv.id);
    assert.deepEqual([det.masked, det.name, det.access], [true, undefined, null]);
    assert.equal((await a.get(`/api/admin/designs/${priv.id}/view`)).body.code, 'NO_GRANT');
    const req1 = (await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Hỗ trợ người dùng sửa lỗi hiển thị' })).body.request;
    det = (await a.get(`/api/admin/users/${o.me.id}`)).body.designs.find((x) => x.id === priv.id);
    assert.equal(det.access.status, 'pending');
    assert.equal(det.name, undefined);

    // chủ: thông báo có yêu cầu (kèm trạng thái) + danh sách ở trang Tài khoản
    const n = (await notifs(o)).find((x) => x.type === 'access-request');
    assert.equal(n.actors[0].displayName, 'Admin Xin Xem');
    assert.equal(n.reason, 'Hỗ trợ người dùng sửa lỗi hiển thị');
    assert.equal(n.request.status, 'pending');
    assert.equal(n.design.name, 'Thiết kế bí mật nhất');
    const list = (await o.get('/api/account/access-requests')).body.items;
    assert.equal(list[0].id, req1.id);
    assert.equal(list[0].admin.displayName, 'Admin Xin Xem');
    // người khác không trả lời thay được
    assert.equal((await a2.post(`/api/account/access-requests/${req1.id}/approve`)).status, 404);
    assert.equal((await o.post(`/api/account/access-requests/${req1.id}/fly`)).status, 404);

    // đồng ý
    const ok = await o.post(`/api/account/access-requests/${req1.id}/approve`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.request.status, 'approved');
    const days = (new Date(ok.body.request.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days <= 7, `hết hạn sau 7 ngày (${days})`);
    assert.equal((await o.post(`/api/account/access-requests/${req1.id}/approve`)).status, 409);
    const view = await a.get(`/api/admin/designs/${priv.id}/view`);
    assert.equal(view.status, 200);
    assert.equal(view.body.design.name, 'Thiết kế bí mật nhất');
    assert.equal(view.body.design.config.size.ringSize, 17, 'thấy bản hiện tại (kể cả nháp)');
    assert.equal((await a2.get(`/api/admin/designs/${priv.id}/view`)).body.code, 'NO_GRANT', 'quyền chỉ của người xin');
    assert.equal(await AdminLog.countDocuments({ action: 'access.view', target: priv.id }), 1);
    det = (await a.get(`/api/admin/users/${o.me.id}`)).body.designs.find((x) => x.id === priv.id);
    assert.deepEqual([det.masked, det.name, det.access.status], [false, 'Thiết kế bí mật nhất', 'approved']);
    // admin nhận kết quả – KHÔNG kèm tên / ảnh thiết kế riêng tư
    const res1 = (await notifs(a)).find((x) => x.type === 'access-result');
    assert.equal(res1.kind, 'approved');
    assert.equal(res1.design.masked, true);
    assert.equal(JSON.stringify(res1).includes('bí mật'), false);
    assert.equal((await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Hỗ trợ người dùng sửa lỗi hiển thị' })).body.code, 'GRANTED');

    // thu hồi → hết xem ngay
    assert.equal((await o.post(`/api/account/access-requests/${req1.id}/revoke`)).status, 200);
    assert.equal((await a.get(`/api/admin/designs/${priv.id}/view`)).body.code, 'NO_GRANT');
    assert.equal((await notifs(a)).find((x) => x.type === 'access-result').kind, 'revoked');
    assert.equal((await o.post(`/api/account/access-requests/${req1.id}/revoke`)).status, 409);

    // xin lại → hết hạn tự nhiên
    const req2 = (await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Xin lại để kiểm tra lần hai' })).body.request;
    await o.post(`/api/account/access-requests/${req2.id}/approve`);
    assert.equal((await a.get(`/api/admin/designs/${priv.id}/view`)).status, 200);
    await AccessRequest.updateOne({ _id: req2.id }, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await a.get(`/api/admin/designs/${priv.id}/view`)).body.code, 'NO_GRANT');
    assert.equal((await o.get('/api/account/access-requests')).body.items.find((x) => x.id === req2.id).status, 'expired');

    // từ chối
    const req3 = (await a.post(`/api/admin/designs/${priv.id}/access-requests`).send({ reason: 'Xin lần ba để thử từ chối' })).body.request;
    assert.equal((await o.post(`/api/account/access-requests/${req3.id}/decline`)).body.request.status, 'declined');
    assert.equal((await a.get(`/api/admin/designs/${priv.id}/view`)).body.code, 'NO_GRANT');
    assert.equal((await notifs(a)).find((x) => x.type === 'access-result').kind, 'declined');
    // nhật ký: 3 lần xin, nhãn KHÔNG chứa tên thiết kế riêng tư
    const logs = await AdminLog.find({ action: 'access.request', target: priv.id });
    assert.equal(logs.length, 3);
    assert.ok(logs.every((l) => !l.targetLabel.includes('bí mật') && l.targetLabel.startsWith('Thiết kế riêng tư (Nhẫn)')));
    // xoá thiết kế → yêu cầu đi theo
    await o.del(`/api/designs/${priv.id}`);
    assert.equal(await AccessRequest.countDocuments({ design: priv.id }), 0);
    assert.equal(await Notification.countDocuments({ design: priv.id }), 0);
  });
});

describe('dữ liệu cũ', () => {
  test('bình luận tạo trước GĐ4 (chưa có chữ bỏ dấu) → được điền khi khởi động', async () => {
    const { migrate } = await import('../src/migrate.js');
    const o = await user();
    const d = await design(o);
    await Comment.collection.insertOne({ design: new mongoose.Types.ObjectId(d.id), author: new mongoose.Types.ObjectId(o.me.id), parent: null, body: 'Bình luận Cũ Có Dấu', deleted: false, replyCount: 0, createdAt: new Date(), updatedAt: new Date() });
    const r = await migrate();
    assert.ok(r.comments >= 1);
    assert.equal((await Comment.findOne({ body: 'Bình luận Cũ Có Dấu' })).norm, 'binh luan cu co dau');
  });
});
