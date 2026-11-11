import { JEWELRY_TYPES } from '@ngk/shared';
import { useDesignStore } from '../../store/designStore.js';
import { TypeIcon } from '../icons.jsx';
import { requireLogin } from '../../store/authStore.js';

/** Cột chọn loại trang sức bên trái Studio. */
export function TypeRail() {
  const type = useDesignStore((s) => s.config.type);
  const changeType = useDesignStore((s) => s.changeType);
  return (
    <nav aria-label="Loại trang sức" className="flex gap-1 md:flex-col">
      {JEWELRY_TYPES.map((t) => {
        const active = t.code === type;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => (t.code === 'custom' ? requireLogin(() => changeType('custom'), 'Đăng nhập để dùng “Tự tạo” – trình dựng hình tự do.') : changeType(t.code))}
            aria-pressed={active}
            className={`group flex min-w-16 flex-1 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11px] font-medium transition-all md:flex-none ${
              active ? 'bg-gold-400/12 text-gold-200' : 'text-cream-500 hover:bg-ink-750 hover:text-cream-100'
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                active ? 'border-gold-500/60 bg-ink-800 text-gold-300' : 'border-ink-600 group-hover:border-ink-500'
              }`}
            >
              <TypeIcon type={t.code} size={20} />
            </span>
            {t.name}
          </button>
        );
      })}
    </nav>
  );
}
