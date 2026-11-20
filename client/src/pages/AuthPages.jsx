// CÁC TRANG TÀI KHOẢN KHÔNG CẦN ĐĂNG NHẬP: đăng nhập / đăng ký / quên mật khẩu, đặt lại mật khẩu, xác minh email.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { AuthView, TextInput, VIEW_TITLES, passwordProblem } from '../components/auth/AuthForms.jsx';
import { Button } from '../components/ui/Button.jsx';
import { useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';
import { post } from '../services/api.js';

function Card({ title, children }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 py-16">
        <div className="rounded-3xl border border-ink-700 bg-ink-850 p-7 shadow-2xl">
          <h1 className="mb-6 font-display text-3xl font-semibold text-cream-50">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Chỉ cho phép chuyển tiếp tới trang trong cùng trang web (chống chuyển hướng mở – open redirect). */
// chỉ nhận đường dẫn trong trang: "/…" nhưng không phải "//…" hay "/\…" (trình duyệt hiểu cả hai là trang web khác)
const safeNext = (v) => (typeof v === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : '/thiet-ke-cua-toi');

/** /dang-nhap · /dang-ky · /quen-mat-khau */
export function AuthPage({ initial = 'login' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const [view, setView] = useState(initial);
  useEffect(() => setView(initial), [initial]);
  const next = safeNext(params.get('next'));
  useEffect(() => {
    if (status === 'ready' && user && view !== 'forgot') navigate(next, { replace: true });
  }, [status, user, view, next, navigate]);
  return (
    <Card title={VIEW_TITLES[view]}>
      <AuthView view={view} onSwitch={setView} onDone={() => navigate(next, { replace: true })} />
    </Card>
  );
}

/** /dat-lai-mat-khau?token=… */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const problem = pw ? passwordProblem(pw) : null;
  const submit = async (e) => {
    e.preventDefault();
    if (problem) return setError(`Mật khẩu: ${problem.toLowerCase()}`);
    if (pw !== pw2) return setError('Hai mật khẩu chưa khớp nhau');
    setBusy(true);
    setError(null);
    try {
      const { user } = await post('/api/auth/reset', { token, password: pw });
      useAuthStore.getState().signedIn(user);
      toast('Đã đặt mật khẩu mới – các thiết bị khác đã được đăng xuất.', { tone: 'success' });
      navigate('/thiet-ke-cua-toi', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Đặt mật khẩu mới">
      {!token ? (
        <p className="text-sm text-cream-400">
          Liên kết thiếu mã. Hãy mở lại liên kết trong email, hoặc <Link to="/quen-mat-khau" className="text-gold-300 underline">gửi liên kết mới</Link>.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextInput label="Mật khẩu mới" type="password" value={pw} onChange={setPw} autoComplete="new-password" autoFocus hint="Ít nhất 8 ký tự, có cả chữ và số." error={problem} />
          <TextInput label="Nhập lại mật khẩu" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" />
          {error && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}{' '}
              {/hết hạn|không hợp lệ/.test(error) && (
                <Link to="/quen-mat-khau" className="underline">
                  Gửi liên kết mới
                </Link>
              )}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !pw || !pw2}>
            {busy && <Loader2 size={16} className="animate-spin" />} Lưu mật khẩu mới
          </Button>
        </form>
      )}
    </Card>
  );
}

/** /xac-minh-email?token=… – tự gửi mã lên máy chủ khi mở trang. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState({ status: token ? 'loading' : 'error', message: token ? '' : 'Liên kết thiếu mã xác minh.' });
  const sentRef = useRef(false);
  useEffect(() => {
    if (!token || sentRef.current) return; // StrictMode chạy effect 2 lần – mã chỉ dùng được 1 lần
    sentRef.current = true;
    post('/api/auth/verify-email', { token })
      .then((res) => {
        const cur = useAuthStore.getState().user;
        if (cur && cur.id === res.user.id) useAuthStore.getState().setUser(res.user);
        setState({ status: 'ok', changedEmail: res.changedEmail, email: res.user.email });
      })
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [token]);
  return (
    <Card title="Xác minh email">
      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-cream-400">
          <Loader2 size={16} className="animate-spin" /> Đang xác minh…
        </p>
      )}
      {state.status === 'ok' && (
        <div className="space-y-5">
          <p className="flex items-start gap-2 text-sm text-cream-200">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
            {state.changedEmail ? (
              <span>
                Email đăng nhập đã đổi thành <b>{state.email}</b>.
              </span>
            ) : (
              <span>
                Đã xác minh <b>{state.email}</b>. Cảm ơn bạn!
              </span>
            )}
          </p>
          <Button as={Link} to="/thiet-ke-cua-toi" variant="primary" className="w-full">
            Tới thiết kế của tôi
          </Button>
        </div>
      )}
      {state.status === 'error' && (
        <div className="space-y-5">
          <p className="flex items-start gap-2 text-sm text-cream-200">
            <XCircle size={18} className="mt-0.5 shrink-0 text-danger" /> {state.message}
          </p>
          <p className="text-xs text-cream-500">Có thể liên kết đã được dùng hoặc đã quá 24 giờ. Vào trang Tài khoản để gửi lại email xác minh.</p>
          <Button as={Link} to="/tai-khoan" variant="secondary" className="w-full">
            Tới trang tài khoản
          </Button>
        </div>
      )}
    </Card>
  );
}
