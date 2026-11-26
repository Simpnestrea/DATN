// CHUÔNG THÔNG BÁO: số chưa đọc (cập nhật mỗi phút + khi quay lại tab), danh sách, bấm để mở đúng chỗ.
// Quản trị viên xin xem thiết kế riêng tư → chủ thiết kế Đồng ý / Từ chối ngay trong chuông.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { get, post } from '../../services/api.js';
import { Avatar } from '../auth/UserMenu.jsx';
import { NgkMark } from '../icons.jsx';
import { formatDate, timeAgo } from '../../utils/time.js';

const POLL_MS = 60_000;
const typeName = (code) => (JEWELRY_TYPES.find((t) => t.code === code)?.name ?? 'trang sức').toLowerCase();

/** Câu thông báo tiếng Việt: "A", "A và B", "A và 3 người khác" + hành động. */
export function notificationText(n) {
  const names = n.actors.map((a) => a.displayName);
  let who = names[0] ?? 'Ai đó';
  if (n.actorCount === 2 && names[1]) who = `${names[0]} và ${names[1]}`;
  else if (n.actorCount > 2) who = `${names[0]} và ${n.actorCount - 1} người khác`;
  const name = n.design ? (n.design.masked ? `thiết kế riêng tư (${typeName(n.design.type)})` : `“${n.design.name}”`) : 'một thiết kế đã bị xoá';
  switch (n.type) {
    case 'like':
      return `${who} đã thích ${name}`;
    case 'comment':
      return `${who} đã bình luận về ${name}`;
    case 'reply':
      return `${who} đã trả lời bình luận của bạn ở ${name}`;
    case 'remix':
      return `${who} đã remix ${name}`;
    case 'moderation':
      return {
        'design-hidden': `Quản trị viên NGK đã ẩn ${name} khỏi cộng đồng`,
        'design-restored': `${name} đã được hiện lại trong cộng đồng`,
        'comment-removed': `Quản trị viên NGK đã gỡ bình luận của bạn ở ${name}`,
        'comment-restored': `Bình luận của bạn ở ${name} đã được khôi phục`,
      }[n.kind] ?? `Quản trị viên NGK đã xử lý ${name}`;
    case 'featured':
      return `Chúc mừng! ${name} được NGK chọn là thiết kế nổi bật`;
    case 'access-request':
      return `${who} (quản trị viên) xin xem thiết kế riêng tư ${name}`;
    case 'access-result':
      return {
        approved: `${who} đã đồng ý cho bạn xem ${name} trong 7 ngày`,
        declined: `${who} đã từ chối yêu cầu xem ${name}`,
        revoked: `${who} đã thu hồi quyền xem ${name}`,
      }[n.kind] ?? `${who} đã trả lời yêu cầu xem ${name}`;
    default:
      return `${who} đã tương tác với ${name}`;
  }
}

/** Trạng thái yêu cầu xin xem (đã trả lời). */
const REQUEST_STATUS = {
  approved: (r) => `Bạn đã đồng ý · hết hạn ${formatDate(r.expiresAt)}`,
  declined: () => 'Bạn đã từ chối',
  revoked: () => 'Bạn đã thu hồi quyền xem',
  expired: () => 'Quyền xem đã hết hạn',
};

