// HỘP CHIA SẺ một thiết kế đã lưu: Riêng tư / Có liên kết / Công khai, mô tả, cho phép remix / bình luận, sao chép link.
// Dùng trong Studio (nút "Chia sẻ") và trang Thiết kế của tôi.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, EyeOff, Globe2, ImageOff, Link2, Loader2, Lock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { get, patch, post } from '../../services/api.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Toggle } from '../ui/controls.jsx';
import { formatDateTime } from '../../utils/time.js';

const MODES = [
  { code: 'private', name: 'Riêng tư', desc: 'Chỉ mình bạn thấy.', Icon: Lock },
  { code: 'unlisted', name: 'Có liên kết', desc: 'Ai có link đều xem được, nhưng không hiện ở Khám phá.', Icon: Link2 },
  { code: 'public', name: 'Công khai', desc: 'Hiện ở trang Khám phá và trang hồ sơ của bạn.', Icon: Globe2 },
];

export const publicUrl = (id) => `${window.location.origin}/thiet-ke/${id}`;

export async function copyLink(id) {
  try {
    await navigator.clipboard.writeText(publicUrl(id));
    toast('Đã sao chép liên kết', { tone: 'success' });
  } catch {
    window.prompt('Sao chép liên kết:', publicUrl(id)); // trình duyệt chặn clipboard → cho người dùng tự chép
  }
}

/**
 * THẺ XEM TRƯỚC LINK: đúng tiêu đề / mô tả / ảnh mà máy chủ chèn vào trang /thiet-ke/:id cho Facebook, Zalo, Messenger… đọc
 * khi dán link (thẻ og: – server/src/share.js). Bản demo chạy trên máy (localhost) nên các trang đó chưa vào đọc được → xem
 * trước ở đây.
 */
