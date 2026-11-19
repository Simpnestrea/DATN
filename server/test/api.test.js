// KIỂM THỬ API (node:test + supertest) trên cơ sở dữ liệu riêng ngk_test (xoá sạch trước khi chạy).
// Chạy: npm test (ở thư mục gốc) – cần MongoDB đang chạy ở 127.0.0.1:27017.
import './env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createDefaultConfig } from '@ngk/shared';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { _sentMail } from '../src/mail.js';
import { _setGoogleVerifier } from '../src/routes/auth.js';
import { Image, Session, Version } from '../src/models.js';

const app = createApp();
const H = { 'X-NGK': '1', Origin: 'http://localhost:5173' };
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');

/** Trình duyệt giả: giữ cookie giữa các lần gọi. */
const browser = () => {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set(H);
  return { agent, get: (u) => agent.get(u), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), del: wrap('delete') };
};
const tokenFrom = (link) => new URL(link).searchParams.get('token');
let seq = 0;
async function register(b, extra = {}) {
  const email = `u${++seq}@ngk.vn`;
  const res = await b.post('/api/auth/register').send({ email, password: 'matkhau123', displayName: `Người ${seq}`, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { email, user: res.body.user, devLink: res.body.devLink };
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

describe('bảo vệ chung', () => {
  test('ghi không có header X-NGK → 403', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.cc', password: 'x' });
    assert.equal(res.status, 403);
  });
  test('Origin lạ → 403', async () => {
    const res = await request(app).post('/api/auth/login').set({ 'X-NGK': '1', Origin: 'https://evil.example' }).send({});
    assert.equal(res.status, 403);
  });
  test('khoá toán tử MongoDB trong dữ liệu → 400', async () => {
    const res = await request(app).post('/api/auth/login').set(H).send({ email: { $ne: '' }, password: { $gt: '' } });
    assert.equal(res.status, 400);
  });
  test('JSON hỏng → 400 tiếng Việt', async () => {
    const res = await request(app).post('/api/auth/login').set({ ...H, 'Content-Type': 'application/json' }).send('{bad');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /JSON/);
  });
  test('API không có → 404 JSON; header bảo mật có mặt', async () => {
    const res = await request(app).get('/api/khong-co');
    assert.equal(res.status, 404);
    assert.ok(res.headers['x-content-type-options']);
    assert.ok(!res.headers['x-powered-by']);
  });
});

describe('đăng ký / đăng nhập', () => {
  test('đăng ký → đăng nhập luôn, cookie httpOnly, chưa xác minh, có thư xác minh', async () => {
    const b = browser();
    const { user, devLink } = await register(b);
    assert.equal(user.emailVerified, false);
    assert.ok(devLink.includes('/xac-minh-email?token='));
    const me = await b.get('/api/auth/me');
    assert.equal(me.body.user.email, user.email);
    assert.equal(me.body.user.passwordHash, undefined);
  });
  test('cookie đặt httpOnly + SameSite=Lax', async () => {
    const res = await request(app).post('/api/auth/register').set(H).send({ email: 'cookie@ngk.vn', password: 'matkhau123', displayName: 'Cookie' });
    const cookies = res.headers['set-cookie'].join(';');
    assert.match(cookies, /ngk_at=.*HttpOnly/i);
    assert.match(cookies, /SameSite=Lax/i);
  });
  test('kiểm tra dữ liệu đăng ký', async () => {
    const b = browser();
    for (const body of [
      { email: 'sai', password: 'matkhau123', displayName: 'Ab' },
      { email: 'x@ngk.vn', password: 'ngan1', displayName: 'Ab' },
      { email: 'x@ngk.vn', password: 'chikhongso', displayName: 'Ab' },
      { email: 'x@ngk.vn', password: 'matkhau123', displayName: 'A' },
    ]) {
      const res = await b.post('/api/auth/register').send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });
  test('email trùng → 409 (không phân biệt hoa thường)', async () => {
    const b = browser();
    const { email } = await register(b);
    const res = await browser().post('/api/auth/register').send({ email: email.toUpperCase(), password: 'matkhau123', displayName: 'Trùng' });
    assert.equal(res.status, 409);
  });
  test('sai mật khẩu 5 lần (cùng máy, cùng email) → tạm chặn; email khác vẫn đăng nhập được', async () => {
    const { email } = await register(browser());
    const b = browser();
    for (let i = 0; i < 5; i++) assert.equal((await b.post('/api/auth/login').send({ email, password: 'sai12345' })).status, 401);
    const locked = await b.post('/api/auth/login').send({ email, password: 'matkhau123' });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'TOO_MANY_ATTEMPTS');
    const { email: email2 } = await register(browser());
    assert.equal((await b.post('/api/auth/login').send({ email: email2, password: 'matkhau123' })).status, 200);
  });
  test('email không tồn tại → cùng thông báo với sai mật khẩu', async () => {
    const res = await browser().post('/api/auth/login').send({ email: 'khongco@ngk.vn', password: 'matkhau123' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Email hoặc mật khẩu không đúng');
  });
  test('khách: /me trả user null; API riêng → 401', async () => {
    assert.equal((await request(app).get('/api/auth/me')).body.user, null);
    assert.equal((await request(app).get('/api/designs')).status, 401);
  });
  test('đăng xuất thu hồi phiên', async () => {
    const b = browser();
    await register(b);
    await b.post('/api/auth/logout');
    assert.equal((await b.get('/api/auth/me')).body.user, null);
    assert.equal((await b.post('/api/auth/refresh')).status, 401);
  });
  test('đăng xuất / đổi mật khẩu → mã truy cập cũ (dù bị lộ, còn hạn 15 phút) hết hiệu lực NGAY', async () => {
    const b = browser();
    const { email } = await register(b);
    const loginOnce = async () => {
      const r = await request(app).post('/api/auth/login').set(H).send({ email, password: 'matkhau123' });
      return r.headers['set-cookie'].find((c) => c.startsWith('ngk_at=')).split(';')[0];
    };
    const at = await loginOnce();
    assert.equal((await request(app).get('/api/designs').set('Cookie', at)).status, 200);
    await request(app).post('/api/auth/logout').set(H).set('Cookie', at);
    assert.equal((await request(app).get('/api/designs').set('Cookie', at)).status, 401);
    // đổi mật khẩu ở thiết bị khác → mã của thiết bị này (bị lộ) cũng chết ngay
    const leaked = await loginOnce();
    assert.equal((await b.post('/api/account/password').send({ current: 'matkhau123', next: 'matkhaumoi456' })).status, 200);
    assert.equal((await request(app).get('/api/designs').set('Cookie', leaked)).status, 401);
    assert.equal((await b.get('/api/designs')).status, 200, 'thiết bị đang đổi mật khẩu vẫn giữ phiên');
  });
});

describe('phiên đăng nhập (gia hạn xoay vòng)', () => {
  test('gia hạn cấp mã mới; dùng lại mã cũ sau thời gian ân hạn → thu hồi mọi phiên', async () => {
    const b = browser();
    const { user } = await register(b);
    const raw = (await request(app).post('/api/auth/login').set(H).send({ email: user.email, password: 'matkhau123' })).headers['set-cookie'];
    const rt = raw.find((c) => c.startsWith('ngk_rt=')).split(';')[0];
    const r1 = await request(app).post('/api/auth/refresh').set(H).set('Cookie', rt);
    assert.equal(r1.status, 200);
    // giả lập đã qua thời gian ân hạn rồi kẻ gian dùng lại mã cũ
    await Session.updateMany({ user: user.id }, { rotatedAt: new Date(Date.now() - 60_000) });
    const reuse = await request(app).post('/api/auth/refresh').set(H).set('Cookie', rt);
    assert.equal(reuse.status, 401);
    assert.equal(await Session.countDocuments({ user: user.id }), 0);
  });
  test('2 tab gia hạn cùng lúc bằng mã cũ trong 30 giây → không bị đá ra', async () => {
    const raw = (await request(app).post('/api/auth/register').set(H).send({ email: 'tabs@ngk.vn', password: 'matkhau123', displayName: 'Tabs' })).headers['set-cookie'];
    const rt = raw.find((c) => c.startsWith('ngk_rt=')).split(';')[0];
    assert.equal((await request(app).post('/api/auth/refresh').set(H).set('Cookie', rt)).status, 200);
    assert.equal((await request(app).post('/api/auth/refresh').set(H).set('Cookie', rt)).status, 200);
  });
  test('mã truy cập giả mạo → coi như chưa đăng nhập', async () => {
    const res = await request(app).get('/api/designs').set('Cookie', 'ngk_at=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.');
    assert.equal(res.status, 401);
  });
});

describe('xác minh email / quên mật khẩu', () => {
  test('xác minh email bằng link; link chỉ dùng 1 lần', async () => {
    const b = browser();
    const { devLink } = await register(b);
    const token = tokenFrom(devLink);
    const ok = await browser().post('/api/auth/verify-email').send({ token });
    assert.equal(ok.body.user.emailVerified, true);
    assert.equal((await browser().post('/api/auth/verify-email').send({ token })).status, 400);
  });
  test('quên mật khẩu: trả lời giống nhau dù email không tồn tại', async () => {
    const res = await browser().post('/api/auth/forgot').send({ email: 'khongco@ngk.vn' });
    assert.equal(res.status, 200);
    assert.equal(res.body.devLink, undefined);
  });
  test('đặt lại mật khẩu → mật khẩu mới dùng được, mọi phiên cũ bị thu hồi', async () => {
    const old = browser();
    const { email } = await register(old);
    const f = await browser().post('/api/auth/forgot').send({ email });
    const reset = browser();
    const r = await reset.post('/api/auth/reset').send({ token: tokenFrom(f.body.devLink), password: 'matkhaumoi9' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.emailVerified, true);
    assert.equal((await old.post('/api/auth/refresh')).status, 401);
    assert.equal((await browser().post('/api/auth/login').send({ email, password: 'matkhau123' })).status, 401);
    assert.equal((await browser().post('/api/auth/login').send({ email, password: 'matkhaumoi9' })).status, 200);
  });
  test('mã đặt lại hết hạn → từ chối', async () => {
    const { email } = await register(browser());
    const f = await browser().post('/api/auth/forgot').send({ email });
    await mongoose.model('OneTimeToken').updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    const r = await browser().post('/api/auth/reset').send({ token: tokenFrom(f.body.devLink), password: 'matkhaumoi9' });
    assert.equal(r.status, 400);
  });
});

describe('Google', () => {
  test('đăng nhập Google tạo tài khoản đã xác minh', async () => {
    _setGoogleVerifier(async () => ({ sub: 'g-1', email: 'gg@gmail.com', email_verified: true, name: 'Google User', picture: 'https://lh3.googleusercontent.com/a' }));
    const b = browser();
    const r = await b.post('/api/auth/google').send({ credential: 'x'.repeat(50) });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.emailVerified, true);
    assert.equal(r.body.user.hasPassword, false);
    assert.equal(r.body.user.avatarUrl, 'https://lh3.googleusercontent.com/a');
    const pw = await browser().post('/api/auth/login').send({ email: 'gg@gmail.com', password: 'matkhau123' });
    assert.match(pw.body.error, /Google/);
  });
  test('CHỐNG CHIẾM TÀI KHOẢN TRƯỚC: kẻ gian đăng ký sẵn email (chưa xác minh) → chủ thật đăng nhập Google giành lại', async () => {
    const attacker = browser();
    await attacker.post('/api/auth/register').send({ email: 'victim@gmail.com', password: 'kegian123', displayName: 'Kẻ gian' });
    _setGoogleVerifier(async () => ({ sub: 'g-victim', email: 'victim@gmail.com', email_verified: true, name: 'Chủ thật' }));
    const owner = browser();
    const r = await owner.post('/api/auth/google').send({ credential: 'y'.repeat(50) });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.hasPassword, false); // mật khẩu của kẻ gian bị huỷ
    assert.equal((await attacker.get('/api/auth/me')).body.user, null); // phiên của kẻ gian bị thu hồi → mã truy cập cũ chết NGAY
    assert.equal((await attacker.post('/api/auth/refresh')).status, 401); // và không gia hạn được
    assert.equal((await browser().post('/api/auth/login').send({ email: 'victim@gmail.com', password: 'kegian123' })).status, 401);
  });
  test('Google chưa xác minh email → từ chối', async () => {
    _setGoogleVerifier(async () => ({ sub: 'g-2', email: 'x@gmail.com', email_verified: false }));
    assert.equal((await browser().post('/api/auth/google').send({ credential: 'z'.repeat(50) })).status, 401);
  });
});

describe('tài khoản', () => {
  test('đổi tên, ảnh đại diện (kiểm tra chữ ký ảnh), xoá ảnh', async () => {
    const b = browser();
    await register(b);
    assert.equal((await b.patch('/api/account/profile').send({ displayName: '  Ngọc   Ánh ' })).body.user.displayName, 'Ngọc Ánh');
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    assert.equal((await b.put('/api/account/avatar').send({ image: fake })).status, 400);
    const up = await b.put('/api/account/avatar').send({ image: PNG });
    assert.equal(up.status, 200);
    const img = await request(app).get(up.body.user.avatarUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    const del = await b.del('/api/account/avatar');
    assert.equal(del.body.user.avatarUrl, null);
    assert.equal((await request(app).get(up.body.user.avatarUrl)).status, 404);
  });
  test('đổi mật khẩu cần mật khẩu cũ; thu hồi thiết bị khác, giữ thiết bị hiện tại', async () => {
    const b = browser();
    const { email } = await register(b);
    const other = browser();
    await other.post('/api/auth/login').send({ email, password: 'matkhau123' });
    assert.equal((await b.post('/api/account/password').send({ current: 'sai', next: 'matkhaumoi1' })).status, 403);
    assert.equal((await b.post('/api/account/password').send({ current: 'matkhau123', next: 'matkhaumoi1' })).status, 200);
    assert.equal((await b.post('/api/auth/refresh')).status, 200);
    assert.equal((await other.post('/api/auth/refresh')).status, 401);
  });
  test('đổi email: xác nhận ở email mới mới đổi', async () => {
    const b = browser();
    const { email } = await register(b);
    const r = await b.post('/api/account/email').send({ email: 'moi@ngk.vn', password: 'matkhau123' });
    assert.equal(r.status, 200);
    assert.equal((await b.get('/api/auth/me')).body.user.email, email);
    const v = await browser().post('/api/auth/verify-email').send({ token: tokenFrom(r.body.devLink) });
    assert.equal(v.body.user.email, 'moi@ngk.vn');
    assert.equal(v.body.changedEmail, true);
  });
  test('liên kết / gỡ Google', async () => {
    const b = browser();
    await register(b);
    _setGoogleVerifier(async () => ({ sub: 'g-link', email: 'khac@gmail.com', email_verified: true }));
    assert.equal((await b.post('/api/account/google').send({ credential: 'l'.repeat(50), password: 'matkhau123' })).body.user.googleLinked, true);
    const other = browser();
    await register(other);
    assert.equal((await other.post('/api/account/google').send({ credential: 'l'.repeat(50), password: 'matkhau123' })).status, 409);
    assert.equal((await b.del('/api/account/google').send({ password: 'matkhau123' })).body.user.googleLinked, false);
  });
});

describe('thiết kế', () => {
  const cfg = createDefaultConfig('ring');
  test('tạo (lưu lần đầu) → có phiên bản 1 + ảnh; khách không xem được ảnh', async () => {
    const b = browser();
    await register(b);
    const r = await b.post('/api/designs').send({ name: 'Nhẫn cưới Ánh', config: cfg, thumbnail: PNG, note: 'bản đầu' });
    assert.equal(r.status, 201);
    assert.equal(r.body.version, 1);
    assert.equal(r.body.design.versionCount, 1);
    assert.equal((await b.get(r.body.design.thumbnailUrl)).status, 200);
    assert.equal((await request(app).get(r.body.design.thumbnailUrl)).status, 404);
  });
  test('cấu hình hỏng / quá lớn → từ chối; cấu hình được chuẩn hoá', async () => {
    const b = browser();
    await register(b);
    assert.equal((await b.post('/api/designs').send({ config: { type: 'tauvutru' } })).status, 400);
    const big = { ...cfg, junk: 'x'.repeat(1.2 * 1024 * 1024) };
    assert.equal((await b.post('/api/designs').send({ config: big })).status, 413);
    const weird = structuredClone(cfg);
    weird.size.ringSize = 999; // ngoài khoảng → bị kẹp lại
    const r = await b.post('/api/designs').send({ config: weird });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const d = await b.get(`/api/designs/${r.body.design.id}`);
    assert.notEqual(d.body.design.config.size.ringSize, 999);
  });
  test('đồng bộ nháp + phát hiện 2 tab cùng sửa (409)', async () => {
    const b = browser();
    await register(b);
    const { design } = (await b.post('/api/designs').send({ config: cfg })).body;
    const c2 = structuredClone(cfg);
    c2.size.ringSize = 14;
    const d1 = await b.put(`/api/designs/${design.id}/draft`).send({ config: c2, revision: design.revision });
    assert.equal(d1.status, 200);
    assert.equal(d1.body.design.revision, design.revision + 1);
    const stale = await b.put(`/api/designs/${design.id}/draft`).send({ config: cfg, revision: design.revision });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'CONFLICT');
    assert.equal(stale.body.revision, design.revision + 1);
    assert.equal((await b.get(`/api/designs/${design.id}/versions`)).body.items.length, 1); // nháp không tạo phiên bản
  });
  test('giữ đúng 20 phiên bản gần nhất, ảnh của bản bị xoá cũng bị xoá', async () => {
    const b = browser();
    const { user } = await register(b);
    let { design } = (await b.post('/api/designs').send({ config: cfg, thumbnail: PNG })).body;
    for (let i = 2; i <= 23; i++) {
      const r = await b.post(`/api/designs/${design.id}/versions`).send({ config: cfg, revision: design.revision, note: `lần ${i}`, thumbnail: PNG });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      design = r.body.design;
    }
    const list = (await b.get(`/api/designs/${design.id}/versions`)).body.items;
    assert.equal(list.length, 20);
    assert.equal(list[0].n, 23);
    assert.equal(list.at(-1).n, 4);
    assert.equal(design.versionCount, 20);
    assert.equal(await Image.countDocuments({ owner: user.id, kind: 'thumb' }), 20);
    const v = await b.get(`/api/designs/${design.id}/versions/10`);
    assert.equal(v.body.version.note, 'lần 10');
    assert.equal((await b.get(`/api/designs/${design.id}/versions/2`)).status, 404);
  });
  test('người khác không đọc / sửa / xoá được thiết kế của mình', async () => {
    const a = browser();
    await register(a);
    const { design } = (await a.post('/api/designs').send({ config: cfg, thumbnail: PNG })).body;
    const b = browser();
    await register(b);
    assert.equal((await b.get(`/api/designs/${design.id}`)).status, 404);
    assert.equal((await b.put(`/api/designs/${design.id}/draft`).send({ config: cfg, revision: 1 })).status, 404);
    assert.equal((await b.del(`/api/designs/${design.id}`)).status, 404);
    assert.equal((await b.get(design.thumbnailUrl)).status, 404);
    assert.equal((await b.get('/api/designs/khong-phai-id')).status, 404);
  });
  test('tìm không dấu, lọc loại, sắp xếp; đổi tên, nhân bản, xoá', async () => {
    const b = browser();
    await register(b);
    await b.post('/api/designs').send({ name: 'Nhẫn cưới Ánh', config: cfg });
    await b.post('/api/designs').send({ name: 'Vòng cổ mặt trăng', config: createDefaultConfig('necklace') });
    const { design } = (await b.post('/api/designs').send({ name: 'Bông tai ngọc', config: createDefaultConfig('earrings') })).body;
    assert.deepEqual((await b.get('/api/designs?q=nhan cuoi')).body.items.map((d) => d.name), ['Nhẫn cưới Ánh']);
    assert.deepEqual((await b.get('/api/designs?q=NGỌC')).body.items.map((d) => d.name), ['Bông tai ngọc']);
    assert.equal((await b.get('/api/designs?type=necklace')).body.total, 1);
    assert.deepEqual((await b.get('/api/designs?sort=name')).body.items.map((d) => d.name), ['Bông tai ngọc', 'Nhẫn cưới Ánh', 'Vòng cổ mặt trăng']);
    assert.equal((await b.get('/api/designs?q=.*')).body.total, 0); // ký tự regex được thoát
    assert.equal((await b.patch(`/api/designs/${design.id}`).send({ name: 'Khuyên tai ngọc trai' })).body.design.name, 'Khuyên tai ngọc trai');
    const dup = await b.post(`/api/designs/${design.id}/duplicate`);
    assert.equal(dup.body.design.name, 'Khuyên tai ngọc trai (bản sao)');
    assert.equal((await b.del(`/api/designs/${design.id}`)).status, 200);
    assert.equal(await Version.countDocuments({ design: design.id }), 0);
    assert.equal((await b.get('/api/designs')).body.total, 3);
  });
  test('thư dev ghi nhận đủ', () => {
    assert.ok(_sentMail.length > 5);
  });
});
