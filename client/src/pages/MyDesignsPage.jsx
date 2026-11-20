// TRANG "THIẾT KẾ CỦA TÔI": lưới ảnh, tìm không dấu, lọc loại, sắp xếp; đổi tên / nhân bản / xoá; lịch sử phiên bản.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, Copy, ExternalLink, EyeOff, Globe2, Heart, History, Link2, Loader2, MessageCircle, MoreHorizontal, Pencil, Plus, Repeat2, Search, Share2, Trash2 } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { TypeIcon } from '../components/icons.jsx';
import { useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';
import { del, get, patch, post } from '../services/api.js';
import { SharingDialog } from '../components/community/SharingDialog.jsx';

const SORTS = [
  { code: 'updated', name: 'Mới sửa' },
  { code: 'created', name: 'Mới tạo' },
  { code: 'name', name: 'Tên A–Z' },
];
const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? code;
const when = (t) =>
  new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function RequireLogin({ children, reason }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status !== 'ready') {
    return (
      <div className="flex justify-center py-24 text-cream-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl text-cream-50">Cần đăng nhập</h1>
        <p className="mt-3 text-sm text-cream-500">{reason}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => useAuthStore.getState().openAuth('login')}>
            Đăng nhập
          </Button>
          <Button variant="secondary" onClick={() => useAuthStore.getState().openAuth('register')}>
            Đăng ký
          </Button>
        </div>
      </div>
    );
  }
  return children;
}

export default function MyDesignsPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <RequireLogin reason="Đăng nhập để xem các thiết kế bạn đã lưu.">
        <Designs />
      </RequireLogin>
    </div>
  );
}

