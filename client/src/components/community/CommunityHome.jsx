// PHẦN CỘNG ĐỒNG trên trang chủ: "NGK chọn", "Nổi bật tuần này", số liệu, "Nhà thiết kế nổi bật".
// Chưa có thiết kế công khai nào (hoặc không kết nối được máy chủ) → ẩn cả khối, không để lại tiêu đề trống.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Heart, MessageCircle, Repeat2, Shapes, Users } from 'lucide-react';
import { get } from '../../services/api.js';
import { Button } from '../ui/Button.jsx';
import { Avatar } from '../auth/UserMenu.jsx';
import { DesignCard } from './DesignCard.jsx';
import { compactNumber } from '../../utils/time.js';

function useApi(url) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    get(url)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData({ failed: true }));
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

function CommunityStats({ s }) {
  const items = [
    { Icon: Users, n: s.members, label: 'thành viên' },
    { Icon: Shapes, n: s.designs, label: 'thiết kế công khai' },
    { Icon: Heart, n: s.likes, label: 'lượt thích' },
    { Icon: MessageCircle, n: s.comments, label: 'bình luận' },
    { Icon: Repeat2, n: s.remixes, label: 'lượt remix' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="community-stats">
      {items.map(({ Icon, n, label }) => (
        <div key={label} className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-4">
          <Icon size={18} className="text-gold-400" />
          <dd className="mt-2 font-display text-3xl font-semibold text-cream-50">{compactNumber(n)}</dd>
          <dt className="text-xs text-cream-500">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** NGK CHỌN: thiết kế quản trị viên chọn là xuất sắc (mới chọn trước) – không có thì không hiện. */
function FeaturedDesigns() {
  const r = useApi('/api/public/designs?featured=1');
  if (!r || r.failed || !r.items.length) return null;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Award size={14} /> NGK chọn
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50">Thiết kế xuất sắc</h2>
          <p className="mt-2 text-sm text-cream-500">Do đội ngũ NGK tuyển chọn từ cộng đồng.</p>
        </div>
        <Button as={Link} to="/kham-pha?chon=1" variant="ghost">
          Xem tất cả <ArrowRight size={16} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4" data-testid="home-featured">
        {r.items.slice(0, 4).map((d) => (
          <DesignCard key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}

function TrendingDesigns() {
  const r = useApi('/api/public/designs?sort=trending');
  if (r?.failed || (r && !r.items.length)) return null;
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4" data-testid="home-trending">
      {r
        ? r.items.slice(0, 8).map((d) => <DesignCard key={d.id} d={d} />)
        : Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />)}
    </div>
  );
}

function FeaturedDesigners() {
  const r = useApi('/api/public/designers?limit=6');
  if (!r || r.failed || !r.items.length) return null;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-semibold text-cream-50">Nhà thiết kế nổi bật</h2>
        <p className="mt-2 text-sm text-cream-500">Thành viên có nhiều lượt thích nhất trên các thiết kế công khai.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="home-designers">
        {r.items.map(({ user, likes, designs, top }) => (
          <Link
            key={user.id}
            to={user.handle ? `/@${user.handle}` : '/kham-pha'}
            className="group flex flex-col gap-4 rounded-2xl border border-ink-700 bg-ink-850 p-5 transition-colors hover:border-gold-500/50"
          >
            <div className="flex items-center gap-3">
              <Avatar user={user} size={52} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-cream-50 group-hover:text-gold-200">{user.displayName}</p>
                <p className="truncate text-xs text-gold-300/80">@{user.handle}</p>
                <p className="mt-0.5 text-[11px] text-cream-500">
                  {designs} thiết kế · {compactNumber(likes)} lượt thích
                </p>
              </div>
            </div>
            {user.bio && <p className="line-clamp-2 text-xs leading-relaxed text-cream-400">{user.bio}</p>}
            <div className="mt-auto grid grid-cols-3 gap-2">
              {top.map((t) => (
                <div key={t.id} className="aspect-square overflow-hidden rounded-xl bg-ink-900" title={t.name}>
                  {t.thumbnailUrl && <img src={t.thumbnailUrl} alt={t.name} loading="lazy" className="h-full w-full object-cover" />}
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Khối hoàn chỉnh chèn vào trang chủ. */
export function CommunityHome() {
  const stats = useApi('/api/public/stats');
  if (!stats || stats.failed || !stats.designs) return null;
  return (
    <section className="border-y border-ink-700/70 bg-ink-950/60" aria-label="Cộng đồng NGK" data-testid="home-community">
      <div className="mx-auto max-w-7xl space-y-14 px-5 py-16">
        <FeaturedDesigns />
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Cộng đồng</p>
              <h2 className="mt-3 font-display text-4xl font-semibold text-cream-50">Nổi bật tuần này</h2>
              <p className="mt-2 text-sm text-cream-500">Những thiết kế được thích nhiều nhất 7 ngày qua – bấm để xem 3D, thích hoặc remix.</p>
            </div>
            <Button as={Link} to="/kham-pha?sort=trending" variant="ghost">
              Khám phá thêm <ArrowRight size={16} />
            </Button>
          </div>
          <TrendingDesigns />
          <CommunityStats s={stats} />
        </div>
        <FeaturedDesigners />
      </div>
    </section>
  );
}
