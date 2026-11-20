// ĐỒNG BỘ THIẾT KẾ với máy chủ:
//  - mở thiết kế đã lưu (/studio?id=…), mở một phiên bản cũ (&v=n)
//  - LƯU = tạo 1 phiên bản (kèm ảnh đại diện chụp từ khung 3D); lần lưu đầu tạo thiết kế mới trên máy chủ
//  - TỰ ĐỒNG BỘ NHÁP: ngừng chỉnh 2,5 giây → gửi bản hiện tại (không tạo phiên bản); mất mạng → thử lại khi có mạng
//  - revision: phát hiện thiết kế bị sửa ở tab / máy khác → hỏi người dùng (không âm thầm ghi đè)
import { create } from 'zustand';
import { createDefaultConfig } from '@ngk/shared';
import { useDesignStore } from '../store/designStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useCatalogStore } from '../store/catalogStore.js';
import { afterLogout, beforeLogout } from './logoutCleanup.js';
import { getBackground, useViewerStore } from '../store/viewerStore.js';
import { toast } from '../store/toastStore.js';
import { ApiError, get, post, put } from './api.js';
import { clearDraft, loadDraft } from './draftStorage.js';

const SYNC_DELAY = 2500;
const RETRY_DELAY = 10000;

export const useSyncStore = create(() => ({
  revision: null, // revision trên máy chủ mà bản đang mở dựa vào (null = chưa lưu lên máy chủ)
  status: 'local', // local | dirty | syncing | synced | offline | conflict | error
  lastSyncedAt: null,
  lastSavedAt: null, // lần lưu phiên bản gần nhất
  versionCount: 0,
  saving: false,
  conflict: null, // { serverRevision }
  dialog: null, // 'save' | null
  visibility: 'private', // chế độ chia sẻ của thiết kế đang mở (bảng thông số in mã QR khi đã chia sẻ)
  remixOf: null, // ghi công khi là bản remix { designId, name, ownerName, ownerHandle }
}));
const setSync = (patch) => useSyncStore.setState(patch);
const designId = () => useDesignStore.getState().designId;
const onServer = () => designId() && designId() !== 'new';

// ── ảnh đại diện ──────────────────────────────────────────────────────────────────────────────────
/** Chụp khung 3D → WebP nhỏ (≤ 480px, ≤ ~250 KB). null nếu khung 3D chưa sẵn sàng. */
export async function captureThumbnail() {
  const { capture, background } = useViewerStore.getState();
  if (!capture) return null;
  try {
    const png = capture({ scale: 1, background: getBackground(background) });
    const img = new Image();
    img.src = png;
    await img.decode();
    const k = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55]) {
      const url = c.toDataURL('image/webp', q);
      if (url.startsWith('data:image/webp') && url.length < 330_000) return url;
    }
    return null;
  } catch {
    return null; // ảnh đại diện không bắt buộc
  }
}

// ── mở ────────────────────────────────────────────────────────────────────────────────────────────
/** Mở thiết kế đã lưu. Bản nháp trên máy (chưa kịp đồng bộ) mới hơn bản máy chủ → dùng bản trên máy. */
export async function openDesign(id, { version, lookup } = {}) {
  const { design } = await get(`/api/designs/${id}`);
  const st = useDesignStore.getState();
  let cfg = design.config;
  let title = design.name;
  let restored = false;
  if (version) {
    const { version: v } = await get(`/api/designs/${id}/versions/${version}`);
    cfg = v.config;
    toast(`Đang xem phiên bản ${v.n}${v.note ? ` – “${v.note}”` : ''}. Bấm Lưu để khôi phục thành bản mới nhất.`, { duration: 7000 });
  } else {
    const local = loadDraft(id, lookup);
    if (local?.savedAt && local.savedAt > new Date(design.updatedAt).getTime() + 1000) {
      cfg = local.config;
      title = local.title || title;
      restored = true;
    }
  }
  st.load(cfg, { title, designId: id });
  setSync({
    revision: design.revision,
    status: restored || version ? 'dirty' : 'synced',
    lastSyncedAt: restored ? null : Date.now(),
    lastSavedAt: design.lastSavedAt ? new Date(design.lastSavedAt).getTime() : null,
    versionCount: design.versionCount,
    conflict: null,
    visibility: design.visibility ?? 'private',
    remixOf: design.remixOf ?? null,
  });
  if (restored) {
    toast('Đã khôi phục thay đổi chưa kịp đồng bộ lần trước.');
    scheduleSync(300);
  }
  return design;
}

