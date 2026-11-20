// CÁC FORM ĐĂNG NHẬP / ĐĂNG KÝ / QUÊN MẬT KHẨU – dùng trong hộp thoại (AuthDialog) và trang riêng (AuthPage).
import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { post } from '../../services/api.js';
import { Button } from '../ui/Button.jsx';

export function TextInput({ label, type = 'text', value, onChange, autoComplete, autoFocus, hint, error, ...rest }) {
  const [show, setShow] = useState(false);
  const id = useId();
  const isPw = type === 'password';
  const note = error || hint;
  // nhãn chỉ gắn với ô nhập (nút "hiện mật khẩu" nằm ngoài nhãn → trình đọc màn hình không đọc lẫn)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-cream-100">
        {label}
      </label>
      <div className={`flex items-center rounded-xl border bg-ink-850 focus-within:border-gold-500/60 ${error ? 'border-danger/60' : 'border-ink-600'}`}>
        <input
          id={id}
          type={isPw && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={!!error || undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className="h-11 w-full min-w-0 bg-transparent px-3 text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
          {...rest}
        />
        {isPw && (
          <button type="button" tabIndex={-1} onClick={() => setShow(!show)} className="px-3 text-cream-500 hover:text-cream-100" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {note && (
        <span id={`${id}-note`} className={`block text-xs ${error ? 'text-danger' : 'text-cream-600'}`}>
          {note}
        </span>
      )}
    </div>
  );
}

/** Kiểm tra mật khẩu giống máy chủ (để báo lỗi ngay, máy chủ vẫn kiểm tra lại). */
export function passwordProblem(pw) {
  if (pw.length < 8) return 'Cần ít nhất 8 ký tự';
  if (new TextEncoder().encode(pw).length > 72) return 'Quá dài (tối đa 72 byte – chữ có dấu tính 2–3 byte)';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Cần có cả chữ và số';
  return null;
}

function FormError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      {children}
    </p>
  );
}

/** Link trong thư của hộp thư demo (chưa cấu hình Gmail – email không gửi thật). */
export function DevLink({ url, label = 'Mở liên kết trong email' }) {
  if (!url) return null;
  return (
    <p className="rounded-xl border border-gold-500/40 bg-gold-400/[0.06] px-3 py-2 text-xs text-gold-200">
      Hộp thư demo (chưa cấu hình Gmail): email không được gửi thật.{' '}
      <a href={url} className="font-semibold underline">
        {label}
      </a>
    </p>
  );
}

/** Nút "Tiếp tục với Google" (Google Identity Services). Ẩn khi máy chủ chưa có GOOGLE_CLIENT_ID. */
let gsiLoading = null;
function loadGsi() {
  gsiLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => {
      gsiLoading = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return gsiLoading;
}
export function GoogleButton({ onCredential, text = 'continue_with', divider = true }) {
  const clientId = useAuthStore((s) => s.googleClientId);
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGsi()
      .then((google) => {
        if (!alive || !ref.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential), ux_mode: 'popup' });
        google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', text, locale: 'vi', width: Math.min(360, ref.current.offsetWidth || 320) });
      })
      .catch(() => toast('Không tải được nút đăng nhập Google', { tone: 'warning' }));
    return () => {
      alive = false;
    };
  }, [clientId, text]);
  if (!clientId) return null;
  return (
    <div className="space-y-3">
      <div ref={ref} className="flex min-h-[44px] justify-center" />
      {divider && (
        <div className="flex items-center gap-3 text-[11px] text-cream-600">
          <span className="h-px flex-1 bg-ink-700" /> hoặc dùng email <span className="h-px flex-1 bg-ink-700" />
        </div>
      )}
    </div>
  );
}

function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const Spinner = () => <Loader2 size={16} className="animate-spin" />;

