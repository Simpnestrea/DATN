// TRANG TÀI KHOẢN: hồ sơ (tên, ảnh đại diện), email (xác minh, đổi email), mật khẩu, liên kết Google,
// quyền xem của quản trị viên với thiết kế riêng tư (đồng ý / từ chối / thu hồi).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Avatar } from '../components/auth/UserMenu.jsx';
import { DevLink, GoogleButton, TextInput, passwordProblem } from '../components/auth/AuthForms.jsx';
import { RequireLogin } from './MyDesignsPage.jsx';
import { useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';
import { del, get, patch, post, put } from '../services/api.js';

export default function AccountPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <RequireLogin reason="Đăng nhập để quản lý tài khoản.">
        <Account />
      </RequireLogin>
    </div>
  );
}

function Section({ title, children, desc }) {
  return (
    <section className="rounded-3xl border border-ink-700 bg-ink-850 p-6">
      <h2 className="font-display text-xl font-semibold text-cream-50">{title}</h2>
      {desc && <p className="mt-1 text-xs text-cream-500">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
const Err = ({ children }) => (children ? <p role="alert" className="text-xs text-danger">{children}</p> : null);

/** Ảnh chọn từ máy → cắt vuông giữa ảnh, thu về 256×256, nén WebP. */
async function avatarDataUrl(file) {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh');
  if (file.size > 15 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 15 MB)');
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 256, 256);
  bmp.close?.();
  const url = c.toDataURL('image/webp', 0.85);
  return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.85);
}

function Account() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <h1 className="font-display text-4xl font-semibold text-cream-50">Tài khoản</h1>
      <Profile user={user} setUser={setUser} />
      <EmailSection user={user} />
      <PasswordSection user={user} setUser={setUser} />
      <GoogleSection user={user} setUser={setUser} />
      <AdminAccessSection />
    </main>
  );
}

const ACCESS_STATUS = {
  pending: { text: 'Đang chờ bạn trả lời', cls: 'text-gold-300' },
  approved: { text: 'Đang được xem', cls: 'text-success' },
  declined: { text: 'Bạn đã từ chối', cls: 'text-cream-500' },
  revoked: { text: 'Bạn đã thu hồi', cls: 'text-cream-500' },
  expired: { text: 'Đã hết hạn', cls: 'text-cream-500' },
};

/**
 * QUYỀN XEM CỦA QUẢN TRỊ VIÊN với thiết kế riêng tư của bạn: chỉ hiện khi đã từng có yêu cầu.
 * Đồng ý → quản trị viên xem (chỉ đọc) 7 ngày; thu hồi được ngay. Mở từ chuông thông báo: /tai-khoan#quyen-xem.
 */
function AdminAccessSection() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);
  const load = () =>
    get('/api/account/access-requests')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (items?.length && window.location.hash === '#quyen-xem') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [items]);
  if (!items?.length) return null;

  const act = async (r, action, message) => {
    setBusy(r.id);
    try {
      await post(`/api/account/access-requests/${r.id}/${action}`);
      toast(message, { tone: 'success' });
      await load();
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div ref={ref} id="quyen-xem" className="scroll-mt-24">
      <Section title="Quyền xem của quản trị viên" desc="Thiết kế riêng tư chỉ bạn xem được. Quản trị viên muốn xem (ví dụ để hỗ trợ bạn) phải xin phép – bạn đồng ý thì họ xem được, chỉ đọc, trong 7 ngày; thu hồi lúc nào cũng được.">
        <ul className="space-y-3" data-testid="access-requests">
          {items.map((r) => {
            const st = ACCESS_STATUS[r.status] ?? ACCESS_STATUS.expired;
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-3.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                  {r.design.thumbnailUrl && <img src={r.design.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-cream-100">
                    <b>{r.admin.displayName}</b> <span className="text-cream-500">(quản trị viên)</span> xin xem{' '}
                    <Link to={`/studio?id=${r.design.id}`} className="font-medium text-gold-200 hover:text-gold-100">
                      “{r.design.name}”
                    </Link>
                  </p>
                  <p className="text-xs text-cream-400">Lý do: {r.reason}</p>
                  <p className="text-[11px] text-cream-600">
                    Gửi {new Date(r.createdAt).toLocaleString('vi-VN')}
                    {r.status === 'approved' && r.expiresAt ? ` · xem được đến ${new Date(r.expiresAt).toLocaleString('vi-VN')}` : ''}
                    {' · '}
                    <span className={st.cls}>{st.text}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.status === 'pending' && (
                    <>
                      <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => act(r, 'approve', 'Đã đồng ý – quản trị viên xem được trong 7 ngày')}>
                        Đồng ý
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r, 'decline', 'Đã từ chối yêu cầu')}>
                        Từ chối
                      </Button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => act(r, 'revoke', 'Đã thu hồi quyền xem')}>
                      Thu hồi
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function Profile({ user, setUser }) {
  const [name, setName] = useState(user.displayName);
  useEffect(() => setName(user.displayName), [user.displayName]);
  const fileRef = useRef(null);
  const a = useAction();
  return (
    <Section title="Hồ sơ">
      <div className="flex items-center gap-5">
        <Avatar user={user} size={80} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Chọn ảnh đại diện"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              a.run(async () => {
                const image = await avatarDataUrl(f);
                setUser((await put('/api/account/avatar', { image })).user);
                toast('Đã cập nhật ảnh đại diện', { tone: 'success' });
              });
            }}
          />
          <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => fileRef.current.click()}>
            {a.busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Đổi ảnh
          </Button>
          {user.avatarUrl && (
            <Button size="sm" variant="ghost" disabled={a.busy} onClick={() => a.run(async () => setUser((await del('/api/account/avatar')).user))}>
              Bỏ ảnh
            </Button>
          )}
        </div>
      </div>
      <ProfileForm user={user} setUser={setUser} name={name} setName={setName} />
      <Err>{a.error}</Err>
    </Section>
  );
}

