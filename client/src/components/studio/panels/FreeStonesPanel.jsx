// Tab "Gắn đá": gắn đá tự do lên bất kỳ vị trí nào trên bề mặt kim loại.
import { useMemo, useState } from 'react';
import { Copy, FlipHorizontal2, MousePointerClick, Trash2, TriangleAlert, X } from 'lucide-react';
import { FREE_STONE_MAX, FREE_STONE_SIZE } from '@ngk/shared';
import { activeGemstones, useCatalogStore } from '../../../store/catalogStore.js';
import { useFreeStoneStore } from '../../../store/freeStoneStore.js';
import { Field, Notice, SectionTitle, Slider, Swatch } from '../../ui/controls.jsx';
import { Button } from '../../ui/Button.jsx';
import { gemFill } from '../../../utils/color.js';
import { useDesign } from '../useDesign.js';
import { BAND_PRESETS, FACE_PRESETS } from '../../../three/free/presets.js';

const mm = (v) => `${Number(v).toFixed(1)} mm`;

/** Bề mặt có mẫu gắn sẵn: 'band' (đai) | 'face' (mặt dây) | null. */
function presetSurface(config) {
  if (config.type === 'ring') return 'band';
  if (config.type === 'bracelet' && ['bangle', 'cuff'].includes(config.style)) return 'band';
  const shape = config.type === 'pendant' ? config.style : config.type === 'necklace' ? config.deco.pendantShape : null;
  if (shape && shape !== 'none' && shape !== 'solitaire') return 'face';
  return null;
}

function PresetIcon({ dots }) {
  return (
    <svg viewBox="-1.1 -1.1 2.2 2.2" className="h-10 w-full" aria-hidden="true">
      {dots.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={-y} r={r} fill="currentColor" opacity={0.85} />
      ))}
    </svg>
  );
}

/** Thư viện bố cục đá: chọn một mẫu → đá được gắn tự động, sau đó chỉnh từng viên như bình thường. */
function PresetGallery() {
  const { config } = useDesign();
  const { brush, api } = useFreeStoneStore();
  const [replace, setReplace] = useState(true);
  const surface = presetSurface(config);
  if (!surface) {
    return <Notice>Mẫu gắn sẵn có cho nhẫn, vòng kiềng/cuff và mặt dây. Với loại này bạn vẫn gắn từng viên bằng cách bấm lên mô hình.</Notice>;
  }
  const presets = surface === 'band' ? BAND_PRESETS : FACE_PRESETS;
  return (
    <div className="space-y-3">
      <SectionTitle>Mẫu gắn sẵn</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.code}
            type="button"
            title={p.desc}
            disabled={!api}
            onClick={() => api?.applyPreset(p.code, { stone: brush.stone, sizeMm: brush.sizeMm, replace })}
            className="flex flex-col items-center gap-1 rounded-xl border border-ink-700 bg-ink-850 px-1 pt-2 pb-1.5 text-[10.5px] leading-tight text-cream-300 transition-all hover:-translate-y-0.5 hover:border-gold-500/60 hover:text-gold-200 disabled:opacity-40"
          >
            <PresetIcon dots={p.dots} />
            {p.name}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-cream-500">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[#d9b766]" />
        Thay thế các đá tự do đang có (bỏ chọn để gắn thêm)
      </label>
      <p className="text-xs text-cream-600">Mẫu dùng loại đá và cỡ đá đang chọn ở mục bên dưới. Viên trùng vị trí đá có sẵn sẽ tự bỏ qua.</p>
    </div>
  );
}

