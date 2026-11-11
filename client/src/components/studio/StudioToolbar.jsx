import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Redo2, Repeat2, RotateCcw, Share2, Undo2 } from 'lucide-react';
import { selectCanRedo, selectCanUndo, useDesignStore } from '../../store/designStore.js';
import { Button, IconButton } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { NgkMark } from '../icons.jsx';
import { ExportModal } from './ExportModal.jsx';
import { SaveButton, SyncStatus, openSave } from './SaveDialogs.jsx';
import { UserMenu } from '../auth/UserMenu.jsx';
import { NotificationBell } from '../community/NotificationBell.jsx';
import { SharingDialog } from '../community/SharingDialog.jsx';
import { requireLogin } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { useSyncStore } from '../../services/designSync.js';

export function StudioToolbar({ savedAt }) {
  const title = useDesignStore((s) => s.title);
  const setTitle = useDesignStore((s) => s.setTitle);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const reset = useDesignStore((s) => s.reset);
  const canUndo = useDesignStore(selectCanUndo);
  const canRedo = useDesignStore(selectCanRedo);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const designId = useDesignStore((s) => s.designId);
  const remixOf = useSyncStore((s) => s.remixOf);
  const visibility = useSyncStore((s) => s.visibility);
  const unsaved = useSyncStore((s) => ['dirty', 'syncing'].includes(s.status));
  const onServer = designId && designId !== 'new';
  const share = () =>
    requireLogin(() => {
      if (!(useDesignStore.getState().designId && useDesignStore.getState().designId !== 'new')) {
        toast('Hãy Lưu thiết kế vào tài khoản trước khi chia sẻ.', { tone: 'warning' });
        openSave();
        return;
      }
      setShareOpen(true);
    }, 'Đăng nhập để chia sẻ thiết kế.');

  return (
    // màn hẹp (điện thoại): xuống dòng thành 2 hàng, nút chữ chỉ còn biểu tượng → nút Lưu / chuông / tài khoản luôn bấm được
    // (trước đây bị đẩy ra ngoài màn hình và bị cắt). Không dùng cuộn ngang: sẽ cắt mất hộp thả xuống của chuông / tài khoản.
    <header className="relative z-40 flex min-h-16 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-ink-700 bg-ink-900/95 px-4 py-2 backdrop-blur md:h-16 md:flex-nowrap md:gap-x-3 md:py-0">
      <Link to="/" className="flex items-center gap-2 pr-2" aria-label="NGK – về trang chủ">
        <NgkMark size={26} />
        <span className="font-display text-xl font-bold tracking-[0.18em] text-gold-gradient">NGK</span>
      </Link>
      <span className="h-6 w-px bg-ink-700" />

      <label className="group flex min-w-32 flex-1 items-center gap-2 md:min-w-0">
        <span className="sr-only">Tên thiết kế</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="min-w-0 max-w-sm flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-display text-lg font-semibold text-cream-50 hover:border-ink-600 focus:border-gold-500/60 focus:bg-ink-850 focus:outline-none"
        />
        <Pencil size={14} className="shrink-0 text-cream-600 group-hover:text-cream-300" />
      </label>
      {remixOf && (
        <span className="hidden max-w-48 shrink-0 items-center gap-1 truncate rounded-full border border-ink-600 px-2.5 py-1 text-[11px] text-cream-400 2xl:flex" title={`Remix từ “${remixOf.name}” của ${remixOf.ownerName}`}>
          <Repeat2 size={12} className="shrink-0 text-gold-300" /> Remix từ “{remixOf.name}”
        </span>
      )}

      <div className="flex items-center gap-1">
        <IconButton label="Hoàn tác (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Làm lại (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={18} />
        </IconButton>
        <IconButton label="Đặt lại mặc định" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={17} />
        </IconButton>
      </div>

      <SyncStatus localSavedAt={savedAt} />

      <Button variant="secondary" size="sm" aria-label="Chia sẻ" onClick={share} title={onServer && visibility !== 'private' ? (visibility === 'public' ? 'Đang công khai' : 'Đang chia sẻ bằng liên kết') : 'Chia sẻ thiết kế'}>
        <Share2 size={15} /> <span className="hidden sm:inline">Chia sẻ</span>
        {onServer && visibility !== 'private' ? <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-label="đang chia sẻ" /> : null}
      </Button>
      <Button variant="secondary" size="sm" aria-label="Xuất" title="Xuất ảnh PNG / bảng thông số PDF" onClick={() => setExportOpen(true)}>
        <Download size={15} /> <span className="hidden sm:inline">Xuất</span>
      </Button>
      <SaveButton />
      <NotificationBell />
      <UserMenu compact />
      <SharingDialog
        designId={shareOpen && onServer ? designId : null}
        unsaved={unsaved}
        onClose={() => setShareOpen(false)}
        onSaved={(d) => useSyncStore.setState({ visibility: d.visibility })}
      />

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Đặt lại thiết kế?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Đặt lại
            </Button>
          </>
        }
      >
        <p className="text-sm text-cream-300">
          Mọi tùy chỉnh sẽ trở về mặc định của kiểu dáng hiện tại. Bạn vẫn có thể bấm <b>Hoàn tác</b> để lấy lại.
        </p>
      </Modal>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />

    </header>
  );
}
