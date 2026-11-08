import { Link } from 'react-router-dom';
import { NgkMark } from '../icons.jsx';

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-700/70 bg-ink-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <NgkMark size={28} />
          <div>
            <p className="font-display text-lg font-bold tracking-[0.2em] text-gold-gradient">NGK</p>
            <p className="text-xs text-cream-600">Xưởng thiết kế trang sức 3D trực tuyến</p>
          </div>
        </div>
        <nav className="flex gap-6 text-sm text-cream-500">
          <Link to="/studio" className="hover:text-cream-100">Studio</Link>
          <Link to="/templates" className="hover:text-cream-100">Mẫu gợi ý</Link>
          <Link to="/kham-pha" className="hover:text-cream-100">Khám phá</Link>
        </nav>
        <p className="text-xs text-cream-600">© {new Date().getFullYear()} NGK · Đồ án tốt nghiệp</p>
      </div>
    </footer>
  );
}
