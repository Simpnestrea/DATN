// BẢNG THÔNG SỐ (nhóm theo mục) – dùng ở trang thiết kế công khai và bản in PDF.
import { useMemo } from 'react';
import { describeConfig } from '@ngk/shared';
import { useCatalogStore } from '../../store/catalogStore.js';

export function useSpecGroups(config) {
  const lookup = useCatalogStore((s) => s.lookup);
  return useMemo(() => {
    if (!config) return [];
    const map = new Map();
    for (const row of describeConfig(config, lookup)) {
      if (!map.has(row.group)) map.set(row.group, []);
      map.get(row.group).push(row);
    }
    return [...map.entries()];
  }, [config, lookup]);
}

/** @param variant 'dark' (trang web) | 'print' (giấy trắng) */
export function SpecsTable({ config, variant = 'dark' }) {
  const groups = useSpecGroups(config);
  const print = variant === 'print';
  return (
    <div className={print ? 'spec-print grid grid-cols-2 gap-x-6 gap-y-3' : 'space-y-5'}>
      {groups.map(([group, rows]) => (
        <section key={group} className={print ? 'break-inside-avoid' : ''}>
          <h3 className={print ? 'mb-1 text-[10px] font-bold tracking-[0.18em] text-[#8a7440] uppercase' : 'eyebrow mb-2'}>{group}</h3>
          <dl className={print ? 'divide-y divide-[#e7e1d4] border-y border-[#e7e1d4]' : 'divide-y divide-ink-700 rounded-xl border border-ink-700 bg-ink-850'}>
            {rows.map((r) => (
              <div key={r.label} className={print ? 'flex justify-between gap-3 py-1 text-[11px]' : 'flex justify-between gap-4 px-3.5 py-2.5 text-sm'}>
                <dt className={print ? 'text-[#6b6458]' : 'text-cream-500'}>{r.label}</dt>
                <dd className={print ? 'text-right font-medium text-[#1d1b18]' : 'text-right text-cream-100'}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