function Designs() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [history, setHistory] = useState(null);
  const [sharing, setSharing] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const params = new URLSearchParams({ sort, page: String(page), limit: '24' });
    if (q.trim()) params.set('q', q.trim());
    if (type) params.set('type', type);
    try {
      const res = await get(`/api/designs?${params}`);
      if (id === reqId.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    }
  }, [q, type, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // gõ tìm kiếm: đợi ngừng gõ
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => setPage(1), [q, type, sort]);

  const duplicate = async (d) => {
    try {
      await post(`/api/designs/${d.id}/duplicate`);
      toast(`Đã nhân bản “${d.name}”`, { tone: 'success' });
      load();
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-cream-50">Thiết kế của tôi</h1>
          <p className="mt-1 text-sm text-cream-500">{data ? `${data.total} thiết kế` : '…'}</p>
        </div>
        <Button as={Link} to="/studio" variant="primary">
          <Plus size={16} /> Thiết kế mới
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 focus-within:border-gold-500/60">
          <Search size={16} className="text-cream-500" />
          <input aria-label="Tìm theo tên" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên (gõ không dấu cũng được)" className="h-full w-full bg-transparent text-sm text-cream-50 placeholder:text-cream-600 focus:outline-none" />
        </label>
        <select aria-label="Loại trang sức" value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-full border border-ink-600 bg-ink-850 px-4 text-sm text-cream-100">
          <option value="">Mọi loại</option>
          {JEWELRY_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-full border border-ink-600 bg-ink-850 px-4 text-sm text-cream-100">
          {SORTS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-8 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      {!data && !error && (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      )}
      {data && !data.items.length && (
        <div className="mt-16 text-center text-cream-500">
          {q || type ? 'Không có thiết kế nào khớp.' : 'Bạn chưa lưu thiết kế nào. Mở Studio, thiết kế rồi bấm “Lưu thiết kế”.'}
        </div>
      )}
      {data && data.items.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4" data-testid="design-grid">
          {data.items.map((d) => (
            <DesignCard
              key={d.id}
              d={d}
              onRename={() => setRenaming(d)}
              onDuplicate={() => duplicate(d)}
              onDelete={() => setDeleting(d)}
              onHistory={() => setHistory(d)}
              onShare={() => setSharing(d)}
            />
          ))}
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trang trước
          </Button>
          <span className="self-center text-xs text-cream-500">
            {page} / {data.pages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Trang sau
          </Button>
        </div>
      )}

      <RenameDialog design={renaming} onClose={() => setRenaming(null)} onDone={load} />
      <DeleteDialog design={deleting} onClose={() => setDeleting(null)} onDone={load} />
      <HistoryDialog design={history} onClose={() => setHistory(null)} />
      <SharingDialog designId={sharing?.id ?? null} onClose={() => setSharing(null)} onSaved={load} />
    </main>
  );
}

const VIS_BADGE = {
  public: { Icon: Globe2, text: 'Công khai' },
  unlisted: { Icon: Link2, text: 'Có liên kết' },
};

function DesignCard({ d, onRename, onDuplicate, onDelete, onHistory, onShare }) {
  const navigate = useNavigate();
  const badge = VIS_BADGE[d.visibility];
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-cream-200 hover:bg-ink-700';
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 transition-colors hover:border-gold-500/50" data-testid="design-card">
      <Link to={`/studio?id=${d.id}`} className="block">
        <div className="relative aspect-square bg-ink-900">
          {d.thumbnailUrl ? (
            <img src={d.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-cream-600">
              <TypeIcon type={d.type} size={48} />
            </div>
          )}
          <span className="absolute left-2 top-2 flex flex-wrap gap-1">
            {badge && (
              <span className="flex items-center gap-1 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10px] text-gold-200 backdrop-blur" data-testid="visibility-badge">
                <badge.Icon size={11} /> {badge.text}
              </span>
            )}
            {d.hidden && (
              <span className="flex items-center gap-1 rounded-full bg-danger/90 px-2 py-0.5 text-[10px] font-medium text-white" title={`Bị quản trị viên ẩn: ${d.hidden.reason}`} data-testid="hidden-badge">
                <EyeOff size={11} /> Bị ẩn
              </span>
            )}
            {d.featured && (
              <span className="flex items-center gap-1 rounded-full bg-gold-400/90 px-2 py-0.5 text-[10px] font-semibold text-ink-950">
                <Award size={11} /> NGK chọn
              </span>
            )}
          </span>
        </div>
        <div className="space-y-1 p-4">
          <h2 className="truncate font-medium text-cream-50">{d.name}</h2>
          <p className="text-xs text-cream-500">
            {typeName(d.type)} · sửa {when(d.updatedAt)}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream-600">
            <span>{d.versionCount} phiên bản</span>
            {d.visibility !== 'private' && (
              <>
                <span className="flex items-center gap-1">
                  <Heart size={11} /> {d.likeCount}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle size={11} /> {d.commentCount}
                </span>
              </>
            )}
          </p>
          {d.remixOf && (
            <p className="flex items-center gap-1 truncate text-[11px] text-cream-500" title={`Remix từ “${d.remixOf.name}” của ${d.remixOf.ownerName}`}>
              <Repeat2 size={11} className="shrink-0 text-gold-300" /> Remix từ “{d.remixOf.name}” của {d.remixOf.ownerName}
            </p>
          )}
        </div>
      </Link>
      <div ref={ref} className="absolute right-2 top-2">
        <button
          type="button"
          aria-label={`Thao tác với ${d.name}`}
          onClick={() => setMenu(!menu)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900/80 text-cream-200 opacity-100 backdrop-blur hover:bg-ink-700 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-ink-600 bg-ink-850 p-1 shadow-2xl">
            {[
              [Share2, 'Chia sẻ…', onShare],
              ...(d.visibility !== 'private' ? [[ExternalLink, 'Xem trang công khai', () => navigate(`/thiet-ke/${d.id}`)]] : []),
              [Pencil, 'Đổi tên', onRename],
              [Copy, 'Nhân bản', onDuplicate],
              [History, 'Lịch sử phiên bản', onHistory],
              [Trash2, 'Xoá', onDelete],
            ].map(([Icon, label, fn]) => (
              <button
                key={label}
                role="menuitem"
                type="button"
                className={`${item} ${label === 'Xoá' ? 'text-danger hover:text-danger' : ''}`}
                onClick={() => {
                  setMenu(false);
                  fn();
                }}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function RenameDialog({ design, onClose, onDone }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(design?.name ?? ''), [design]);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await patch(`/api/designs/${design.id}`, { name });
      onClose();
      onDone();
    } catch (err) {
      toast(err.message, { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!design}
      onClose={onClose}
      title="Đổi tên thiết kế"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>
            Lưu tên
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <input aria-label="Tên mới" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus className="h-10 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-cream-50 focus:border-gold-500/60 focus:outline-none" />
      </form>
    </Modal>
  );
}

function DeleteDialog({ design, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await del(`/api/designs/${design.id}`);
      toast(`Đã xoá “${design.name}”`);
      onClose();
      onDone();
    } catch (err) {
      toast(err.message, { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!design}
      onClose={onClose}
      title="Xoá thiết kế?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            Xoá vĩnh viễn
          </Button>
        </>
      }
    >
      <p className="text-sm text-cream-300">
        “<b className="text-cream-50">{design?.name}</b>” cùng toàn bộ {design?.versionCount} phiên bản{design?.visibility !== 'private' ? ', lượt thích và bình luận' : ''} sẽ bị xoá vĩnh viễn và không khôi phục được.
      </p>
    </Modal>
  );
}

function HistoryDialog({ design, onClose }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!design) return;
    setItems(null);
    get(`/api/designs/${design.id}/versions`)
      .then((r) => setItems(r.items))
      .catch((e) => {
        toast(e.message, { tone: 'warning' });
        onClose();
      });
  }, [design]); // eslint-disable-line react-hooks/exhaustive-deps -- onClose đổi mỗi lần vẽ lại, không được gây tải lại
  return (
    <Modal open={!!design} onClose={onClose} title={`Lịch sử phiên bản – ${design?.name ?? ''}`} width="max-w-2xl">
      {!items ? (
        <div className="flex justify-center py-10 text-cream-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" data-testid="version-list">
          {items.map((v, i) => (
            <li key={v.n} className="flex items-center gap-3 rounded-xl border border-ink-700 p-2">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-900">{v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-cream-50">
                  Phiên bản {v.n} {i === 0 && <span className="ml-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] text-gold-200">mới nhất</span>}
                </p>
                <p className="truncate text-xs text-cream-500">{v.note || 'Không có ghi chú'}</p>
                <p className="text-[11px] text-cream-600">{when(v.createdAt)}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/studio?id=${design.id}&v=${v.n}`)}>
                {i === 0 ? 'Mở' : 'Mở & khôi phục'}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs text-cream-600">Giữ tối đa 20 phiên bản gần nhất. Mở một bản cũ trong Studio rồi bấm Lưu → bản đó trở thành phiên bản mới nhất (các bản khác vẫn còn).</p>
    </Modal>
  );
}
