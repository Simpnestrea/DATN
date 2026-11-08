// Các control dùng trong panel tùy chỉnh: Field, Slider, Toggle, Segmented, Swatch, OptionCard.
import { useId } from 'react';
import { Check } from 'lucide-react';

export function Field({ label, hint, children, aside }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-cream-100">{label}</span>
        {aside && <span className="text-xs text-cream-500 tabular-nums">{aside}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-cream-600">{hint}</p>}
    </div>
  );
}

/**
 * Thanh trượt: onChange khi kéo (cập nhật tạm), onCommit khi thả (ghi lịch sử Undo).
 */
export function Slider({ label, value, min, max, step = 0.1, format = (v) => v, onChange, onCommit, hint, disabled }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <Field label={<label htmlFor={id}>{label}</label>} aside={format(value)} hint={hint}>
      <input
        id={id}
        type="range"
        className="ngk-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <div className="flex justify-between text-[10px] text-cream-600 tabular-nums">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </Field>
  );
}

export function Toggle({ label, description, checked, onChange, disabled, lockedReason }) {
  const id = useId();
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-55' : ''}`}>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[13px] font-medium text-cream-100">{label}</span>
        {(lockedReason || description) && (
          <span className="mt-0.5 block text-xs leading-relaxed text-cream-600">{lockedReason ?? description}</span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-gold-500' : 'bg-ink-600'
        } disabled:cursor-not-allowed`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-cream-50 shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}

export function Segmented({ options, value, onChange, disabled, columns }) {
  return (
    <div
      role="radiogroup"
      className="grid gap-1 rounded-xl border border-ink-700 bg-ink-850 p-1"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.code === value;
        return (
          <button
            key={o.code}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.code)}
            className={`flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all disabled:opacity-35 ${
              active ? 'bg-ink-600 text-gold-200 shadow-inner' : 'text-cream-300 hover:text-cream-50'
            }`}
          >
            {o.icon}
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

/** Ô màu tròn (kim loại / đá). `fill` là CSS background. */
export function Swatch({ name, fill, selected, onClick, size = 'md', sublabel }) {
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={name}
      className="group flex flex-col items-center gap-1.5 text-center"
    >
      <span
        className={`relative ${dim} rounded-full ring-offset-2 ring-offset-ink-800 transition-all ${
          selected ? 'ring-2 ring-gold-400' : 'ring-1 ring-ink-600 group-hover:ring-cream-500'
        }`}
        style={{ background: fill }}
      >
        {selected && (
          <span className="absolute -right-0.5 -bottom-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gold-400 text-ink-950">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className={`max-w-[5.5rem] text-[11px] leading-tight ${selected ? 'text-gold-200' : 'text-cream-500'}`}>
        {name}
      </span>
      {sublabel && <span className="-mt-1 text-[10px] text-cream-600">{sublabel}</span>}
    </button>
  );
}

/** Thẻ lựa chọn lớn (kiểu dáng, hình mặt dây...). */
export function OptionCard({ title, description, icon, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:opacity-40 ${
        selected
          ? 'border-gold-500/70 bg-gold-400/[0.07] shadow-[inset_0_0_0_1px_rgba(217,183,102,0.25)]'
          : 'border-ink-700 bg-ink-850 hover:border-ink-500 hover:bg-ink-800'
      }`}
    >
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            selected ? 'bg-gold-400/15 text-gold-300' : 'bg-ink-750 text-cream-300 group-hover:text-cream-100'
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className={`block text-[13px] font-semibold ${selected ? 'text-gold-200' : 'text-cream-100'}`}>
          {title}
        </span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-cream-500">{description}</span>}
      </span>
    </button>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="eyebrow">{children}</h3>
      {aside}
    </div>
  );
}

export function Notice({ children, tone = 'info' }) {
  const tones = {
    info: 'border-ink-600 bg-ink-850 text-cream-300',
    gold: 'border-gold-500/30 bg-gold-400/[0.06] text-gold-200',
  };
  return <div className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${tones[tone]}`}>{children}</div>;
}
