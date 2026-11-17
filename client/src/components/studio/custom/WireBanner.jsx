// Thanh hướng dẫn nổi trên khung 3D khi đang VẼ / SỬA ĐIỂM sợi kim loại.
import { Check, Undo2, X } from 'lucide-react';
import { useCustomStore } from '../../../store/customStore.js';
import { finishWireDraw } from '../../../three/custom/wireOps.js';

export function WireBanner() {
  const wire = useCustomStore((s) => s.wire);
  if (!wire) return null;
  const st = useCustomStore.getState();
  const btn = 'pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-40';
  // đặt sát ĐÁY khung 3D (trên dải nút xem) – không che chỗ đang bấm đặt điểm trên mô hình
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-10 flex justify-center px-4" data-testid="wire-banner">
      <div className="flex max-w-[760px] flex-wrap items-center justify-center gap-2 rounded-2xl border border-gold-500/40 bg-ink-900/90 px-4 py-2 shadow-xl backdrop-blur">
        {wire.mode === 'draw' ? (
          <>
            <span className="text-xs text-gold-200">
              ◆ <b>{wire.points.length}</b> điểm · bấm lên khối / lưới = đặt điểm · bấm điểm xanh = khép vòng · bấm đúp / Enter = xong
            </span>
            <button type="button" className={`${btn} text-cream-300 hover:bg-ink-700`} disabled={!wire.points.length} onClick={() => st.setWire({ points: wire.points.slice(0, -1) })}>
              <Undo2 size={14} /> Bỏ điểm cuối
            </button>
            <button type="button" className={`${btn} bg-gold-400/20 text-gold-100 hover:bg-gold-400/30`} disabled={wire.points.length < 2} onClick={() => finishWireDraw(false)}>
              <Check size={14} /> Xong
            </button>
            <button type="button" className={`${btn} text-cream-400 hover:bg-ink-700`} onClick={() => st.endWire()}>
              <X size={14} /> Huỷ
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-gold-200">
              ◆ Kéo chấm = di chuyển điểm (Shift = tự do) · bấm lên sợi = chèn điểm · Delete = xoá điểm đỏ
            </span>
            <button type="button" className={`${btn} bg-gold-400/20 text-gold-100 hover:bg-gold-400/30`} onClick={() => st.endWire()}>
              <Check size={14} /> Xong (Esc)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
