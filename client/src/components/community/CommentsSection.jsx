// BÌNH LUẬN của một thiết kế: trả lời 1 cấp, sửa / xoá / báo cáo, cần đăng nhập + email đã xác minh để viết.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Loader2, MessageCircle, Pencil, Reply, Trash2 } from 'lucide-react';
import { requireLogin, useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { del, get, patch, post } from '../../services/api.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Avatar } from '../auth/UserMenu.jsx';
import { AuthorLink } from './DesignCard.jsx';
import { ReportDialog } from './Interactions.jsx';
import { formatDateTime, timeAgo } from '../../utils/time.js';

const MAX = 1000;

function Composer({ onSubmit, initial = '', placeholder, autoFocus, onCancel, submitLabel = 'Gửi' }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSubmit(t);
      setText('');
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && onCancel) onCancel();
        }}
        rows={text.split('\n').length > 2 ? 4 : 2}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-y rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/60 focus:outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-cream-600">
          {text.length}/{MAX} · Ctrl+Enter để gửi
        </span>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={submit} disabled={busy || !text.trim()}>
          {busy && <Loader2 size={14} className="animate-spin" />} {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Ô viết bình luận theo trạng thái: khách / chưa xác minh / tắt bình luận / được viết. */
function ComposerGate({ allowComments, onSubmit }) {
  const user = useAuthStore((s) => s.user);
  const [resent, setResent] = useState(false);
  if (!allowComments) return <p className="rounded-xl border border-ink-700 px-4 py-3 text-sm text-cream-500">Tác giả đã tắt bình luận cho thiết kế này.</p>;
  if (!user) {
    return (
      <button type="button" onClick={() => requireLogin(() => {}, 'Đăng nhập để bình luận.')} className="w-full rounded-xl border border-dashed border-ink-600 px-4 py-3 text-left text-sm text-cream-400 hover:border-gold-500/50 hover:text-cream-100">
        Đăng nhập để bình luận…
      </button>
    );
  }
  if (!user.emailVerified) {
    return (
      <div className="space-y-2 rounded-xl border border-gold-500/30 bg-gold-400/[0.05] px-4 py-3 text-sm text-gold-200">
        <p>Xác minh email để bình luận (chống tài khoản rác).</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={resent}
          onClick={async () => {
            try {
              const r = await post('/api/auth/resend-verification');
              setResent(true);
              if (r.devLink) useAuthStore.setState({ devMail: { label: 'xác minh email', url: r.devLink } });
              toast('Đã gửi lại email xác minh', { tone: 'success' });
            } catch (e) {
              toast(e.message, { tone: 'warning' });
            }
          }}
        >
          {resent ? 'Đã gửi – kiểm tra hộp thư' : 'Gửi lại email xác minh'}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar user={user} size={34} />
      <div className="flex-1">
        <Composer onSubmit={onSubmit} placeholder="Viết bình luận…" />
      </div>
    </div>
  );
}

function CommentItem({ c, isReply, onReply, onChanged, onDeleted, onReport }) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (c.deleted) {
    return <p className="py-1 text-sm italic text-cream-600" data-testid="comment-deleted">Bình luận đã bị xoá</p>;
  }
  if (c.removed) {
    // bị quản trị viên gỡ – người viết được biết lý do
    return (
      <p className="py-1 text-sm italic text-cream-600" data-testid="comment-removed">
        Bình luận đã bị quản trị viên gỡ{c.removedReason ? ` – lý do: ${c.removedReason}` : ''}
      </p>
    );
  }
  if (c.hidden) {
    // người viết đang bị quản trị viên tạm khoá – hiện lại khi được mở khoá
    return <p className="py-1 text-sm italic text-cream-600" data-testid="comment-hidden">Bình luận đang bị ẩn</p>;
  }
  return (
    <div className="flex gap-3" id={`bl-${c.id}`} data-testid="comment">
      <Avatar user={c.author} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <AuthorLink author={c.author} avatar={false} className="font-semibold text-cream-100" />
          <span className="text-cream-600" title={formatDateTime(c.createdAt)}>
            {timeAgo(c.createdAt)}
          </span>
          {c.editedAt && <span className="text-cream-600">(đã sửa)</span>}
        </div>
        {editing ? (
          <div className="mt-2">
            <Composer
              initial={c.body}
              autoFocus
              submitLabel="Lưu"
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                const r = await patch(`/api/comments/${c.id}`, { body });
                onChanged(r.comment);
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-cream-200">{c.body}</p>
        )}
        {!editing && (
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-cream-500">
            <button type="button" className="flex items-center gap-1 hover:text-cream-100" onClick={() => onReply(c)}>
              <Reply size={12} /> Trả lời
            </button>
            {c.canEdit && (
              <button type="button" className="flex items-center gap-1 hover:text-cream-100" onClick={() => setEditing(true)}>
                <Pencil size={12} /> Sửa
              </button>
            )}
            {c.canDelete && (
              <button type="button" className="flex items-center gap-1 hover:text-danger" onClick={() => setConfirmDel(true)}>
                <Trash2 size={12} /> Xoá
              </button>
            )}
            {c.canReport && (
              <button type="button" className="flex items-center gap-1 hover:text-cream-100" onClick={() => onReport(c)}>
                <Flag size={12} /> Báo cáo
              </button>
            )}
          </div>
        )}
      </div>
      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Xoá bình luận?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  const r = await del(`/api/comments/${c.id}`);
                  setConfirmDel(false);
                  onDeleted(c, r.soft);
                } catch (e) {
                  toast(e.message, { tone: 'warning' });
                }
              }}
            >
              Xoá
            </Button>
          </>
        }
      >
        <p className="text-sm text-cream-300">Bình luận sẽ bị xoá vĩnh viễn.</p>
      </Modal>
    </div>
  );
}