function ShareCard({ designId }) {
  const [card, setCard] = useState(undefined); // undefined = đang tải · null = không có thẻ
  useEffect(() => {
    let alive = true;
    get(`/api/public/designs/${designId}/share-card`)
      .then((c) => alive && setCard(c))
      .catch(() => alive && setCard(null));
    return () => {
      alive = false;
    };
  }, [designId]);
  if (card === null) return null;
  return (
    <div className="space-y-1.5 border-t border-ink-700 pt-2.5">
      <p className="text-[11px] font-medium text-cream-400">Khi dán link lên Facebook, Zalo, Messenger…</p>
      <div className="flex overflow-hidden rounded-lg border border-ink-700 bg-ink-900" data-testid="share-card">
        {/* ảnh là link tuyệt đối (http://localhost…/api/images/…) → lấy đường dẫn: trang mở bằng 127.0.0.1 vẫn hiện được */}
        {card?.image ? (
          <img src={new URL(card.image).pathname} alt="" className="h-20 w-28 shrink-0 object-cover" />
        ) : (
          <div className={`grid h-20 w-28 shrink-0 place-items-center bg-ink-800 text-cream-600 ${card ? '' : 'animate-pulse'}`}>{card && <ImageOff size={18} />}</div>
        )}
        {card && (
          <div className="min-w-0 px-3 py-2">
            <p className="truncate text-[10px] tracking-wide text-cream-600 uppercase">{new URL(card.url).host}</p>
            <p className="truncate text-sm font-semibold text-cream-50">{card.title}</p>
            <p className="line-clamp-2 text-xs leading-snug text-cream-400">{card.description}</p>
          </div>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-cream-600">
        Máy chủ chèn sẵn thẻ này vào trang thiết kế. Bản demo chạy trên máy này nên Facebook / Zalo chưa đọc được link – xem trước ở đây.
      </p>
    </div>
  );
}

/**
 * @param designId   id thiết kế trên máy chủ (null = đóng)
 * @param unsaved    Studio đang có thay đổi chưa Lưu (người xem chưa thấy)
 * @param onSaved    (designSummary) => void
 */
export function SharingDialog({ designId, onClose, unsaved = false, onSaved }) {
  const user = useAuthStore((s) => s.user);
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!designId) return;
    setD(null);
    setForm(null);
    get(`/api/designs/${designId}`)
      .then(({ design }) => {
        setD(design);
        setForm({ visibility: design.visibility, description: design.description, allowRemix: design.allowRemix, allowComments: design.allowComments });
      })
      .catch((e) => {
        toast(e.message, { tone: 'warning' });
        onClose();
      });
  }, [designId]); // eslint-disable-line react-hooks/exhaustive-deps

  const verified = !!user?.emailVerified;
  const changed = d && form && (form.visibility !== d.visibility || form.description !== d.description || form.allowRemix !== d.allowRemix || form.allowComments !== d.allowComments);

  const save = async () => {
    setBusy(true);
    try {
      const { design } = await patch(`/api/designs/${designId}/sharing`, form);
      setD(design);
      onSaved?.(design);
      toast(design.visibility === 'private' ? 'Thiết kế đang ở chế độ riêng tư' : design.visibility === 'public' ? 'Đã đăng công khai' : 'Đã bật chia sẻ bằng liên kết', { tone: 'success' });
      if (design.visibility !== 'private' && d.visibility === 'private') await copyLink(designId);
    } catch (e) {
      toast(e.message, { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!designId}
      onClose={onClose}
      title="Chia sẻ thiết kế"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !changed}>
            {busy && <Loader2 size={15} className="animate-spin" />} Lưu cài đặt
          </Button>
        </>
      }
    >
      {!form ? (
        <div className="flex justify-center py-10 text-cream-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-5" data-testid="sharing-dialog">
          {d.hidden && (
            <div role="status" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-xs leading-relaxed text-cream-200" data-testid="sharing-hidden">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                <EyeOff size={14} /> Đang bị quản trị viên ẩn khỏi cộng đồng
              </p>
              {d.hidden.reason && <p className="mt-1">Lý do: {d.hidden.reason}</p>}
              <p className="mt-1 text-cream-400">Bạn vẫn giữ và chỉnh sửa được thiết kế, nhưng chưa chia sẻ lại được cho tới khi quản trị viên hiện lại.</p>
            </div>
          )}
          {d.remixOf && (
            <p className="rounded-xl border border-ink-700 px-3 py-2 text-xs text-cream-400">
              Bản remix từ “{d.remixOf.name}” của {d.remixOf.ownerName} – ghi công này luôn hiển thị khi chia sẻ.
            </p>
          )}
          <fieldset className="grid gap-2" aria-label="Chế độ hiển thị">
            {MODES.map(({ code, name, desc, Icon }) => {
              const locked = code !== 'private' && (!verified || !!d.hidden);
              const active = form.visibility === code;
              return (
                <label
                  key={code}
                  className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
                    active ? 'border-gold-500/70 bg-gold-400/[0.07]' : 'border-ink-700 hover:border-ink-500'
                  }`}
                >
                  <input type="radio" name="visibility" value={code} checked={active} disabled={locked} onChange={() => setForm({ ...form, visibility: code })} className="mt-1 accent-gold-400" />
                  <Icon size={18} className={`mt-0.5 shrink-0 ${active ? 'text-gold-300' : 'text-cream-500'}`} />
                  <span>
                    <span className="block text-sm font-medium text-cream-50">{name}</span>
                    <span className="block text-xs text-cream-500">{desc}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {!verified && (
            <div className="space-y-2 rounded-xl border border-gold-500/30 bg-gold-400/[0.05] px-3 py-2.5 text-xs text-gold-200">
              <p>Xác minh email để chia sẻ thiết kế với người khác.</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={resent}
                onClick={async () => {
                  try {
                    const r = await post('/api/auth/resend-verification');
                    setResent(true);
                    if (r.devLink) useAuthStore.setState({ devMail: { label: 'xác minh email', url: r.devLink } });
                  } catch (e) {
                    toast(e.message, { tone: 'warning' });
                  }
                }}
              >
                {resent ? 'Đã gửi – kiểm tra hộp thư' : 'Gửi lại email xác minh'}
              </Button>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="flex justify-between text-[13px] font-medium text-cream-100">
              Mô tả <span className="text-[11px] font-normal text-cream-600">{form.description.length}/500</span>
            </span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
              rows={3}
              placeholder="Ý tưởng, chất liệu, dịp dùng… (hiện trên trang thiết kế)"
              className="w-full resize-none rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-600 focus:border-gold-500/60 focus:outline-none"
            />
          </label>
          <Toggle label="Cho phép remix" description="Người khác được lấy thiết kế về sửa tiếp (luôn ghi công bạn là tác giả gốc)." checked={form.allowRemix} onChange={(v) => setForm({ ...form, allowRemix: v })} />
          <Toggle label="Cho phép bình luận" checked={form.allowComments} onChange={(v) => setForm({ ...form, allowComments: v })} />

          {/* bị quản trị viên ẩn → người khác mở link cũng không thấy, nên không đưa link ra */}
          {d.visibility !== 'private' && !d.hidden && (
            <div className="space-y-2 rounded-xl border border-ink-700 p-3">
              <div className="flex items-center gap-2">
                <input readOnly value={publicUrl(designId)} aria-label="Liên kết" className="h-9 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-900 px-2 text-xs text-cream-200" onFocus={(e) => e.target.select()} />
                <Button size="sm" variant="secondary" onClick={() => copyLink(designId)}>
                  <Copy size={14} /> Chép
                </Button>
                <Button size="sm" variant="ghost" as={Link} to={`/thiet-ke/${designId}`} onClick={onClose}>
                  <ExternalLink size={14} />
                </Button>
              </div>
              {/* lưu cài đặt / lưu thiết kế mới → tải lại thẻ */}
              <ShareCard key={`${d.visibility}|${d.description}|${d.lastSavedAt}`} designId={designId} />
            </div>
          )}
          <p className="text-xs leading-relaxed text-cream-500">
            Người xem thấy <b className="text-cream-300">phiên bản đã Lưu gần nhất</b>
            {d.lastSavedAt ? ` (${formatDateTime(d.lastSavedAt)})` : ''}, không thấy bản nháp đang sửa.
            {unsaved && <span className="text-gold-300"> Bạn đang có thay đổi chưa Lưu – bấm Lưu thiết kế để người xem thấy bản mới.</span>}
          </p>
        </div>
      )}
    </Modal>
  );
}
