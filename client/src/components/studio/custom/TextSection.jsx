// Bảng chỉnh KHỐI CHỮ: nội dung (tiếng Việt có dấu), kiểu chữ, cỡ chữ, khoảng cách chữ.
// Độ dày / bo cạnh dùng thanh trượt chung của khối (PropertiesPanel).
import { useEffect, useRef, useState } from 'react';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/lora/700.css';
import '@fontsource/dancing-script/700.css';
import { PART_KIND_MAP, TEXT_FONTS, TEXT_LIMITS, normalizeText } from '@ngk/shared';
import { Field, SectionTitle, Slider } from '../../ui/controls.jsx';
import { commitText, updateText } from '../../../three/custom/customOps.js';
import { FONT_FAMILY } from '../../../three/geometry/fontFamily.js';

const META = PART_KIND_MAP.get('text').params;

export function TextSection({ part }) {
  const { text, font, size, spacing } = part.params;
  const [draft, setDraft] = useState(text);
  const [missing, setMissing] = useState([]);
  const focused = useRef(false);
  // khối khác được chọn / Undo đổi chữ → cập nhật ô nhập (trừ khi đang gõ)
  useEffect(() => {
    if (!focused.current) setDraft(text);
  }, [text, part.id]);

  const change = (patch, transient = true) =>
    updateText(part.id, patch, { transient }).then((r) => {
      setMissing(r.missing);
      return r;
    });

  const onType = (v) => {
    const t = [...v].slice(0, TEXT_LIMITS.chars).join('');
    setDraft(t);
    const clean = normalizeText(t);
    if (clean) change({ text: clean });
  };
  const finishTyping = () => {
    focused.current = false;
    const clean = normalizeText(draft);
    if (!clean) setDraft(text); // xoá hết chữ → giữ chữ cũ
    commitText(part.id);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Chữ</SectionTitle>
      <Field label="Nội dung" aside={`${[...draft].length}/${TEXT_LIMITS.chars}`} hint="Gõ được tiếng Việt có dấu. Một dòng – muốn nhiều dòng thì thêm khối chữ khác.">
        <input
          aria-label="Nội dung chữ"
          value={draft}
          onFocus={() => (focused.current = true)}
          onChange={(e) => onType(e.target.value)}
          onBlur={finishTyping}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          style={{ fontFamily: FONT_FAMILY[font] }}
          className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-lg text-cream-50 focus:border-gold-500/60 focus:outline-none"
        />
      </Field>
      {missing.length > 0 && <p className="text-xs text-gold-300">Kiểu chữ này không có: {[...new Set(missing)].join(' ')} – đã bỏ qua.</p>}

      <Field label="Kiểu chữ">
        <div className="grid grid-cols-3 gap-1.5">
          {TEXT_FONTS.map((f) => (
            <button
              key={f.code}
              type="button"
              aria-pressed={font === f.code}
              onClick={() => change({ font: f.code }, false)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-colors ${
                font === f.code ? 'border-gold-500/70 bg-gold-400/10 text-gold-200' : 'border-ink-700 text-cream-300 hover:border-ink-500'
              }`}
            >
              <span className="text-xl leading-tight" style={{ fontFamily: FONT_FAMILY[f.code] }}>
                Ánh
              </span>
              <span className="text-[10px] text-cream-500">{f.name}</span>
            </button>
          ))}
        </div>
      </Field>

      <Slider
        label={META.size.label}
        min={META.size.min}
        max={META.size.max}
        step={0.1}
        value={size}
        format={(v) => `${v.toFixed(1)} mm`}
        onChange={(v) => change({ size: v })}
        onCommit={() => commitText(part.id)}
      />
      <Slider
        label={META.spacing.label}
        min={META.spacing.min}
        max={META.spacing.max}
        step={0.05}
        value={spacing}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} mm`}
        onChange={(v) => change({ spacing: v })}
        onCommit={() => commitText(part.id)}
        hint="Kéo âm để các chữ viết tay chạm vào nhau thành một khối liền (kiểu dây chuyền tên)."
      />
    </div>
  );
}
