// Nút tài khoản trên thanh đầu trang: chưa đăng nhập → "Đăng nhập"; đã đăng nhập → ảnh đại diện + menu.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderHeart, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { Button } from '../ui/Button.jsx';

export function Avatar({ user, size = 32 }) {
  const [broken, setBroken] = useState(false);
  const initials = (user?.displayName ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  if (user?.avatarUrl && !broken) {
    return <img src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-gold-400/20 font-semibold text-gold-200" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function UserMenu({ compact = false }) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (status !== 'ready') return <span className="h-8 w-8 animate-pulse rounded-full bg-ink-700" />;
  if (!user) {
    return (
      <Button variant="ghost" size="sm" onClick={() => useAuthStore.getState().openAuth('login')}>
        Đăng nhập
      </Button>
    );
  }
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-cream-200 hover:bg-ink-700 hover:text-cream-50';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Tài khoản" className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-ink-700">
        <Avatar user={user} size={30} />
        {!compact && <span className="hidden max-w-32 truncate text-sm text-cream-200 lg:inline">{user.displayName}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-ink-600 bg-ink-850 p-1.5 shadow-2xl">
          <div className="border-b border-ink-700 px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold text-cream-50">{user.displayName}</p>
            <p className="truncate text-xs text-cream-500">{user.email}</p>
            {!user.emailVerified && <p className="mt-1 text-[11px] text-gold-300">Email chưa xác minh</p>}
          </div>
          <Link role="menuitem" to="/thiet-ke-cua-toi" className={item} onClick={() => setOpen(false)}>
            <FolderHeart size={16} /> Thiết kế của tôi
          </Link>
          <Link role="menuitem" to="/tai-khoan" className={item} onClick={() => setOpen(false)}>
            <UserRound size={16} /> Tài khoản
          </Link>
          {user.role === 'admin' && (
            <Link role="menuitem" to="/quan-tri" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck size={16} className="text-gold-300" /> Quản trị
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={async () => {
              setOpen(false);
              await logout();
              toast('Đã đăng xuất');
              navigate('/');
            }}
          >
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