export function CommentsSection({ designId, onCountChange }) {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // bình luận gốc đang trả lời
  const [report, setReport] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // giữ hàm báo số bình luận qua ref: trang cha truyền hàm mới mỗi lần vẽ lại cũng không làm tải lại bình luận
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;
  const load = useCallback(
    async (page = 1) => {
      const r = await get(`/api/public/designs/${designId}/comments?page=${page}`);
      setData((d) => (page === 1 ? r : { ...r, items: [...(d?.items ?? []), ...r.items] }));
    },
    [designId],
  );
  // đăng nhập / đăng xuất → quyền sửa / xoá thay đổi → tải lại
  useEffect(() => {
    load(1).catch((e) => toast(e.message, { tone: 'warning' }));
  }, [load, user?.id]);
  // mở từ thông báo (#binh-luan) → cuộn tới phần bình luận
  useEffect(() => {
    if (data && window.location.hash === '#binh-luan') document.getElementById('binh-luan')?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const bump = (delta) => setData((d) => ({ ...d, total: Math.max(0, (d?.total ?? 0) + delta) }));
  // báo số bình luận cho trang cha SAU khi vẽ xong (không gọi setState của trang cha trong lúc tính state ở đây)
  const total = data?.total;
  useEffect(() => {
    if (total !== undefined) countRef.current?.(total);
  }, [total]);
  const addTop = async (body) => {
    const r = await post(`/api/designs/${designId}/comments`, { body });
    setData((d) => ({ ...d, items: [r.comment, ...(d?.items ?? [])] }));
    bump(1);
  };
  const addReply = async (body) => {
    const r = await post(`/api/designs/${designId}/comments`, { body, parentId: replyTo.id });
    setData((d) => ({ ...d, items: d.items.map((t) => (t.id === r.comment.parentId ? { ...t, replies: [...t.replies, r.comment], replyCount: t.replyCount + 1 } : t)) }));
    setReplyTo(null);
    bump(1);
  };
  const changed = (c) =>
    setData((d) => ({
      ...d,
      items: d.items.map((t) => (t.id === c.id ? { ...t, ...c, replies: t.replies } : { ...t, replies: t.replies.map((r) => (r.id === c.id ? { ...r, ...c } : r)) })),
    }));
  const deleted = (c, soft) => {
    setData((d) => {
      let items = d.items;
      if (!c.parentId) items = soft ? items.map((t) => (t.id === c.id ? { ...t, deleted: true, body: '', author: null } : t)) : items.filter((t) => t.id !== c.id);
      else {
        items = items
          .map((t) => (t.id === c.parentId ? { ...t, replies: t.replies.filter((r) => r.id !== c.id), replyCount: t.replyCount - 1 } : t))
          .filter((t) => !(t.deleted && t.replies.length === 0)); // chỗ giữ "đã xoá" hết câu trả lời → bỏ
      }
      return { ...d, items };
    });
    bump(-1);
  };
  const startReply = (c) =>
    requireLogin(() => setReplyTo(c.parentId ? data.items.find((t) => t.id === c.parentId) : c), 'Đăng nhập để trả lời bình luận.');

  return (
    <section id="binh-luan" className="space-y-5" aria-label="Bình luận">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-cream-50">
        <MessageCircle size={20} className="text-gold-300" /> Bình luận <span className="text-base text-cream-500">({data?.total ?? 0})</span>
      </h2>
      {data && <ComposerGate allowComments={data.allowComments} onSubmit={addTop} />}
      {!data && (
        <div className="flex justify-center py-6 text-cream-500">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {data && !data.items.length && <p className="text-sm text-cream-500">Chưa có bình luận nào{data.allowComments ? ' – hãy là người đầu tiên!' : '.'}</p>}
      <ol className="space-y-5">
        {data?.items.map((t) => (
          <li key={t.id} className="space-y-3">
            <CommentItem c={t} onReply={startReply} onChanged={changed} onDeleted={deleted} onReport={(c) => setReport({ type: 'comment', id: c.id })} />
            {(t.replies.length > 0 || replyTo?.id === t.id) && (
              <ol className="ml-11 space-y-3 border-l border-ink-700 pl-4">
                {t.replies.map((r) => (
                  <li key={r.id}>
                    <CommentItem c={r} isReply onReply={startReply} onChanged={changed} onDeleted={deleted} onReport={(c) => setReport({ type: 'comment', id: c.id })} />
                  </li>
                ))}
                {replyTo?.id === t.id && user && (
                  <li>
                    {user.emailVerified && data.allowComments ? (
                      <Composer autoFocus placeholder={`Trả lời ${t.author?.displayName ?? 'bình luận'}…`} onSubmit={addReply} onCancel={() => setReplyTo(null)} submitLabel="Trả lời" />
                    ) : (
                      <p className="text-xs text-cream-500">{data.allowComments ? 'Xác minh email để trả lời bình luận.' : 'Tác giả đã tắt bình luận.'}</p>
                    )}
                  </li>
                )}
              </ol>
            )}
          </li>
        ))}
      </ol>
      {data && data.page < data.pages && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            try {
              await load(data.page + 1);
            } finally {
              setLoadingMore(false);
            }
          }}
          className="text-sm text-gold-300 hover:underline"
        >
          {loadingMore ? 'Đang tải…' : 'Xem thêm bình luận'}
        </button>
      )}
      <ReportDialog target={report} onClose={() => setReport(null)} />
    </section>
  );
}
