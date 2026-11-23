// TRANG KHÁM PHÁ: thiết kế công khai của cộng đồng – Mới nhất / Nhiều thích / Nổi bật tuần, lọc loại, tìm không dấu.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, Search } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { CardGrid } from '../components/community/DesignCard.jsx';
import { get } from '../services/api.js';

const SORTS = [
  { code: 'new', name: 'Mới nhất' },
  { code: 'top', name: 'Nhiều thích nhất' },
  { code: 'trending', name: 'Nổi bật tuần' },
];

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const sort = SORTS.some((s) => s.code === params.get('sort')) ? params.get('sort') : 'new';
  const type = JEWELRY_TYPES.some((t) => t.code === params.get('type')) ? params.get('type') : '';
  const q = params.get('q') ?? '';
  const featured = params.get('chon') === '1'; // chỉ thiết kế được NGK chọn
  const [text, setText] = useState(q);
  const [state, setState] = useState({ items: null, page: 1, pages: 1, total: 0, loading: true, error: null });
  const reqId = useRef(0);

  const setParam = (k, v) => {
    // đọc URL HIỆN TẠI (không dùng bản `params` cũ mà hẹn giờ ô tìm kiếm còn giữ → không ghép nhầm bộ lọc vừa đổi)
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // gõ tìm kiếm: đợi ngừng gõ 300 ms rồi mới đổi URL
  useEffect(() => {
    if (text === q) return undefined;
    const t = setTimeout(() => setParam('q', text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (page) => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null, ...(page === 1 ? { items: null } : {}) }));
    const p = new URLSearchParams({ sort, page: String(page) });
    if (type) p.set('type', type);
    if (q) p.set('q', q);
    if (featured) p.set('featured', '1');
    try {
      const res = await get(`/api/public/designs?${p}`);
      if (id !== reqId.current) return;
      setState((s) => ({ items: page === 1 ? res.items : [...(s.items ?? []), ...res.items], page: res.page, pages: res.pages, total: res.total, loading: false, error: null }));
    } catch (e) {
      if (id === reqId.current) setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  };
  useEffect(() => {
    load(1);
  }, [sort, type, q, featured]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active) =>
    `rounded-full border px-3.5 py-1.5 text-xs transition-colors ${active ? 'border-gold-500/70 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-300 hover:border-ink-500 hover:text-cream-50'}`;

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-4xl font-semibold text-cream-50">Khám phá</h1>
        <p className="mt-1 text-sm text-cream-500">Thiết kế trang sức do cộng đồng NGK tạo ra – bấm vào để xem 3D, thích, bình luận hoặc remix.</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Sắp xếp" className="flex rounded-full border border-ink-600 bg-ink-850 p-1">
            {SORTS.map((s) => (
              <button
                key={s.code}
                type="button"
                role="tab"
                aria-selected={sort === s.code}
                onClick={() => setParam('sort', s.code === 'new' ? '' : s.code)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${sort === s.code ? 'bg-gold-400/15 text-gold-200' : 'text-cream-400 hover:text-cream-100'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
            <Search size={16} className="text-cream-500" />
            <input
              aria-label="Tìm thiết kế hoặc tác giả"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tìm theo tên thiết kế hoặc tác giả (không dấu cũng được)"
              className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Loại trang sức">
          <button type="button" className={chip(!type)} onClick={() => setParam('type', '')}>
            Tất cả
          </button>
          {JEWELRY_TYPES.map((t) => (
            <button key={t.code} type="button" className={chip(type === t.code)} aria-pressed={type === t.code} onClick={() => setParam('type', t.code)}>
              {t.name}
            </button>
          ))}
          <span className="mx-1 hidden w-px self-stretch bg-ink-700 sm:block" aria-hidden="true" />
          <button type="button" className={`${chip(featured)} flex items-center gap-1.5`} aria-pressed={featured} onClick={() => setParam('chon', featured ? '' : '1')} title="Thiết kế được NGK chọn là nổi bật">
            <Award size={13} /> NGK chọn
          </button>
        </div>
        {sort === 'trending' && <p className="mt-4 text-xs text-cream-600">Xếp theo số lượt thích trong 7 ngày gần nhất.</p>}

        <div className="mt-8">
          {state.error ? (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{state.error}</p>
          ) : (
            <CardGrid
              items={state.items}
              loading={state.loading}
              hasMore={state.page < state.pages}
              onMore={() => load(state.page + 1)}
              empty={q || type || featured ? 'Không có thiết kế nào khớp – thử từ khoá khác nhé.' : 'Chưa có thiết kế công khai nào. Hãy là người đầu tiên chia sẻ!'}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
