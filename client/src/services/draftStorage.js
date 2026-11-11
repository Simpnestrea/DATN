// Lưu bản nháp thiết kế trong localStorage để không mất dữ liệu khi tải lại trang.
// Mỗi thiết kế có khóa riêng: 'new' cho thiết kế mới, hoặc id thiết kế (GĐ2).
import { parseConfig } from '@ngk/shared';
import { DRAFT_PREFIX as PREFIX } from './logoutCleanup.js';

export function saveDraft(id, { config, title }) {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify({ config, title, savedAt: Date.now() }));
    return true;
  } catch {
    return false; // trình duyệt chặn bộ nhớ hoặc đầy bộ nhớ
  }
}

/** Đọc và KIỂM TRA bản nháp – dữ liệu hỏng/sửa tay sẽ bị bỏ qua. */
export function loadDraft(id, lookup) {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = parseConfig(data?.config, lookup);
    if (!parsed.ok) return null;
    const title = typeof data.title === 'string' ? data.title.slice(0, 80) : '';
    return { config: parsed.config, title, savedAt: Number(data.savedAt) || null };
  } catch {
    return null;
  }
}

export function clearDraft(id) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* bỏ qua */
  }
}
