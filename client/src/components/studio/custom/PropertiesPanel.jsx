// Bảng "Thuộc tính": chỉnh khối đang chọn – kích thước, vị trí/xoay/co giãn (nhập số), vật liệu, thao tác.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Copy, Crosshair, Eraser, FlipHorizontal2, Group, Magnet, PenLine, Repeat, Trash2, Ungroup } from 'lucide-react';
import { CARVE_SHAPES, FINISHES, PART_KIND_MAP } from '@ngk/shared';
import { useDesignStore } from '../../../store/designStore.js';
import { useCustomStore } from '../../../store/customStore.js';
import { activeGemstones, activeMaterials, useCatalogStore } from '../../../store/catalogStore.js';
import { Field, Notice, Segmented, SectionTitle, Slider, Swatch, Toggle } from '../../ui/controls.jsx';
import { Button } from '../../ui/Button.jsx';
import { gemFill, metalFill } from '../../../utils/color.js';
import { TextSection } from './TextSection.jsx';
import { WireSection } from './WireSection.jsx';
import {
  centerParts,
  dropToGrid,
  duplicate,
  groupParts,
  mirror,
  radialArray,
  removeParts,
  rotateBy,
  ungroupParts,
  updatePart,
  updateParts,
} from '../../../three/custom/customOps.js';

const commit = () => useDesignStore.getState().commit();
const TEXT_KEYS = ['text', 'font', 'size', 'spacing', 'paths'];
const WIRE_KEYS = ['points', 'track', 'd', 'closed', 'hug'];

/** Ô nhập số: gõ tự do, áp dụng khi rời ô hoặc Enter. */
function NumberField({ label, value, onCommit, step = 0.1, suffix }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const apply = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <label className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-850 px-2 focus-within:border-gold-500/60">
      <span className="text-[10px] font-semibold text-cream-600">{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-8 w-full min-w-0 bg-transparent text-right text-xs text-cream-50 tabular-nums focus:outline-none"
      />
      {suffix && <span className="text-[10px] text-cream-600">{suffix}</span>}
    </label>
  );
}

function Vec3({ label, value, onCommit, step, suffix }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-3 gap-1.5">
        {['X', 'Y', 'Z'].map((ax, i) => (
          <NumberField
            key={ax}
            label={ax}
            value={value[i]}
            step={step}
            suffix={suffix}
            onCommit={(n) => onCommit(i, n)}
          />
        ))}
      </div>
    </Field>
  );
}

function MetalPicker({ value, finish, onMetal, onFinish }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const metals = useMemo(() => activeMaterials(catalog), [catalog]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {metals.map((m) => (
          <Swatch key={m.code} size="sm" name={m.name.replace(/ 18K| 925| 950/, '')} fill={metalFill(m.color)} selected={value === m.code} onClick={() => onMetal(m.code)} />
        ))}
      </div>
      {onFinish && <Segmented options={FINISHES} value={finish} onChange={onFinish} />}
    </div>
  );
}

function StonePicker({ value, onPick }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const gems = useMemo(() => activeGemstones(catalog).filter((g) => g.kind !== 'pearl'), [catalog]);
  return (
    <div className="grid grid-cols-5 gap-x-1.5 gap-y-3">
      {gems.map((g) => (
        <Swatch key={g.code} size="sm" name={g.name.replace(/\s*\(.*\)/, '')} fill={gemFill(g.color)} selected={value === g.code} onClick={() => onPick(g.code)} />
      ))}
    </div>
  );
}

