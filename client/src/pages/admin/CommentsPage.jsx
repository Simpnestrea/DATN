// QUẢN TRỊ – BÌNH LUẬN: duyệt bình luận ở các thiết kế đang chia sẻ (mới nhất trước). Tìm không dấu theo nội dung /
// người viết, lọc đã gỡ / bị báo cáo. Gỡ (ghi lý do, người viết được báo) / khôi phục.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flag, MessageCircleOff, Reply, RotateCcw, Search } from 'lucide-react';
import { AdminUserLink, ErrorBox, Loading, PageHeader, Pagination, Pill } from '../../components/admin/AdminUi.jsx';
import { ReasonDialog } from '../../components/admin/AdminDialogs.jsx';
import { REMOVE_REASONS } from '../../components/admin/adminLabels.js';
import { Button } from '../../components/ui/Button.jsx';
import { toast } from '../../store/toastStore.js';
import { useAdminStore } from '../../store/adminStore.js';
import { get, post } from '../../services/api.js';
import { formatDateTime, timeAgo } from '../../utils/time.js';

const STATUSES = [
  { code: '', label: 'Tất cả' },
  { code: 'visible', label: 'Đang hiện' },
  { code: 'removed', label: 'Đã gỡ' },
  { code: 'reported', label: 'Bị báo cáo' },
];

export default function CommentsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = STATUSES.some((s) => s.code === params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [act, setAct] = useState(null); // { kind: 'remove' | 'restore', c }
  const reqId = useRef(0);
  const refreshSummary = useAdminStore((s) => s.refresh); // ẩn / gỡ tự đóng báo cáo → cập nhật số trên thanh bên

  const setParam = (patch) => {
    // đọc URL HIỆN TẠI (không dùng bản `params` cũ mà hẹn giờ ô tìm kiếm còn giữ → không ghép nhầm bộ lọc vừa đổi)
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const t = setTimeout(() => setParam({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const p = new URLSearchParams({ page: String(page) });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    try {
      const r = await get(`/api/admin/comments?${p}`);
      if (id !== reqId.current) return;
      setData(r);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    }
  }, [q, status, page]);
  useEffect(() => {
    load();
  }, [load]);

  const done = (message) => {
    setAct(null);
    toast(message, { tone: 'success' });
    load();
    refreshSummary();
  };

  return (
    <div>
      <PageHeader title="Bình luận" subtitle={data ? `${data.total} bình luận${q || status ? ' khớp bộ lọc' : ''}` : '…'} />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
          <Search size={16} className="text-cream-500" />
          <input
            aria-label="Tìm bình luận"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm theo nội dung hoặc người viết (không dấu cũng được)"
            className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Lọc bình luận">
        {STATUSES.map((s) => (
          <button
            key={s.code || 'all'}
            type="button"
            aria-pressed={s.code === status}
            onClick={() => setParam({ status: s.code })}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${s.code === status ? 'border-gold-500/60 bg-gold-400/10 text-gold-200' : 'border-ink-600 text-cream-300 hover:border-ink-500 hover:text-cream-50'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error && <ErrorBox>{error}</ErrorBox>}
        {!data && !error && <Loading />}
        {data && !data.items.length && <p className="py-16 text-center text-sm text-cream-500">Không có bình luận nào khớp.</p>}
        {data && data.items.length > 0 && (
          <ol className="space-y-2" data-testid="admin-comments">
            {data.items.map((c) => (
              <li key={c.id} className={`rounded-xl border px-4 py-3 ${c.removed ? 'border-danger/30 bg-danger/[0.04]' : 'border-ink-700 bg-ink-850'}`} data-testid="admin-comment">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream-500">
                  <AdminUserLink user={c.author} size={22} className="text-sm" />
                  <span title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                  {c.isReply && (
                    <span className="flex items-center gap-1">
                      <Reply size={11} /> trả lời
                    </span>
                  )}
                  ở
                  <a href={`/thiet-ke/${c.design.id}#binh-luan`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 text-cream-300 hover:text-gold-200">
                    {c.design.thumbnailUrl && <img src={c.design.thumbnailUrl} alt="" className="h-5 w-5 rounded object-cover" />}
                    <span className="truncate">“{c.design.name}”</span>
                  </a>
                  {c.removed && (
                    <Pill tone="danger" Icon={MessageCircleOff}>
                      Đã gỡ
                    </Pill>
                  )}
                  {c.openReports > 0 && (
                    <Pill tone="danger" Icon={Flag}>
                      {c.openReports} báo cáo
                    </Pill>
                  )}
                </div>
                <p className={`mt-2 whitespace-pre-line break-words text-sm ${c.removed ? 'text-cream-400' : 'text-cream-100'}`}>{c.body}</p>
                {c.removed && <p className="mt-1 text-[11px] text-danger">Lý do gỡ: {c.removed.reason}</p>}
                <div className="mt-2 flex gap-2">
                  {c.removed ? (
                    <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'restore', c })}>
                      <RotateCcw size={13} /> Khôi phục
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setAct({ kind: 'remove', c })}>
                      <MessageCircleOff size={13} /> Gỡ
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => setParam({ page: String(p) })} />}
      </div>

      <ReasonDialog
        open={act?.kind === 'remove'}
        onClose={() => setAct(null)}
        title="Gỡ bình luận"
        id="remove-reason"
        label="Lý do gỡ (người viết sẽ thấy)"
        presets={REMOVE_REASONS}
        confirmLabel="Gỡ bình luận"
        ConfirmIcon={MessageCircleOff}
        onConfirm={async (reason) => {
          await post(`/api/admin/comments/${act.c.id}/remove`, { reason });
          done('Đã gỡ bình luận');
        }}
      >
        <blockquote className="whitespace-pre-line break-words rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-cream-200">{act?.c.body}</blockquote>
        <p>Mọi người sẽ thấy “Bình luận đã bị quản trị viên gỡ”; các câu trả lời vẫn giữ nguyên. Người viết nhận thông báo kèm lý do.</p>
      </ReasonDialog>
      <ReasonDialog
        open={act?.kind === 'restore'}
        onClose={() => setAct(null)}
        title="Khôi phục bình luận"
        id="restore-note"
        label="Ghi chú cho nhật ký"
        min={0}
        confirmLabel="Khôi phục"
        ConfirmIcon={RotateCcw}
        variant="primary"
        width="max-w-md"
        onConfirm={async (note) => {
          await post(`/api/admin/comments/${act.c.id}/restore`, { note });
          done('Đã khôi phục bình luận');
        }}
      >
        <p>Bình luận hiện lại như cũ; người viết nhận thông báo.</p>
      </ReasonDialog>
    </div>
  );
}
