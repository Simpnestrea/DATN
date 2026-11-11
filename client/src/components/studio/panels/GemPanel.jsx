import { useMemo } from 'react';
import { CUTS, SETTINGS } from '@ngk/shared';
import { activeGemstones, useCatalogStore } from '../../../store/catalogStore.js';
import { Field, Notice, Segmented, SectionTitle, Slider, Swatch, Toggle } from '../../ui/controls.jsx';
import { CutIcon } from '../../icons.jsx';
import { gemFill } from '../../../utils/color.js';
import { useDesign, useSliderBinding } from '../useDesign.js';

const mm = (v) => `${Number(v).toFixed(1)} mm`;

function noGemReason(config) {
  if (config.type === 'ring' && config.style === 'eternity')
    return 'Kiểu Eternity đính đá tấm quanh toàn vòng. Chọn loại đá tấm ở tab “Trang trí”.';
  if (config.deco?.hollow) return 'Mặt dây rỗng không gắn đá chủ. Tắt “Mặt rỗng” ở tab “Trang trí” để thêm đá.';
  if (config.type === 'necklace' && config.deco.pendantShape === 'none')
    return 'Dây chuyền chưa có mặt dây. Chọn hình mặt dây ở tab “Trang trí” để gắn đá.';
  if (config.type === 'earrings' && config.style === 'hoop')
    return 'Khuyên tròn không có đá chủ – bật “Đá tấm mặt trước” ở tab “Trang trí”.';
  return 'Kiểu dáng này không có đá chủ. Bạn có thể thêm đá tấm ở tab “Trang trí”.';
}

/** Đá phụ hai bên của nhẫn Ba viên – chọn riêng với đá chủ và đá tấm. */
function SideStonePicker({ gems }) {
  const { config, setPath } = useDesign();
  const lookup = useCatalogStore((s) => s.lookup);
  const side = config.deco.sideStone;
  const mainIsFaceted = lookup.gemKind(config.gem.stone) !== 'pearl';
  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850/60 p-4">
      <SectionTitle
        aside={
          mainIsFaceted && side !== config.gem.stone ? (
            <button type="button" onClick={() => setPath('deco.sideStone', config.gem.stone)} className="text-xs text-gold-300 hover:underline">
              Giống đá chủ
            </button>
          ) : null
        }
      >
        Đá phụ hai bên
      </SectionTitle>
      <div className="grid grid-cols-5 gap-x-1.5 gap-y-3">
        {gems
          .filter((g) => g.kind !== 'pearl')
          .map((g) => (
            <Swatch
              key={g.code}
              size="sm"
              name={g.name.replace(/\s*\(.*\)/, '')}
              fill={gemFill(g.color, g.kind)}
              selected={side === g.code}
              onClick={() => setPath('deco.sideStone', g.code)}
            />
          ))}
      </div>
      <p className="text-xs text-cream-600">Gợi ý: đá chủ màu + đá phụ kim cương là phối cổ điển; ba viên cùng loại cho vẻ đồng điệu.</p>
    </div>
  );
}

/** Vị trí đá chủ: trượt quanh thân (nhẫn/vòng) hoặc trên mặt dây, kèm nghiêng. */
function GemPlacement({ mode }) {
  const { config, apply } = useDesign();
  const u = useSliderBinding('gem.place.u');
  const v = useSliderBinding('gem.place.v');
  const tilt = useSliderBinding('gem.place.tilt');
  const p = config.gem.place;
  const moved = p.u || p.v || p.tilt;
  const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
  const deg = (x) => `${x > 0 ? '+' : ''}${x}°`;

  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850/60 p-4">
      <SectionTitle
        aside={
          moved ? (
            <button
              type="button"
              onClick={() =>
                apply((c) => {
                  c.gem.place = { u: 0, v: 0, tilt: 0 };
                })
              }
              className="text-xs text-gold-300 hover:underline"
            >
              Về vị trí chuẩn
            </button>
          ) : null
        }
      >
        Vị trí đá chủ
      </SectionTitle>
      {mode === 'band' ? (
        <>
          <Slider label="Vị trí quanh thân" min={-180} max={180} step={1} format={deg} hint="0° là đỉnh nhẫn; ±180° là đáy. Đá phụ và đá tấm vai đi theo." {...u} />
          <Slider label="Lệch trước / sau" min={-1} max={1} step={0.05} format={pct} hint="Dịch đá dọc theo bề rộng đai (kiểu đặt lệch tâm)." {...v} />
        </>
      ) : (
        <>
          <Slider label="Lệch ngang" min={-1} max={1} step={0.05} format={pct} {...u} />
          <Slider label="Lệch dọc" min={-1} max={1} step={0.05} format={pct} hint="Đá luôn nằm trong viền mặt dây." {...v} />
        </>
      )}
      <Slider label="Nghiêng đá" min={-35} max={35} step={1} format={deg} {...tilt} />
      <p className="text-xs text-cream-600">Mẹo: ở tab “Gắn đá” bạn có thể kéo trực tiếp viên đá chủ trên mô hình.</p>
    </div>
  );
}

