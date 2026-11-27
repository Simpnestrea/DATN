// KIỂM THỬ QUẢN TRỊ – PHẦN 4a: quyền vào khu quản trị, cấp / thu quyền bằng lệnh, danh sách & chi tiết người dùng,
// khoá / mở khoá (và mọi hiệu ứng phụ), xoá tài khoản vĩnh viễn, nhật ký quản trị chỉ ghi thêm.
import './env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createDefaultConfig } from '@ngk/shared';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { AdminLog, Comment, Design, Notification, User } from '../src/models.js';
import { grantAdmin, revokeAdmin } from '../src/adminLog.js';

const app = createApp();
const H = { 'X-NGK': '1', Origin: 'http://localhost:5173' };
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');
const PASSWORD = 'matkhau123';

const browser = () => {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set(H);
  return { agent, get: (u) => agent.get(u), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
};
const guest = () => browser();
let seq = 0;
async function user({ verified = true, name } = {}) {
  const b = browser();
  const email = `q${++seq}@ngk.vn`;
  const r = await b.post('/api/auth/register').send({ email, password: PASSWORD, displayName: name ?? `Người dùng ${seq}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (verified) await b.post('/api/auth/verify-email').send({ token: new URL(r.body.devLink).searchParams.get('token') });
  const me = (await b.get('/api/auth/me')).body.user;
  return Object.assign(b, { me });
}
async function admin(name = 'Quản Trị Viên') {
  const a = await user({ name });
  await grantAdmin(a.me.email, 'Kiểm thử');
  return a;
}
async function design(b, { name = 'Nhẫn thử', visibility = 'public' } = {}) {
  const r = await b.post('/api/designs').send({ name, config: createDefaultConfig('ring'), thumbnail: PNG });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (visibility !== 'private') {
    const s = await b.patch(`/api/designs/${r.body.design.id}/sharing`).send({ visibility });
    assert.equal(s.status, 200, JSON.stringify(s.body));
  }
  return r.body.design;
}
const login = (email, password = PASSWORD) => guest().post('/api/auth/login').send({ email, password });

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('quyền vào khu quản trị', () => {
  test('khách → 401; người thường → 404 (không lộ là có API); admin → 200', async () => {
    assert.equal((await guest().get('/api/admin/summary')).status, 401);
    const u = await user();
    const r = await u.get('/api/admin/summary');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'Không tìm thấy API');
    assert.equal((await u.post('/api/admin/users/000000000000000000000000/lock').send({ reason: 'thử xem' })).status, 404);
    const a = await admin();
    const s = await a.get('/api/admin/summary');
    assert.equal(s.status, 200);
    assert.ok(s.body.users >= 2 && s.body.admins >= 1);
  });
  test('thu quyền bằng lệnh → có hiệu lực ngay ở yêu cầu kế tiếp (cùng phiên đăng nhập)', async () => {
    const a = await admin();
    assert.equal((await a.get('/api/admin/summary')).status, 200);
    const r = await revokeAdmin(a.me.email, 'Kiểm thử');
    assert.equal(r.changed, true);
    assert.equal((await a.get('/api/admin/summary')).status, 404);
    assert.equal((await revokeAdmin(a.me.email)).changed, false);
  });
  test('lệnh cấp quyền: email chưa đăng ký / tài khoản mẫu / bị khoá → từ chối; mỗi lần cấp, thu ghi nhật ký', async () => {
    await assert.rejects(grantAdmin('khongco@ngk.vn'), /Không có tài khoản/);
    const d = await user();
    await User.updateOne({ _id: d.me.id }, { demo: true });
    await assert.rejects(grantAdmin(d.me.email), /tài khoản mẫu/);
    const k = await user();
    await User.updateOne({ _id: k.me.id }, { lockedAt: new Date() });
    await assert.rejects(grantAdmin(k.me.email), /bị khoá/);
    const n = await user({ name: 'Ghi Nhật Ký' });
    await grantAdmin(n.me.email, 'Lệnh trên máy chủ (thử)');
    await revokeAdmin(n.me.email, 'Lệnh trên máy chủ (thử)');
    const logs = await AdminLog.find({ target: n.me.id }).sort({ createdAt: 1 });
    assert.deepEqual(logs.map((l) => l.action), ['admin.grant', 'admin.revoke']);
    assert.equal(logs[0].actor, null);
    assert.equal(logs[0].actorName, 'Lệnh trên máy chủ (thử)');
    assert.match(logs[0].targetLabel, /Ghi Nhật Ký \(q\d+@ngk\.vn\)/);
  });
});

describe('danh sách & chi tiết người dùng', () => {
  test('tìm không dấu theo tên / email / @tên riêng; lọc; sắp xếp theo số thiết kế; không lộ mật khẩu băm', async () => {
    const a = await admin();
    const t = await user({ name: 'Thợ Kim Hoàn Đặc Biệt' });
    await design(t, { name: 'A' });
    await design(t, { name: 'B', visibility: 'private' });
    await design(t, { name: 'C', visibility: 'unlisted' });
    let r = await a.get('/api/admin/users?q=tho kim hoan dac');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 1);
    const row = r.body.items[0];
    assert.equal(row.email, t.me.email);
    assert.equal(row.designs, 3);
    assert.equal(row.publicDesigns, 1);
    assert.equal(row.passwordHash, undefined);
    assert.equal(Object.keys(row).some((k) => /password|hash/i.test(k)), false);
    r = await a.get(`/api/admin/users?q=${encodeURIComponent(t.me.email.split('@')[0])}`);
    assert.ok(r.body.items.some((u) => u.id === t.me.id));
    r = await a.get(`/api/admin/users?q=@${t.me.handle}`);
    assert.ok(r.body.items.some((u) => u.id === t.me.id));
    r = await a.get('/api/admin/users?f=admin');
    assert.ok(r.body.items.length >= 1 && r.body.items.every((u) => u.role === 'admin'));
    const unv = await user({ verified: false });
    r = await a.get('/api/admin/users?f=unverified');
    assert.ok(r.body.items.some((u) => u.id === unv.me.id) && r.body.items.every((u) => !u.emailVerified));
    r = await a.get('/api/admin/users?sort=designs');
    assert.equal(r.body.items[0].id, t.me.id, 'nhiều thiết kế nhất đứng đầu');
    r = await a.get('/api/admin/users?f=__proto__&sort=constructor&page=-3');
    assert.equal(r.status, 200);
    assert.equal(r.body.page, 1);
  });
  test('chi tiết: thiết kế RIÊNG TƯ chỉ có loại + ngày tạo (không tên, không ảnh); số liệu đúng', async () => {
    const a = await admin();
    const t = await user({ name: 'Chủ Riêng Tư' });
    const pub = await design(t, { name: 'Công khai đẹp' });
    const secret = await design(t, { name: 'Bí mật tuyệt đối', visibility: 'private' });
    assert.equal((await a.get(`/api/public/designs/${secret.id}`)).status, 404, 'admin cũng không mở được thiết kế riêng tư');
    const fan = await user();
    await fan.post(`/api/designs/${pub.id}/like`);
    await t.post(`/api/designs/${pub.id}/comments`).send({ body: 'Cảm ơn mọi người' });
    await fan.post('/api/reports').send({ targetType: 'design', targetId: pub.id, reason: 'spam' });
    const r = await a.get(`/api/admin/users/${t.me.id}`);
    assert.equal(r.status, 200);
    const priv = r.body.designs.find((d) => d.visibility === 'private');
    assert.equal(priv.masked, true);
    assert.equal(priv.name, undefined);
    assert.equal(priv.thumbnailUrl, undefined);
    assert.equal(priv.type, 'ring');
    assert.ok(priv.createdAt);
    assert.equal(JSON.stringify(r.body).includes('Bí mật tuyệt đối'), false, 'tên thiết kế riêng tư không lộ ra');
    const p = r.body.designs.find((d) => d.visibility === 'public');
    assert.equal(p.name, 'Công khai đẹp');
    assert.ok(p.thumbnailUrl);
    assert.deepEqual(
      { designs: r.body.stats.designs, public: r.body.stats.public, private: r.body.stats.private, likesReceived: r.body.stats.likesReceived, comments: r.body.stats.comments, reportsAgainst: r.body.stats.reportsAgainst },
      { designs: 2, public: 1, private: 1, likesReceived: 1, comments: 1, reportsAgainst: 1 },
    );
    assert.ok(r.body.user.lastLoginAt, 'có thời điểm đăng nhập gần nhất');
    assert.equal(r.body.user.hasPassword, true);
    assert.equal((await a.get('/api/admin/users/000000000000000000000000')).status, 404);
    assert.equal((await a.get('/api/admin/users/khong-hop-le')).status, 404);
  });
});

describe('khoá / mở khoá tài khoản', () => {
  test('bắt buộc lý do; không khoá chính mình / quản trị viên khác; khoá 2 lần → 409', async () => {
    const a = await admin();
    const a2 = await admin('Admin Thứ Hai');
    const t = await user();
    assert.equal((await a.post(`/api/admin/users/${t.me.id}/lock`).send({})).status, 400);
    assert.equal((await a.post(`/api/admin/users/${t.me.id}/lock`).send({ reason: 'x' })).status, 400);
    const self = await a.post(`/api/admin/users/${a.me.id}/lock`).send({ reason: 'thử khoá mình' });
    assert.equal(self.status, 403);
    assert.equal(self.body.code, 'SELF');
    const other = await a.post(`/api/admin/users/${a2.me.id}/lock`).send({ reason: 'thử khoá admin' });
    assert.equal(other.status, 403);
    assert.equal(other.body.code, 'TARGET_ADMIN');
    assert.equal((await a.post(`/api/admin/users/${t.me.id}/lock`).send({ reason: 'Đăng nội dung rác' })).status, 200);
    assert.equal((await a.post(`/api/admin/users/${t.me.id}/lock`).send({ reason: 'Đăng nội dung rác' })).status, 409);
    assert.equal((await a.post(`/api/admin/users/${a.me.id}/unlock`).send({})).status, 409);
  });

  test('khoá: đăng xuất ngay, không đăng nhập / đặt lại mật khẩu được; nội dung công khai + bình luận + hồ sơ ẩn; mở khoá → như cũ', async () => {
    const a = await admin();
    const t = await user({ name: 'Người Vi Phạm' });
    const other = await user({ name: 'Người Khác' });
    const td = await design(t, { name: 'Thiết kế vi phạm' });
    const od = await design(other, { name: 'Thiết kế lành mạnh' });
    await t.post(`/api/designs/${od.id}/comments`).send({ body: 'Bình luận rác rác rác' });
    await t.post(`/api/designs/${od.id}/like`);
    assert.equal((await t.get('/api/auth/me')).status, 200);
    const membersBefore = (await guest().get('/api/public/stats')).body.members;

    const lock = await a.post(`/api/admin/users/${t.me.id}/lock`).send({ reason: 'Đăng nội dung rác nhiều lần' });
    assert.equal(lock.status, 200);
    // mất phiên NGAY (mã truy cập còn hạn cũng không dùng được), gia hạn bị từ chối
    assert.equal((await t.get('/api/auth/me')).body.user, null);
    assert.equal((await t.get('/api/designs')).status, 401);
    const refresh = await t.post('/api/auth/refresh');
    assert.equal(refresh.status, 401);
    // đăng nhập lại: đúng mật khẩu → 403 kèm lý do; sai mật khẩu → thông báo chung (không lộ)
    const l = await login(t.me.email);
    assert.equal(l.status, 403);
    assert.equal(l.body.code, 'ACCOUNT_LOCKED');
    assert.match(l.body.error, /Đăng nội dung rác nhiều lần/);
    assert.equal((await login(t.me.email, 'saimatkhau1')).status, 401);
    // quên mật khẩu: không cấp link
    const f = await guest().post('/api/auth/forgot').send({ email: t.me.email });
    assert.equal(f.status, 200);
    assert.equal(f.body.devLink, undefined);
    // nội dung công khai ẩn ở mọi nơi
    const explore = (await guest().get('/api/public/designs?q=vi pham')).body.items;
    assert.equal(explore.some((d) => d.id === td.id), false);
    assert.equal((await guest().get(`/api/public/designs/${td.id}`)).status, 404);
    assert.equal((await other.post(`/api/designs/${td.id}/like`)).status, 404);
    const prof = await guest().get(`/api/public/users/${t.me.handle}`);
    assert.equal(prof.status, 404);
    assert.equal(prof.body.code, 'LOCKED');
    const cm = (await guest().get(`/api/public/designs/${od.id}/comments`)).body.items[0];
    assert.equal(cm.hidden, true);
    assert.equal(cm.body, '');
    assert.equal(cm.author, null);
    assert.equal((await guest().get('/api/public/stats')).body.members, membersBefore - 1);
    assert.equal(await Design.countDocuments({ owner: t.me.id, ownerLocked: true }), 1);
    // admin vẫn mở được thiết kế công khai đang bị ẩn (để xem xét); thấy lý do + người khoá
    assert.equal((await a.get(`/api/public/designs/${td.id}`)).status, 200);
    const det = (await a.get(`/api/admin/users/${t.me.id}`)).body.user;
    assert.equal(det.locked.reason, 'Đăng nội dung rác nhiều lần');
    assert.equal(det.locked.by, 'Quản Trị Viên');
    assert.equal((await a.get('/api/admin/users?f=locked')).body.items.some((u) => u.id === t.me.id), true);

    // mở khoá → trở lại như cũ
    assert.equal((await a.post(`/api/admin/users/${t.me.id}/unlock`).send({ note: 'Đã cam kết không tái phạm' })).status, 200);
    assert.equal((await guest().get(`/api/public/designs/${td.id}`)).status, 200);
    assert.equal((await guest().get(`/api/public/users/${t.me.handle}`)).status, 200);
    const cm2 = (await guest().get(`/api/public/designs/${od.id}/comments`)).body.items[0];
    assert.equal(cm2.hidden, undefined);
    assert.equal(cm2.body, 'Bình luận rác rác rác');
    // phiên cũ đã bị thu hồi lúc khoá → mã truy cập cũ KHÔNG sống lại sau khi mở khoá (phải đăng nhập lại)
    assert.equal((await t.get('/api/designs')).status, 401);
    assert.equal((await login(t.me.email)).status, 200);
    const logs = await AdminLog.find({ target: t.me.id }).sort({ createdAt: 1 });
    assert.deepEqual(logs.map((x) => [x.action, x.reason]), [
      ['user.lock', 'Đăng nội dung rác nhiều lần'],
      ['user.unlock', 'Đã cam kết không tái phạm'],
    ]);
    assert.equal(String(logs[0].actor), a.me.id);
  });
});

describe('xoá tài khoản vĩnh viễn', () => {
  test('phải gõ đúng email + ghi lý do; không xoá được admin / chính mình', async () => {
    const a = await admin();
    const t = await user();
    const wrong = await a.del(`/api/admin/users/${t.me.id}`).send({ confirmEmail: 'sai@ngk.vn', reason: 'Tài khoản rác' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'CONFIRM_MISMATCH');
    assert.equal((await a.del(`/api/admin/users/${t.me.id}`).send({ confirmEmail: t.me.email })).status, 400);
    assert.equal((await a.del(`/api/admin/users/${a.me.id}`).send({ confirmEmail: a.me.email, reason: 'thử xoá mình' })).body.code, 'SELF');
    assert.ok(await User.exists({ _id: t.me.id }));
  });

  test('xoá sạch dữ liệu, giữ đúng số liệu + ngữ cảnh của người khác, ghi nhật ký', async () => {
    const a = await admin();
    const t = await user({ name: 'Sắp Bị Xoá' });
    const b = await user({ name: 'Bình Thường' });
    const c = await user({ name: 'Người Thứ Ba' });
    const td = await design(t, { name: 'Của người bị xoá' });
    const bd = await design(b, { name: 'Của B' });
    await t.post(`/api/designs/${bd.id}/like`);
    await c.post(`/api/designs/${bd.id}/like`); // thông báo gộp "Sắp Bị Xoá và 1 người khác"
    // bình luận gốc của t mà c đã trả lời → giữ chỗ "đã bị xoá"; bình luận gốc của t không ai trả lời → mất hẳn
    const top = (await t.post(`/api/designs/${bd.id}/comments`).send({ body: 'Gốc có trả lời' })).body.comment;
    await c.post(`/api/designs/${bd.id}/comments`).send({ body: 'Trả lời của C', parentId: top.id });
    await t.post(`/api/designs/${bd.id}/comments`).send({ body: 'Gốc không ai trả lời' });
    // t trả lời bình luận của c
    const ctop = (await c.post(`/api/designs/${bd.id}/comments`).send({ body: 'Gốc của C' })).body.comment;
    await t.post(`/api/designs/${bd.id}/comments`).send({ body: 'T trả lời C', parentId: ctop.id });
    await c.post(`/api/designs/${td.id}/like`);
    assert.equal((await Design.findById(bd.id)).likeCount, 2);

    const r = await a.del(`/api/admin/users/${t.me.id}`).send({ confirmEmail: t.me.email.toUpperCase(), reason: 'Yêu cầu xoá tài khoản' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.designs, 1);
    assert.equal(await User.exists({ _id: t.me.id }), null);
    assert.equal(await Design.exists({ _id: td.id }), null);
    assert.equal((await a.get(`/api/admin/users/${t.me.id}`)).status, 404);
    assert.equal((await login(t.me.email)).status, 401);
    const bAfter = await Design.findById(bd.id);
    assert.equal(bAfter.likeCount, 1);
    // còn: chỗ giữ (gốc t) + trả lời của C + gốc của C = 3 bản ghi, 2 bình luận hiển thị
    assert.equal(bAfter.commentCount, 2);
    const comments = await Comment.find({ design: bd.id });
    assert.equal(comments.length, 3);
    const placeholder = comments.find((x) => String(x._id) === top.id);
    assert.equal(placeholder.deleted, true);
    assert.equal(placeholder.body, '');
    assert.equal((await Comment.findById(ctop.id)).replyCount, 0, 'đếm lại số trả lời của bình luận C');
    const notif = await Notification.findOne({ user: b.me.id, type: 'like', design: bd.id });
    assert.equal(notif.actors.some((x) => String(x) === t.me.id), false);
    assert.equal(notif.actorCount, 1);
    assert.equal(await Notification.countDocuments({ user: c.me.id, design: td.id }), 0);
    const log = await AdminLog.findOne({ action: 'user.delete', target: t.me.id });
    assert.equal(log.reason, 'Yêu cầu xoá tài khoản');
    assert.match(log.targetLabel, /Sắp Bị Xoá/);
    assert.equal(log.meta.designs, 1);
  });
});

describe('nhật ký quản trị', () => {
  test('lọc theo hành động / nhóm / người làm / đối tượng / chữ không dấu / ngày', async () => {
    const a = await admin('Admin Nhật Ký');
    const t = await user({ name: 'Đối Tượng Lọc' });
    await a.post(`/api/admin/users/${t.me.id}/lock`).send({ reason: 'Quấy rối người dùng khác' });
    await a.post(`/api/admin/users/${t.me.id}/unlock`).send({});
    let r = await a.get('/api/admin/logs?action=user.lock');
    assert.ok(r.body.items.length >= 1 && r.body.items.every((x) => x.action === 'user.lock'));
    r = await a.get('/api/admin/logs?group=user');
    assert.ok(r.body.items.every((x) => x.action.startsWith('user.')));
    r = await a.get(`/api/admin/logs?actor=${a.me.id}`);
    assert.deepEqual(r.body.items.map((x) => x.action).sort(), ['user.lock', 'user.unlock']);
    r = await a.get('/api/admin/logs?actor=cli');
    assert.ok(r.body.items.length >= 1 && r.body.items.every((x) => x.actor === null));
    r = await a.get(`/api/admin/logs?target=${t.me.id}`);
    assert.equal(r.body.items.length, 2);
    assert.equal(r.body.items[0].action, 'user.unlock', 'mới nhất trước');
    r = await a.get('/api/admin/logs?q=quay roi');
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].reason, 'Quấy rối người dùng khác');
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam
    r = await a.get(`/api/admin/logs?target=${t.me.id}&from=${today}&to=${today}`);
    assert.equal(r.body.items.length, 2);
    r = await a.get(`/api/admin/logs?target=${t.me.id}&to=2020-01-01`);
    assert.equal(r.body.items.length, 0);
    const actors = (await a.get('/api/admin/logs/actors')).body;
    assert.ok(actors.items.some((x) => x.id === a.me.id));
    assert.equal(actors.cli, true);
  });
  test('chỉ ghi thêm: mọi lệnh sửa / xoá nhật ký đều bị chặn', async () => {
    const one = await AdminLog.findOne();
    assert.ok(one);
    await assert.rejects(AdminLog.updateOne({ _id: one._id }, { reason: 'sửa' }), /chỉ được ghi thêm/);
    await assert.rejects(AdminLog.updateMany({}, { reason: 'sửa' }), /chỉ được ghi thêm/);
    await assert.rejects(AdminLog.findOneAndUpdate({ _id: one._id }, { reason: 'sửa' }), /chỉ được ghi thêm/);
    await assert.rejects(AdminLog.deleteOne({ _id: one._id }), /chỉ được ghi thêm/);
    await assert.rejects(AdminLog.deleteMany({}), /chỉ được ghi thêm/);
    await assert.rejects(AdminLog.findOneAndDelete({ _id: one._id }), /chỉ được ghi thêm/);
    one.reason = 'sửa';
    await assert.rejects(one.save(), /chỉ được ghi thêm/);
    await assert.rejects(one.deleteOne(), /chỉ được ghi thêm/);
    assert.notEqual((await AdminLog.findById(one._id)).reason, 'sửa');
  });
});