export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null); // id thông báo đang trả lời
  const ref = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      setCount((await get('/api/notifications/unread-count')).count);
    } catch {
      /* mất mạng / hết phiên – bỏ qua, lần sau thử lại */
    }
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    refreshCount();
    const t = setInterval(() => document.visibilityState === 'visible' && refreshCount(), POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, refreshCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    setItems(null);
    get('/api/notifications')
      .then((r) => {
        setItems(r.items);
        setCount(r.unread);
      })
      .catch(() => setItems([]));
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;

  const markRead = (n) => {
    if (n.read) return;
    setCount((c) => Math.max(0, c - 1));
    setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    post(`/api/notifications/${n.id}/read`).catch(() => {});
  };
  const openItem = (n) => {
    setOpen(false);
    markRead(n);
    if (!n.design) return;
    if (n.type === 'access-request') return navigate('/tai-khoan#quyen-xem');
    if (n.type === 'access-result') {
      // được đồng ý (còn hạn) → mở trang xem; còn lại → trang quản trị của chủ thiết kế
      return navigate(n.request?.status === 'approved' ? `/quan-tri/thiet-ke/${n.design.id}` : `/quan-tri/nguoi-dung/${n.actors[0]?.id ?? ''}`);
    }
    // remix: bản remix là thiết kế riêng của người kia → mở thiết kế GỐC của bạn (thấy số lượt remix + danh sách remix công khai)
    const toComments = n.type === 'comment' || n.type === 'reply' || n.kind === 'comment-removed' || n.kind === 'comment-restored';
    navigate(`/thiet-ke/${n.design.id}${toComments ? '#binh-luan' : ''}`);
  };
  const respond = async (n, action) => {
    setBusy(n.id);
    try {
      const r = await post(`/api/account/access-requests/${n.request.id}/${action}`);
      if (!n.read) setCount((c) => Math.max(0, c - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true, request: r.request } : x)));
      toast(action === 'approve' ? 'Đã đồng ý – quản trị viên xem được (chỉ đọc) trong 7 ngày' : 'Đã từ chối yêu cầu', { tone: 'success' });
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    } finally {
      setBusy(null);
    }
  };
  const readAll = async () => {
    await post('/api/notifications/read-all').catch(() => {});
    setCount(0);
    setItems((list) => list?.map((n) => ({ ...n, read: true })));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={count ? `Thông báo (${count} chưa đọc)` : 'Thông báo'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-cream-300 hover:bg-ink-700 hover:text-cream-50"
      >
        <Bell size={18} />
        {count > 0 && (
          <span data-testid="bell-count" className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Thông báo" className="absolute right-0 top-full z-50 mt-2 w-[380px] max-w-[92vw] rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <span className="text-sm font-semibold text-cream-50">Thông báo</span>
            <button type="button" onClick={readAll} disabled={!count} className="flex items-center gap-1 text-xs text-gold-300 hover:underline disabled:opacity-40 disabled:no-underline">
              <CheckCheck size={14} /> Đánh dấu đã đọc hết
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {!items && (
              <div className="flex justify-center py-8 text-cream-500">
                <Loader2 className="animate-spin" />
              </div>
            )}
            {items && !items.length && <p className="px-3 py-8 text-center text-sm text-cream-500">Chưa có thông báo nào.</p>}
            {items?.map((n) => {
              const system = n.actors[0]?.system;
              const pending = n.type === 'access-request' && n.request?.status === 'pending';
              return (
                <div key={n.id} data-testid="notification" data-type={n.type} className={`rounded-xl transition-colors hover:bg-ink-700 ${n.read ? '' : 'bg-gold-400/[0.06]'}`}>
                  <button type="button" onClick={() => openItem(n)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
                    {system ? (
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-gold-400/15">
                        <NgkMark size={18} />
                      </span>
                    ) : (
                      <Avatar user={n.actors[0]} size={34} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug text-cream-100">{notificationText(n)}</span>
                      {n.reason && <span className="mt-0.5 block text-xs text-cream-400">Lý do: {n.reason}</span>}
                      {n.preview && <span className="mt-0.5 block truncate text-xs text-cream-500">“{n.preview}”</span>}
                      {n.type === 'access-request' && n.request && !pending && (
                        <span className="mt-0.5 block text-[11px] text-gold-300">{REQUEST_STATUS[n.request.status]?.(n.request)}</span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-cream-600">{timeAgo(n.at)}</span>
                    </span>
                    {n.design?.thumbnailUrl && <img src={n.design.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" aria-label="chưa đọc" />}
                  </button>
                  {pending && (
                    <div className="flex gap-2 px-3 pb-3 pl-[58px]">
                      <button
                        type="button"
                        disabled={busy === n.id}
                        onClick={() => respond(n, 'approve')}
                        className="rounded-full bg-gold-400 px-3 py-1 text-xs font-semibold text-ink-950 hover:bg-gold-300 disabled:opacity-50"
                      >
                        Đồng ý (7 ngày)
                      </button>
                      <button
                        type="button"
                        disabled={busy === n.id}
                        onClick={() => respond(n, 'decline')}
                        className="rounded-full border border-ink-500 px-3 py-1 text-xs text-cream-200 hover:border-cream-500 disabled:opacity-50"
                      >
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
