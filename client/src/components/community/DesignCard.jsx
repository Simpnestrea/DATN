// Thẻ thiết kế công khai (Khám phá, hồ sơ, danh sách remix): ảnh, tên, tác giả, lượt thích / remix / bình luận.
import { Link } from 'react-router-dom';
import { Award, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { TypeIcon } from '../icons.jsx';
import { Avatar } from '../auth/UserMenu.jsx';
import { compactNumber, timeAgo } from '../../utils/time.js';

export const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? code;

/** Tên tác giả (+ ảnh) dẫn tới trang hồ sơ /@ten-rieng. */
export function AuthorLink({ author, size = 22, className = '', avatar = true }) {
  if (!author?.handle) {
    return <span className={`flex items-center gap-1.5 text-cream-400 ${className}`}>{author?.displayName ?? 'Ẩn danh'}</span>;
  }
  return (
    <Link to={`/@${author.handle}`} className={`flex min-w-0 items-center gap-1.5 text-cream-300 hover:text-gold-200 ${className}`} onClick={(e) => e.stopPropagation()}>
      {avatar && <Avatar user={author} size={size} />}
      <span className="truncate">{author.displayName}</span>
    </Link>
  );
}

export function DesignCard({ d }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 transition-colors hover:border-gold-500/50" data-testid="public-card">
      <Link to={`/thiet-ke/${d.id}`} className="block">
        <div className="relative aspect-square bg-ink-900">
          {d.thumbnailUrl ? (
            <img src={d.thumbnailUrl} alt={d.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center text-cream-600">
              <TypeIcon type={d.type} size={48} />
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-ink-950/75 px-2 py-0.5 text-[10px] text-cream-300 backdrop-blur">{typeName(d.type)}</span>
          <span className="absolute right-2 top-2 flex gap-1">
            {d.featured && (
              <span className="flex items-center gap-1 rounded-full bg-gold-400/90 px-2 py-0.5 text-[10px] font-semibold text-ink-950" title="Được NGK chọn là thiết kế nổi bật" data-testid="featured-badge">
                <Award size={11} /> NGK chọn
              </span>
            )}
            {d.remixOf && <span className="rounded-full bg-ink-950/75 px-2 py-0.5 text-[10px] text-gold-200 backdrop-blur">Remix</span>}
          </span>
        </div>
      </Link>
      <div className="space-y-2 p-3.5">
        <Link to={`/thiet-ke/${d.id}`} className="block truncate font-medium text-cream-50 hover:text-gold-200">
          {d.name}
        </Link>
        <div className="flex items-center justify-between gap-2 text-xs">
          <AuthorLink author={d.owner} size={20} className="text-xs" />
          <span className="shrink-0 text-[11px] text-cream-600">{timeAgo(d.publishedAt)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-cream-500">
          <span className={`flex items-center gap-1 ${d.liked ? 'text-rose-400' : ''}`} title="Lượt thích">
            <Heart size={13} fill={d.liked ? 'currentColor' : 'none'} /> {compactNumber(d.likeCount)}
          </span>
          <span className="flex items-center gap-1" title="Bình luận">
            <MessageCircle size={13} /> {compactNumber(d.commentCount)}
          </span>
          {d.remixCount > 0 && (
            <span className="flex items-center gap-1" title="Lượt remix">
              <Repeat2 size={13} /> {compactNumber(d.remixCount)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Lưới thẻ + "Xem thêm" (tải trang tiếp theo). */
export function CardGrid({ items, loading, onMore, hasMore, empty }) {
  if (!items && loading) {
    return (
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    );
  }
  if (items && !items.length) return <p className="py-16 text-center text-sm text-cream-500">{empty}</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4" data-testid="public-grid">
        {items?.map((d) => (
          <DesignCard key={d.id} d={d} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={onMore} disabled={loading} className="rounded-full border border-ink-600 px-5 py-2 text-sm text-cream-200 hover:border-gold-500/60 disabled:opacity-50">
            {loading ? 'Đang tải…' : 'Xem thêm'}
          </button>
        </div>
      )}
    </>
  );
}
