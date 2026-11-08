import { forwardRef } from 'react';

const VARIANTS = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-[0_6px_24px_-8px_rgba(217,183,102,0.6)] hover:from-gold-200 hover:to-gold-400',
  secondary: 'border border-ink-600 bg-ink-800 text-cream-100 hover:border-gold-500/60 hover:bg-ink-750',
  ghost: 'text-cream-300 hover:bg-ink-750 hover:text-cream-50',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};
const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', className = '', as: As = 'button', ...props },
  ref,
) {
  return (
    <As
      ref={ref}
      className={`inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 select-none disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...(As === 'button' ? { type: props.type ?? 'button' } : {})}
      {...props}
    />
  );
});

/** Nút chỉ có icon, luôn có nhãn cho trình đọc màn hình + tooltip. */
export function IconButton({ label, active = false, className = '', children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-gold-400/15 text-gold-300' : 'text-cream-300 hover:bg-ink-700 hover:text-cream-50'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
