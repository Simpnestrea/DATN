// HỘP THOẠI dùng chung của khu quản trị: ghi lý do rồi xác nhận (ẩn thiết kế, gỡ bình luận, xin quyền xem…),
// khoá tài khoản (dùng ở trang người dùng lẫn hàng chờ báo cáo).
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorBox, ReasonField } from './AdminUi.jsx';
import { LOCK_REASONS } from './adminLabels.js';
import { post } from '../../services/api.js';

/**
 * Ghi lý do + xác nhận. `onConfirm(reason)` trả về Promise – lỗi hiện ngay trong hộp, hộp giữ nguyên để sửa.
 * @param min  0 = lý do không bắt buộc (ghi chú)
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  children,
  label = 'Lý do',
  presets = [],
  min = 4,
  placeholder,
  confirmLabel,
  ConfirmIcon,
  variant = 'danger',
  onConfirm,
  id = 'reason',
  width = 'max-w-lg',
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  const ok = [...reason.trim()].length >= min;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={width}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant={variant} disabled={!ok || busy} onClick={submit}>
            {ConfirmIcon && <ConfirmIcon size={15} />} {busy ? 'Đang xử lý…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-cream-300">
        {children}
        <ReasonField id={id} label={label} value={reason} onChange={setReason} presets={presets} min={min} placeholder={placeholder} autoFocus />
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/**
 * Khoá tài khoản (bắt buộc lý do – người bị khoá thấy lý do khi đăng nhập).
 * @param user    { id, displayName, email }
 * @param shared  số thiết kế công khai / có liên kết sẽ bị ẩn (null = không rõ)
 * @param report  khoá từ hàng chờ báo cáo → đóng luôn báo cáo của nội dung đó { targetType, targetId }
 */
export function LockUserDialog({ open, user, shared = null, report = null, onClose, onDone }) {
  if (!user) return null;
  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Khoá tài khoản"
      id="lock-reason"
      label="Lý do khoá (người dùng sẽ thấy)"
      presets={LOCK_REASONS}
      confirmLabel="Khoá tài khoản"
      ConfirmIcon={Lock}
      onConfirm={async (reason) => {
        const r = await post(`/api/admin/users/${user.id}/lock`, { reason, ...(report ? { closeReports: report } : {}) });
        onDone(`Đã khoá tài khoản ${user.displayName}`, r);
      }}
    >
      <p>
        Khoá <b className="text-cream-50">{user.displayName}</b>
        {user.email ? ` (${user.email})` : ''}:
      </p>
      <ul className="list-disc space-y-1 pl-5 text-cream-400">
        <li>Bị đăng xuất ngay trên mọi thiết bị.</li>
        <li>Không đăng nhập được (kể cả Google, quên mật khẩu) – khi thử sẽ thấy lý do bên dưới.</li>
        <li>{shared != null ? `${shared} thiết kế công khai / có liên kết` : 'Thiết kế công khai / có liên kết'}, bình luận và hồ sơ tạm ẩn khỏi cộng đồng.</li>
        {report && <li>Các báo cáo về nội dung này được đóng lại.</li>}
        <li>Mở khoá lúc nào cũng được – mọi thứ trở lại như cũ, không mất dữ liệu.</li>
      </ul>
    </ReasonDialog>
  );
}
