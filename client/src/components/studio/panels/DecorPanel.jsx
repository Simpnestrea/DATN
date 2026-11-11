import { useMemo } from 'react';
import { BAIL_STYLES, CHARM_SHAPES, ENGRAVING_MAX, ENGRAVING_POSITIONS, LIMITS, PENDANT_SHAPES, RING_PATTERNS } from '@ngk/shared';
import { activeGemstones, useCatalogStore } from '../../../store/catalogStore.js';
import { Field, Notice, Segmented, SectionTitle, Slider, Swatch, Toggle } from '../../ui/controls.jsx';
import { ShapeIcon } from '../../icons.jsx';
import { gemFill } from '../../../utils/color.js';
import { useDesign, useSliderBinding } from '../useDesign.js';

function AccentStonePicker() {
  const { config, setPath } = useDesign();
  const catalog = useCatalogStore((s) => s.catalog);
  const gems = useMemo(() => activeGemstones(catalog).filter((g) => g.kind !== 'pearl'), [catalog]);
  return (
    <div className="space-y-3">
      <SectionTitle>Loại đá tấm / đá phụ</SectionTitle>
      <div className="grid grid-cols-5 gap-x-1.5 gap-y-3">
        {gems.map((g) => (
          <Swatch
            key={g.code}
            size="sm"
            name={g.name.replace(/\s*\(.*\)/, '')}
            fill={gemFill(g.color)}
            selected={config.deco.accentStone === g.code}
            onClick={() => setPath('deco.accentStone', g.code)}
          />
        ))}
      </div>
    </div>
  );
}

const QUICK_SYMBOLS = ['♥', '∞', '★', '✦', '&'];

