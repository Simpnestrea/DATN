// TƯƠNG TÁC: nút Thích (đổi ngay trên giao diện, lỗi thì hoàn lại), hộp Báo cáo vi phạm.
import { useEffect, useState } from 'react';
import { Flag, Heart, Loader2 } from 'lucide-react';
import { requireLogin, useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { del, post } from '../../services/api.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { compactNumber } from '../../utils/time.js';

/**
 * @param onLoginLike  khách bấm Thích → đăng nhập xong gọi hàm này (trang cha thích SAU khi đã tải lại dữ liệu theo tài
 *                     khoản mới – tránh kết quả tải lại về sau ghi đè lượt thích vừa bấm)
 */
export function LikeButton({ designId, liked: liked0, count: count0, onChange, onLoginLike }) {
  const [liked, setLiked] = useState(liked0);
  const [count, setCount] = useState(count0);
  const [busy, setBusy] = useState(false);
  // dữ liệu trang được tải lại (đăng nhập / đăng xuất / thích từ nơi khác) → theo dữ liệu mới
  useEffect(() => {
    setLiked(liked0);
    setCount(count0);
  }, [liked0, count0]);
  const toggle = () => {
    if (!useAuthStore.getState().user && onLoginLike) {
      requireLogin(onLoginLike, 'Đăng nhập để thích thiết kế này.');
      return;
    }
    requireLogin(async () => {
      if (busy) return;
      const next = !liked;
      // đổi ngay cho mượt, máy chủ trả số đúng thì cập nhật lại
      setLiked(next);
      setCount((c) => Math.max(0, c + (next ? 1 : -1)));
      setBusy(true);
      try {
        const r = next ? await post(`/api/designs/${designId}/like`) : await del(`/api/designs/${designId}/like`);
        setLiked(r.liked);
        setCount(r.likeCount);
        onChange?.(r);
      } catch (e) {
        setLiked(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        toast(e.message, { tone: 'warning' });
      } finally {
        setBusy(false);
      }
    }, 'Đăng nhập để thích thiết kế này.');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? 'Bỏ thích' : 'Thích'}
      className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
        liked ? 'border-rose-400/60 bg-rose-500/10 text-rose-300' : 'border-ink-600 text-cream-200 hover:border-rose-400/50 hover:text-rose-200'
      }`}
    >
      <Heart size={17} fill={liked ? 'currentColor' : 'none'} className={busy ? 'animate-pulse' : ''} />
      <span data-testid="like-count">{compactNumber(count)}</span>
    </button>
  );
}

const REASONS = [
  { code: 'spam', name: 'Spam / quảng cáo' },
  { code: 'offensive', name: 'Nội dung xúc phạm, không phù hợp' },
  { code: 'copyright', name: 'Sao chép thiết kế của người khác' },
  { code: 'other', name: 'Lý do khác' },
];

/** Hộp báo cáo vi phạm (thiết kế / bình luận) – quản trị viên xử lý. */
export function ReportDialog({ target, onClose }) {
  const [reason, setReason] = useState('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await post('/api/reports', { targetType: target.type, targetId: target.id, reason, note: note.trim() || undefined });
      toast('Đã gửi báo cáo – cảm ơn bạn, quản trị viên sẽ xem xét.', { tone: 'success' });
      onClose();
    } catch (e) {
      toast(e.message, { tone: 'warning' });
      if (e.status === 409) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={target?.type === 'comment' ? 'Báo cáo bình luận' : 'Báo cáo thiết kế'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Flag size={15} />} Gửi báo cáo
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium text-cream-100">Lý do</legend>
        {REASONS.map((r) => (
          <label key={r.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${reason === r.code ? 'border-gold-500/60 bg-gold-400/[0.06] text-cream-50' : 'border-ink-700 text-cream-300'}`}>
            <input type="radio" name="reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-gold-400" />
            {r.name}
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block space-y-1.5">
        <span className="text-[13px] font-medium text-cream-100">Ghi chú thêm (tùy chọn)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-cream-50 focus:border-gold-500/60 focus:outline-none"
        />
      </label>
    </Modal>
  );
}
