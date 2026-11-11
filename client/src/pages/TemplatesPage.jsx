import { useMemo, useState } from 'react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { allTemplates, useCatalogStore } from '../store/catalogStore.js';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { TemplateCard } from '../components/TemplateCard.jsx';

export default function TemplatesPage() {
  const catalog = useCatalogStore((s) => s.catalog);
  const templates = useMemo(() => allTemplates(catalog), [catalog]);
  const [type, setType] = useState('all');
  const list = type === 'all' ? templates : templates.filter((t) => t.type === type);
  const filters = [{ code: 'all', name: 'Tất cả' }, ...JEWELRY_TYPES];

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-14">
        <p className="eyebrow">Thư viện mẫu</p>
        <h1 className="mt-3 font-display text-5xl font-semibold text-cream-50">Mẫu thiết kế gợi ý</h1>
        <p className="mt-3 max-w-2xl text-cream-300">
          Mỗi mẫu là điểm khởi đầu – mở trong Studio để đổi kim loại, đá, kích thước và mọi chi tiết khác.
        </p>

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo loại">
          {filters.map((f) => {
            const active = f.code === type;
            const count = f.code === 'all' ? templates.length : templates.filter((t) => t.type === f.code).length;
            return (
              <button
                key={f.code}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setType(f.code)}
                className={`rounded-full border px-4 py-2 text-sm transition-all ${
                  active ? 'border-gold-500/70 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-300 hover:border-ink-500 hover:text-cream-50'
                }`}
              >
                {f.name} <span className="ml-1 text-xs text-cream-600">{count}</span>
              </button>
            );
          })}
        </div>

        {list.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {list.map((t) => (
              <TemplateCard key={t.code} template={t} />
            ))}
          </div>
        ) : (
          <p className="mt-12 text-center text-cream-500">Chưa có mẫu cho loại này.</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
