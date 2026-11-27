// QUẢN TRỊ – CHI TIẾT NGƯỜI DÙNG: thông tin, số liệu, thiết kế (RIÊNG TƯ chỉ hiện loại + ngày tạo), lịch sử quản trị.
// Khoá / mở khoá (bắt buộc lý do – người dùng thấy lý do khi đăng nhập), xoá vĩnh viễn (gõ lại email để xác nhận).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AtSign, Award, CalendarDays, Clock, Eye, EyeOff, Heart, KeyRound, Lock, LockOpen, LogIn, Mail, MessageCircle, ScrollText, Trash2 } from 'lucide-react';
import { JEWELRY_TYPES } from '@ngk/shared';
import { Avatar } from '../../components/auth/UserMenu.jsx';
import { TypeIcon } from '../../components/icons.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ActionPill, ErrorBox, Loading, Pill, ReasonField, UserBadges } from '../../components/admin/AdminUi.jsx';
import { ACCESS_REASONS, DELETE_REASONS } from '../../components/admin/adminLabels.js';
import { LockUserDialog, ReasonDialog } from '../../components/admin/AdminDialogs.jsx';
import { useAdminStore } from '../../store/adminStore.js';
import { toast } from '../../store/toastStore.js';
import { del, get, post } from '../../services/api.js';
import { formatDate, formatDateTime, timeAgo } from '../../utils/time.js';

