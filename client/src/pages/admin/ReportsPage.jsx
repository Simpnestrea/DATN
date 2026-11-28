// QUẢN TRỊ – BÁO CÁO: hàng chờ gộp theo nội dung (1 thiết kế bị 5 người báo = 1 mục, nhiều báo cáo nhất trước)
// + lịch sử đã xử lý. Mỗi mục: ẩn thiết kế / gỡ bình luận (ghi lý do, báo cho chủ), khoá người đăng, bỏ qua.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck, EyeOff, FlagOff, Lock, MessageCircleOff } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { AdminUserLink, DesignStatusPills, ErrorBox, Loading, PageHeader, Pagination, Pill } from '../../components/admin/AdminUi.jsx';
import { LockUserDialog, ReasonDialog } from '../../components/admin/AdminDialogs.jsx';
import { HIDE_REASONS, REMOVE_REASONS, REPORT_REASONS, RESOLUTIONS } from '../../components/admin/adminLabels.js';
import { TypeIcon } from '../../components/icons.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useAdminStore } from '../../store/adminStore.js';
import { toast } from '../../store/toastStore.js';
import { get, post } from '../../services/api.js';
import { formatDateTime, timeAgo } from '../../utils/time.js';

const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? code;

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'handled' ? 'handled' : 'open';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [loaded, setLoaded] = useState(null); // { tab, ...kết quả }
  // dữ liệu của tab khác (vừa bấm đổi tab, chưa tải xong) → coi như chưa có, không vẽ nhầm sang giao diện tab này
  const data = loaded?.tab === tab ? loaded : null;
  const [error, setError] = useState(null);
  const [act, setAct] = useState(null); // { kind: 'hide' | 'remove' | 'dismiss' | 'lock', g }
  const refreshSummary = useAdminStore((s) => s.refresh);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const r = await get(`/api/admin/reports?status=${tab}&page=${page}`);
      if (id === reqId.current) {
        setLoaded({ ...r, tab });
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    }
  }, [tab, page]);
  useEffect(() => {
    setLoaded(null);
    load();
  }, [load]);

  const go = (patch) => {
    // đọc URL HIỆN TẠI (không dùng bản `params` cũ mà hẹn giờ ô tìm kiếm còn giữ → không ghép nhầm bộ lọc vừa đổi)
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const done = (message) => {
    setAct(null);
    toast(message, { tone: 'success' });
    load();
    refreshSummary();
  };
  const closeGone = async (g) => {
    try {
      await post('/api/admin/reports/close', { targetType: g.targetType, targetId: g.targetId, resolution: 'gone' });
      done('Đã đóng báo cáo');
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    }
  };

  const tabBtn = (code, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === code}
      onClick={() => go({ tab: code === 'open' ? '' : code, page: '' })}
      className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${tab === code ? 'border-gold-400 text-gold-200' : 'border-transparent text-cream-500 hover:text-cream-100'}`}
    >
      {label}
    </button>
  );

  const g = act?.g;
  return (
    <div>
      <PageHeader
        title="Báo cáo"
        subtitle={data ? (tab === 'open' ? `${data.total} nội dung đang chờ xử lý` : `${data.total} báo cáo đã xử lý`) : '…'}
      />
      <div role="tablist" className="mt-6 flex gap-6 border-b border-ink-700">
        {tabBtn('open', 'Đang chờ')}
        {tabBtn('handled', 'Đã xử lý')}
      </div>

      <div className="mt-6">
        {error && <ErrorBox>{error}</ErrorBox>}
        {!data && !error && <Loading />}
        {data && !data.items.length && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-cream-500">
            <CircleCheck size={28} className="text-success" />
            {tab === 'open' ? 'Không có báo cáo nào đang chờ – cộng đồng đang yên bình.' : 'Chưa xử lý báo cáo nào.'}
          </div>
        )}
        {data && data.items.length > 0 && tab === 'open' && (
          <div className="space-y-4" data-testid="report-queue">
            {data.items.map((it) => (
              <ReportGroup key={it.key} g={it} onAct={(kind) => setAct({ kind, g: it })} onCloseGone={() => closeGone(it)} />
            ))}
          </div>
        )}
        {data && data.items.length > 0 && tab === 'handled' && (
          <ol className="space-y-2" data-testid="report-history">
            {data.items.map((r) => (
              <HandledItem key={r.id} r={r} />
            ))}
          </ol>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => go({ page: String(p) })} />}
      </div>

      {/* hộp thoại xử lý */}
      <ReasonDialog
        open={act?.kind === 'hide'}
        onClose={() => setAct(null)}
        title="Ẩn thiết kế khỏi cộng đồng"
        id="hide-reason"
        label="Lý do ẩn (chủ thiết kế sẽ thấy)"
        presets={HIDE_REASONS}
        confirmLabel="Ẩn thiết kế"
        ConfirmIcon={EyeOff}
        onConfirm={async (reason) => {
          await post(`/api/admin/designs/${g.targetId}/hide`, { reason });
          done('Đã ẩn thiết kế và đóng các báo cáo');
        }}
      >
        <p>Thiết kế biến mất khỏi Khám phá, hồ sơ, trang chủ và link chia sẻ. Chủ thiết kế vẫn giữ, chỉnh sửa được nhưng không tự công khai lại được; họ nhận thông báo kèm lý do. Bạn hiện lại được bất cứ lúc nào ở trang Thiết kế.</p>
      </ReasonDialog>
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
          await post(`/api/admin/comments/${g.targetId}/remove`, { reason });
          done('Đã gỡ bình luận và đóng các báo cáo');
        }}
      >
        <p>Mọi người sẽ thấy “Bình luận đã bị quản trị viên gỡ”; các câu trả lời vẫn giữ nguyên. Người viết nhận thông báo kèm lý do. Khôi phục được ở trang Bình luận.</p>
      </ReasonDialog>
      <ReasonDialog
        open={act?.kind === 'dismiss'}
        onClose={() => setAct(null)}
        title="Bỏ qua báo cáo"
        id="dismiss-note"
        label="Ghi chú cho nhật ký"
        min={0}
        placeholder="Ví dụ: đã kiểm tra, không vi phạm"
        confirmLabel="Bỏ qua"
        ConfirmIcon={FlagOff}
        variant="primary"
        width="max-w-md"
        onConfirm={async (note) => {
          await post('/api/admin/reports/close', { targetType: g.targetType, targetId: g.targetId, resolution: 'dismiss', note });
          done(`Đã bỏ qua ${g.count} báo cáo`);
        }}
      >
        <p>Nội dung được giữ nguyên. {g?.count} báo cáo về nội dung này sẽ chuyển sang “Đã xử lý”.</p>
      </ReasonDialog>
      <LockUserDialog
        open={act?.kind === 'lock'}
        user={g ? (g.targetType === 'design' ? g.target?.owner : g.target?.author) : null}
        report={g ? { targetType: g.targetType, targetId: g.targetId } : null}
        onClose={() => setAct(null)}
        onDone={(message) => done(message)}
      />
    </div>
  );
}

function ReportGroup({ g, onAct, onCloseGone }) {
  const t = g.target;
  const who = t ? (g.targetType === 'design' ? t.owner : t.author) : null;
  const canLock = who?.id && !who.locked && who.role !== 'admin';
  return (
    <article className="rounded-2xl border border-ink-700 bg-ink-850 p-4" data-testid="report-group">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone="muted">{g.targetType === 'design' ? 'Thiết kế' : 'Bình luận'}</Pill>
        <Pill tone="danger">{g.count} báo cáo</Pill>
        {g.reasons.map((r) => (
          <span key={r.reason} className="text-cream-400">
            {REPORT_REASONS[r.reason] ?? r.reason}
            {r.count > 1 && <b className="text-cream-200"> ×{r.count}</b>}
          </span>
        ))}
        <span className="ml-auto text-cream-600" title={formatDateTime(g.lastAt)}>
          mới nhất {timeAgo(g.lastAt)}
        </span>
      </header>

      <div className="mt-3">
        {!t && <p className="rounded-xl border border-dashed border-ink-600 px-3 py-4 text-center text-sm text-cream-500">Nội dung không còn (đã bị xoá).</p>}
        {t && g.targetType === 'design' && <DesignPreview d={t} />}
        {t && g.targetType === 'comment' && (
          <div className="space-y-2 rounded-xl border border-ink-700 bg-ink-900 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream-500">
              <AdminUserLink user={t.author} size={20} className="text-sm" />
              <span>{timeAgo(t.createdAt)}</span>
              {t.design && (
                <>
                  ở
                  {t.design.masked ? (
                    <span>một thiết kế đang riêng tư</span>
                  ) : (
                    <a href={`/thiet-ke/${t.design.id}#binh-luan`} target="_blank" rel="noreferrer" className="text-cream-300 hover:text-gold-200">
                      “{t.design.name}”
                    </a>
                  )}
                </>
              )}
              {t.removed && (
                <Pill tone="danger" Icon={MessageCircleOff} title={t.removed.reason}>
                  Đã gỡ
                </Pill>
              )}
            </div>
            <p className="whitespace-pre-line break-words text-sm text-cream-100">{t.body}</p>
          </div>
        )}
      </div>

      {g.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {g.notes.map((n, i) => (
            <li key={i} className="text-cream-400">
              <span className="text-cream-200">“{n.note}”</span> — {n.reporter} · {REPORT_REASONS[n.reason] ?? n.reason} · {timeAgo(n.at)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!t ? (
          <Button size="sm" variant="secondary" onClick={onCloseGone}>
            Đóng báo cáo
          </Button>
        ) : (
          <>
            {g.targetType === 'design' ? (
              <Button size="sm" variant="danger" disabled={!!t.hidden} onClick={() => onAct('hide')}>
                <EyeOff size={14} /> {t.hidden ? 'Đã ẩn' : 'Ẩn thiết kế'}
              </Button>
            ) : (
              <Button size="sm" variant="danger" disabled={!!t.removed} onClick={() => onAct('remove')}>
                <MessageCircleOff size={14} /> {t.removed ? 'Đã gỡ' : 'Gỡ bình luận'}
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={!canLock} onClick={() => onAct('lock')} title={who?.locked ? 'Đã bị khoá' : who?.role === 'admin' ? 'Quản trị viên' : undefined}>
              <Lock size={14} /> Khoá người đăng
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAct('dismiss')}>
              <FlagOff size={14} /> Bỏ qua
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

/** Xem nhanh thiết kế bị báo cáo (riêng tư → chỉ loại, không tên / ảnh). */
function DesignPreview({ d }) {
  return (
    <div className="flex gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-800">
        {d.thumbnailUrl ? (
          <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-cream-600">
            <TypeIcon type={d.type} size={30} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {d.masked ? (
          <p className="text-sm text-cream-300">Riêng tư · {typeName(d.type)} – chủ đã chuyển về riêng tư sau khi bị báo cáo</p>
        ) : (
          <a href={`/thiet-ke/${d.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-cream-50 hover:text-gold-200">
            {d.name}
          </a>
        )}
        <AdminUserLink user={d.owner} size={20} className="text-xs" />
        <DesignStatusPills d={d} />
      </div>
    </div>
  );
}

function HandledItem({ r }) {
  const t = r.target;
  const what =
    r.targetType === 'design'
      ? t
        ? t.masked
          ? `thiết kế riêng tư (${typeName(t.type)})`
          : `“${t.name}”`
        : 'thiết kế đã xoá'
      : t
        ? `bình luận “${[...t.body].slice(0, 60).join('')}${t.body.length > 60 ? '…' : ''}”`
        : 'bình luận đã xoá';
  return (
    <li className="grid gap-x-4 gap-y-1 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm md:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-xs tabular-nums text-cream-500">{r.handledAt ? formatDateTime(r.handledAt) : '—'}</span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Pill tone={r.resolution === 'dismiss' ? 'muted' : r.resolution === 'gone' ? 'muted' : 'danger'}>{RESOLUTIONS[r.resolution] ?? r.status}</Pill>
          <span className="min-w-0 truncate text-cream-200">{what}</span>
        </div>
        <p className="text-xs text-cream-500">
          {r.reporter?.displayName} báo cáo “{REPORT_REASONS[r.reason] ?? r.reason}”{r.note ? `: ${r.note}` : ''} · {timeAgo(r.createdAt)}
          {r.handledBy && <> · xử lý bởi {r.handledBy}</>}
        </p>
        {t && r.targetType === 'design' && !t.masked && (
          <Link to={`/quan-tri/thiet-ke?q=${encodeURIComponent(t.name)}`} className="text-xs text-gold-300 hover:text-gold-200">
            Xem trong trang Thiết kế
          </Link>
        )}
      </div>
    </li>
  );
}
