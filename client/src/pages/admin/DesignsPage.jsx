// QUẢN TRỊ – THIẾT KẾ: duyệt mọi thiết kế đang chia sẻ (Công khai / Có liên kết – thiết kế riêng tư không bao giờ có ở đây).
// Tìm theo tên / tác giả, lọc trạng thái + loại, sắp xếp. Ẩn / hiện lại (ghi lý do, báo cho chủ), bật / tắt "NGK chọn".
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, Eye, EyeOff, Heart, MessageCircle, Search } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { AdminUserLink, DesignStatusPills, ErrorBox, Loading, PageHeader, Pagination } from '../../components/admin/AdminUi.jsx';
import { ReasonDialog } from '../../components/admin/AdminDialogs.jsx';
import { HIDE_REASONS } from '../../components/admin/adminLabels.js';
import { TypeIcon } from '../../components/icons.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { toast } from '../../store/toastStore.js';
import { useAdminStore } from '../../store/adminStore.js';
import { get, post } from '../../services/api.js';
import { timeAgo } from '../../utils/time.js';

const STATUSES = [
  { code: '', label: 'Tất cả' },
  { code: 'visible', label: 'Đang hiện' },
  { code: 'hidden', label: 'Đã ẩn' },
  { code: 'featured', label: 'NGK chọn' },
  { code: 'reported', label: 'Bị báo cáo' },
  { code: 'locked', label: 'Chủ bị khoá' },
];
const SORTS = [
  { code: 'new', label: 'Mới đăng' },
  { code: 'likes', label: 'Nhiều thích nhất' },
  { code: 'reports', label: 'Nhiều báo cáo nhất' },
];

export default function DesignsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = STATUSES.some((s) => s.code === params.get('status')) ? params.get('status') : '';
  const type = JEWELRY_TYPES.some((t) => t.code === params.get('type')) ? params.get('type') : '';
  const sort = SORTS.some((s) => s.code === params.get('sort')) ? params.get('sort') : 'new';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [act, setAct] = useState(null); // { kind: 'hide' | 'restore', d }
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
    const p = new URLSearchParams({ sort, page: String(page) });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    if (type) p.set('type', type);
    try {
      const r = await get(`/api/admin/designs?${p}`);
      if (id !== reqId.current) return;
      setData(r);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    }
  }, [q, status, type, sort, page]);
  useEffect(() => {
    load();
  }, [load]);

  const quick = async (url, message) => {
    try {
      await post(url);
      toast(message, { tone: 'success' });
      load();
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    }
  };
  const done = (message) => {
    setAct(null);
    toast(message, { tone: 'success' });
    load();
    refreshSummary();
  };

  const select = 'h-10 rounded-full border border-ink-600 bg-ink-850 px-4 text-sm text-cream-100';
  return (
    <div>
      <PageHeader title="Thiết kế" subtitle={data ? `${data.total} thiết kế đang chia sẻ${q || status || type ? ' khớp bộ lọc' : ''}` : '…'} />
      <p className="mt-2 text-xs text-cream-500">Chỉ gồm thiết kế Công khai / Có liên kết – thiết kế riêng tư không hiện ở đây.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
          <Search size={16} className="text-cream-500" />
          <input
            aria-label="Tìm thiết kế"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm theo tên thiết kế hoặc tác giả (không dấu cũng được)"
            className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none"
          />
        </label>
        <select aria-label="Loại trang sức" value={type} onChange={(e) => setParam({ type: e.target.value })} className={select}>
          <option value="">Mọi loại</option>
          {JEWELRY_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setParam({ sort: e.target.value === 'new' ? '' : e.target.value })} className={select}>
          {SORTS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Lọc trạng thái">
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
        {data && !data.items.length && <p className="py-16 text-center text-sm text-cream-500">Không có thiết kế nào khớp.</p>}
        {data && data.items.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" data-testid="admin-designs">
            {data.items.map((d) => (
              <article key={d.id} className="flex flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-850" data-testid="admin-design">
                <a href={`/thiet-ke/${d.id}`} target="_blank" rel="noreferrer" className="relative block aspect-square bg-ink-900" title="Mở trang thiết kế (tab mới)">
                  {d.thumbnailUrl ? (
                    <img src={d.thumbnailUrl} alt={d.name} loading="lazy" className={`h-full w-full object-cover ${d.hidden || d.ownerLocked ? 'opacity-50' : ''}`} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-cream-600">
                      <TypeIcon type={d.type} size={44} />
                    </div>
                  )}
                  <span className="absolute inset-x-2 top-2">
                    <DesignStatusPills d={d} />
                  </span>
                </a>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="truncate text-sm font-medium text-cream-50" title={d.name}>
                    {d.name}
                  </p>
                  <AdminUserLink user={d.owner} size={20} className="text-xs" />
                  <p className="flex items-center gap-3 text-[11px] text-cream-500">
                    <span className="flex items-center gap-1">
                      <Heart size={11} /> {d.likeCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={11} /> {d.commentCount}
                    </span>
                    {d.publishedAt && <span>{timeAgo(d.publishedAt)}</span>}
                  </p>
                  {d.hidden && <p className="text-[11px] text-danger">Lý do ẩn: {d.hidden.reason}</p>}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {d.hidden ? (
                      <Button size="sm" variant="secondary" onClick={() => setAct({ kind: 'restore', d })}>
                        <Eye size={13} /> Hiện lại
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setAct({ kind: 'hide', d })}>
                        <EyeOff size={13} /> Ẩn
                      </Button>
                    )}
                    {d.featured ? (
                      <Button size="sm" variant="ghost" onClick={() => quick(`/api/admin/designs/${d.id}/unfeature`, `Đã bỏ “${d.name}” khỏi NGK chọn`)}>
                        <Award size={13} /> Bỏ chọn
                      </Button>
                    ) : (
                      d.visibility === 'public' &&
                      !d.hidden &&
                      !d.ownerLocked && (
                        <Button size="sm" variant="secondary" onClick={() => quick(`/api/admin/designs/${d.id}/feature`, `Đã thêm “${d.name}” vào NGK chọn`)}>
                          <Award size={13} /> NGK chọn
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => setParam({ page: String(p) })} />}
      </div>

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
          await post(`/api/admin/designs/${act.d.id}/hide`, { reason });
          done(`Đã ẩn “${act.d.name}”`);
        }}
      >
        <p>
          Ẩn <b className="text-cream-50">“{act?.d.name}”</b>: biến mất khỏi Khám phá, hồ sơ, trang chủ và link chia sẻ; bỏ khỏi NGK chọn. Chủ thiết kế vẫn giữ, chỉnh sửa được nhưng không tự công khai lại được; họ nhận thông báo kèm lý do.
        </p>
      </ReasonDialog>
      <ReasonDialog
        open={act?.kind === 'restore'}
        onClose={() => setAct(null)}
        title="Hiện lại thiết kế"
        id="restore-note"
        label="Ghi chú (gửi kèm thông báo cho chủ)"
        min={0}
        confirmLabel="Hiện lại"
        ConfirmIcon={Eye}
        variant="primary"
        width="max-w-md"
        onConfirm={async (note) => {
          await post(`/api/admin/designs/${act.d.id}/restore`, { note });
          done(`Đã hiện lại “${act.d.name}”`);
        }}
      >
        <p>
          <b className="text-cream-50">“{act?.d.name}”</b> trở lại cộng đồng theo chế độ chia sẻ chủ đang chọn; chủ thiết kế nhận thông báo.
        </p>
      </ReasonDialog>
    </div>
  );
}
