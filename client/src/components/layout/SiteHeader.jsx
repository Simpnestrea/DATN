import { Link, NavLink } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { NgkMark } from '../icons.jsx';
import { Button } from '../ui/Button.jsx';
import { UserMenu } from '../auth/UserMenu.jsx';
import { NotificationBell } from '../community/NotificationBell.jsx';
import { useAuthStore } from '../../store/authStore.js';

const NAV = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/studio', label: 'Studio thiết kế' },
  { to: '/templates', label: 'Mẫu gợi ý' },
  { to: '/kham-pha', label: 'Khám phá' },
];

export function SiteHeader() {
  const user = useAuthStore((s) => s.user);
  const nav = user ? [...NAV, { to: '/thiet-ke-cua-toi', label: 'Thiết kế của tôi' }] : NAV;
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/70 bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="NGK – trang chủ">
          <NgkMark size={30} />
          <span className="leading-none">
            <span className="block font-display text-2xl font-bold tracking-[0.2em] text-gold-gradient">NGK</span>
            <span className="block text-[9px] tracking-[0.32em] text-cream-500 uppercase">Jewelry Design Studio</span>
          </span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm transition-colors ${isActive ? 'text-gold-200' : 'text-cream-300 hover:text-cream-50'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Button as={Link} to="/studio" variant="primary" size="sm">
            Bắt đầu thiết kế <ArrowRight size={15} />
          </Button>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
