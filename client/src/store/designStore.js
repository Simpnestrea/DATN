// Store thiết kế: cấu hình hiện tại + lịch sử Undo/Redo.
//
// Mọi thay đổi đi qua `apply()` → clone → sửa → normalizeConfig (áp quy tắc) → lưu.
// Với thanh trượt: khi kéo dùng { transient: true } (chỉ cập nhật hình 3D),
// khi thả chuột gọi commit() → ghi đúng 1 bước vào lịch sử thay vì hàng trăm bước.
import { create } from 'zustand';
import { createDefaultConfig, normalizeConfig } from '@ngk/shared';
import { useCatalogStore } from './catalogStore.js';

const HISTORY_LIMIT = 60;
export const DEFAULT_TITLE = 'Thiết kế chưa đặt tên';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lookup = () => useCatalogStore.getState().lookup;
const normalize = (c) => normalizeConfig(c, lookup());

function setIn(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys.at(-1)] = value;
}

export const useDesignStore = create((set, get) => ({
  config: createDefaultConfig('ring'),
  title: DEFAULT_TITLE,
  designId: 'new', // GĐ2: id thiết kế trên server
  past: [],
  future: [],
  txBase: null, // ảnh chụp cấu hình trước khi bắt đầu kéo thanh trượt

  /** Áp một hàm sửa lên bản sao cấu hình. */
  apply(mutator, { transient = false } = {}) {
    const { config, txBase, past } = get();
    const draft = structuredClone(config);
    mutator(draft);
    const next = normalize(draft);
    if (transient) {
      set({ config: next, txBase: txBase ?? config });
      return;
    }
    const base = txBase ?? config;
    if (same(base, next)) {
      set({ config: next, txBase: null });
      return;
    }
    set({ config: next, past: [...past, base].slice(-HISTORY_LIMIT), future: [], txBase: null });
  },

  /** Đặt giá trị theo đường dẫn, ví dụ setPath('gem.sizeMm', 7). */
  setPath(path, value, opts) {
    get().apply((c) => setIn(c, path, value), opts);
  },

  /** Kết thúc một chuỗi thay đổi tạm thời (thả thanh trượt). */
  commit() {
    const { txBase, config, past } = get();
    if (!txBase) return;
    if (same(txBase, config)) set({ txBase: null });
    else set({ past: [...past, txBase].slice(-HISTORY_LIMIT), future: [], txBase: null });
  },

  /** Đổi loại trang sức – giữ lại kim loại và loại đá để trải nghiệm liền mạch. */
  changeType(type) {
    if (get().txBase) get().commit(); // chốt thay đổi đang dở (nếu có)
    const { config } = get();
    if (config.type === type) return;
    const next = createDefaultConfig(type);
    next.metal = { ...config.metal };
    next.gem.stone = config.gem.stone;
    next.gem.color = config.gem.color;
    const normalized = normalize(next);
    set((s) => ({ config: normalized, past: [...s.past, config].slice(-HISTORY_LIMIT), future: [] }));
  },

  setStyle(style) {
    get().apply((c) => {
      c.style = style;
    });
  },

  undo() {
    if (get().txBase) get().commit();
    const { past, future, config } = get();
    if (!past.length) return;
    set({
      config: past.at(-1),
      past: past.slice(0, -1),
      future: [config, ...future].slice(0, HISTORY_LIMIT),
      txBase: null,
    });
  },

  redo() {
    const { future, past, config } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({ config: next, past: [...past, config].slice(-HISTORY_LIMIT), future: rest });
  },

  /** Đưa về mặc định của loại + kiểu dáng hiện tại (có thể Undo). */
  reset() {
    const { config } = get();
    const fresh = normalize(createDefaultConfig(config.type, config.style));
    if (same(fresh, config)) return;
    set((s) => ({ config: fresh, past: [...s.past, config].slice(-HISTORY_LIMIT), future: [], txBase: null }));
  },

  /** Nạp một cấu hình mới (mẫu, bản nháp, thiết kế đã lưu) – xóa lịch sử. */
  load(config, { title = DEFAULT_TITLE, designId = 'new' } = {}) {
    set({ config: normalize(config), title: title || DEFAULT_TITLE, designId, past: [], future: [], txBase: null });
  },

  setTitle(title) {
    set({ title: title.slice(0, 80) });
  },
}));

// Chỉ khi chạy dev: cho phép kiểm thử tự động / gỡ lỗi đọc store từ console (window.__ngk.design.getState())
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__ngk = { ...(window.__ngk ?? {}), design: useDesignStore };
}

export const selectCanUndo = (s) => s.past.length > 0 || s.txBase !== null;
export const selectCanRedo = (s) => s.future.length > 0;
