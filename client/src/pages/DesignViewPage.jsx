// TRANG XEM THIẾT KẾ (/thiet-ke/:id): khung 3D xoay được (không chỉnh sửa), tác giả, mô tả, Thích / Remix / Chia sẻ /
// Tải PDF, bảng thông số, bình luận, các bản remix công khai. Khách cũng xem được (thiết kế Có liên kết / Công khai).
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, ChevronDown, Copy, Eye, EyeOff, FileText, Flag, Globe2, Link2, Loader2, Lock, Pencil, Repeat2, Share2, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ViewerControls } from '../components/studio/ViewerControls.jsx';
import { AuthorLink, DesignCard, typeName } from '../components/community/DesignCard.jsx';
import { LikeButton, ReportDialog } from '../components/community/Interactions.jsx';
import { CommentsSection } from '../components/community/CommentsSection.jsx';
import { SharingDialog, copyLink } from '../components/community/SharingDialog.jsx';
import { SpecsTable } from '../components/community/SpecsTable.jsx';
import { requireLogin, useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';
import { get, post } from '../services/api.js';
import { formatDateTime, timeAgo } from '../utils/time.js';
import { ReasonDialog } from '../components/admin/AdminDialogs.jsx';
import { HIDE_REASONS } from '../components/admin/adminLabels.js';

const JewelryCanvas = lazy(() => import('../three/JewelryCanvas.jsx'));

const VIS = {
  unlisted: { Icon: Link2, text: 'Có liên kết – chỉ người có link mới xem được' },
  private: { Icon: Lock, text: 'Riêng tư – chỉ bạn thấy trang này' },
  public: { Icon: Globe2, text: 'Công khai' },
};

export default function DesignViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const [state, setState] = useState({ design: null, error: null });
  const [remixes, setRemixes] = useState([]);
  const [commentCount, setCommentCount] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [report, setReport] = useState(null);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [remixing, setRemixing] = useState(false);
  const [modAct, setModAct] = useState(null); // quản trị viên: 'hide' | 'restore'
  const pendingLike = useRef(false); // khách bấm Thích → đăng nhập → thích sau khi tải lại dữ liệu

  const load = useCallback(async () => {
    try {
      let { design } = await get(`/api/public/designs/${id}`);
      if (pendingLike.current && useAuthStore.getState().user) {
        pendingLike.current = false;
        if (!design.liked) {
          try {
            const r = await post(`/api/designs/${id}/like`);
            design = { ...design, liked: r.liked, likeCount: r.likeCount };
          } catch (e) {
            toast(e.message, { tone: 'warning' });
          }
        }
      }
      setState({ design, error: null });
      setCommentCount(design.commentCount);
      document.title = `${design.name} – ${design.owner.displayName} | NGK`;
      get(`/api/public/designs/${id}/remixes`)
        .then((r) => setRemixes(r.items))
        .catch(() => setRemixes([]));
    } catch (e) {
      setState({ design: null, error: e.status === 404 ? 'notfound' : e.message });
    }
  }, [id]);
  // tải lại khi đăng nhập / đăng xuất (đã thích chưa, có phải chủ không, thiết kế riêng tư của mình…)
  useEffect(() => {
    if (authStatus === 'ready') load();
  }, [load, authStatus, user?.id]);
  useEffect(() => () => void (document.title = 'NGK – Thiết kế trang sức 3D'), []);

  const d = state.design;
  const remix = () =>
    requireLogin(async () => {
      setRemixing(true);
      try {
        const r = await post(`/api/designs/${id}/remix`);
        toast(`Đã tạo “${r.design.name}” trong Thiết kế của bạn – sửa tiếp thoải mái!`, { tone: 'success' });
        navigate(`/studio?id=${r.design.id}`);
      } catch (e) {
        toast(e.message, { tone: 'warning' });
      } finally {
        setRemixing(false);
      }
    }, 'Đăng nhập để remix – bản remix được lưu vào Thiết kế của bạn.');

  const adminQuick = async (action, message) => {
    try {
      await post(`/api/admin/designs/${id}/${action}`);
      toast(message, { tone: 'success' });
      load();
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    }
  };

  if (state.error) {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="font-display text-3xl text-cream-50">{state.error === 'notfound' ? 'Không tìm thấy thiết kế' : 'Không tải được thiết kế'}</h1>
          <p className="mt-3 text-sm text-cream-500">
            {state.error === 'notfound' ? 'Thiết kế có thể đã bị xoá, hoặc tác giả đã chuyển về chế độ riêng tư.' : state.error}
          </p>
          <Button as={Link} to="/kham-pha" variant="primary" className="mt-8">
            Xem các thiết kế khác
          </Button>
        </main>
      </div>
    );
  }

  const vis = d && VIS[d.visibility];
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* KHUNG 3D */}
          <div className="relative h-[58vh] min-h-[380px] overflow-hidden rounded-3xl border border-ink-700 lg:h-[72vh]" data-testid="view-canvas">
            {d ? (
              <>
                <Suspense fallback={<div className="skeleton absolute inset-0" />}>
                  <JewelryCanvas config={d.config} mode="view" />
                </Suspense>
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                  <ViewerControls config={d.config} showMatte={false} />
                </div>
                <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 text-[11px] text-cream-600">Kéo để xoay · cuộn để phóng to</p>
              </>
            ) : (
              <div className="skeleton absolute inset-0" />
            )}
          </div>

          {/* THÔNG TIN */}
          <aside className="space-y-5">
            {!d ? (
              <div className="space-y-3">
                <div className="skeleton h-8 w-3/4 rounded-lg" />
                <div className="skeleton h-5 w-1/2 rounded-lg" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-ink-600 px-2.5 py-0.5 text-cream-400">{typeName(d.type)}</span>
                  {d.featured && (
                    <span className="flex items-center gap-1 rounded-full bg-gold-400/90 px-2.5 py-0.5 font-semibold text-ink-950" data-testid="featured-badge">
                      <Award size={11} /> NGK chọn
                    </span>
                  )}
                  {vis && d.visibility !== 'public' && (
                    <span className="flex items-center gap-1 rounded-full border border-gold-500/40 px-2.5 py-0.5 text-gold-200">
                      <vis.Icon size={11} /> {vis.text}
                    </span>
                  )}
                </div>
                {d.moderation?.hidden && (
                  <div role="status" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm" data-testid="moderation-banner">
                    <p className="flex items-center gap-2 font-semibold text-danger">
                      <EyeOff size={15} /> Đang bị quản trị viên ẩn khỏi cộng đồng
                    </p>
                    {d.moderation.reason && <p className="mt-1 text-cream-100">Lý do: {d.moderation.reason}</p>}
                    <p className="mt-1 text-xs text-cream-400">
                      {d.isOwner
                        ? 'Chỉ bạn (và quản trị viên) thấy trang này. Bạn vẫn giữ và chỉnh sửa được thiết kế; quản trị viên sẽ hiện lại khi phù hợp.'
                        : 'Người khác không thấy thiết kế này.'}
                    </p>
                  </div>
                )}
                {d.moderation?.ownerLocked && (
                  <p role="status" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                    Chủ thiết kế đang bị khoá – thiết kế đang ẩn khỏi cộng đồng.
                  </p>
                )}
                <div>
                  <h1 className="font-display text-3xl font-semibold leading-tight text-cream-50" data-testid="design-title">
                    {d.name}
                  </h1>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <AuthorLink author={d.owner} size={30} className="font-medium" />
                    <span className="text-xs text-cream-500" title={`Phiên bản ${d.versionN} lưu lúc ${formatDateTime(d.savedAt)}`}>
                      {d.visibility === 'public' ? 'Đăng' : 'Lưu'} {timeAgo(d.visibility === 'public' ? d.publishedAt : d.savedAt)}
                    </span>
                  </div>
                </div>
                {d.remixOf && (
                  <p className="flex flex-wrap items-center gap-1 rounded-xl border border-ink-700 px-3 py-2 text-xs text-cream-400" data-testid="remix-credit">
                    <Repeat2 size={13} className="text-gold-300" /> Remix từ
                    {d.remixOf.available ? (
                      <Link to={`/thiet-ke/${d.remixOf.designId}`} className="font-medium text-cream-100 hover:text-gold-200">
                        “{d.remixOf.name}”
                      </Link>
                    ) : (
                      <span className="font-medium text-cream-200">“{d.remixOf.name}”</span>
                    )}
                    của
                    {d.remixOf.ownerHandle ? (
                      <Link to={`/@${d.remixOf.ownerHandle}`} className="font-medium text-cream-100 hover:text-gold-200">
                        {d.remixOf.ownerName}
                      </Link>
                    ) : (
                      <span className="font-medium text-cream-200">{d.remixOf.ownerName}</span>
                    )}
                    {!d.remixOf.available && <span className="text-cream-600">(bản gốc không còn công khai)</span>}
                  </p>
                )}
                {d.description && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-cream-300">{d.description}</p>}

                <div className="flex flex-wrap gap-2">
                  <LikeButton key={d.id} designId={d.id} liked={d.liked} count={d.likeCount} onLoginLike={() => (pendingLike.current = true)} />
                  {!d.isOwner && (
                    <Button
                      variant="secondary"
                      onClick={remix}
                      disabled={!d.allowRemix || remixing}
                      title={d.allowRemix ? 'Tạo bản sao vào Thiết kế của bạn để sửa tiếp (ghi công tác giả gốc)' : 'Tác giả không cho phép remix thiết kế này'}
                    >
                      {remixing ? <Loader2 size={16} className="animate-spin" /> : <Repeat2 size={16} />} Remix
                      {d.remixCount > 0 && <span className="text-cream-500">{d.remixCount}</span>}
                    </Button>
                  )}
                  {d.visibility !== 'private' && (
                    <Button variant="secondary" onClick={() => copyLink(d.id)} title="Sao chép liên kết">
                      <Copy size={16} /> Chép link
                    </Button>
                  )}
                  <Button variant="secondary" as="a" href={`/in-thong-so?id=${d.id}`} target="_blank" rel="noopener" title="Bảng thông số A4 – lưu thành PDF">
                    <FileText size={16} /> Tải PDF
                  </Button>
                </div>
                {!d.allowRemix && !d.isOwner && <p className="text-xs text-cream-600">Tác giả không cho phép remix thiết kế này.</p>}

                {d.isOwner && (
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-gold-500/30 bg-gold-400/[0.04] p-3">
                    <span className="w-full text-xs text-gold-200">Đây là thiết kế của bạn</span>
                    <Button size="sm" variant="primary" as={Link} to={`/studio?id=${d.id}`}>
                      <Pencil size={14} /> Mở trong Studio
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setSharing(true)}>
                      <Share2 size={14} /> Cài đặt chia sẻ
                    </Button>
                  </div>
                )}

                {user?.role === 'admin' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-600 bg-ink-850 p-3" data-testid="admin-bar">
                    <span className="flex w-full items-center gap-1.5 text-xs text-gold-300">
                      <ShieldCheck size={13} /> Quản trị
                    </span>
                    {d.moderation?.hidden ? (
                      <Button size="sm" variant="secondary" onClick={() => setModAct('restore')}>
                        <Eye size={14} /> Hiện lại
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setModAct('hide')}>
                        <EyeOff size={14} /> Ẩn thiết kế
                      </Button>
                    )}
                    {d.visibility === 'public' &&
                      !d.moderation &&
                      (d.featured ? (
                        <Button size="sm" variant="ghost" onClick={() => adminQuick('unfeature', 'Đã bỏ khỏi NGK chọn')}>
                          <Award size={14} /> Bỏ NGK chọn
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => adminQuick('feature', 'Đã thêm vào NGK chọn')}>
                          <Award size={14} /> NGK chọn
                        </Button>
                      ))}
                  </div>
                )}

                <section className="border-t border-ink-700 pt-4">
                  <button type="button" onClick={() => setSpecsOpen(!specsOpen)} aria-expanded={specsOpen} className="flex w-full items-center justify-between text-sm font-semibold text-cream-100">
                    Bảng thông số <ChevronDown size={16} className={`transition-transform ${specsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {specsOpen && (
                    <div className="mt-4 max-h-[46vh] overflow-y-auto pr-1">
                      <SpecsTable config={d.config} />
                    </div>
                  )}
                </section>
                {user && !d.isOwner && (
                  <button type="button" onClick={() => setReport({ type: 'design', id: d.id })} className="flex items-center gap-1 text-[11px] text-cream-600 hover:text-cream-300">
                    <Flag size={11} /> Báo cáo thiết kế này
                  </button>
                )}
              </>
            )}
          </aside>
        </div>

        {d && (
          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
            <CommentsSection designId={d.id} onCountChange={setCommentCount} />
            <section className="space-y-4" aria-label="Bản remix">
              <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-cream-50">
                <Repeat2 size={20} className="text-gold-300" /> Bản remix
              </h2>
              {remixes.length ? (
                <div className="grid grid-cols-2 gap-4">
                  {remixes.map((r) => (
                    <DesignCard key={r.id} d={r} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-cream-500">{d.remixCount > 0 ? `${d.remixCount} lượt remix (chưa bản nào được công khai).` : 'Chưa có bản remix công khai.'}</p>
              )}
            </section>
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {commentCount} bình luận
        </span>
      </main>
      <SiteFooter />
      {d?.isOwner && (
        <SharingDialog
          designId={sharing ? d.id : null}
          onClose={() => setSharing(false)}
          onSaved={() => load()}
        />
      )}
      <ReportDialog target={report} onClose={() => setReport(null)} />
      {user?.role === 'admin' && d && (
        <>
          <ReasonDialog
            open={modAct === 'hide'}
            onClose={() => setModAct(null)}
            title="Ẩn thiết kế khỏi cộng đồng"
            id="hide-reason"
            label="Lý do ẩn (chủ thiết kế sẽ thấy)"
            presets={HIDE_REASONS}
            confirmLabel="Ẩn thiết kế"
            ConfirmIcon={EyeOff}
            onConfirm={async (reason) => {
              await post(`/api/admin/designs/${d.id}/hide`, { reason });
              setModAct(null);
              toast('Đã ẩn thiết kế khỏi cộng đồng', { tone: 'success' });
              load();
            }}
          >
            <p>Thiết kế biến mất khỏi Khám phá, hồ sơ, trang chủ và link chia sẻ; chủ thiết kế nhận thông báo kèm lý do.</p>
          </ReasonDialog>
          <ReasonDialog
            open={modAct === 'restore'}
            onClose={() => setModAct(null)}
            title="Hiện lại thiết kế"
            id="restore-note"
            label="Ghi chú (gửi kèm thông báo cho chủ)"
            min={0}
            confirmLabel="Hiện lại"
            ConfirmIcon={Eye}
            variant="primary"
            width="max-w-md"
            onConfirm={async (note) => {
              await post(`/api/admin/designs/${d.id}/restore`, { note });
              setModAct(null);
              toast('Đã hiện lại thiết kế', { tone: 'success' });
              load();
            }}
          >
            <p>Thiết kế trở lại cộng đồng theo chế độ chia sẻ chủ đang chọn.</p>
          </ReasonDialog>
        </>
      )}
    </div>
  );
}
