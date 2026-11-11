// LƯU THIẾT KẾ trong Studio: hộp lưu phiên bản (tên + ghi chú), hộp xử lý xung đột (sửa ở 2 nơi),
// trạng thái đồng bộ trên thanh công cụ, phím Ctrl+S, lớp khoá "Tự tạo" khi chưa đăng nhập.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff, Loader2, Lock, Save } from 'lucide-react';
import { useDesignStore } from '../../store/designStore.js';
import { useCatalogStore } from '../../store/catalogStore.js';
import { requireLogin, useAuthStore } from '../../store/authStore.js';
import { resolveConflict, saveVersion, useSyncStore } from '../../services/designSync.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { shortcutsBlocked } from '../../utils/keys.js';

/** Mở hộp lưu (chưa đăng nhập → đăng nhập trước, xong tự mở tiếp). */
export function openSave() {
  requireLogin(() => useSyncStore.setState({ dialog: 'save' }), 'Đăng nhập để lưu thiết kế vào tài khoản – bản đang làm sẽ được giữ nguyên.');
}

export function useSaveShortcut() {
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault(); // không mở hộp "Lưu trang" của trình duyệt
      if (document.querySelector('[data-keytrap]')) return;
      if (!shortcutsBlocked(e) || e.target?.tagName === 'INPUT') openSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const time = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Dòng trạng thái trên thanh công cụ Studio. */
export function SyncStatus({ localSavedAt }) {
  const user = useAuthStore((s) => s.user);
  const { status, lastSyncedAt, lastSavedAt } = useSyncStore();
  const onServer = useDesignStore((s) => s.designId && s.designId !== 'new');
  let text;
  let icon = null;
  if (!onServer || !user) text = localSavedAt ? `Nháp trên máy ${time(localSavedAt)} · chưa lưu vào tài khoản` : '';
  else if (status === 'syncing') {
    text = 'Đang đồng bộ…';
    icon = <Loader2 size={12} className="animate-spin" />;
  } else if (status === 'dirty') text = 'Có thay đổi – sắp đồng bộ';
  else if (status === 'offline') {
    text = 'Mất kết nối – nháp vẫn còn trên máy, sẽ tự đồng bộ lại';
    icon = <CloudOff size={12} />;
  } else if (status === 'conflict') text = 'Thiết kế vừa được sửa ở nơi khác';
  else if (status === 'error') text = 'Chưa đồng bộ được';
  else text = `Đã đồng bộ ${lastSyncedAt ? time(lastSyncedAt) : ''}${lastSavedAt ? ` · lưu bản gần nhất ${time(lastSavedAt)}` : ''}`;
  return (
    <span data-testid="sync-status" className={`hidden items-center gap-1.5 text-xs select-none xl:flex ${['offline', 'conflict', 'error'].includes(status) && onServer ? 'text-gold-300' : 'text-cream-600'}`} aria-live="polite">
      {icon}
      {text}
    </span>
  );
}

export function SaveButton() {
  const saving = useSyncStore((s) => s.saving);
  return (
    <Button variant="primary" size="sm" aria-label="Lưu thiết kế" onClick={openSave} disabled={saving} title="Lưu thiết kế (Ctrl+S)">
      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} <span className="hidden sm:inline">Lưu thiết kế</span>
    </Button>
  );
}

export function SaveDialogs() {
  const dialog = useSyncStore((s) => s.dialog);
  const status = useSyncStore((s) => s.status);
  const versionCount = useSyncStore((s) => s.versionCount);
  const saving = useSyncStore((s) => s.saving);
  const title = useDesignStore((s) => s.title);
  const setTitle = useDesignStore((s) => s.setTitle);
  const isNew = useDesignStore((s) => !s.designId || s.designId === 'new');
  const lookup = useCatalogStore((s) => s.lookup);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => useSyncStore.setState({ dialog: null });
  useEffect(() => {
    if (dialog === 'save') setNote('');
  }, [dialog]);

  const submit = async (e) => {
    e?.preventDefault();
    const res = await saveVersion(note.trim());
    if (res) close();
  };
  const choose = async (c) => {
    setBusy(true);
    try {
      await resolveConflict(c, lookup);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={dialog === 'save'}
        onClose={close}
        title={isNew ? 'Lưu thiết kế vào tài khoản' : 'Lưu phiên bản mới'}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu
            </Button>
          </>
        }
      >
        {/* Enter trong ô nào cũng lưu (form 2 ô nhập không tự gửi khi Enter) */}
        <form onSubmit={submit} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit(e)} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-cream-100">Tên thiết kế</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="h-10 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-cream-50 focus:border-gold-500/60 focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-cream-100">Ghi chú cho phiên bản (tùy chọn)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Ví dụ: đổi sang vàng trắng, thêm đá tấm"
              className="h-10 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/60 focus:outline-none"
            />
          </label>
          <p className="text-xs leading-relaxed text-cream-500">
            {isNew
              ? 'Thiết kế sẽ được lưu vào tài khoản cùng ảnh chụp góc nhìn hiện tại. Sau đó mọi thay đổi tự đồng bộ; mỗi lần bấm Lưu tạo một phiên bản để quay lại khi cần.'
              : `Đang có ${versionCount} phiên bản – giữ tối đa 20 bản gần nhất. Ảnh đại diện lấy theo góc nhìn hiện tại của khung 3D.`}
          </p>
        </form>
      </Modal>

      <Modal open={status === 'conflict'} onClose={() => {}} title="Thiết kế vừa được sửa ở nơi khác">
        <div className="space-y-4 text-sm text-cream-300">
          <p>Thiết kế này đã được thay đổi ở một tab hoặc thiết bị khác sau khi bạn mở. Bạn muốn làm gì?</p>
          <div className="grid gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => choose('reload')}>
              Tải bản mới nhất từ máy chủ (bỏ thay đổi ở đây)
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => choose('overwrite')}>
              Giữ bản ở đây – ghi đè lên bản kia
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => choose('copy')}>
              Lưu bản ở đây thành thiết kế mới
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** "Tự tạo" chỉ dành cho người đã đăng nhập – che khung 3D + bảng chỉnh (không xoá bài đang làm). */
export function CustomLock() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  if (status !== 'ready' || user) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/80 p-6 backdrop-blur-sm md:left-24" data-testid="custom-lock">
      <div className="max-w-sm rounded-3xl border border-gold-500/40 bg-ink-850 p-7 text-center shadow-2xl">
        <Lock size={28} className="mx-auto text-gold-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold text-cream-50">“Tự tạo” cần đăng nhập</h2>
        <p className="mt-2 text-sm text-cream-400">Trình dựng hình tự do dành cho thành viên. Đăng ký miễn phí – hoặc chọn một loại trang sức khác ở cột bên trái để thiết kế ngay.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={() => useAuthStore.getState().openAuth('login', { reason: 'Đăng nhập để dùng “Tự tạo”.' })}>
            Đăng nhập
          </Button>
          <Button variant="secondary" onClick={() => useAuthStore.getState().openAuth('register')}>
            Đăng ký
          </Button>
        </div>
        <Link to="/" className="mt-4 inline-block text-xs text-cream-500 hover:text-cream-200">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