/** Thao tác dùng chung cho 1 hoặc nhiều khối. */
function Actions({ ids, grouped }) {
  const placeMode = useCustomStore((s) => s.placeMode);
  const setPlaceMode = useCustomStore((s) => s.setPlaceMode);
  const [count, setCount] = useState(6);
  // có đai tròn trong thiết kế → mặc định xếp vòng quanh đai (đai nằm trên lưới, không ở gốc toạ độ)
  const hasBand = useDesignStore((s) => s.config.parts.some((p) => p.kind === 'band' && !ids.includes(p.id)));
  const [axis, setAxis] = useState(hasBand ? 'band' : 'z');
  const axisOptions = [...(hasBand ? [{ code: 'band', name: 'Đai' }] : []), ...['x', 'y', 'z'].map((a) => ({ code: a, name: a.toUpperCase() }))];
  return (
    <div className="space-y-4">
      <SectionTitle>Thao tác</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => duplicate(ids)}>
          <Copy size={14} /> Nhân bản
        </Button>
        <Button size="sm" variant={placeMode ? 'primary' : 'secondary'} onClick={() => setPlaceMode(!placeMode)}>
          <Magnet size={14} /> {placeMode ? 'Bấm lên bề mặt…' : 'Đặt lên bề mặt'}
        </Button>
        <Button size="sm" onClick={() => dropToGrid(ids)}>
          <ArrowDownToLine size={14} /> Hạ xuống lưới
        </Button>
        <Button size="sm" onClick={() => centerParts(ids)}>
          <Crosshair size={14} /> Căn giữa
        </Button>
        {ids.length > 1 && !grouped && (
          <Button size="sm" onClick={() => groupParts(ids)}>
            <Group size={14} /> Nhóm lại
          </Button>
        )}
        {grouped && (
          <Button size="sm" onClick={() => ungroupParts(ids)}>
            <Ungroup size={14} /> Bỏ nhóm
          </Button>
        )}
      </div>

      <Field label="Xoay nhanh 90°" hint="Xoay quanh trục thế giới qua tâm khối. Xoay tự do: giữ Ctrl + kéo khối (bấm X/Y/Z khi kéo để khóa trục, Shift để bước 15°).">
        <div className="grid grid-cols-3 gap-1.5">
          {['x', 'y', 'z'].map((a) => (
            <div key={a} className="flex overflow-hidden rounded-full border border-ink-600">
              <button type="button" onClick={() => rotateBy(ids, a, -90)} className="flex-1 py-1.5 text-xs text-cream-300 hover:bg-ink-700" title={`Xoay −90° quanh ${a.toUpperCase()}`}>
                ↺
              </button>
              <span className="flex items-center px-1 text-[11px] font-semibold" style={{ color: { x: '#e5675f', y: '#6fc49a', z: '#6f9fe5' }[a] }}>
                {a.toUpperCase()}
              </span>
              <button type="button" onClick={() => rotateBy(ids, a, 90)} className="flex-1 py-1.5 text-xs text-cream-300 hover:bg-ink-700" title={`Xoay +90° quanh ${a.toUpperCase()}`}>
                ↻
              </button>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Đối xứng (tạo bản sao lật qua trục)">
        <div className="grid grid-cols-3 gap-1.5">
          {['x', 'y', 'z'].map((a) => (
            <Button key={a} size="sm" onClick={() => mirror(ids, a)}>
              <FlipHorizontal2 size={14} /> {a.toUpperCase()}
            </Button>
          ))}
        </div>
      </Field>

      <Field label="Xếp vòng" hint="Tạo nhiều bản sao xoay đều: “Đai” = quanh tâm và trục của đai tròn (ví dụ đá quanh nhẫn); X/Y/Z = quanh trục qua gốc toạ độ (ví dụ cánh hoa: Y).">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={2}
            max={48}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-8 w-16 rounded-lg border border-ink-600 bg-ink-850 px-2 text-center text-xs text-cream-50"
            aria-label="Số bản"
          />
          <span className="text-xs text-cream-500">bản · trục</span>
          <div className="flex-1">
            <Segmented options={axisOptions} value={axisOptions.some((o) => o.code === axis) ? axis : axisOptions[0].code} onChange={setAxis} />
          </div>
          <Button size="sm" onClick={() => radialArray(ids, count, axisOptions.some((o) => o.code === axis) ? axis : axisOptions[0].code)}>
            <Repeat size={14} />
          </Button>
        </div>
      </Field>

      <Button size="sm" variant="danger" className="w-full" onClick={() => removeParts(ids)}>
        <Trash2 size={14} /> Xóa {ids.length > 1 ? `${ids.length} khối` : 'khối'}
      </Button>
    </div>
  );
}

export function PropertiesPanel() {
  const parts = useDesignStore((s) => s.config.parts);
  const selected = useCustomStore((s) => s.selected);
  const sel = parts.filter((p) => selected.includes(p.id));

  if (!sel.length) {
    return <Notice>Chưa chọn khối nào. Bấm vào một khối trên mô hình (hoặc trong tab “Lớp”) để chỉnh, hoặc thêm khối mới ở tab “Thêm khối”.</Notice>;
  }

  if (sel.length > 1) {
    const ids = sel.map((p) => p.id);
    const grouped = sel.every((p) => p.group && p.group === sel[0].group);
    const anyGem = sel.some((p) => p.kind === 'gem');
    const anyMetal = sel.some((p) => p.kind !== 'gem');
    return (
      <div className="space-y-6">
        <p className="text-sm text-cream-300">
          Đang chọn <b className="text-gold-200">{sel.length} khối</b>
          {grouped ? ' (một nhóm)' : ''}. Tay cầm sẽ biến đổi cả cụm quanh tâm chung.
        </p>
        {anyMetal && (
          <Field label="Kim loại cho tất cả khối kim loại">
            <MetalPicker
              value={sel.find((p) => p.kind !== 'gem')?.mat.metal}
              finish={sel.find((p) => p.kind !== 'gem')?.mat.finish}
              onMetal={(code) => updateParts(ids, (p) => void (p.mat.metal = code))}
              onFinish={(f) => updateParts(ids, (p) => void (p.mat.finish = f))}
            />
          </Field>
        )}
        {anyGem && (
          <Field label="Loại đá cho tất cả viên đá">
            <StonePicker value={sel.find((p) => p.kind === 'gem')?.mat.stone} onPick={(code) => updateParts(ids.filter((id) => sel.find((p) => p.id === id).kind === 'gem'), (p) => void (p.mat.stone = code))} />
          </Field>
        )}
        <Actions ids={ids} grouped={grouped} />
      </div>
    );
  }

  return <SinglePart part={sel[0]} />;
}

/**
 * TẠO HÌNH trực tiếp trên khối đang chọn: cọ khoét (bấm/kéo lên khối), làm rỗng, cắt phẳng.
 * Mọi thay đổi lưu trong khối, có Undo, xoá/tắt bất kỳ lúc nào để trở lại như cũ.
 */
function ShapeSection({ part }) {
  const carve = useCustomStore((s) => s.carve);
  const setCarve = useCustomStore((s) => s.setCarve);
  const set = (fn, opts) => updatePart(part.id, fn, opts);
  const { carves, shell, slice } = part.shape;
  const mm = (v) => `${Number(v).toFixed(1)} mm`;

  return (
    <div className="space-y-5 rounded-2xl border border-gold-500/30 bg-gold-400/[0.04] p-4">
      <SectionTitle>Tạo hình khối</SectionTitle>

      {/* Cọ khoét */}
      <div className="space-y-3">
        <Button size="sm" variant={carve.on ? 'primary' : 'secondary'} className="w-full" onClick={() => setCarve({ on: !carve.on })}>
          <Eraser size={14} /> {carve.on ? 'Đang bật cọ gọt – bấm / kéo lên khối (Esc để tắt)' : 'Bật cọ gọt'}
        </Button>
        <Segmented options={CARVE_SHAPES} value={carve.shape} onChange={(v) => setCarve({ shape: v })} />
        <Slider label="Cỡ cọ (bán kính)" min={0.3} max={10} step={0.1} format={mm} value={carve.size} onChange={(v) => setCarve({ size: v })} onCommit={() => {}} />
        <Slider
          label="Độ sâu gọt"
          min={0.2}
          max={20}
          step={0.1}
          format={mm}
          value={carve.depth}
          onChange={(v) => setCarve({ depth: v })}
          onCommit={() => {}}
          hint="Gọt từ phía bạn đang nhìn vào, sâu đúng bằng giá trị này – đặt lớn hơn độ dày khối để đục thủng. Xoay khung nhìn để gọt từ hướng khác."
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-cream-500">{carves.length ? `Đã khoét ${carves.length} vết` : 'Chưa có vết khoét'}</span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={!carves.length} onClick={() => set((p) => void p.shape.carves.pop())}>
              Bỏ vết cuối
            </Button>
            <Button size="sm" variant="ghost" disabled={!carves.length} onClick={() => set((p) => void (p.shape.carves = []))}>
              Xoá hết
            </Button>
          </span>
        </div>
      </div>

      {/* Làm rỗng */}
      <Slider
        label="Làm rỗng – độ dày thành"
        min={0}
        max={8}
        step={0.1}
        value={shell}
        format={(v) => (v > 0 ? mm(v) : 'Đặc')}
        onChange={(v) => set((p) => void (p.shape.shell = v), { transient: true })}
        onCommit={commit}
        hint="Khoét rỗng ruột khối, chừa lại lớp vỏ dày như trên. Kéo về 0 để khối đặc trở lại."
      />

      {/* Cắt phẳng */}
      <div className="space-y-3">
        <Toggle
          label="Cắt phẳng"
          description="Cắt bỏ một phần khối theo mặt phẳng – ví dụ cắt bằng đáy, cắt đôi."
          checked={!!slice}
          onChange={(v) => set((p) => void (p.shape.slice = v ? { axis: 'y', side: 1, at: 0.5 } : null))}
        />
        {slice && (
          <>
            <Field label="Mặt cắt vuông góc trục">
              <Segmented
                options={[{ code: 'x', name: 'X' }, { code: 'y', name: 'Y' }, { code: 'z', name: 'Z' }]}
                value={slice.axis}
                onChange={(v) => set((p) => void (p.shape.slice.axis = v))}
              />
            </Field>
            <Field label="Bỏ phần">
              <Segmented
                options={[{ code: '1', name: 'Phía +' }, { code: '-1', name: 'Phía −' }]}
                value={String(slice.side)}
                onChange={(v) => set((p) => void (p.shape.slice.side = Number(v)))}
              />
            </Field>
            <Slider
              label="Vị trí cắt"
              min={0}
              max={1}
              step={0.01}
              value={slice.at}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set((p) => void (p.shape.slice.at = v), { transient: true })}
              onCommit={commit}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SinglePart({ part }) {
  const meta = PART_KIND_MAP.get(part.kind);
  const set = (fn, opts) => updatePart(part.id, fn, opts);
  const isGem = part.kind === 'gem';
  const uniform = part.scale[0] === part.scale[1] && part.scale[1] === part.scale[2];

  return (
    <div className="space-y-6">
      <Field label="Tên khối">
        <input
          value={part.name}
          maxLength={40}
          onChange={(e) => set((p) => void (p.name = e.target.value), { transient: true })}
          onBlur={commit}
          className="h-9 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-cream-50 focus:border-gold-500/60 focus:outline-none"
        />
      </Field>

      <div className="space-y-4">
        {part.kind === 'text' && <TextSection part={part} />}
        {part.kind === 'wire' && <WireSection part={part} />}
        <SectionTitle>{part.kind === 'text' ? 'Khối chữ' : part.kind === 'wire' ? 'Tiết diện' : `Kích thước – ${meta.name}`}</SectionTitle>
        {Object.entries(meta.params).map(([key, def]) => {
          if (part.kind === 'text' && TEXT_KEYS.includes(key)) return null; // đã có ở mục Chữ phía trên
          if (part.kind === 'wire' && WIRE_KEYS.includes(key)) return null; // đã có ở mục Sợi kim loại phía trên
          if (def.type === 'sketch') {
            const n = part.params[key].length;
            return (
              <div key={key} className="space-y-1.5">
                <Button size="sm" variant="primary" className="w-full" onClick={() => useCustomStore.getState().openSketch(part.id)}>
                  <PenLine size={14} /> Sửa hình vẽ 2D
                </Button>
                <p className="text-xs text-cream-600">
                  {n} hình trong bản vẽ.{part.shape.carves.length ? ' Vết gọt trên khối sẽ co giãn theo khung hình mới khi bạn sửa hình.' : ''}
                </p>
              </div>
            );
          }
          if (def.type === 'number') {
            return (
              <Slider
                key={key}
                label={def.label}
                min={def.min}
                max={def.max}
                step={def.step}
                value={part.params[key]}
                format={(v) => `${Number(v).toFixed(def.step >= 1 ? 0 : def.step < 0.1 ? 2 : 1)}${def.unit === '°' ? '°' : ' mm'}`}
                onChange={(v) => set((p) => void (p.params[key] = v), { transient: true })}
                onCommit={commit}
              />
            );
          }
          if (def.type === 'select') {
            return (
              <Field key={key} label={def.label}>
                <Segmented options={def.options} value={part.params[key]} onChange={(v) => set((p) => void (p.params[key] = v))} columns={Math.min(def.options.length, 3)} />
              </Field>
            );
          }
          return <Toggle key={key} label={def.label} checked={part.params[key]} onChange={(v) => set((p) => void (p.params[key] = v))} />;
        })}
      </div>

      {!isGem && <ShapeSection part={part} />}

      <div className="space-y-3">
        <SectionTitle>Vị trí & hướng</SectionTitle>
        <Vec3 label="Vị trí (mm)" value={part.pos} step={0.5} onCommit={(i, n) => set((p) => void (p.pos[i] = n))} />
        <Vec3 label="Xoay (độ)" value={part.rot} step={5} suffix="°" onCommit={(i, n) => set((p) => void (p.rot[i] = n))} />
        <Vec3 label="Co giãn (lần)" value={part.scale} step={0.05} suffix="×" onCommit={(i, n) => set((p) => void (p.scale[i] = n))} />
        {uniform ? null : (
          <button type="button" onClick={() => set((p) => void (p.scale = [1, 1, 1]))} className="text-xs text-gold-300 hover:underline">
            Đặt lại co giãn đều 1×
          </button>
        )}
      </div>

      <div className="space-y-3">
        <SectionTitle>Vật liệu</SectionTitle>
        {isGem ? (
          <>
            <StonePicker value={part.mat.stone} onPick={(code) => set((p) => void (p.mat.stone = code))} />
            {part.params.setting !== 'none' && (
              <Field label="Kim loại ổ gắn">
                <MetalPicker value={part.mat.metal} onMetal={(code) => set((p) => void (p.mat.metal = code))} />
              </Field>
            )}
          </>
        ) : (
          <MetalPicker
            value={part.mat.metal}
            finish={part.mat.finish}
            onMetal={(code) => set((p) => void (p.mat.metal = code))}
            onFinish={(f) => set((p) => void (p.mat.finish = f))}
          />
        )}
      </div>

      <Actions ids={[part.id]} grouped={false} />
    </div>
  );
}
