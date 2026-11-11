import { LIMITS, NECKLACE_LENGTHS, RING_PROFILES, diameterToUsSize, ringSizeToCircumference, ringSizeToDiameter } from '@ngk/shared';
import { Field, Notice, Segmented, Slider } from '../../ui/controls.jsx';
import { useDesign, useSliderBinding } from '../useDesign.js';

const mm = (v) => `${Number(v).toFixed(1)} mm`;
const cm = (v) => `${(v / 10).toFixed(1)} cm`;

function BoundSlider({ path, ...props }) {
  const binding = useSliderBinding(path);
  return <Slider {...props} {...binding} />;
}

function RingSize() {
  const { config, rules, setPath } = useDesign();
  const s = config.size.ringSize;
  const d = ringSizeToDiameter(s);
  const L = LIMITS.ring;
  return (
    <>
      <BoundSlider
        path="size.ringSize"
        label="Size nhẫn (VN)"
        min={L.ringSize[0]}
        max={L.ringSize[1]}
        step={1}
        format={(v) => `Size ${v}`}
        hint={`Đường kính trong ${d.toFixed(1)} mm · chu vi ${ringSizeToCircumference(s)} mm · tương đương ~US ${diameterToUsSize(d)}`}
      />
      <BoundSlider path="size.bandWidth" label="Bề rộng đai" min={L.bandWidth[0]} max={L.bandWidth[1]} format={mm} />
      <BoundSlider path="size.bandThickness" label="Độ dày đai" min={L.bandThickness[0]} max={L.bandThickness[1]} format={mm} />
      {rules.profile && (
        <Field label="Dáng tiết diện đai" hint="Bo tròn êm tay khi đeo lâu; phẳng hiện đại; sống dao tạo đường gờ sắc nét.">
          <Segmented options={RING_PROFILES} value={config.size.profile} onChange={(v) => setPath('size.profile', v)} />
        </Field>
      )}
    </>
  );
}

function BraceletSize() {
  const { config } = useDesign();
  const L = LIMITS.bracelet;
  const solid = ['bangle', 'cuff'].includes(config.style);
  return (
    <>
      <BoundSlider
        path="size.circumference"
        label={solid ? 'Chu vi trong' : 'Chiều dài lắc'}
        min={L.circumference[0]}
        max={L.circumference[1]}
        step={1}
        format={cm}
        hint="Đo vòng cổ tay rồi cộng thêm 1–2 cm để đeo thoải mái."
      />
      {solid && (
        <>
          <BoundSlider path="size.width" label="Bề rộng vòng" min={L.width[0]} max={L.width[1]} format={mm} />
          <BoundSlider path="size.thickness" label="Độ dày vòng" min={L.thickness[0]} max={L.thickness[1]} format={mm} />
        </>
      )}
      {(config.style === 'chain' || config.style === 'charm') && (
        <BoundSlider path="size.width" label="Độ to mắt xích" min={2} max={6} format={mm} />
      )}
      {config.style === 'tennis' && <Notice>Kích thước mỗi viên đá chỉnh ở tab “Đá quý”.</Notice>}
    </>
  );
}

function NecklaceSize() {
  const { config, setPath } = useDesign();
  const L = LIMITS.necklace;
  const shape = config.deco.pendantShape;
  return (
    <>
      <Field label="Chiều dài phổ biến">
        <div className="grid grid-cols-5 gap-1.5">
          {NECKLACE_LENGTHS.map((p) => {
            const active = config.size.length === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPath('size.length', p.value)}
                aria-pressed={active}
                className={`rounded-lg border px-1 py-2 text-center transition-all ${
                  active ? 'border-gold-500/70 bg-gold-400/[0.07] text-gold-200' : 'border-ink-700 bg-ink-850 text-cream-300 hover:border-ink-500'
                }`}
              >
                <span className="block text-xs font-semibold">{p.value / 10}</span>
                <span className="block text-[10px] text-cream-600">{p.name}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <BoundSlider path="size.length" label="Chiều dài dây" min={L.length[0]} max={L.length[1]} step={5} format={cm} />
      <BoundSlider path="size.chainThickness" label="Độ dày dây" min={L.chainThickness[0]} max={L.chainThickness[1]} format={mm} />
      {shape !== 'none' && shape !== 'solitaire' && (
        <BoundSlider path="size.pendantSize" label="Kích thước mặt dây" min={L.pendantSize[0]} max={L.pendantSize[1]} format={mm} />
      )}
    </>
  );
}

function EarringsSize() {
  const { config } = useDesign();
  const L = LIMITS.earrings;
  if (config.style === 'stud') {
    return <Notice>Kích thước khuyên nụ bằng kích thước đá (hoặc bi kim loại) – chỉnh ở tab “Đá quý”.</Notice>;
  }
  return (
    <>
      {config.style === 'hoop' && (
        <BoundSlider path="size.hoopDiameter" label="Đường kính vòng" min={L.hoopDiameter[0]} max={L.hoopDiameter[1]} step={1} format={mm} />
      )}
      {config.style === 'drop' && (
        <BoundSlider path="size.dropLength" label="Chiều dài buông" min={L.dropLength[0]} max={L.dropLength[1]} step={1} format={mm} />
      )}
      <BoundSlider
        path="size.thickness"
        label={config.style === 'hoop' ? 'Độ dày vòng' : 'Độ to dây'}
        min={L.thickness[0]}
        max={L.thickness[1]}
        format={mm}
      />
    </>
  );
}

function PendantSize() {
  const { config } = useDesign();
  const L = LIMITS.pendant;
  if (config.style === 'solitaire') {
    return <Notice>Mặt “Giọt đá” có kích thước theo viên đá – chỉnh ở tab “Đá quý”.</Notice>;
  }
  return (
    <>
      <BoundSlider path="size.pendantSize" label="Chiều cao mặt dây" min={L.pendantSize[0]} max={L.pendantSize[1]} format={mm} />
      <BoundSlider path="size.thickness" label="Độ dày mặt dây" min={L.thickness[0]} max={L.thickness[1]} format={mm} />
    </>
  );
}

const BY_TYPE = { ring: RingSize, bracelet: BraceletSize, necklace: NecklaceSize, earrings: EarringsSize, pendant: PendantSize };

export function SizePanel() {
  const { config } = useDesign();
  const Panel = BY_TYPE[config.type];
  return (
    <div className="space-y-6">
      <Panel />
    </div>
  );
}
