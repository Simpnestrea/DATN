// KHU QUẢN TRỊ (/quan-tri/*) – chỉ quản trị viên. Người khác thấy trang 404 y như đường dẫn không tồn tại.
// (Đây chỉ là lớp giao diện: máy chủ tự kiểm tra quyền ở MỌI lời gọi API quản trị.)
import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Flag, Gem, LayoutDashboard, Loader2, MessageCircle, ScrollText, Shapes, ShieldCheck, Users } from 'lucide-react';
import { SiteHeader } from '../../components/layout/SiteHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useAuthStore } from '../../store/authStore.js';
import { useAdminStore } from '../../store/adminStore.js';
import NotFoundPage from '../NotFoundPage.jsx';
import UsersPage from './UsersPage.jsx';
import UserDetailPage from './UserDetailPage.jsx';
import LogsPage from './LogsPage.jsx';
import ReportsPage from './ReportsPage.jsx';
import DesignsPage from './DesignsPage.jsx';
import CommentsPage from './CommentsPage.jsx';
import PrivateDesignPage from './PrivateDesignPage.jsx';
import DashboardPage from './DashboardPage.jsx';
import CatalogPage from './CatalogPage.jsx';

export default function AdminApp() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status !== 'ready') {
    return (
      <div className="flex h-dvh items-center justify-center text-cream-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (user?.role !== 'admin') return <NotFoundPage />;
  return <AdminShell />;
}

const NAV = [
  { to: '/quan-tri/tong-quan', label: 'Tổng quan', Icon: LayoutDashboard },
  // Báo cáo: số nội dung đang chờ xử lý (đỏ khi có việc)
  { to: '/quan-tri/bao-cao', label: 'Báo cáo', Icon: Flag, count: (s) => s?.openTargets, alert: true },
  { to: '/quan-tri/nguoi-dung', label: 'Người dùng', Icon: Users, count: (s) => s?.users },
  { to: '/quan-tri/thiet-ke', label: 'Thiết kế', Icon: Shapes },
  { to: '/quan-tri/binh-luan', label: 'Bình luận', Icon: MessageCircle },
  { to: '/quan-tri/danh-muc', label: 'Danh mục', Icon: Gem },
  { to: '/quan-tri/nhat-ky', label: 'Nhật ký', Icon: ScrollText },
];

function AdminShell() {
  const summary = useAdminStore((s) => s.summary);
  const refresh = useAdminStore((s) => s.refresh);
  const { pathname } = useLocation();
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);
  useEffect(() => {
    document.title = 'Quản trị | NGK';
    return () => {
      document.title = 'NGK – Thiết kế trang sức 3D';
    };
  }, []);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-gold-300 uppercase">
            <ShieldCheck size={15} /> Quản trị
          </p>
          <nav aria-label="Khu quản trị" className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
            {NAV.map(({ to, label, Icon, count, alert }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${isActive ? 'bg-gold-400/10 text-gold-200' : 'text-cream-300 hover:bg-ink-800 hover:text-cream-50'}`
                }
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {count?.(summary) != null &&
                  (alert ? (
                    count(summary) > 0 && (
                      <span className="min-w-[20px] rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold tabular-nums text-white" data-testid="nav-reports-count">
                        {count(summary)}
                      </span>
                    )
                  ) : (
                    <span className="text-xs tabular-nums text-cream-500">{count(summary)}</span>
                  ))}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="mt-6 min-w-0 lg:mt-0">
          <Routes>
            <Route index element={<Navigate to="/quan-tri/tong-quan" replace />} />
            <Route path="tong-quan" element={<DashboardPage />} />
            <Route path="danh-muc" element={<CatalogPage />} />
            <Route path="bao-cao" element={<ReportsPage />} />
            <Route path="thiet-ke" element={<DesignsPage />} />
            <Route path="thiet-ke/:id" element={<PrivateDesignPage />} />
            <Route path="binh-luan" element={<CommentsPage />} />
            <Route path="nguoi-dung" element={<UsersPage />} />
            <Route path="nguoi-dung/:id" element={<UserDetailPage />} />
            <Route path="nhat-ky" element={<LogsPage />} />
            <Route
              path="*"
              element={
                <div className="py-16 text-center">
                  <p className="font-display text-2xl text-cream-50">Không có trang quản trị này</p>
                  <Button as={Link} to="/quan-tri" variant="secondary" className="mt-6">
                    Về trang quản trị
                  </Button>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
