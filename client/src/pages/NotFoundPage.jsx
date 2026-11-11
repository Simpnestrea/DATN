import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { Button } from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex max-w-xl flex-col items-center px-5 py-28 text-center">
        <p className="font-display text-8xl font-semibold text-gold-gradient">404</p>
        <h1 className="mt-4 font-display text-3xl text-cream-50">Không tìm thấy trang</h1>
        <p className="mt-3 text-cream-500">Đường dẫn có thể đã bị thay đổi hoặc không tồn tại.</p>
        <div className="mt-8 flex gap-3">
          <Button as={Link} to="/" variant="secondary">
            Về trang chủ
          </Button>
          <Button as={Link} to="/studio" variant="primary">
            Mở Studio
          </Button>
        </div>
      </main>
    </div>
  );
}
