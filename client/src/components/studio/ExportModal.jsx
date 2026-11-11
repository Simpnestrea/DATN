import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Segmented } from '../ui/controls.jsx';
import { getBackground, useViewerStore } from '../../store/viewerStore.js';
import { useDesignStore } from '../../store/designStore.js';
import { toast } from '../../store/toastStore.js';
import { downloadDataUrl, slugify } from '../../utils/download.js';
import { useAuthStore } from '../../store/authStore.js';
import { useSyncStore } from '../../services/designSync.js';
import { openStudioSheet } from '../../services/printSheet.js';

const SCALES = [
  { code: '1', name: 'Tiêu chuẩn' },
  { code: '2', name: 'Cao (2×)' },
  { code: '3', name: 'Rất cao (3×)' },
];
const BG_OPTIONS = [
  { code: 'view', name: 'Như khung xem' },
  { code: 'none', name: 'Trong suốt' },
];

export function ExportModal({ open, onClose }) {
  const capture = useViewerStore((s) => s.capture);
  const bgCode = useViewerStore((s) => s.background);
  const title = useDesignStore((s) => s.title);
  const [scale, setScale] = useState('2');
  const [bg, setBg] = useState('view');

  const doExport = () => {
    if (!capture) {
      toast('Khung 3D chưa sẵn sàng, thử lại sau giây lát.', { tone: 'warning' });
      return;
    }
    try {
      const url = capture({ scale: Number(scale), background: bg === 'view' ? getBackground(bgCode) : null });
      downloadDataUrl(url, `ngk-${slugify(title)}.png`);
      toast('Đã xuất ảnh PNG', { tone: 'success' });
      onClose();
    } catch {
      toast('Không xuất được ảnh – hãy thử độ phân giải thấp hơn.', { tone: 'warning' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xuất thiết kế"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" onClick={doExport}>
            <Download size={16} /> Tải ảnh PNG
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-cream-300">Ảnh được chụp đúng góc nhìn hiện tại của khung 3D. Hãy xoay mô hình tới góc đẹp nhất trước khi xuất.</p>
        <Field label="Độ phân giải">
          <Segmented options={SCALES} value={scale} onChange={setScale} />
        </Field>
        <Field label="Nền ảnh" hint="Nền trong suốt tiện để ghép vào slide, poster hoặc báo cáo.">
          <Segmented options={BG_OPTIONS} value={bg} onChange={setBg} />
        </Field>
        <div className="space-y-2 border-t border-ink-700 pt-4">
          <p className="text-[13px] font-medium text-cream-100">Bảng thông số (PDF)</p>
          <p className="text-xs text-cream-500">
            Trang A4: ảnh 4 góc, bảng thông số đầy đủ, tác giả{' '}
            {useSyncStore.getState().visibility !== 'private' ? 'và mã QR tới trang thiết kế' : '(thiết kế đã chia sẻ sẽ có thêm mã QR)'}. Mở ở tab mới – chọn “Lưu
            dưới dạng PDF” trong hộp In.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              const { config, designId } = useDesignStore.getState();
              const { visibility } = useSyncStore.getState();
              const onServer = designId && designId !== 'new';
              const ok = openStudioSheet({
                config,
                title,
                author: useAuthStore.getState().user?.displayName ?? null,
                shareUrl: onServer && visibility !== 'private' ? `${window.location.origin}/thiet-ke/${designId}` : null,
              });
              if (!ok) toast('Trình duyệt chặn bộ nhớ tạm – không mở được bảng thông số.', { tone: 'warning' });
              else onClose();
            }}
          >
            <FileText size={16} /> Mở bảng thông số PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