const typeName = (code) => JEWELRY_TYPES.find((t) => t.code === code)?.name ?? code;
const VIS = { public: 'Công khai', unlisted: 'Có liên kết' };

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null); // 'lock' | 'unlock' | 'delete'
  const [requesting, setRequesting] = useState(null); // thiết kế riêng tư đang xin quyền xem
  const refreshSummary = useAdminStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      setData(await get(`/api/admin/users/${id}`));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // quay lại danh sách (giữ bộ lọc đang dùng nếu vừa đi từ danh sách sang)
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/quan-tri/nguoi-dung'));
  const done = async (message) => {
    setDialog(null);
    toast(message, { tone: 'success' });
    await load();
    refreshSummary();
  };

  const backBtn = (
    <button type="button" onClick={back} className="flex items-center gap-1.5 text-sm text-cream-400 hover:text-cream-50">
      <ArrowLeft size={15} /> Người dùng
    </button>
  );
  if (error) {
    return (
      <div className="space-y-6">
        {backBtn}
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        {backBtn}
        <Loading />
      </div>
    );
  }

  const { user: u, stats: s, designs, logs } = data;
  const shared = s.public + s.unlisted;
  const methods = [u.hasPassword && 'mật khẩu', u.googleLinked && 'Google'].filter(Boolean).join(' + ') || 'không có (không đăng nhập được)';

  return (
    <div>
      {backBtn}

      <section className="mt-5 rounded-2xl border border-ink-700 bg-ink-850 p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar user={u} size={72} />
          <div className="min-w-0 flex-1 space-y-2.5">
            {/* nút thao tác cùng hàng với tên → phần thông tin bên dưới dùng hết chiều ngang */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <h1 className="font-display text-3xl font-semibold text-cream-50" data-testid="admin-user-name">
                  {u.displayName}
                </h1>
                <UserBadges u={u} />
              </div>
              <Actions u={u} onLock={() => setDialog('lock')} onUnlock={() => setDialog('unlock')} onDelete={() => setDialog('delete')} />
            </div>
            <dl className="grid gap-x-8 gap-y-1.5 pt-1 text-sm text-cream-300 md:grid-cols-2">
              <Info Icon={Mail}>
                {u.email} <span className="text-cream-500">({u.emailVerified ? 'đã xác minh' : 'chưa xác minh'})</span>
              </Info>
              {u.handle && (
                <Info Icon={AtSign}>
                  <a href={`/@${u.handle}`} target="_blank" rel="noreferrer" className="text-gold-300 hover:text-gold-200">
                    {u.handle}
                  </a>
                </Info>
              )}
              <Info Icon={CalendarDays}>Tham gia {formatDate(u.createdAt)}</Info>
              <Info Icon={KeyRound}>Đăng nhập bằng {methods}</Info>
              <Info Icon={LogIn}>Đăng nhập gần nhất: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'chưa từng'}</Info>
              <Info Icon={Clock}>Hoạt động gần nhất: {u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'chưa từng'}</Info>
            </dl>
            {u.bio && <p className="whitespace-pre-line text-sm leading-relaxed text-cream-400">{u.bio}</p>}
          </div>
        </div>
        {u.locked && (
          <div role="status" data-testid="locked-banner" className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <Lock size={15} /> Tài khoản đang bị khoá
            </p>
            <p className="mt-1 text-cream-100">Lý do: {u.locked.reason}</p>
            <p className="mt-1 text-xs text-cream-400">
              Từ {formatDateTime(u.locked.at)}
              {u.locked.by ? ` · bởi ${u.locked.by}` : ''}. Thiết kế công khai, bình luận và hồ sơ đang ẩn khỏi cộng đồng.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Số liệu">
        <Stat label="Thiết kế" n={s.designs} wide sub={`${s.public} công khai · ${s.unlisted} có liên kết · ${s.private} riêng tư`} />
        <Stat label="Lượt thích nhận được" n={s.likesReceived} />
        <Stat label="Đã thích" n={s.likesGiven} />
        <Stat label="Bình luận" n={s.comments} />
        <Stat label="Bị báo cáo" n={s.reportsAgainst} danger={s.reportsAgainst > 0} />
        <Stat label="Đã gửi báo cáo" n={s.reportsMade} />
        <Stat label="Phiên đăng nhập đang mở" n={s.sessions} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-cream-50">
          Thiết kế <span className="font-sans text-lg font-normal text-cream-500">({designs.length})</span>
        </h2>
        {designs.length === 0 ? (
          <p className="mt-3 text-sm text-cream-500">Chưa có thiết kế nào.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4" data-testid="admin-user-designs">
            {designs.map((d) =>
              d.visibility === 'private' ? <PrivateTile key={d.id} d={d} owner={u} onRequest={() => setRequesting(d)} /> : <DesignTile key={d.id} d={d} />,
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-cream-50">Lịch sử quản trị</h2>
          {logs.length > 0 && (
            <Link to={`/quan-tri/nhat-ky?target=${u.id}`} className="flex items-center gap-1.5 text-xs text-gold-300 hover:text-gold-200">
              <ScrollText size={14} /> Xem trong Nhật ký
            </Link>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-cream-500">Chưa có thao tác quản trị nào với tài khoản này.</p>
        ) : (
          <ol className="mt-4 space-y-2" data-testid="admin-user-logs">
            {logs.map((l) => (
              <li key={l.id} className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ActionPill action={l.action} />
                  <span className="text-cream-300">{l.actorName}</span>
                  <span className="text-xs text-cream-600" title={formatDateTime(l.at)}>
                    {timeAgo(l.at)}
                  </span>
                </div>
                {l.reason && <p className="mt-1.5 text-cream-200">Lý do: {l.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <LockUserDialog open={dialog === 'lock'} user={u} shared={shared} onClose={() => setDialog(null)} onDone={done} />
      <ReasonDialog
        open={dialog === 'unlock'}
        onClose={() => setDialog(null)}
        title="Mở khoá tài khoản"
        id="unlock-note"
        label="Ghi chú cho nhật ký"
        min={0}
        placeholder="Ví dụ: đã cam kết không tái phạm"
        confirmLabel="Mở khoá"
        ConfirmIcon={LockOpen}
        variant="primary"
        width="max-w-md"
        onConfirm={async (note) => {
          await post(`/api/admin/users/${u.id}/unlock`, { note });
          done(`Đã mở khoá tài khoản ${u.displayName}`);
        }}
      >
        <p>
          <b className="text-cream-50">{u.displayName}</b> đăng nhập lại được ngay; thiết kế công khai, bình luận và hồ sơ hiện lại như cũ.
        </p>
      </ReasonDialog>
      <ReasonDialog
        open={!!requesting}
        onClose={() => setRequesting(null)}
        title="Xin quyền xem thiết kế riêng tư"
        id="access-reason"
        label="Lý do xin xem (chủ thiết kế sẽ thấy)"
        presets={ACCESS_REASONS}
        min={10}
        confirmLabel="Gửi yêu cầu"
        ConfirmIcon={KeyRound}
        variant="primary"
        onConfirm={async (reason) => {
          await post(`/api/admin/designs/${requesting.id}/access-requests`, { reason });
          setRequesting(null);
          toast(`Đã gửi yêu cầu – ${u.displayName} sẽ nhận thông báo để đồng ý hoặc từ chối`, { tone: 'success' });
          load();
        }}
      >
        <p>
          Thiết kế riêng tư chỉ chủ của nó xem được. <b className="text-cream-50">{u.displayName}</b> sẽ nhận thông báo kèm lý do và tự quyết định:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-cream-400">
          <li>Đồng ý → bạn xem được (chỉ đọc, không sửa) trong 7 ngày; chủ thu hồi được bất cứ lúc nào.</li>
          <li>Từ chối → bạn không xem được; lý do vẫn được lưu trong nhật ký.</li>
          <li>Mỗi lần bạn mở xem đều được ghi vào nhật ký quản trị.</li>
        </ul>
      </ReasonDialog>
      <DeleteDialog
        open={dialog === 'delete'}
        u={u}
        s={s}
        onClose={() => setDialog(null)}
        onDone={(message) => {
          setDialog(null);
          toast(message, { tone: 'success' });
          refreshSummary();
          navigate('/quan-tri/nguoi-dung', { replace: true });
        }}
      />
    </div>
  );
}

function Info({ Icon, children }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon size={14} className="mt-[3px] shrink-0 text-cream-500" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Stat({ label, n, sub, wide, danger }) {
  return (
    <div className={`rounded-2xl border border-ink-700 bg-ink-850 px-4 py-3.5 ${wide ? 'col-span-2' : ''}`}>
      <p className={`text-2xl font-semibold tabular-nums ${danger ? 'text-danger' : 'text-cream-50'}`}>{n}</p>
      <p className="text-xs text-cream-500">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-cream-600">{sub}</p>}
    </div>
  );
}

function Actions({ u, onLock, onUnlock, onDelete }) {
  if (u.isMe) return <p className="max-w-56 text-xs text-cream-500">Đây là tài khoản của bạn.</p>;
  if (u.role === 'admin') {
    return (
      <p className="max-w-72 text-xs leading-relaxed text-cream-500">
        Quản trị viên – không khoá hay xoá được trên web. Nếu cần, trước hết thu quyền bằng lệnh{' '}
        <code className="rounded bg-ink-800 px-1 text-cream-300">npm run admin -- --thu {u.email}</code> trên máy chủ.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {u.locked ? (
        <Button variant="secondary" onClick={onUnlock}>
          <LockOpen size={15} /> Mở khoá
        </Button>
      ) : (
        <Button variant="danger" onClick={onLock}>
          <Lock size={15} /> Khoá tài khoản
        </Button>
      )}
      <Button variant="danger" onClick={onDelete}>
        <Trash2 size={15} /> Xoá vĩnh viễn
      </Button>
    </div>
  );
}

function DesignTile({ d }) {
  const body = (
    <>
      <div className="relative aspect-square bg-ink-900">
        {d.thumbnailUrl ? (
          <img src={d.thumbnailUrl} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-cream-600">
            <TypeIcon type={d.type} size={44} />
          </div>
        )}
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Pill tone={d.visibility === 'public' ? 'gold' : 'muted'}>{VIS[d.visibility]}</Pill>
          {d.hidden && (
            <Pill tone="danger" Icon={EyeOff} title={d.hidden.reason}>
              Đã ẩn
            </Pill>
          )}
          {d.featured && (
            <Pill tone="gold" Icon={Award}>
              NGK chọn
            </Pill>
          )}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-cream-50">{d.name}</p>
        <p className="flex items-center gap-3 text-[11px] text-cream-500">
          <span>{typeName(d.type)}</span>
          <span className="flex items-center gap-1">
            <Heart size={11} /> {d.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={11} /> {d.commentCount}
          </span>
        </p>
        {!d.saved && <p className="text-[11px] text-cream-600">Chưa Lưu lần nào – chưa ai xem được</p>}
      </div>
    </>
  );
  const cls = 'block overflow-hidden rounded-2xl border border-ink-700 bg-ink-850';
  return d.saved ? (
    <a href={`/thiet-ke/${d.id}`} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:border-gold-500/50`} title="Mở trang thiết kế (tab mới)">
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const ACCESS_TEXT = {
  pending: 'Đang chờ chủ thiết kế trả lời',
  declined: 'Chủ thiết kế đã từ chối',
  revoked: 'Chủ thiết kế đã thu hồi quyền xem',
  expired: 'Quyền xem đã hết hạn',
};

/**
 * Thiết kế RIÊNG TƯ: chỉ loại + ngày tạo – không tên, không ảnh – kèm nút xin quyền xem.
 * Chủ đã đồng ý (còn hạn) → hiện tên + ảnh + nút Xem (chỉ đọc).
 */
function PrivateTile({ d, owner, onRequest }) {
  const st = d.access?.status ?? null;
  const daysLeft = st === 'approved' ? Math.max(1, Math.ceil((new Date(d.access.expiresAt) - Date.now()) / 86400000)) : 0;
  // chủ là tài khoản mẫu / đang bị khoá → không trả lời được yêu cầu
  const cannot = owner.demo ? 'Tài khoản mẫu – không xin quyền được' : owner.locked ? 'Chủ đang bị khoá – không trả lời được' : null;
  return (
    <div className={`overflow-hidden rounded-2xl border bg-ink-900 ${st === 'approved' ? 'border-gold-500/40' : 'border-dashed border-ink-600'}`} data-testid="private-tile">
      {st === 'approved' ? (
        <Link to={`/quan-tri/thiet-ke/${d.id}`} className="relative block aspect-square" title="Xem (chỉ đọc)">
          {d.thumbnailUrl ? (
            <img src={d.thumbnailUrl} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-cream-600">
              <TypeIcon type={d.type} size={44} />
            </div>
          )}
          <span className="absolute left-2 top-2">
            <Pill tone="gold" Icon={Eye}>
              Được xem · còn {daysLeft} ngày
            </Pill>
          </span>
        </Link>
      ) : (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 px-4 text-center">
          <Lock size={24} className="text-cream-500" />
          <p className="text-[11px] leading-relaxed text-cream-600">Nội dung riêng tư – chỉ chủ thiết kế xem được</p>
          {st && <p className={`text-[11px] ${st === 'pending' ? 'text-gold-300' : 'text-cream-500'}`}>{ACCESS_TEXT[st]}</p>}
          {st !== 'pending' &&
            (cannot ? (
              <p className="text-[10px] text-cream-600">{cannot}</p>
            ) : (
              <Button size="sm" variant="secondary" onClick={onRequest} className="mt-1">
                <KeyRound size={13} /> {st ? 'Xin lại' : 'Xin quyền xem'}
              </Button>
            ))}
        </div>
      )}
      <div className="space-y-1 border-t border-ink-700 p-3">
        <p className="truncate text-sm font-medium text-cream-300">{st === 'approved' ? d.name : `Riêng tư · ${typeName(d.type)}`}</p>
        <p className="text-[11px] text-cream-500">
          {st === 'approved' ? `${typeName(d.type)} · ` : ''}Tạo {formatDate(d.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ── hộp thoại ──────────────────────────────────────────────────────────────────────────────────────
function useAction(open) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function DeleteDialog({ open, u, s, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, run } = useAction(open);
  useEffect(() => {
    if (open) {
      setReason('');
      setConfirm('');
    }
  }, [open]);
  const ok = [...reason.trim()].length >= 4 && confirm.trim().toLowerCase() === u.email;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xoá tài khoản vĩnh viễn"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={!ok || busy}
            onClick={() =>
              run(async () => {
                await del(`/api/admin/users/${u.id}`, { confirmEmail: confirm.trim(), reason: reason.trim() });
                onDone(`Đã xoá vĩnh viễn tài khoản ${u.displayName}`);
              })
            }
          >
            <Trash2 size={15} /> {busy ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-cream-300">
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-danger">
          Không thể hoàn tác. Tài khoản <b>{u.displayName}</b> và mọi dữ liệu dưới đây bị xoá vĩnh viễn:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-cream-400">
          <li>{s.designs} thiết kế (kèm mọi phiên bản và ảnh)</li>
          <li>
            {s.likesGiven} lượt thích đã cho, {s.comments} bình luận
          </li>
          <li>Ảnh đại diện, thông báo, phiên đăng nhập</li>
        </ul>
        <p className="text-xs leading-relaxed text-cream-500">
          Bình luận đã có người khác trả lời sẽ hiện “Bình luận đã bị xoá” để giữ mạch trò chuyện. Số lượt thích, bình luận trên thiết kế của người khác được đếm lại.
        </p>
        <ReasonField id="delete-reason" label="Lý do xoá" value={reason} onChange={setReason} presets={DELETE_REASONS} min={4} />
        <label className="block space-y-2">
          <span className="block text-sm font-medium text-cream-100">
            Gõ <b className="select-all text-cream-50">{u.email}</b> để xác nhận
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Email xác nhận"
            className="h-10 w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 text-sm text-cream-50 focus:border-danger/60 focus:outline-none"
          />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}