/** Tên hiển thị + tên riêng (/@ten-rieng, kiểm tra còn trống ngay khi gõ) + giới thiệu. */
function ProfileForm({ user, setUser, name, setName }) {
  const [handle, setHandle] = useState(user.handle ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [check, setCheck] = useState(null); // { available, reason } | null
  const a = useAction();
  useEffect(() => {
    setHandle(user.handle ?? '');
    setBio(user.bio ?? '');
  }, [user.handle, user.bio]);
  const h = handle.trim().toLowerCase().replace(/^@/, '');
  useEffect(() => {
    if (!h || h === user.handle) {
      setCheck(null);
      return undefined;
    }
    const t = setTimeout(() => {
      get(`/api/account/handle-available?handle=${encodeURIComponent(h)}`)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [h, user.handle]);
  const changed = name.trim() !== user.displayName || h !== (user.handle ?? '') || bio.trim() !== (user.bio ?? '');
  const blocked = name.trim().length < 2 || !h || (check && !check.available);
  return (
    <form
      className="space-y-4 border-t border-ink-700 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          setUser((await patch('/api/account/profile', { displayName: name, handle: h, bio })).user);
          toast('Đã lưu hồ sơ', { tone: 'success' });
        });
      }}
    >
      <TextInput label="Tên hiển thị" value={name} onChange={setName} maxLength={50} />
      <TextInput
        label="Tên riêng (đường dẫn hồ sơ)"
        value={handle}
        onChange={(v) => setHandle(v.toLowerCase().replace(/\s+/g, ''))}
        maxLength={31}
        autoComplete="username"
        hint={check?.available ? `✓ Còn trống – hồ sơ của bạn sẽ ở ${window.location.origin}/@${h}` : '3–30 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới.'}
        error={check && !check.available ? check.reason : null}
      />
      <label className="block space-y-1.5">
        <span className="flex justify-between text-[13px] font-medium text-cream-100">
          Giới thiệu <span className="text-[11px] font-normal text-cream-600">{bio.length}/300</span>
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 300))}
          rows={3}
          placeholder="Vài dòng về bạn – phong cách, chất liệu yêu thích…"
          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/60 focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={a.busy || !changed || blocked}>
          {a.busy && <Loader2 size={14} className="animate-spin" />} Lưu hồ sơ
        </Button>
        {user.handle && (
          <Link to={`/@${user.handle}`} className="text-xs text-gold-300 hover:underline">
            Xem hồ sơ công khai (@{user.handle})
          </Link>
        )}
      </div>
      <Err>{a.error}</Err>
    </form>
  );
}

