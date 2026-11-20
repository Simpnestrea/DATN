// Hộp đăng nhập dùng chung (mở bằng useAuthStore.openAuth / requireLogin) + thông báo của hộp thư demo.
import { X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { Modal } from '../ui/Modal.jsx';
import { AuthView, VIEW_TITLES } from './AuthForms.jsx';

export function AuthDialog() {
  const dialog = useAuthStore((s) => s.dialog);
  const close = useAuthStore((s) => s.closeAuth);
  const setView = useAuthStore((s) => s.setAuthView);
  return (
    <Modal open={!!dialog} onClose={close} title={VIEW_TITLES[dialog?.view] ?? 'Đăng nhập'}>
      {dialog?.reason && <p className="mb-4 rounded-xl border border-gold-500/30 bg-gold-400/[0.05] px-3 py-2 text-xs text-gold-200">{dialog.reason}</p>}
      {dialog && <AuthView view={dialog.view} onSwitch={setView} />}
    </Modal>
  );
}

/** Hộp thư demo (chưa cấu hình Gmail): email không gửi thật → hiện link trong thư (xác minh email…) ở góc màn hình để bấm mở. */
export function DevMailNotice() {
  const devMail = useAuthStore((s) => s.devMail);
  if (!devMail) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-sm items-start gap-2 rounded-2xl border border-gold-500/40 bg-ink-900/95 px-4 py-3 text-xs text-gold-200 shadow-xl">
      <span>
        Hộp thư demo (chưa cấu hình Gmail) – thư {devMail.label} không được gửi thật.{' '}
        <a href={devMail.url} className="font-semibold underline" onClick={() => useAuthStore.setState({ devMail: null })}>
          Mở liên kết
        </a>
      </span>
      <button type="button" aria-label="Đóng" onClick={() => useAuthStore.setState({ devMail: null })} className="text-cream-500 hover:text-cream-50">
        <X size={14} />
      </button>
    </div>
  );
}
