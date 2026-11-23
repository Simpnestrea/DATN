// HỒ SƠ CÔNG KHAI (/@ten-rieng): ảnh, tên, giới thiệu, ngày tham gia, thống kê, tab Thiết kế / Đã thích.
import { lazy, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, Heart, Pencil, Shapes } from 'lucide-react';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { Avatar } from '../components/auth/UserMenu.jsx';
import { Button } from '../components/ui/Button.jsx';
import { CardGrid } from '../components/community/DesignCard.jsx';
import { useAuthStore } from '../store/authStore.js';
import { get } from '../services/api.js';
import { compactNumber, formatDate } from '../utils/time.js';

const NotFoundPage = lazy(() => import('./NotFoundPage.jsx'));

/** Đường dẫn 1 đoạn: bắt đầu bằng @ → hồ sơ; còn lại → trang 404. */
export default function SlugPage() {
  const { slug = '' } = useParams();
  if (!slug.startsWith('@') || slug.length < 4) return <NotFoundPage />;
  return <ProfilePage handle={slug.slice(1).toLowerCase()} />;
}

function ProfilePage({ handle }) {
  const userId = useAuthStore((s) => s.user?.id);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('designs');
  const [list, setList] = useState({ items: null, page: 1, pages: 1, loading: true });
  const reqId = useRef(0);

  useEffect(() => {
    setProfile(null);
    setError(null);
    get(`/api/public/users/${encodeURIComponent(handle)}`)
      .then((r) => {
        setProfile(r);
        document.title = `${r.user.displayName} (@${r.user.handle}) | NGK`;
      })
      .catch((e) => setError(e.code === 'LOCKED' ? 'locked' : e.status === 404 ? 'notfound' : e.message));
  }, [handle, userId]);
  useEffect(() => () => void (document.title = 'NGK – Thiết kế trang sức 3D'), []);

  const load = async (page) => {
    const id = ++reqId.current;
    setList((s) => ({ ...s, loading: true, ...(page === 1 ? { items: null } : {}) }));
    try {
      const r = await get(`/api/public/users/${encodeURIComponent(handle)}/${tab === 'liked' ? 'liked' : 'designs'}?page=${page}`);
      if (id !== reqId.current) return;
      setList((s) => ({ items: page === 1 ? r.items : [...(s.items ?? []), ...r.items], page: r.page, pages: r.pages, loading: false }));
    } catch {
      if (id === reqId.current) setList((s) => ({ ...s, items: s.items ?? [], loading: false }));
    }
  };
  useEffect(() => {
    if (profile) load(1);
  }, [profile?.user.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="font-display text-3xl text-cream-50">
            {error === 'notfound' ? 'Không tìm thấy người dùng' : error === 'locked' ? 'Tài khoản đang bị tạm khoá' : 'Không tải được hồ sơ'}
          </h1>
          <p className="mt-3 text-sm text-cream-500">
            {error === 'notfound'
              ? `Không có ai dùng tên @${handle}.`
              : error === 'locked'
                ? `Hồ sơ @${handle} tạm thời không hiển thị.`
                : error}
          </p>
          <Button as={Link} to="/kham-pha" variant="primary" className="mt-8">
            Tới trang Khám phá
          </Button>
        </main>
      </div>
    );
  }

  const u = profile?.user;
  const tabBtn = (code, label, Icon) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === code}
      onClick={() => setTab(code)}
      className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${tab === code ? 'border-gold-400 text-gold-200' : 'border-transparent text-cream-500 hover:text-cream-100'}`}
    >
      <Icon size={15} /> {label}
    </button>
  );
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        {!u ? (
          <div className="flex items-center gap-5">
            <div className="skeleton h-24 w-24 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-7 w-56 rounded-lg" />
              <div className="skeleton h-4 w-32 rounded-lg" />
            </div>
          </div>
        ) : (
          <header className="flex flex-wrap items-start gap-6">
            <Avatar user={u} size={96} />
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="font-display text-3xl font-semibold text-cream-50" data-testid="profile-name">
                {u.displayName}
              </h1>
              <p className="flex flex-wrap items-center gap-2 text-sm text-gold-300">
                @{u.handle}
                {u.demo && (
                  <span
                    className="rounded-full border border-ink-500 px-2 py-0.5 text-[10px] font-medium tracking-wide text-cream-400"
                    title="Tài khoản minh hoạ do NGK tạo để giới thiệu tính năng cộng đồng"
                    data-testid="demo-badge"
                  >
                    Tài khoản mẫu
                  </span>
                )}
              </p>
              {u.bio && <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-cream-300">{u.bio}</p>}
              <div className="flex flex-wrap gap-5 pt-1 text-xs text-cream-500">
                <span className="flex items-center gap-1.5">
                  <Shapes size={14} /> <b className="text-cream-100">{profile.stats.designs}</b> thiết kế công khai
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart size={14} /> <b className="text-cream-100">{compactNumber(profile.stats.likes)}</b> lượt thích
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} /> Tham gia {formatDate(u.joinedAt)}
                </span>
              </div>
            </div>
            {u.isMe && (
              <Button as={Link} to="/tai-khoan" variant="secondary" size="sm">
                <Pencil size={14} /> Sửa hồ sơ
              </Button>
            )}
          </header>
        )}

        <div role="tablist" className="mt-10 flex gap-6 border-b border-ink-700">
          {tabBtn('designs', 'Thiết kế', Shapes)}
          {tabBtn('liked', 'Đã thích', Heart)}
        </div>
        <div className="mt-8">
          <CardGrid
            items={list.items}
            loading={list.loading || !u}
            hasMore={list.page < list.pages}
            onMore={() => load(list.page + 1)}
            empty={tab === 'liked' ? 'Chưa thích thiết kế công khai nào.' : u?.isMe ? 'Bạn chưa đăng công khai thiết kế nào – mở một thiết kế trong Studio rồi bấm “Chia sẻ”.' : 'Chưa có thiết kế công khai nào.'}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