/** Khắc chữ: nội dung + vị trí (theo thông lệ của từng loại) + cỡ chữ. */
function EngravingSection() {
  const { config, rules, setPath, commit } = useDesign();
  const size = useSliderBinding('deco.engravingSize');
  const value = config.deco.engraving ?? '';
  const count = Array.from(value).length;
  const positions = ENGRAVING_POSITIONS.filter((p) => rules.engravingPositions.includes(p.code));
  const current = positions.find((p) => p.code === config.deco.engravingPos);
  const mm = (v) => `${Number(v).toFixed(1)} mm`;

  const insert = (sym) => {
    if (count >= ENGRAVING_MAX) return;
    setPath('deco.engraving', `${value}${value && sym !== '&' ? ' ' : ''}${sym}`);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850/60 p-4">
      <SectionTitle>Khắc chữ</SectionTitle>
      <Field label="Nội dung" aside={`${count}/${ENGRAVING_MAX}`}>
        <input
          type="text"
          value={value}
          placeholder="Tên, ngày kỷ niệm, lời nhắn…"
          onChange={(e) => setPath('deco.engraving', e.target.value, { transient: true })}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-10 w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/70 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => insert(s)}
              className="h-7 min-w-7 rounded-lg border border-ink-600 px-2 text-sm text-cream-300 hover:border-gold-500/60 hover:text-gold-200"
              title={`Chèn ${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
      {positions.length > 1 && (
        <Field label="Vị trí khắc" hint={current?.hint}>
          <Segmented options={positions} value={config.deco.engravingPos} onChange={(v) => setPath('deco.engravingPos', v)} />
        </Field>
      )}
      <Slider
        label="Cỡ chữ (chiều cao)"
        min={rules.engravingSize[0]}
        max={rules.engravingSize[1]}
        step={0.1}
        format={mm}
        hint="Kiểu khắc chìm. Cỡ tối đa phụ thuộc bề rộng bề mặt khắc; chữ dài sẽ tự co cho vừa."
        {...size}
      />
      {!value && <p className="text-xs text-cream-600">Nhập nội dung để xem chữ khắc trên mô hình (xoay mô hình tới vị trí khắc).</p>}
    </div>
  );
}

function EngravingSectionIfAllowed() {
  const { rules } = useDesign();
  return rules.engraving ? <EngravingSection /> : null;
}

function HaloToggle() {
  const { config, rules, setPath } = useDesign();
  if (rules.halo === 'none') return null;
  const aroundGem = rules.haloLabel === 'Vòng đá halo';
  if (aroundGem && !config.gem.enabled) return null; // halo bao quanh đá chủ → cần có đá chủ
  const forced = rules.halo === 'forced';
  return (
    <Toggle
      label={rules.haloLabel}
      description={aroundGem ? 'Vòng đá tấm bao quanh đá chủ giúp đá trông lớn hơn.' : 'Đá tấm chạy dọc viền mặt dây.'}
      lockedReason={forced ? 'Luôn có ở kiểu dáng này.' : undefined}
      checked={config.deco.halo}
      disabled={forced}
      onChange={(v) => setPath('deco.halo', v)}
    />
  );
}

function PaveToggle({ label, description }) {
  const { config, rules, setPath } = useDesign();
  if (rules.pave === 'none') return null;
  const forced = rules.pave === 'forced';
  return (
    <Toggle
      label={label}
      description={description}
      lockedReason={forced ? 'Luôn có ở kiểu dáng này.' : undefined}
      checked={config.deco.pave}
      disabled={forced}
      onChange={(v) => setPath('deco.pave', v)}
    />
  );
}

function RingDecor() {
  const { config, rules, setPath } = useDesign();
  const usesAccent = config.deco.halo || config.deco.pave; // đá phụ hai bên (Ba viên) chọn riêng ở tab Đá quý
  return (
    <>
      <HaloToggle />
      <PaveToggle
        label={config.style === 'eternity' ? 'Đá tấm toàn vòng' : 'Đá tấm dọc thân (pavé)'}
        description="Hàng đá nhỏ đính dọc hai bên vai nhẫn."
      />
      {rules.pattern && (
        <Field label="Hoa văn viền" hint="Viền hạt (milgrain) mang phong cách cổ điển; gờ viền tạo đường nét hiện đại.">
          <Segmented options={RING_PATTERNS} value={config.deco.pattern} onChange={(v) => setPath('deco.pattern', v)} />
        </Field>
      )}
      {usesAccent && <AccentStonePicker />}
      <EngravingSection />
    </>
  );
}

function BraceletDecor() {
  const { config, rules, setPath } = useDesign();
  const count = useSliderBinding('deco.charmCount');
  const L = LIMITS.bracelet;
  const nothing = config.style === 'chain' || config.style === 'tennis';
  return (
    <>
      <PaveToggle label="Đá tấm mặt trên" description="Hàng đá nhỏ chạy dọc mặt trên vòng kiềng." />
      {rules.charms && (
        <>
          <Slider label="Số lượng charm" min={L.charmCount[0]} max={L.charmCount[1]} step={1} {...count} />
          <Field label="Hình charm">
            <Segmented options={CHARM_SHAPES} value={config.deco.charmShape} onChange={(v) => setPath('deco.charmShape', v)} />
          </Field>
        </>
      )}
      {config.deco.pave && <AccentStonePicker />}
      {rules.engraving && <EngravingSection />}
      {nothing && (
        <Notice>
          {config.style === 'tennis'
            ? 'Lắc tennis đã là một hàng đá liền – chọn loại đá ở tab “Đá quý”.'
            : 'Lắc mắt xích tối giản. Chọn kiểu “Lắc charm” để treo thêm charm trang trí.'}
        </Notice>
      )}
    </>
  );
}

function PendantDecorCommon({ shapeSelector }) {
  const { config, rules, setPath } = useDesign();
  return (
    <>
      {shapeSelector}
      {rules.hollow && (
        <Toggle
          label="Mặt rỗng (chỉ còn viền)"
          description="Tạo mặt dây thanh thoát; mặt rỗng không gắn đá chủ."
          checked={config.deco.hollow}
          onChange={(v) => setPath('deco.hollow', v)}
        />
      )}
      <HaloToggle />
      {config.deco.halo && <AccentStonePicker />}
    </>
  );
}

function NecklaceDecor() {
  const { config, setPath } = useDesign();
  const shapes = [{ code: 'none', name: 'Không mặt' }, ...PENDANT_SHAPES];
  const selector = (
    <Field label="Mặt dây">
      <div className="grid grid-cols-4 gap-2">
        {shapes.map((s) => {
          const active = config.deco.pendantShape === s.code;
          return (
            <button
              key={s.code}
              type="button"
              aria-pressed={active}
              onClick={() => setPath('deco.pendantShape', s.code)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] transition-all ${
                active ? 'border-gold-500/70 bg-gold-400/[0.07] text-gold-200' : 'border-ink-700 bg-ink-850 text-cream-300 hover:border-ink-500'
              }`}
            >
              <ShapeIcon shape={s.code} />
              {s.name}
            </button>
          );
        })}
      </div>
    </Field>
  );
  return (
    <>
      <PendantDecorCommon shapeSelector={selector} />
      <EngravingSectionIfAllowed />
    </>
  );
}

function EarringsDecor() {
  const { config } = useDesign();
  return (
    <>
      <HaloToggle />
      <PaveToggle label="Đá tấm mặt trước" description="Đính đá nhỏ dọc mặt trước của vòng khuyên." />
      {(config.deco.halo || config.deco.pave) && <AccentStonePicker />}
      {config.style === 'drop' && !config.gem.enabled && (
        <Notice>Khi tắt đá chủ, phần buông là giọt kim loại.</Notice>
      )}
    </>
  );
}

function PendantDecor() {
  const { config, rules, setPath } = useDesign();
  return (
    <>
      <PendantDecorCommon />
      <Field label="Móc treo">
        <Segmented options={BAIL_STYLES} value={config.deco.bail} onChange={(v) => setPath('deco.bail', v)} />
      </Field>
      <Toggle
        label="Hiển thị dây minh họa"
        description="Chỉ để xem trước – thiết kế này là mặt dây riêng."
        checked={config.deco.showChain}
        onChange={(v) => setPath('deco.showChain', v)}
      />
      {(config.deco.bail === 'gem' && !config.deco.halo) && <AccentStonePicker />}
      {rules.engraving && <EngravingSection />}
    </>
  );
}

const BY_TYPE = { ring: RingDecor, bracelet: BraceletDecor, necklace: NecklaceDecor, earrings: EarringsDecor, pendant: PendantDecor };

export function DecorPanel() {
  const { config } = useDesign();
  const Panel = BY_TYPE[config.type];
  return (
    <div className="space-y-6">
      <Panel />
    </div>
  );
}