/** Thiết kế chưa lưu lên máy chủ (bản nháp "new", mẫu, loại mới). */
export function resetSync() {
  clearTimeout(timer);
  setSync({ revision: null, status: 'local', lastSyncedAt: null, lastSavedAt: null, versionCount: 0, conflict: null, visibility: 'private', remixOf: null });
}

// ── lưu phiên bản ─────────────────────────────────────────────────────────────────────────────────
/** @returns { id, version } hoặc null (lỗi đã báo) */
export async function saveVersion(note = '', { fromDesign } = {}) {
  if (!useAuthStore.getState().user) return null;
  if (useSyncStore.getState().saving) return null;
  setSync({ saving: true });
  clearTimeout(timer);
  try {
    // bản nháp đang gửi dở (mạng chậm / máy chủ đang khởi động) → đợi xong rồi mới đọc revision: nếu không, lần lưu dùng
    // revision CŨ và chính tab này bị báo "đã sửa ở nơi khác" (xung đột giả)
    if (inflight) await inflight;
    const sync = useSyncStore.getState();
    if (sync.status === 'conflict') return null; // xung đột thật – hộp chọn cách xử lý đang hiện
    const { config, title } = useDesignStore.getState();
    const thumbnail = await captureThumbnail();
    let res;
    if (!onServer()) {
      // fromDesign: tách từ thiết kế khác của mình → máy chủ chép lại ghi công remix (không mất ghi công tác giả gốc)
      res = await post('/api/designs', { name: title, config, note, thumbnail, fromDesign });
      const id = res.design.id;
      clearDraft('new');
      useDesignStore.setState({ designId: id });
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      url.searchParams.delete('v');
      window.history.replaceState(window.history.state, '', url);
    } else {
      res = await post(`/api/designs/${designId()}/versions`, { name: title, config, note, thumbnail, revision: sync.revision });
    }
    lastSent = JSON.stringify([config, title]);
    setSync({
      revision: res.design.revision,
      status: 'synced',
      lastSyncedAt: Date.now(),
      lastSavedAt: Date.now(),
      versionCount: res.design.versionCount,
      conflict: null,
      visibility: res.design.visibility ?? 'private',
      remixOf: res.design.remixOf ?? null,
    });
    toast(`Đã lưu phiên bản ${res.version}`, { tone: 'success' });
    return { id: res.design.id, version: res.version };
  } catch (e) {
    handleError(e);
    return null;
  } finally {
    setSync({ saving: false });
  }
}

/** Lưu bản đang mở thành THIẾT KẾ MỚI (dùng khi xung đột, hoặc "Lưu thành bản sao"). */
export async function saveAsNew() {
  const from = onServer() ? designId() : undefined;
  useDesignStore.setState({ designId: 'new' });
  resetSync();
  const { title } = useDesignStore.getState();
  if (!/\(bản sao\)$/.test(title)) useDesignStore.getState().setTitle(`${title} (bản sao)`);
  return saveVersion('Tách ra từ thiết kế khác', { fromDesign: from });
}

// ── tự đồng bộ nháp ───────────────────────────────────────────────────────────────────────────────
let timer = null;
let lastSent = null;
let inflight = null;

function scheduleSync(delay = SYNC_DELAY) {
  clearTimeout(timer);
  timer = setTimeout(syncDraft, delay);
}

export async function syncDraft() {
  if (!onServer() || !useAuthStore.getState().user) return;
  const s = useSyncStore.getState();
  if (s.status === 'conflict' || s.saving) return;
  if (inflight) {
    scheduleSync(800); // đang gửi bản trước – gửi tiếp sau
    return;
  }
  const { config, title } = useDesignStore.getState();
  const key = JSON.stringify([config, title]);
  if (key === lastSent) {
    setSync({ status: 'synced' });
    return;
  }
  setSync({ status: 'syncing' });
  const id = designId();
  inflight = put(`/api/designs/${id}/draft`, { config, name: title, revision: s.revision })
    .then((res) => {
      if (designId() !== id) return;
      lastSent = key;
      const changedSince = JSON.stringify([useDesignStore.getState().config, useDesignStore.getState().title]) !== key;
      setSync({ revision: res.design.revision, status: changedSince ? 'dirty' : 'synced', lastSyncedAt: Date.now() });
      if (changedSince) scheduleSync();
    })
    .catch(handleError)
    .finally(() => {
      inflight = null;
    });
  await inflight;
}