export function FreeStonesPanel() {
  const { config, apply, commit } = useDesign();
  const catalog = useCatalogStore((s) => s.catalog);
  const lookup = useCatalogStore((s) => s.lookup);
  const gems = useMemo(() => activeGemstones(catalog).filter((g) => g.kind !== 'pearl'), [catalog]);
  const { selectedId, brush, info, api, select, setBrush } = useFreeStoneStore();
  const [confirmClear, setConfirmClear] = useState(false);

  const stones = config.freeStones;
  const selected = stones.find((s) => s.id === selectedId) ?? null;
  const current = selected ?? brush;
  const noSurface = config.type === 'necklace' && config.deco.pendantShape === 'none';
  const isEarrings = config.type === 'earrings';

  // đổi loại/cỡ: áp cho viên đang chọn (nếu có) và cho cả "cọ" để viên gắn sau giống vậy
  const updateCurrent = (patch, opts) => {
    setBrush(patch);
    if (!selected) return;
    apply((c) => {
      const s = c.freeStones.find((x) => x.id === selected.id);
      if (s) Object.assign(s, patch);
    }, opts);
  };
  const remove = (id) => {
    apply((c) => {
      c.freeStones = c.freeStones.filter((s) => s.id !== id);
    });
    if (id === selectedId) select(null);
  };

  if (noSurface) {
    return <Notice>Dây chuyền chưa có mặt dây. Chọn hình mặt dây ở tab “Trang trí” để có bề mặt gắn đá.</Notice>;
  }

  const warn = selected && info[selected.id];

  return (
    <div className="space-y-6">
      <Notice tone="gold">
        <span className="flex items-start gap-2">
          <MousePointerClick size={16} className="mt-0.5 shrink-0" />
          <span>
            <b>Bấm</b> lên bề mặt kim loại để gắn đá · <b>kéo</b> viên đá (kể cả <b>đá chủ</b>) để di chuyển · <b>Delete</b> để xóa ·{' '}
            <b>Esc</b> bỏ chọn. Kéo chỗ trống để xoay mô hình như bình thường.
            {isEarrings && ' Đá được tự động gắn đối xứng trên cả đôi khuyên.'}
          </span>
        </span>
      </Notice>

      <PresetGallery />

      <div className="space-y-4">
        <SectionTitle
          aside={
            selected && (
              <button type="button" onClick={() => select(null)} className="flex items-center gap-1 text-xs text-cream-500 hover:text-cream-100">
                <X size={13} /> Bỏ chọn
              </button>
            )
          }
        >
          {selected ? 'Viên đá đang chọn' : 'Đá sẽ gắn'}
        </SectionTitle>
        <div className="grid grid-cols-5 gap-x-1.5 gap-y-3">
          {gems.map((g) => (
            <Swatch
              key={g.code}
              size="sm"
              name={g.name.replace(/\s*\(.*\)/, '')}
              fill={gemFill(g.color)}
              selected={current.stone === g.code}
              onClick={() => updateCurrent({ stone: g.code })}
            />
          ))}
        </div>
        <Slider
          label="Kích thước viên"
          min={FREE_STONE_SIZE[0]}
          max={FREE_STONE_SIZE[1]}
          step={0.1}
          format={mm}
          value={current.sizeMm}
          onChange={(v) => updateCurrent({ sizeMm: v }, { transient: true })}
          onCommit={commit}
        />

        {selected && (
          <>
            {warn?.overhang && (
              <p className="flex items-start gap-2 text-xs text-gold-300">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" /> Viên đá lớn hơn bề mặt – một phần nhô ra ngoài mép. Hãy giảm kích thước
                hoặc dời vào giữa.
              </p>
            )}
            {warn?.hidden && (
              <p className="flex items-start gap-2 text-xs text-gold-300">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" /> Sau khi đổi thiết kế, vị trí cũ không còn bề mặt nên viên đá đang bị ẩn.
                Hãy xóa hoặc gắn lại.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" onClick={() => api?.duplicate(selected.id)} disabled={!api}>
                <Copy size={14} /> Nhân bản
              </Button>
              <Button size="sm" onClick={() => api?.mirror(selected.id)} disabled={!api || isEarrings} title={isEarrings ? 'Khuyên tai đã tự đối xứng' : undefined}>
                <FlipHorizontal2 size={14} /> Đối xứng
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(selected.id)}>
                <Trash2 size={14} /> Xóa
              </Button>
            </div>
          </>
        )}
      </div>

      <Field label="Đá đã gắn" aside={`${stones.length}/${FREE_STONE_MAX}`}>
        {stones.length ? (
          <div className="flex flex-wrap gap-1.5">
            {stones.map((s, i) => {
              const g = lookup.gem(s.stone);
              const active = s.id === selectedId;
              const flagged = info[s.id]?.hidden || info[s.id]?.overhang;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(active ? null : s.id)}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[11px] transition-colors ${
                    active ? 'border-gold-500/70 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-300 hover:border-ink-500'
                  }`}
                >
                  <span className="h-4 w-4 rounded-full" style={{ background: gemFill(g?.color ?? '#ffffff') }} />
                  #{i + 1} · {s.sizeMm}mm
                  {flagged && <TriangleAlert size={11} className="text-gold-400" />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-cream-600">Chưa có viên nào. Bấm lên mô hình để bắt đầu.</p>
        )}
      </Field>

      {stones.length > 0 && (
        <Button
          size="sm"
          variant={confirmClear ? 'danger' : 'ghost'}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            apply((c) => {
              c.freeStones = [];
            });
            select(null);
            setConfirmClear(false);
          }}
          onBlur={() => setConfirmClear(false)}
        >
          <Trash2 size={14} /> {confirmClear ? 'Bấm lần nữa để xóa tất cả' : 'Xóa tất cả đá tự do'}
        </Button>
      )}

      <p className="text-xs leading-relaxed text-cream-600">
        Không gắn được ở mặt trong nhẫn/vòng và mặt sau (chỗ chạm da) hoặc chồng lên đá khác. Đá bám theo bề mặt nên vẫn đúng vị trí khi bạn
        đổi size.
      </p>
    </div>
  );
}