function EmailSection({ user }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(null);
  const [resent, setResent] = useState(null);
  const a = useAction();
  return (
    <Section title="Email">
      <p className="flex items-center gap-2 text-sm text-cream-200">
        {user.email}
        {user.emailVerified ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 size={14} /> đã xác minh
          </span>
        ) : (
          <span className="text-xs text-gold-300">chưa xác minh</span>
        )}
      </p>
      {!user.emailVerified && (
        <div className="space-y-2">
          <p className="text-xs text-cream-500">Xác minh email để sau này đăng thiết kế công khai và bình luận.</p>
          <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => a.run(async () => setResent(await post('/api/auth/resend-verification')))}>
            Gửi lại email xác minh
          </Button>
          {resent && <p className="text-xs text-success">Đã gửi – kiểm tra hộp thư (cả mục Spam).</p>}
          <DevLink url={resent?.devLink} label="Mở liên kết xác minh" />
        </div>
      )}
      <form
        className="space-y-3 border-t border-ink-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(async () => {
            setSent(await post('/api/account/email', { email, password }));
            setPassword('');
          });
        }}
      >
        <p className="text-[13px] font-medium text-cream-100">Đổi email đăng nhập</p>
        <TextInput label="Email mới" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {user.hasPassword && <TextInput label="Mật khẩu hiện tại" type="password" value={password} onChange={setPassword} autoComplete="current-password" />}
        <Button type="submit" size="sm" variant="secondary" disabled={a.busy || !email || (user.hasPassword && !password)}>
          Gửi liên kết xác nhận
        </Button>
        {sent && (
          <p className="text-xs text-success">
            Đã gửi liên kết tới <b>{sent.pendingEmail}</b>. Email đăng nhập chỉ đổi sau khi bạn bấm liên kết đó (trong 24 giờ).
          </p>
        )}
        <DevLink url={sent?.devLink} label="Mở liên kết xác nhận email mới" />
      </form>
      <Err>{a.error}</Err>
    </Section>
  );
}

function PasswordSection({ user, setUser }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const a = useAction();
  const problem = next ? passwordProblem(next) : null;
  return (
    <Section title={user.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'} desc={user.hasPassword ? 'Đổi xong, các thiết bị khác sẽ bị đăng xuất.' : 'Tài khoản của bạn đang đăng nhập bằng Google. Đặt mật khẩu để đăng nhập được bằng email nữa.'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem || next !== next2) return;
          a.run(async () => {
            setUser((await post('/api/account/password', { current, next })).user);
            setCurrent('');
            setNext('');
            setNext2('');
            toast('Đã lưu mật khẩu mới', { tone: 'success' });
          });
        }}
      >
        {user.hasPassword && <TextInput label="Mật khẩu hiện tại" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />}
        <TextInput label="Mật khẩu mới" type="password" value={next} onChange={setNext} autoComplete="new-password" hint="Ít nhất 8 ký tự, có cả chữ và số." error={problem} />
        <TextInput label="Nhập lại mật khẩu mới" type="password" value={next2} onChange={setNext2} autoComplete="new-password" error={next2 && next !== next2 ? 'Hai mật khẩu chưa khớp' : null} />
        <Button type="submit" size="sm" variant="secondary" disabled={a.busy || !next || !!problem || next !== next2 || (user.hasPassword && !current)}>
          Lưu mật khẩu
        </Button>
        <Err>{a.error}</Err>
      </form>
    </Section>
  );
}

function GoogleSection({ user, setUser }) {
  const clientId = useAuthStore((s) => s.googleClientId);
  const google = useAuthStore((s) => s.google);
  const a = useAction();
  // gắn / gỡ Google là thao tác nhạy cảm → máy chủ yêu cầu mật khẩu hiện tại (tài khoản có mật khẩu)
  const [password, setPassword] = useState('');
  const needPassword = user.hasPassword && !password;
  const passwordInput = user.hasPassword && (
    <div className="max-w-xs">
      <TextInput label="Mật khẩu hiện tại" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
    </div>
  );
  return (
    <Section title="Đăng nhập bằng Google">
      {user.googleLinked ? (
        <div className="space-y-3">
          <span className="flex items-center gap-1 text-sm text-success">
            <CheckCircle2 size={15} /> Đã liên kết tài khoản Google
          </span>
          {passwordInput}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={a.busy || !user.hasPassword || needPassword}
              title={user.hasPassword ? '' : 'Đặt mật khẩu trước khi gỡ Google'}
              onClick={() =>
                a.run(async () => {
                  setUser((await del('/api/account/google', { password })).user);
                  setPassword('');
                })
              }
            >
              Gỡ liên kết
            </Button>
            {!user.hasPassword && <span className="text-xs text-cream-500">Đặt mật khẩu ở trên trước khi gỡ, nếu không bạn sẽ không đăng nhập lại được.</span>}
          </div>
        </div>
      ) : clientId ? (
        <div className="space-y-3">
          {passwordInput}
          {needPassword ? (
            <p className="text-xs text-cream-500">Nhập mật khẩu hiện tại để hiện nút liên kết Google.</p>
          ) : (
            <div className="max-w-xs">
              <GoogleButton
                text="signin_with"
                divider={false}
                onCredential={(c) =>
                  a.run(async () => {
                    await google(c, { link: true, password });
                    setPassword('');
                    toast('Đã liên kết Google', { tone: 'success' });
                  })
                }
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-cream-500">Máy chủ chưa bật đăng nhập Google (thiếu GOOGLE_CLIENT_ID trong server/.env).</p>
      )}
      <Err>{a.error}</Err>
    </Section>
  );
}
