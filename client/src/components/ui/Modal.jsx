import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Hộp thoại: đóng bằng Esc / bấm nền; tự focus vào hộp thoại khi mở. */
export function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // chỉ chạy khi MỞ hộp (không phụ thuộc onClose – hàm này thường tạo mới mỗi lần vẽ lại; nếu phụ thuộc, mỗi lần gõ
  // phím trong ô nhập của hộp sẽ đưa focus về khung hộp → mất chữ đang gõ)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    // ô nhập có autoFocus thì giữ, còn lại focus vào khung hộp (cho trình đọc màn hình / phím Esc)
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-fade-up relative w-full ${width} rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
          <h2 className="font-display text-xl font-semibold text-cream-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full p-1.5 text-cream-500 hover:bg-ink-700 hover:text-cream-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
