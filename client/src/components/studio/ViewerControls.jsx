import { shortcutsBlocked } from '../../utils/keys.js';
import { useEffect, useState } from 'react';
import { Contrast, Focus, Gauge, Rotate3d, ScanSearch, Sun } from 'lucide-react';
import { BACKGROUNDS, LIGHTINGS, useViewerStore } from '../../store/viewerStore.js';
import { useDesignStore } from '../../store/designStore.js';
import { IconButton } from '../ui/Button.jsx';

/**
 * Thanh điều khiển nổi trên khung 3D: tự xoay, căn khung, cận cảnh, nền, ánh sáng, chất lượng.
 * @param config  thiết kế đang hiển thị (mặc định: thiết kế đang mở trong Studio)
 * @param showMatte  nút "Tắt bóng" (chế độ dựng hình – chỉ cần khi chỉnh sửa)
 */
export function ViewerControls({ config: configProp, showMatte = true }) {
  const v = useViewerStore();
  // chỉ lấy đúng điều cần biết (có mặt dây để cận cảnh không) – không render lại mỗi lần kéo thanh trượt
  const studioCanCloseUp = useDesignStore((s) => s.config.type === 'necklace' && s.config.deco.pendantShape !== 'none');
  const [lightOpen, setLightOpen] = useState(false);
  // phím M: bật/tắt bóng (bỏ qua khi đang gõ chữ)
  useEffect(() => {
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const st = useViewerStore.getState();
        st.set({ matte: !st.matte });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const canCloseUp = configProp ? configProp.type === 'necklace' && configProp.deco.pendantShape !== 'none' : studioCanCloseUp;

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ink-600/80 bg-ink-850/85 px-2 py-1.5 shadow-xl backdrop-blur">
      <IconButton label="Tự động xoay" active={v.autoRotate} onClick={() => v.set({ autoRotate: !v.autoRotate })}>
        <Rotate3d size={18} />
      </IconButton>
      <IconButton label="Căn lại khung nhìn" onClick={() => v.refit()}>
        <Focus size={18} />
      </IconButton>
      {canCloseUp && (
        <IconButton label="Cận cảnh mặt dây" active={v.closeUp} onClick={() => v.set({ closeUp: !v.closeUp })}>
          <ScanSearch size={18} />
        </IconButton>
      )}

      {/* Chế độ dựng hình: tắt bóng / phản chiếu → nhìn rõ hình khối khi chỉnh sửa (phím M) */}
      {showMatte && <button
        type="button"
        onClick={() => v.set({ matte: !v.matte })}
        aria-pressed={v.matte}
        aria-label={v.matte ? 'Bật bóng' : 'Tắt bóng'}
        title={v.matte ? 'Đang tắt bóng (chế độ dựng hình) – bấm để bật lại vẻ bóng thật · phím M' : 'Tắt bóng để nhìn rõ hình khối khi chỉnh sửa · phím M'}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors ${
          v.matte ? 'bg-gold-400/15 text-gold-200' : 'text-cream-300 hover:bg-ink-700 hover:text-cream-50'
        }`}
      >
        <Contrast size={16} />
        {/* màn hẹp: chỉ biểu tượng (cả thanh vừa màn hình điện thoại); tên vẫn có qua aria-label */}
        <span className="hidden sm:inline">{v.matte ? 'Bật bóng' : 'Tắt bóng'}</span>
      </button>}

      <span className="mx-1 h-5 w-px bg-ink-600" />

      <div className="flex items-center gap-1.5 px-1" role="radiogroup" aria-label="Nền">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.code}
            type="button"
            role="radio"
            aria-checked={v.background === b.code}
            title={`Nền: ${b.name}`}
            aria-label={`Nền ${b.name}`}
            onClick={() => v.set({ background: b.code })}
            className={`h-5 w-5 rounded-full transition-all ${
              v.background === b.code ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-850' : 'ring-1 ring-ink-500 hover:ring-cream-500'
            }`}
            style={{ background: b.swatch }}
          />
        ))}
      </div>

      <span className="mx-1 h-5 w-px bg-ink-600" />

      <div className="relative">
        <IconButton label="Ánh sáng" active={lightOpen} onClick={() => setLightOpen((o) => !o)}>
          <Sun size={18} />
        </IconButton>
        {lightOpen && (
          <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1 shadow-xl">
            {LIGHTINGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  v.set({ lighting: l.code });
                  setLightOpen(false);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs whitespace-nowrap ${
                  v.lighting === l.code ? 'bg-ink-600 text-gold-200' : 'text-cream-300 hover:bg-ink-700'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <IconButton
        label={v.quality === 'high' ? 'Chất lượng: Cao (bấm để chuyển Thấp cho máy yếu)' : 'Chất lượng: Thấp (bấm để chuyển Cao)'}
        active={v.quality === 'high'}
        onClick={() => v.set({ quality: v.quality === 'high' ? 'low' : 'high' })}
      >
        <Gauge size={18} />
      </IconButton>
    </div>
  );
}
