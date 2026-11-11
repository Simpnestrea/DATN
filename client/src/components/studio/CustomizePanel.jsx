import { Suspense, useEffect, useRef, useState } from 'react';
import { Diamond, Gem, Layers, ListTree, Palette, Plus, Ruler, SlidersHorizontal, Sparkles } from 'lucide-react';
import { FreeStonesPanel } from './panels/FreeStonesPanel.jsx';
import { useFreeStoneStore } from '../../store/freeStoneStore.js';
import { useCustomStore } from '../../store/customStore.js';
import { useDesignStore } from '../../store/designStore.js';
import { StylePanel } from './panels/StylePanel.jsx';
import { MaterialPanel } from './panels/MaterialPanel.jsx';
import { GemPanel } from './panels/GemPanel.jsx';
import { SizePanel } from './panels/SizePanel.jsx';
import { DecorPanel } from './panels/DecorPanel.jsx';
import { AddPartsPanel, LayersPanel, PropertiesPanel } from './custom/lazy.js';

const TABS = [
  { code: 'style', name: 'Kiểu dáng', icon: Layers, Panel: StylePanel },
  { code: 'material', name: 'Chất liệu', icon: Palette, Panel: MaterialPanel },
  { code: 'gem', name: 'Đá quý', icon: Gem, Panel: GemPanel },
  { code: 'size', name: 'Kích thước', icon: Ruler, Panel: SizePanel },
  { code: 'decor', name: 'Trang trí', icon: Sparkles, Panel: DecorPanel },
  { code: 'stones', name: 'Gắn đá', icon: Diamond, Panel: FreeStonesPanel },
];

// Loại "Tự tạo" dùng bộ tab riêng của trình dựng hình
const CUSTOM_TABS = [
  { code: 'add', name: 'Thêm khối', icon: Plus, Panel: AddPartsPanel },
  { code: 'props', name: 'Thuộc tính', icon: SlidersHorizontal, Panel: PropertiesPanel },
  { code: 'layers', name: 'Lớp & nhóm', icon: ListTree, Panel: LayersPanel },
];

/** Panel tùy chỉnh bên phải: các tab theo quy trình thiết kế (hoặc trình dựng hình với loại Tự tạo). */
export function CustomizePanel() {
  const isCustom = useDesignStore((s) => s.config.type === 'custom');
  const tabs = isCustom ? CUSTOM_TABS : TABS;
  const [tab, setTab] = useState('style');
  const current = tabs.find((t) => t.code === tab) ?? tabs[0];
  const index = tabs.indexOf(current);
  const setMode = useFreeStoneStore((s) => s.setMode);
  const selectedKey = useCustomStore((s) => s.selected.join(','));
  const prevKey = useRef('');

  // Chế độ gắn đá chỉ bật khi đang mở tab "Gắn đá" → tránh lỡ tay gắn đá khi đang xoay mô hình
  useEffect(() => {
    setMode(current.code === 'stones');
    return () => setMode(false);
  }, [current.code, setMode]);

  // Đổi giữa loại thường ↔ Tự tạo: về tab đầu, bỏ chọn khối
  useEffect(() => {
    setTab(isCustom ? 'add' : 'style');
    useCustomStore.getState().select([]);
  }, [isCustom]);

  // Lựa chọn đổi (vừa thêm / vừa bấm một khối) khi đang ở tab "Thêm khối" → chuyển sang "Thuộc tính" để chỉnh ngay
  useEffect(() => {
    if (isCustom && selectedKey && selectedKey !== prevKey.current && current.code === 'add') setTab('props');
    prevKey.current = selectedKey;
  }, [isCustom, selectedKey, current.code]);

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Nhóm tùy chỉnh"
        className="grid gap-0.5 border-b border-ink-700 p-2"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t, i) => {
          const active = t.code === current.code;
          const Icon = t.icon;
          return (
            <button
              key={t.code}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.code)}
              className={`flex flex-col items-center gap-1 rounded-lg px-0.5 py-2 text-[10.5px] font-medium whitespace-nowrap transition-colors ${
                active ? 'bg-ink-750 text-gold-200' : 'text-cream-500 hover:text-cream-100'
              }`}
            >
              <span className="relative">
                <Icon size={17} />
                <span className="absolute -top-1.5 -right-2.5 text-[9px] text-cream-600">{i + 1}</span>
              </span>
              {t.name}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {/* bảng của "Tự tạo" tải riêng (custom/lazy.js) */}
        <Suspense fallback={<p className="text-xs text-cream-500">Đang tải công cụ Tự tạo…</p>}>
          <current.Panel />
        </Suspense>
      </div>

      <div className="flex items-center justify-between border-t border-ink-700 px-5 py-3 text-xs">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setTab(tabs[index - 1].code)}
          className="text-cream-500 hover:text-cream-100 disabled:invisible"
        >
          ← {tabs[index - 1]?.name}
        </button>
        <span className="text-cream-600">
          Bước {index + 1}/{tabs.length}
        </span>
        <button
          type="button"
          disabled={index === tabs.length - 1}
          onClick={() => setTab(tabs[index + 1].code)}
          className="font-medium text-gold-300 hover:text-gold-200 disabled:invisible"
        >
          {tabs[index + 1]?.name} →
        </button>
      </div>
    </aside>
  );
}