function handleError(e) {
  if (e instanceof ApiError && e.status === 409 && e.code === 'CONFLICT') {
    setSync({ status: 'conflict', conflict: { serverRevision: e.body.revision } });
    return;
  }
  if (e instanceof ApiError && e.status === 0) {
    setSync({ status: 'offline' });
    scheduleSync(RETRY_DELAY);
    return;
  }
  if (e instanceof ApiError && e.status === 401) {
    setSync({ status: 'error' });
    toast('Phiên đăng nhập đã hết – đăng nhập lại để tiếp tục lưu (bản nháp vẫn còn trên máy).', { tone: 'warning' });
    return;
  }
  if (e instanceof ApiError && e.status === 404) {
    setSync({ status: 'error' });
    toast('Thiết kế này không còn trên máy chủ (có thể đã bị xoá). Bấm Lưu để lưu thành thiết kế mới.', { tone: 'warning' });
    useDesignStore.setState({ designId: 'new' });
    resetSync();
    return;
  }
  setSync({ status: 'error' });
  toast(e.message || 'Không lưu được thiết kế', { tone: 'warning' });
}

/** Giải quyết xung đột: tải bản trên máy chủ (bỏ thay đổi ở đây) / ghi đè bằng bản ở đây / lưu thành thiết kế mới. */
export async function resolveConflict(choice, lookup) {
  const id = designId();
  if (choice === 'reload') {
    lastSent = null;
    clearDraft(id);
    await openDesign(id, { lookup });
    toast('Đã tải bản mới nhất từ máy chủ');
  } else if (choice === 'overwrite') {
    setSync({ revision: useSyncStore.getState().conflict?.serverRevision, status: 'dirty', conflict: null });
    lastSent = null;
    await syncDraft();
  } else if (choice === 'copy') {
    await saveAsNew();
  }
}

/** Theo dõi thay đổi của thiết kế → đánh dấu chưa đồng bộ + hẹn giờ gửi. Trả về hàm huỷ theo dõi. */
export function startDraftSync() {
  const unsub = useDesignStore.subscribe((state, prev) => {
    if (state.designId !== prev.designId) {
      lastSent = null;
      return;
    }
    if (state.config === prev.config && state.title === prev.title) return;
    if (!onServer()) return;
    const st = useSyncStore.getState();
    if (st.status === 'conflict') return;
    setSync({ status: 'dirty' });
    scheduleSync();
  });
  const online = () => onServer() && useSyncStore.getState().status === 'offline' && scheduleSync(200);
  window.addEventListener('online', online);
  // đóng / tải lại trang khi còn thay đổi chưa gửi → bản nháp trên máy vẫn có (localStorage); cảnh báo nếu chưa lưu
  const beforeUnload = (e) => {
    const s = useSyncStore.getState().status;
    if (onServer() && ['dirty', 'syncing'].includes(s)) {
      syncDraft();
      e.preventDefault();
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    unsub();
    clearTimeout(timer);
    window.removeEventListener('online', online);
    window.removeEventListener('beforeunload', beforeUnload);
  };
}

// ── ĐĂNG XUẤT (xem logoutCleanup.js) ──────────────────────────────────────────────────────────────
// trước: gửi nốt thay đổi chưa đồng bộ của thiết kế đang mở; không gửi được (mất mạng, xung đột) → giữ bản nháp đó trên máy
beforeLogout(async () => {
  if (!onServer()) return null;
  clearTimeout(timer);
  if (inflight) await inflight;
  if (!['synced', 'conflict'].includes(useSyncStore.getState().status)) await syncDraft();
  return useSyncStore.getState().status === 'synced' ? null : designId();
});
// sau: thiết kế đã lưu (có thể riêng tư) của người vừa đăng xuất rời khỏi bộ nhớ trang → thay bằng bản nháp chưa lưu của máy
// (cùng nội dung với bản đang lưu trong trình duyệt → lỡ bị tự lưu nháp ghi lại cũng không mất gì) hoặc thiết kế mặc định
afterLogout(() => {
  if (onServer()) {
    const draft = loadDraft('new', useCatalogStore.getState().lookup);
    useDesignStore.getState().load(draft?.config ?? createDefaultConfig('ring'), { title: draft?.title });
  }
  resetSync();
  lastSent = null;
});