export function LoginForm({ onSwitch, onDone }) {
  const login = useAuthStore((s) => s.login);
  const google = useAuthStore((s) => s.google);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useSubmit(async () => {
    const user = await login(email, password);
    toast(`Xin chào, ${user.displayName}!`, { tone: 'success' });
    onDone?.(user);
  });
  return (
    <form onSubmit={run} className="space-y-4" noValidate>
      <GoogleButton
        onCredential={async (c) => {
          try {
            const user = await google(c);
            toast(`Xin chào, ${user.displayName}!`, { tone: 'success' });
            onDone?.(user);
          } catch (err) {
            setError(err.message);
          }
        }}
      />
      <TextInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
      <TextInput label="Mật khẩu" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex justify-end">
        <button type="button" onClick={() => onSwitch('forgot')} className="text-xs text-gold-300 hover:underline">
          Quên mật khẩu?
        </button>
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !email || !password}>
        {busy && <Spinner />} Đăng nhập
      </Button>
      <p className="text-center text-xs text-cream-500">
        Chưa có tài khoản?{' '}
        <button type="button" onClick={() => onSwitch('register')} className="font-semibold text-gold-300 hover:underline">
          Đăng ký miễn phí
        </button>
      </p>
    </form>
  );
}

export function RegisterForm({ onSwitch, onDone }) {
  const register = useAuthStore((s) => s.register);
  const google = useAuthStore((s) => s.google);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const pwErr = password && touched ? passwordProblem(password) : null;
  const { busy, error, setError, run } = useSubmit(async () => {
    setTouched(true);
    if (passwordProblem(password)) throw new Error(`Mật khẩu: ${passwordProblem(password).toLowerCase()}`);
    const res = await register(email, password, name);
    if (res.mailFailed) toast('Đã tạo tài khoản, nhưng chưa gửi được email xác minh – vào trang Tài khoản bấm “Gửi lại email xác minh” sau ít phút.', { tone: 'warning' });
    else toast('Đã tạo tài khoản – hãy mở email để xác minh địa chỉ.', { tone: 'success' });
    if (res.devLink) useAuthStore.setState({ devMail: { label: 'xác minh email', url: res.devLink } });
    onDone?.(res.user);
  });
  return (
    <form onSubmit={run} className="space-y-4" noValidate>
      <GoogleButton
        text="signup_with"
        onCredential={async (c) => {
          try {
            onDone?.(await google(c));
          } catch (err) {
            setError(err.message);
          }
        }}
      />
      <TextInput label="Tên hiển thị" value={name} onChange={setName} autoComplete="name" autoFocus maxLength={50} />
      <TextInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <TextInput
        label="Mật khẩu"
        type="password"
        value={password}
        onChange={setPassword}
        onBlur={() => setTouched(true)}
        autoComplete="new-password"
        hint="Ít nhất 8 ký tự, có cả chữ và số."
        error={pwErr}
      />
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !name.trim() || !email || !password}>
        {busy && <Spinner />} Tạo tài khoản
      </Button>
      <p className="text-center text-xs text-cream-500">
        Đã có tài khoản?{' '}
        <button type="button" onClick={() => onSwitch('login')} className="font-semibold text-gold-300 hover:underline">
          Đăng nhập
        </button>
      </p>
    </form>
  );
}

export function ForgotForm({ onSwitch }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const { busy, error, run } = useSubmit(async () => {
    const res = await post('/api/auth/forgot', { email });
    setSent({ email, devLink: res.devLink });
  });
  if (sent) {
    return (
      <div className="space-y-4 text-sm text-cream-300">
        <p>
          Nếu <b className="text-cream-50">{sent.email}</b> có tài khoản NGK, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút). Hãy kiểm tra cả
          thư mục Spam.
        </p>
        <DevLink url={sent.devLink} label="Mở liên kết đặt lại mật khẩu" />
        <Button variant="secondary" className="w-full" onClick={() => onSwitch('login')}>
          Quay lại đăng nhập
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={run} className="space-y-4" noValidate>
      <p className="text-sm text-cream-400">Nhập email tài khoản – chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.</p>
      <TextInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !email}>
        {busy && <Spinner />} Gửi liên kết
      </Button>
      <button type="button" onClick={() => onSwitch('login')} className="w-full text-center text-xs text-gold-300 hover:underline">
        Quay lại đăng nhập
      </button>
    </form>
  );
}

export const VIEW_TITLES = { login: 'Đăng nhập', register: 'Tạo tài khoản NGK', forgot: 'Quên mật khẩu' };

export function AuthView({ view, onSwitch, onDone }) {
  if (view === 'register') return <RegisterForm onSwitch={onSwitch} onDone={onDone} />;
  if (view === 'forgot') return <ForgotForm onSwitch={onSwitch} />;
  return <LoginForm onSwitch={onSwitch} onDone={onDone} />;
}
