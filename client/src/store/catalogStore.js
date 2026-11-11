// Store danh mục: tải 1 lần, cung cấp bộ tra cứu (lookup) và danh sách đang hoạt động.
import { create } from 'zustand';
import { createCatalogLookup, localLookup } from '@ngk/shared';
import { fetchCatalog } from '../services/catalogService.js';
import { hashString } from '../utils/hash.js';

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
/** Dấu vân tay kim loại + đá (quản trị viên sửa màu / độ bóng → ảnh mẫu đã lưu không còn khớp → chụp lại). */
const signature = (catalog) => hashString(JSON.stringify([catalog.materials, catalog.gemstones]));

export const useCatalogStore = create((set, get) => ({
  status: 'idle', // idle | loading | ready | error
  error: null,
  catalog: null,
  lookup: localLookup,
  sig: '',

  async load() {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const catalog = await fetchCatalog();
      set({ catalog, lookup: createCatalogLookup(catalog), sig: signature(catalog), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err?.message ?? 'Không tải được danh mục' });
    }
  },
  /** Tải lại (sau khi quản trị viên sửa danh mục) – không làm trang hiện màn hình chờ. */
  async reload() {
    try {
      const catalog = await fetchCatalog();
      set({ catalog, lookup: createCatalogLookup(catalog), sig: signature(catalog), status: 'ready' });
    } catch {
      /* giữ bản đang có */
    }
  },
}));

// Danh sách chỉ gồm mục đang hoạt động (mục bị ẩn vẫn tra cứu được để hiển thị thiết kế cũ).
// Lưu ý: đây là hàm thuần nhận `catalog` – dùng kèm useMemo, KHÔNG dùng làm selector của zustand
// (selector trả về mảng mới mỗi lần sẽ gây render vô hạn).
export const activeMaterials = (catalog) => (catalog?.materials ?? []).filter((m) => m.isActive).sort(byOrder);
export const activeGemstones = (catalog) => (catalog?.gemstones ?? []).filter((g) => g.isActive).sort(byOrder);
export const activeStyles = (catalog, type) =>
  (catalog?.styles ?? []).filter((st) => st.type === type && st.isActive).sort(byOrder);
export const allTemplates = (catalog) => catalog?.templates ?? [];
