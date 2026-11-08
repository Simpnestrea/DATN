import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore.js';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert };

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone] ?? Info;
        return (
          <div
            key={t.id}
            className="animate-fade-up pointer-events-auto flex items-center gap-3 rounded-full border border-ink-600 bg-ink-800/95 py-2 pr-2 pl-4 text-sm text-cream-100 shadow-xl backdrop-blur"
          >
            <Icon size={16} className={t.tone === 'success' ? 'text-success' : t.tone === 'warning' ? 'text-gold-400' : 'text-cream-300'} />
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo" className="rounded-full p-1 text-cream-500 hover:text-cream-50">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
