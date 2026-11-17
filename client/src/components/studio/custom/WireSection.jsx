// Bảng chỉnh SỢI KIM LOẠI: sửa điểm, toạ độ điểm đang chọn, độ dày, khép vòng, bám sát bề mặt.
// (Tiết diện tròn/vuông dùng ô chọn chung của khối trong PropertiesPanel.)
import { useEffect, useState } from 'react';
import { MousePointerClick, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PART_KIND_MAP } from '@ngk/shared';
import { useCustomStore } from '../../../store/customStore.js';
import { useDesignStore } from '../../../store/designStore.js';
import { Button } from '../../ui/Button.jsx';
import { SectionTitle, Slider, Toggle } from '../../ui/controls.jsx';
import { updatePart } from '../../../three/custom/customOps.js';
import { insertWirePoint, rehugWire, removeWirePoint, setWireHug, setWirePoints, wireWorldPoints } from '../../../three/custom/wireOps.js';

const META = PART_KIND_MAP.get('wire').params;

export function WireSection({ part }) {
  const wire = useCustomStore((s) => s.wire);
  const editing = wire?.mode === 'edit' && wire.partId === part.id;
  const sel = editing ? wire.sel : -1;
  const { points, d, closed, hug, track } = part.params;
  const world = wireWorldPoints(part);
  const st = useCustomStore.getState();

  return (
    <div className="space-y-4">
      <SectionTitle>Sợi kim loại</SectionTitle>
      <Button size="sm" variant={editing ? 'primary' : 'secondary'} className="w-full" onClick={() => (editing ? st.endWire() : st.editWire(part.id))}>
        <MousePointerClick size={14} /> {editing ? 'Đang sửa điểm – bấm để xong (Esc)' : 'Sửa điểm trên mô hình'}
      </Button>
      <p className="text-xs text-cream-600">
        {points.length} điểm điều khiển{hug ? ` · đang bám bề mặt (${track.length ? `${track.length} điểm bám` : 'chưa có mặt nào gần'})` : ''}
      </p>

      {editing && (
        <div className="space-y-3 rounded-xl border border-ink-700 p-3">
          {sel >= 0 && sel < world.length ? (
            <>
              <div className="text-xs font-medium text-cream-100">Điểm {sel + 1} / {world.length} (toạ độ thế giới, mm)</div>
              <PointInputs
                value={world[sel]}
                onCommit={(axis, v) => {
                  const pts = wireWorldPoints(part);
                  pts[sel].setComponent(axis, v);
                  setWirePoints(part.id, pts);
                }}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" onClick={() => st.setWire({ sel: insertWirePoint(part.id, sel) })}>
                  <Plus size={14} /> Chèn điểm sau
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={world.length <= 2}
                  onClick={() => removeWirePoint(part.id, sel) && st.setWire({ sel: Math.min(sel, world.length - 2) })}
                >
                  <Trash2 size={14} /> Xoá điểm
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-cream-500">Bấm một chấm tròn trên mô hình để chọn điểm, hoặc bấm lên sợi để chèn điểm mới.</p>
          )}
        </div>
      )}

      <Slider
        label={META.d.label}
        min={META.d.min}
        max={META.d.max}
        step={0.05}
        value={d}
        format={(v) => `${v.toFixed(2)} mm`}
        onChange={(v) => updatePart(part.id, (p) => void (p.params.d = v), { transient: true })}
        onCommit={() => {
          // sợi bám bề mặt: đổi độ dày → tâm sợi phải cách mặt đúng bán kính mới
          if (hug) rehugWire(part.id, { transient: true });
          useDesignStore.getState().commit();
        }}
      />
      <Toggle
        label={META.closed.label}
        description="Nối điểm cuối về điểm đầu thành vòng khép kín (nhẫn dây, khung viền)."
        checked={closed}
        disabled={points.length < 3}
        onChange={(v) => {
          updatePart(part.id, (p) => void (p.params.closed = v), { transient: true });
          if (hug) rehugWire(part.id, { transient: true });
          useDesignStore.getState().commit();
        }}
      />
      <Toggle
        label={META.hug.label}
        description="Sợi tự ôm theo bề mặt các khối bên dưới giữa các điểm (như dây quấn quanh nhẫn) thay vì cong tự do."
        checked={hug}
        onChange={(v) => setWireHug(part.id, v)}
      />
      {hug && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => rehugWire(part.id)} title="Dùng khi đã di chuyển sợi hoặc các khối bên dưới">
          <RefreshCw size={14} /> Bám lại bề mặt
        </Button>
      )}
    </div>
  );
}

function PointInputs({ value, onCommit }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {['X', 'Y', 'Z'].map((ax, i) => (
        <AxisInput key={ax} label={ax} value={value.getComponent(i)} onCommit={(v) => onCommit(i, v)} />
      ))}
    </div>
  );
}

function AxisInput({ label, value, onCommit }) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => setText(value.toFixed(2)), [value]);
  const apply = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && Math.abs(n - value) > 1e-4) onCommit(n);
    else setText(value.toFixed(2));
  };
  return (
    <label className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-850 px-2">
      <span className="text-[10px] font-semibold text-cream-600">{label}</span>
      <input
        aria-label={`Điểm ${label}`}
        type="number"
        step={0.1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-8 w-full min-w-0 bg-transparent text-right text-xs text-cream-50 tabular-nums focus:outline-none"
      />
    </label>
  );
}
