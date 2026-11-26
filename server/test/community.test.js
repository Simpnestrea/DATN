// KIỂM THỬ CỘNG ĐỒNG (GĐ3): chia sẻ, Khám phá, thích, remix, bình luận, báo cáo, hồ sơ, thông báo, xem trước link.
import './env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { createDefaultConfig } from '@ngk/shared';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { Comment, Like, Notification, User } from '../src/models.js';

const app = createApp();
const H = { 'X-NGK': '1', Origin: 'http://localhost:5173' };
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');
const ring = (size = 12) => {
  const c = createDefaultConfig('ring');
  c.size.ringSize = size;
  return c;
};

const browser = () => {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set(H);
  return { agent, get: (u) => agent.get(u), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
};
const guest = () => browser();
let seq = 0;
/** Người dùng đã đăng ký (+ xác minh email nếu verified). */
async function user({ verified = true, name } = {}) {
  const b = browser();
  const email = `c${++seq}@ngk.vn`;
  const r = await b.post('/api/auth/register').send({ email, password: 'matkhau123', displayName: name ?? `Thợ Kim Hoàn ${seq}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (verified) {
    const token = new URL(r.body.devLink).searchParams.get('token');
    await b.post('/api/auth/verify-email').send({ token });
  }
  const me = (await b.get('/api/auth/me')).body.user;
  return Object.assign(b, { me });
}
/** Tạo thiết kế (đã lưu 1 phiên bản) và chia sẻ theo chế độ cho trước. */
async function design(b, { name = 'Nhẫn thử', visibility = 'public', cfg = ring(), extra = {} } = {}) {
  const r = await b.post('/api/designs').send({ name, config: cfg, thumbnail: PNG });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (visibility !== 'private') {
    const s = await b.patch(`/api/designs/${r.body.design.id}/sharing`).send({ visibility, ...extra });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    return s.body.design;
  }
  return r.body.design;
}

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('chia sẻ & quyền xem', () => {
  test('chưa xác minh email → không chia sẻ được', async () => {
    const a = await user({ verified: false });
    const d = (await a.post('/api/designs').send({ name: 'x', config: ring() })).body.design;
    const r = await a.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'public' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'EMAIL_UNVERIFIED');
  });
  test('riêng tư: người khác & khách → 404; chủ xem được', async () => {
    const a = await user();
    const d = await design(a, { visibility: 'private' });
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).status, 404);
    const b = await user();
    assert.equal((await b.get(`/api/public/designs/${d.id}`)).status, 404);
    const own = await a.get(`/api/public/designs/${d.id}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.design.isOwner, true);
    assert.equal((await guest().get(d.thumbnailUrl)).status, 404);
  });
  test('có liên kết: khách xem được bằng link (cả ảnh), nhưng không hiện ở Khám phá', async () => {
    const a = await user();
    const d = await design(a, { name: 'Bí mật có link', visibility: 'unlisted' });
    const g = guest();
    const r = await g.get(`/api/public/designs/${d.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.design.owner.displayName, a.me.displayName);
    assert.equal(r.body.design.owner.email, undefined); // không lộ email tác giả
    assert.equal((await g.get(d.thumbnailUrl)).status, 200);
    const list = (await g.get('/api/public/designs?q=bi mat')).body;
    assert.equal(list.total, 0);
  });
  test('người xem thấy PHIÊN BẢN ĐÃ LƯU, không thấy bản nháp', async () => {
    const a = await user();
    const d = await design(a, { cfg: ring(12) });
    const full = (await a.get(`/api/designs/${d.id}`)).body.design;
    await a.put(`/api/designs/${d.id}/draft`).send({ config: ring(15), revision: full.revision });
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).body.design.config.size.ringSize, 12);
    const now = (await a.get(`/api/designs/${d.id}`)).body.design;
    await a.post(`/api/designs/${d.id}/versions`).send({ config: ring(15), revision: now.revision });
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).body.design.config.size.ringSize, 15);
  });
  test('mô tả, cho phép remix / bình luận; chuyển về riêng tư thì biến mất', async () => {
    const a = await user();
    const d = await design(a, { extra: { description: 'Nhẫn cưới\nvàng 18K', allowRemix: false } });
    assert.equal(d.description, 'Nhẫn cưới\nvàng 18K');
    assert.equal(d.allowRemix, false);
    assert.ok(d.publishedAt);
    assert.equal((await a.patch(`/api/designs/${d.id}/sharing`).send({ description: 'x'.repeat(501) })).status, 400);
    assert.equal((await a.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'xyz' })).status, 400);
    await a.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'private' });
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).status, 404);
    const b = await user();
    assert.equal((await b.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'public' })).status, 404); // không phải chủ
  });
});

describe('Khám phá', () => {
  test('sắp xếp mới / nhiều thích / nổi bật tuần; lọc loại; tìm theo tên thiết kế, tên tác giả, tên riêng', async () => {
    const a = await user({ name: 'Nguyễn Ánh Dương' });
    const d1 = await design(a, { name: 'Nhẫn Bình Minh' });
    const d2 = await design(a, { name: 'Vòng cổ Hoàng Hôn', cfg: createDefaultConfig('necklace') });
    const d3 = await design(a, { name: 'Bông tai Sương Sớm', cfg: createDefaultConfig('earrings') });
    // d1: 2 lượt thích cũ (8 ngày trước); d3: 1 lượt thích tuần này
    const [u1, u2, u3] = [await user(), await user(), await user()];
    await u1.post(`/api/designs/${d1.id}/like`);
    await u2.post(`/api/designs/${d1.id}/like`);
    // ghi thẳng qua driver: Mongoose không cho sửa createdAt (trường bất biến)
    await Like.collection.updateMany({ design: new mongoose.Types.ObjectId(d1.id) }, { $set: { createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) } });
    await u3.post(`/api/designs/${d3.id}/like`);
    const names = async (q) => (await guest().get(`/api/public/designs?${q}`)).body.items.map((x) => x.name);
    const mine = (list) => list.filter((n) => [d1, d2, d3].some((d) => d.name === n));
    assert.deepEqual(mine(await names('sort=new')), ['Bông tai Sương Sớm', 'Vòng cổ Hoàng Hôn', 'Nhẫn Bình Minh']);
    assert.deepEqual(mine(await names('sort=top')).slice(0, 2), ['Nhẫn Bình Minh', 'Bông tai Sương Sớm']);
    assert.equal(mine(await names('sort=trending'))[0], 'Bông tai Sương Sớm');
    assert.deepEqual(mine(await names('type=necklace')), ['Vòng cổ Hoàng Hôn']);
    assert.deepEqual(mine(await names('q=binh minh')), ['Nhẫn Bình Minh']);
    assert.equal(mine(await names('q=anh duong')).length, 3); // tên tác giả không dấu
    assert.equal(mine(await names(`q=${a.me.handle}`)).length, 3); // tên riêng
    const item = (await guest().get('/api/public/designs?q=binh minh')).body.items[0];
    assert.equal(item.owner.handle, a.me.handle);
    assert.equal(item.likeCount, 2);
    assert.equal(item.liked, false);
    assert.equal((await u1.get('/api/public/designs?q=binh minh')).body.items[0].liked, true);
  });
});

describe('thích', () => {
  test('thích 2 lần vẫn tính 1; bỏ thích; khách → 401; thiết kế riêng tư → 404', async () => {
    const a = await user();
    const d = await design(a);
    const b = await user();
    assert.equal((await b.post(`/api/designs/${d.id}/like`)).body.likeCount, 1);
    assert.equal((await b.post(`/api/designs/${d.id}/like`)).body.likeCount, 1);
    assert.equal((await b.del(`/api/designs/${d.id}/like`)).body.likeCount, 0);
    assert.equal((await b.del(`/api/designs/${d.id}/like`)).body.likeCount, 0);
    assert.equal((await guest().post(`/api/designs/${d.id}/like`)).status, 401);
    const p = await design(a, { visibility: 'private' });
    assert.equal((await b.post(`/api/designs/${p.id}/like`)).status, 404);
  });
  test('thông báo thích được GỘP; tự thích không có thông báo', async () => {
    const a = await user();
    const d = await design(a, { name: 'Nhẫn được thích' });
    await a.post(`/api/designs/${d.id}/like`);
    assert.equal((await a.get('/api/notifications/unread-count')).body.count, 0);
    const [b, c] = [await user({ name: 'Bảo' }), await user({ name: 'Châu' })];
    await b.post(`/api/designs/${d.id}/like`);
    await c.post(`/api/designs/${d.id}/like`);
    await c.del(`/api/designs/${d.id}/like`);
    await c.post(`/api/designs/${d.id}/like`); // thích lại: không đếm 2 lần
    const n = (await a.get('/api/notifications')).body;
    assert.equal(n.items.length, 1);
    assert.equal(n.items[0].type, 'like');
    assert.equal(n.items[0].actorCount, 2);
    assert.deepEqual(n.items[0].actors.map((x) => x.displayName), ['Châu', 'Bảo']);
    assert.equal(n.items[0].design.name, 'Nhẫn được thích');
    assert.equal(n.unread, 1);
  });
});

describe('remix', () => {
  test('remix tạo bản riêng tư của mình + ghi công không sửa được; bản gốc +1 remix; tác giả nhận thông báo', async () => {
    const a = await user({ name: 'Tác Giả Gốc' });
    const d = await design(a, { name: 'Nhẫn Gốc', cfg: ring(16) });
    const b = await user();
    const r = await b.post(`/api/designs/${d.id}/remix`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const mine = (await b.get(`/api/designs/${r.body.design.id}`)).body.design;
    assert.equal(mine.visibility, 'private');
    assert.equal(mine.config.size.ringSize, 16);
    assert.deepEqual(mine.remixOf, { designId: d.id, name: 'Nhẫn Gốc', ownerName: 'Tác Giả Gốc', ownerHandle: a.me.handle });
    // đổi tên bản remix / dữ liệu gửi lên KHÔNG xoá được ghi công
    await b.patch(`/api/designs/${mine.id}`).send({ name: 'Của tôi hoàn toàn', remixOf: null });
    await b.put(`/api/designs/${mine.id}/draft`).send({ config: ring(10), revision: mine.revision + 1, remixOf: null });
    assert.equal((await b.get(`/api/designs/${mine.id}`)).body.design.remixOf.name, 'Nhẫn Gốc');
    assert.equal((await guest().get(`/api/public/designs/${d.id}`)).body.design.remixCount, 1);
    const n = (await a.get('/api/notifications')).body.items.find((x) => x.type === 'remix');
    assert.ok(n && n.remixId === mine.id);
    // danh sách remix công khai của bản gốc
    assert.equal((await guest().get(`/api/public/designs/${d.id}/remixes`)).body.items.length, 0);
    await b.patch(`/api/designs/${mine.id}/sharing`).send({ visibility: 'public' });
    const list = (await guest().get(`/api/public/designs/${d.id}/remixes`)).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].remixOf.name, 'Nhẫn Gốc');
    // bản gốc chuyển riêng tư → ghi công vẫn còn nhưng không còn liên kết
    await a.patch(`/api/designs/${d.id}/sharing`).send({ visibility: 'private' });
    const view = (await guest().get(`/api/public/designs/${mine.id}`)).body.design;
    assert.equal(view.remixOf.name, 'Nhẫn Gốc');
    assert.equal(view.remixOf.available, false);
    // xoá bản remix → bản gốc bớt 1 lượt remix
    await b.del(`/api/designs/${mine.id}`);
    assert.equal((await a.get(`/api/designs/${d.id}`)).body.design.remixCount, 0);
  });
  test('"Lưu thành thiết kế mới" từ bản remix giữ ghi công; ghi công tự khai từ trình duyệt bị bỏ qua', async () => {
    const a = await user({ name: 'Gốc Thật' });
    const d = await design(a, { name: 'Mẫu Gốc' });
    const b = await user();
    const rid = (await b.post(`/api/designs/${d.id}/remix`)).body.design.id;
    const copy = (await b.post('/api/designs').send({ name: 'Tách ra', config: ring(), fromDesign: rid })).body.design;
    assert.equal(copy.remixOf.name, 'Mẫu Gốc');
    // fromDesign của người khác → không chép được ghi công
    const c = await user();
    const other = (await c.post('/api/designs').send({ name: 'x', config: ring(), fromDesign: rid })).body.design;
    assert.equal(other.remixOf, null);
    // tự khai ghi công giả → bỏ qua
    const fake = (await c.post('/api/designs').send({ name: 'y', config: ring(), remixOf: { design: d.id, name: 'Giả', ownerName: 'Ai đó' } })).body.design;
    assert.equal(fake.remixOf, null);
  });
  test('tác giả tắt remix → 403; tự remix của mình → 400; khách → 401', async () => {
    const a = await user();
    const d = await design(a, { extra: { allowRemix: false } });
    const b = await user();
    const r = await b.post(`/api/designs/${d.id}/remix`);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'REMIX_DISABLED');
    const d2 = await design(a);
    assert.equal((await a.post(`/api/designs/${d2.id}/remix`)).status, 400);
    assert.equal((await guest().post(`/api/designs/${d2.id}/remix`)).status, 401);
  });
});

describe('bình luận', () => {
  test('khách → 401; chưa xác minh → 403; bình luận + trả lời 1 cấp; sửa của mình; đếm đúng', async () => {
    const a = await user({ name: 'Chủ Nhẫn' });
    const d = await design(a);
    assert.equal((await guest().post(`/api/designs/${d.id}/comments`).send({ body: 'hi' })).status, 401);
    const nv = await user({ verified: false });
    const r0 = await nv.post(`/api/designs/${d.id}/comments`).send({ body: 'hi' });
    assert.equal(r0.status, 403);
    assert.equal(r0.body.code, 'EMAIL_UNVERIFIED');
    const b = await user({ name: 'Bình' });
    assert.equal((await b.post(`/api/designs/${d.id}/comments`).send({ body: '   ' })).status, 400);
    const c1 = (await b.post(`/api/designs/${d.id}/comments`).send({ body: 'Đẹp quá!\n\n\n\nGiá bao nhiêu?' })).body.comment;
    assert.equal(c1.body, 'Đẹp quá!\n\nGiá bao nhiêu?');
    const reply = (await a.post(`/api/designs/${d.id}/comments`).send({ body: 'Cảm ơn bạn', parentId: c1.id })).body.comment;
    assert.equal(reply.parentId, c1.id);
    // trả lời một câu trả lời → vẫn vào chuỗi của bình luận gốc (1 cấp)
    const reply2 = (await b.post(`/api/designs/${d.id}/comments`).send({ body: 'Không có gì', parentId: reply.id })).body.comment;
    assert.equal(reply2.parentId, c1.id);
    const list = (await guest().get(`/api/public/designs/${d.id}/comments`)).body;
    assert.equal(list.total, 3);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].replies.length, 2);
    assert.equal(list.items[0].author.displayName, 'Bình');
    assert.equal(list.items[0].canEdit, false); // khách
    // sửa
    assert.equal((await a.patch(`/api/comments/${c1.id}`).send({ body: 'sửa trộm' })).status, 403);
    const ed = (await b.patch(`/api/comments/${c1.id}`).send({ body: 'Đẹp quá! (đã sửa)' })).body.comment;
    assert.ok(ed.editedAt);
    // thông báo: chủ thiết kế nhận "bình luận"; người được trả lời nhận "trả lời"
    const na = (await a.get('/api/notifications')).body.items;
    assert.ok(na.some((n) => n.type === 'comment' && n.preview.startsWith('Đẹp quá!')));
    const nb = (await b.get('/api/notifications')).body.items;
    assert.ok(nb.some((n) => n.type === 'reply' && n.preview === 'Cảm ơn bạn'));
  });
  test('xoá: tác giả bình luận hoặc chủ thiết kế; người khác 403; bình luận gốc còn trả lời → giữ chỗ "đã xoá"', async () => {
    const a = await user();
    const d = await design(a);
    const [b, c] = [await user(), await user()];
    const top = (await b.post(`/api/designs/${d.id}/comments`).send({ body: 'Gốc' })).body.comment;
    const rep = (await c.post(`/api/designs/${d.id}/comments`).send({ body: 'Trả lời', parentId: top.id })).body.comment;
    assert.equal((await c.del(`/api/comments/${top.id}`)).status, 403);
    assert.equal((await b.del(`/api/comments/${top.id}`)).body.soft, true);
    let list = (await guest().get(`/api/public/designs/${d.id}/comments`)).body;
    assert.equal(list.items[0].deleted, true);
    assert.equal(list.items[0].body, '');
    assert.equal(list.items[0].author, null);
    assert.equal(list.total, 1);
    // chủ thiết kế xoá câu trả lời cuối → chỗ giữ cũng được dọn
    assert.equal((await a.del(`/api/comments/${rep.id}`)).status, 200);
    list = (await guest().get(`/api/public/designs/${d.id}/comments`)).body;
    assert.equal(list.items.length, 0);
    assert.equal(list.total, 0);
    assert.equal(await Comment.countDocuments({ design: d.id }), 0);
  });
  test('tác giả tắt bình luận → 403', async () => {
    const a = await user();
    const d = await design(a, { extra: { allowComments: false } });
    const b = await user();
    const r = await b.post(`/api/designs/${d.id}/comments`).send({ body: 'hi' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'COMMENTS_OFF');
    assert.equal((await guest().get(`/api/public/designs/${d.id}/comments`)).body.allowComments, false);
  });
});

describe('báo cáo', () => {
  test('báo cáo bình luận / thiết kế; không trùng; không tự báo cáo', async () => {
    const a = await user();
    const d = await design(a);
    const b = await user();
    const c = (await b.post(`/api/designs/${d.id}/comments`).send({ body: 'spam spam' })).body.comment;
    const u = await user();
    assert.equal((await u.post('/api/reports').send({ targetType: 'comment', targetId: c.id, reason: 'spam' })).status, 201);
    assert.equal((await u.post('/api/reports').send({ targetType: 'comment', targetId: c.id, reason: 'spam' })).status, 409);
    assert.equal((await u.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'copyright', note: 'Sao chép mẫu của tôi' })).status, 201);
    assert.equal((await u.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'xyz' })).status, 400);
    assert.equal((await b.post('/api/reports').send({ targetType: 'comment', targetId: c.id, reason: 'spam' })).status, 400);
    assert.equal((await a.post('/api/reports').send({ targetType: 'design', targetId: d.id, reason: 'spam' })).status, 400);
  });
});

describe('hồ sơ công khai & tên riêng', () => {
  test('tên riêng tự gợi ý từ tên hiển thị; đổi tên riêng (sai / giữ lại / trùng); giới thiệu', async () => {
    const a = await user({ name: 'Đặng Thị Ánh' });
    assert.equal(a.me.handle, 'dang.thi.anh');
    const a2 = await user({ name: 'Đặng Thị Ánh' });
    assert.equal(a2.me.handle, 'dang.thi.anh2');
    assert.equal((await a.patch('/api/account/profile').send({ handle: 'a b' })).status, 400);
    assert.equal((await a.patch('/api/account/profile').send({ handle: 'admin' })).status, 400);
    assert.equal((await a.patch('/api/account/profile').send({ handle: 'dang.thi.anh2' })).status, 409);
    const ok = await a.patch('/api/account/profile').send({ handle: '@Anh.Jewelry', bio: 'Thợ kim hoàn\nHà Nội' });
    assert.equal(ok.body.user.handle, 'anh.jewelry');
    assert.equal(ok.body.user.bio, 'Thợ kim hoàn\nHà Nội');
    assert.deepEqual((await a.get('/api/account/handle-available?handle=dang.thi.anh2')).body.available, false);
    assert.deepEqual((await a.get('/api/account/handle-available?handle=anh.jewelry')).body.available, true); // của chính mình
  });
  test('trang hồ sơ: thống kê + chỉ thiết kế công khai; tab đã thích', async () => {
    const a = await user({ name: 'Hồ Sơ Công Khai' });
    const pub = await design(a, { name: 'Công khai' });
    await design(a, { name: 'Có link', visibility: 'unlisted' });
    await design(a, { name: 'Riêng tư', visibility: 'private' });
    const b = await user();
    await b.post(`/api/designs/${pub.id}/like`);
    const g = guest();
    const p = (await g.get(`/api/public/users/${a.me.handle}`)).body;
    assert.equal(p.user.displayName, 'Hồ Sơ Công Khai');
    assert.equal(p.user.email, undefined);
    assert.deepEqual(p.stats, { designs: 1, likes: 1 });
    assert.deepEqual((await g.get(`/api/public/users/${a.me.handle}/designs`)).body.items.map((x) => x.name), ['Công khai']);
    assert.deepEqual((await g.get(`/api/public/users/${b.me.handle}/liked`)).body.items.map((x) => x.name), ['Công khai']);
    assert.equal((await g.get('/api/public/users/khong.ton.tai')).status, 404);
  });
});

describe('thông báo', () => {
  test('đánh dấu đã đọc không đổi thứ tự; xoá thiết kế xoá luôn lượt thích / bình luận / thông báo', async () => {
    const a = await user();
    const d = await design(a);
    const b = await user();
    await b.post(`/api/designs/${d.id}/like`);
    await b.post(`/api/designs/${d.id}/comments`).send({ body: 'Xinh' });
    const before = (await a.get('/api/notifications')).body.items;
    assert.equal(before.length, 2);
    await a.post('/api/notifications/read-all');
    const afterRead = (await a.get('/api/notifications')).body;
    assert.equal(afterRead.unread, 0);
    assert.deepEqual(afterRead.items.map((n) => n.at), before.map((n) => n.at));
    await a.del(`/api/designs/${d.id}`);
    assert.equal(await Like.countDocuments({ design: d.id }), 0);
    assert.equal(await Comment.countDocuments({ design: d.id }), 0);
    assert.equal(await Notification.countDocuments({ design: d.id }), 0);
  });
});

describe('trang chủ: số liệu cộng đồng + nhà thiết kế nổi bật; tài khoản mẫu', () => {
  test('số liệu chỉ tính thiết kế công khai; nhà thiết kế xếp theo tổng lượt thích, kèm 3 thiết kế nổi bật', async () => {
    const before = (await guest().get('/api/public/stats')).body;
    const a = await user({ name: 'Nhà Thiết Kế A' });
    const b = await user({ name: 'Nhà Thiết Kế B' });
    const a1 = await design(a, { name: 'A1' });
    const a2 = await design(a, { name: 'A2' });
    await design(a, { name: 'A3 riêng', visibility: 'private' });
    const b1 = await design(b, { name: 'B1' });
    const fans = [await user(), await user(), await user()];
    for (const f of fans) await f.post(`/api/designs/${a1.id}/like`);
    await fans[0].post(`/api/designs/${a2.id}/like`);
    await fans[0].post(`/api/designs/${b1.id}/like`);
    const after = (await guest().get('/api/public/stats')).body;
    assert.equal(after.designs - before.designs, 3);
    assert.equal(after.likes - before.likes, 5);
    assert.ok(after.members >= before.members + 5);
    const list = (await guest().get('/api/public/designers?limit=50')).body.items;
    const ia = list.findIndex((x) => x.user.handle === a.me.handle);
    const ib = list.findIndex((x) => x.user.handle === b.me.handle);
    assert.ok(ia >= 0 && ib > ia, 'A (4 lượt thích) xếp trước B (1 lượt thích)');
    assert.equal(list[ia].likes, 4);
    assert.equal(list[ia].designs, 2); // thiết kế riêng tư không tính
    assert.deepEqual(list[ia].top.map((t) => t.name), ['A1', 'A2']);
    assert.equal(list[ia].user.email, undefined);
  });
  test('tài khoản mẫu: cờ demo hiện ở hồ sơ công khai', async () => {
    const a = await user({ name: 'Mẫu Demo' });
    await User.updateOne({ handle: a.me.handle }, { demo: true });
    const p = (await guest().get(`/api/public/users/${a.me.handle}`)).body;
    assert.equal(p.user.demo, true);
    const b = await user();
    assert.equal((await guest().get(`/api/public/users/${b.me.handle}`)).body.user.demo, false);
  });
  test('tài khoản mẫu: không nhận được link đặt lại mật khẩu, không đăng nhập được', async () => {
    const a = await user({ name: 'Mẫu Khoá' });
    await User.updateOne({ handle: a.me.handle }, { demo: true });
    // quên mật khẩu: trả lời y như email không có tài khoản – không cấp link
    const f = await guest().post('/api/auth/forgot').send({ email: a.me.email });
    assert.equal(f.status, 200);
    assert.equal(f.body.devLink, undefined);
    // còn mật khẩu (tài khoản thật bị đánh dấu mẫu) vẫn không tạo được phiên
    const l = await guest().post('/api/auth/login').send({ email: a.me.email, password: 'matkhau123' });
    assert.equal(l.status, 403);
    assert.equal(l.body.code, 'DEMO_ACCOUNT');
    // tài khoản thường: vẫn nhận link như cũ
    const b = await user();
    assert.ok((await guest().post('/api/auth/forgot').send({ email: b.me.email })).body.devLink);
  });
});

describe('xem trước khi dán link & nâng cấp dữ liệu cũ', () => {
  test('trang /thiet-ke/:id có thẻ og cho thiết kế công khai; riêng tư thì không', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><title>NGK</title></head><body><div id="root"></div></body></html>');
    const site = createApp({ serveClient: true, clientDist: dir });
    const a = await user({ name: 'Tác giả <script>' });
    const pub = await design(a, { name: 'Nhẫn "Ánh Trăng"', extra: { description: 'Mô tả & chi tiết' } });
    const priv = await design(a, { visibility: 'private' });
    const html = (await request(site).get(`/thiet-ke/${pub.id}`)).text;
    assert.match(html, /<meta property="og:title" content="Nhẫn &quot;Ánh Trăng&quot; – Tác giả &lt;script&gt; \| NGK"/);
    assert.match(html, /og:description" content="Mô tả &amp; chi tiết"/);
    assert.match(html, new RegExp(`og:image" content="http://localhost:5173/api/images/[a-f0-9]{24}"`));
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch((await request(site).get(`/thiet-ke/${priv.id}`)).text, /og:title/);
    assert.match((await request(site).get('/kham-pha')).text, /<div id="root">/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('thẻ xem trước trong hộp Chia sẻ (chạy trên máy – Facebook / Zalo không vào được localhost): đúng dữ liệu chèn vào trang', async () => {
    const a = await user({ name: 'Người Chia Sẻ' });
    const pub = await design(a, { name: 'Nhẫn Bình Minh', visibility: 'unlisted', extra: { description: 'Vàng hồng + kim cương' } });
    const priv = await design(a, { visibility: 'private' });
    const r = await guest().get(`/api/public/designs/${pub.id}/share-card`);
    assert.equal(r.status, 200);
    assert.equal(r.body.title, 'Nhẫn Bình Minh – Người Chia Sẻ | NGK');
    assert.equal(r.body.description, 'Vàng hồng + kim cương');
    assert.equal(r.body.url, `http://localhost:5173/thiet-ke/${pub.id}`);
    assert.match(r.body.image, /^http:\/\/localhost:5173\/api\/images\/[a-f0-9]{24}$/);
    assert.equal((await guest().get(new URL(r.body.image).pathname)).status, 200); // trang Chia sẻ hiện ảnh theo đường dẫn
    assert.equal((await guest().get(`/api/public/designs/${priv.id}/share-card`)).status, 404);
    assert.equal((await guest().get('/api/public/designs/khong-co/share-card')).status, 404);
  });
  test('tài khoản cũ chưa có tên riêng → được gợi ý khi khởi động', async () => {
    await User.collection.insertOne({ email: 'cu@ngk.vn', displayName: 'Người Dùng Cũ', emailVerified: true, role: 'user', createdAt: new Date() });
    const m = await migrate();
    assert.ok(m.users >= 1);
    assert.equal((await User.findOne({ email: 'cu@ngk.vn' })).handle, 'nguoi.dung.cu');
  });
});