export function GemPanel() {
  const { config, rules, setPath, commit } = useDesign();
  const catalog = useCatalogStore((s) => s.catalog);
  const lookup = useCatalogStore((s) => s.lookup);
  const gems = useMemo(() => activeGemstones(catalog), [catalog]);
  const size = useSliderBinding('gem.sizeMm');
  const { gem } = config;
  const isTennis = config.type === 'bracelet' && config.style === 'tennis';
  const isPearl = lookup.gemKind(gem.stone) === 'pearl';
  const stone = lookup.gem(gem.stone);

  if (rules.gem === 'none') return <Notice>{noGemReason(config)}</Notice>;

  return (
    <div className="space-y-6">
      {rules.gem === 'optional' && (
        <Toggle
          label="Đính đá chủ"
          description="Tắt để có thiết kế kim loại trơn."
          checked={gem.enabled}
          onChange={(v) => setPath('gem.enabled', v)}
        />
      )}

      {gem.enabled && (
        <>
          <div className="space-y-4">
            <SectionTitle>{isTennis ? 'Loại đá trên lắc' : 'Loại đá'}</SectionTitle>
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {gems
                .filter((g) => !(isTennis && g.kind === 'pearl'))
                .map((g) => (
                  <Swatch
                    key={g.code}
                    name={g.name.replace(/\s*\(.*\)/, '')}
                    fill={gemFill(g.color, g.kind)}
                    selected={gem.stone === g.code}
                    onClick={() => setPath('gem.stone', g.code)}
                  />
                ))}
            </div>
            {stone && !stone.isActive && (
              <Notice tone="gold">“{stone.name}” đã ngừng có trong danh mục – thiết kế vẫn hiển thị đúng; chọn loại đá khác nếu muốn thay.</Notice>
            )}
            {stone && stone.isActive !== false && <Notice>{stone.description}</Notice>}
          </div>

          <Field
            label="Màu đá tùy chỉnh"
            hint={gem.color ? 'Đang dùng màu tùy chỉnh thay cho màu tự nhiên của đá.' : 'Giữ màu tự nhiên, hoặc chọn màu riêng.'}
          >
            {/* bảng chọn màu bắn sự kiện liên tục khi kéo → cập nhật tạm; rời ô chọn màu thì ghi lịch sử */}
            <div className="flex items-center gap-3">
              <label className="relative h-9 w-14 cursor-pointer overflow-hidden rounded-lg border border-ink-600">
                <input
                  type="color"
                  aria-label="Chọn màu đá"
                  value={(gem.color ?? stone?.color ?? '#ffffff').toLowerCase()}
                  onChange={(e) => setPath('gem.color', e.target.value, { transient: true })}
                  onBlur={commit}
                  className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer"
                />
              </label>
              <button
                type="button"
                disabled={!gem.color}
                onClick={() => setPath('gem.color', null)}
                className="text-xs text-gold-300 hover:underline disabled:text-cream-600 disabled:no-underline"
              >
                Dùng màu tự nhiên
              </button>
            </div>
          </Field>

          {isPearl ? (
            <Notice>Ngọc trai luôn có dáng tròn và được gắn bằng chốt (peg) – không có giác cắt hay chấu.</Notice>
          ) : (
            <Field label="Giác cắt">
              <div className="grid grid-cols-3 gap-2">
                {CUTS.map((c) => {
                  const active = gem.cut === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPath('gem.cut', c.code)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition-all ${
                        active
                          ? 'border-gold-500/70 bg-gold-400/[0.07] text-gold-200'
                          : 'border-ink-700 bg-ink-850 text-cream-300 hover:border-ink-500'
                      }`}
                    >
                      <CutIcon cut={c.code} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <Slider
            label={isTennis ? 'Kích thước mỗi viên' : 'Kích thước đá'}
            min={rules.gemSize[0]}
            max={rules.gemSize[1]}
            step={0.1}
            format={mm}
            hint="Chiều rộng viên đá (mm). Giới hạn thay đổi theo kiểu dáng và kích thước mặt."
            {...size}
          />

          {config.type === 'ring' && config.style === 'three-stone' && <SideStonePicker gems={gems} />}

          {rules.gemMove && <GemPlacement mode={rules.gemMove} />}

          {!isPearl && (
            <Field label="Kiểu ổ gắn đá" hint="Chấu giúp đá đón nhiều ánh sáng; ổ bao ôm trọn viên đá, chắc chắn và hiện đại.">
              <Segmented options={SETTINGS} value={gem.setting} onChange={(v) => setPath('gem.setting', v)} />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
