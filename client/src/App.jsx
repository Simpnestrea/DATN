// Gốc ứng dụng: tải danh mục, định tuyến trang, thông báo (toast), bộ chụp thumbnail.
import { Component, lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useCatalogStore } from './store/catalogStore.js';
import { useBakerGate } from './store/bakerGate.js';
import { Toaster } from './components/ui/Toaster.jsx';
import { NgkMark } from './components/icons.jsx';
import { Button } from './components/ui/Button.jsx';
import { AuthDialog, DevMailNotice } from './components/auth/AuthDialog.jsx';
import { useAuthStore } from './store/authStore.js';

// Tách code theo trang – trang Studio (có three.js) chỉ tải khi cần
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const StudioPage = lazy(() => import('./pages/StudioPage.jsx'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const MyDesignsPage = lazy(() => import('./pages/MyDesignsPage.jsx'));
const ExplorePage = lazy(() => import('./pages/ExplorePage.jsx'));
const DesignViewPage = lazy(() => import('./pages/DesignViewPage.jsx'));
const SpecSheetPage = lazy(() => import('./pages/SpecSheetPage.jsx'));
const SlugPage = lazy(() => import('./pages/ProfilePage.jsx')); // /@ten-rieng → hồ sơ; còn lại → 404
// công cụ tạo dữ liệu mẫu (npm run seed:demo) – CHỈ khi chạy dev, bản build không có trang này
const DevSeedPage = import.meta.env.DEV ? lazy(() => import('./pages/DevSeedPage.jsx')) : null;
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx')); // khu quản trị – tách riêng, người thường không tải
const authPages = () => import('./pages/AuthPages.jsx');
const AuthPage = lazy(() => authPages().then((m) => ({ default: m.AuthPage })));
const ResetPasswordPage = lazy(() => authPages().then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => authPages().then((m) => ({ default: m.VerifyEmailPage })));
const ThumbnailBakerHost = lazy(() => import('./three/ThumbnailBakerHost.jsx'));

/**
 * Khung chụp ảnh mẫu gợi ý: chỉ tải (cả bộ dựng 3D ~1 MB JavaScript) khi có ảnh CẦN chụp – trước đây luôn được gắn nên trang
 * không có khung 3D nào (Khám phá, Tài khoản, Quản trị…) cũng tải. Đã tải thì giữ lại (khung tự giải phóng sau khi hết việc).
 */
function ThumbnailBaker() {
  const needed = useBakerGate((s) => s.needed);
  if (!needed) return null;
  return (
    <Suspense fallback={null}>
      <ThumbnailBakerHost />
    </Suspense>
  );
}

function FullScreenLoader({ text = 'Đang tải…' }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 text-cream-500">
      <div className="animate-pulse">
        <NgkMark size={48} />
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// tải phần JavaScript của trang thất bại (mất mạng, máy chủ đang khởi động lại…) – thông báo khác lỗi hiển thị thông thường
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|Failed to fetch/i;

/**
 * Lỗi khi hiển thị một trang → thông báo + nút tải lại, thay vì cả trang trắng (React gỡ toàn bộ giao diện khi có lỗi không được
 * bắt). Chuyển sang trang khác (`resetKey` = đường dẫn) thì thử hiển thị lại.
 */
class PageErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('[NGK] Lỗi hiển thị trang:', error);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const network = CHUNK_ERROR.test(String(error?.message ?? error));
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <NgkMark size={40} />
        <p className="font-display text-2xl text-cream-50">{network ? 'Không tải được trang' : 'Trang gặp lỗi không mong muốn'}</p>
        <p className="max-w-md text-sm text-cream-500">
          {network ? 'Kiểm tra kết nối mạng rồi thử lại.' : 'Thiết kế đang làm vẫn được lưu nháp trên máy. Hãy tải lại trang để tiếp tục.'}
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
          <Button variant="ghost" onClick={() => window.location.assign('/')}>
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }
}
function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
}

export default function App() {
  const status = useCatalogStore((s) => s.status);
  const error = useCatalogStore((s) => s.error);
  const load = useCatalogStore((s) => s.load);

  useEffect(() => {
    load();
    useAuthStore.getState().init(); // kiểm tra phiên đăng nhập (song song với tải danh mục)
  }, [load]);

  if (status === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-2xl text-cream-50">Không tải được dữ liệu</p>
        <p className="text-sm text-cream-500">{error}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (status !== 'ready') return <FullScreenLoader />;

  return (
    <BrowserRouter>
      <ScrollToTop />
      <RouteErrorBoundary>
        <Suspense fallback={<FullScreenLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/dang-nhap" element={<AuthPage initial="login" />} />
            <Route path="/dang-ky" element={<AuthPage initial="register" />} />
            <Route path="/quen-mat-khau" element={<AuthPage initial="forgot" />} />
            <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
            <Route path="/xac-minh-email" element={<VerifyEmailPage />} />
            <Route path="/thiet-ke-cua-toi" element={<MyDesignsPage />} />
            <Route path="/tai-khoan" element={<AccountPage />} />
            <Route path="/kham-pha" element={<ExplorePage />} />
            <Route path="/thiet-ke/:id" element={<DesignViewPage />} />
            <Route path="/in-thong-so" element={<SpecSheetPage />} />
            <Route path="/quan-tri/*" element={<AdminApp />} />
            {DevSeedPage && <Route path="/__demo-seed" element={<DevSeedPage />} />}
            <Route path="/:slug" element={<SlugPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
      <ThumbnailBaker />
      <AuthDialog />
      <DevMailNotice />
      <Toaster />
    </BrowserRouter>
  );
}
