// Studio → trang bảng thông số in (/in-thong-so): gửi bản đang mở (kể cả chưa lưu) qua localStorage – tab mới đọc được.
import { PRINT_KEY } from './logoutCleanup.js'; // khoá dùng chung – đăng xuất thì xoá

export { PRINT_KEY };

/** @returns false nếu trình duyệt chặn localStorage */
export function openStudioSheet(payload) {
  try {
    localStorage.setItem(PRINT_KEY, JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    return false;
  }
  window.open('/in-thong-so?src=studio&auto=1', '_blank', 'noopener');
  return true;
}
