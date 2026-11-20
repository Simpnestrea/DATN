// DỌN DỮ LIỆU KHI ĐĂNG XUẤT (máy dùng chung – vd. máy chiếu lúc bảo vệ đồ án): người dùng sau không đọc được thiết kế của
// người trước trong trình duyệt (localStorage) hay trong bộ nhớ trang. Module nhỏ ở gói chính: các phần tải riêng (Studio…)
// tự đăng ký việc của mình qua beforeLogout / afterLogout → kho đăng nhập không phải nạp code của chúng.

export const DRAFT_PREFIX = 'ngk:draft:'; // bản nháp thiết kế: ngk:draft:new (chưa lưu) · ngk:draft:<id> (đã lưu lên máy chủ)
export const PRINT_KEY = 'ngk:print'; // bản thiết kế gửi sang trang in bảng thông số
const SERVER_DRAFT = /^ngk:draft:[a-f0-9]{24}$/;

const before = new Set();
const after = new Set();

/** `fn` chạy TRƯỚC khi gọi API đăng xuất (vd. gửi nốt thay đổi chưa đồng bộ). Trả về id thiết kế cần GIỮ bản nháp trên máy. */
export const beforeLogout = (fn) => before.add(fn);
/** `fn` chạy SAU khi đăng xuất (vd. đưa thiết kế của người vừa đăng xuất ra khỏi bộ nhớ). */
export const afterLogout = (fn) => after.add(fn);

/** @returns tập id thiết kế cần giữ bản nháp (thay đổi chưa gửi được lên máy chủ – xoá đi là mất bài) */
export async function runBeforeLogout() {
  const keep = new Set();
  for (const fn of before) {
    try {
      const id = await fn();
      if (id) keep.add(id);
    } catch {
      /* việc phụ – không chặn đăng xuất */
    }
  }
  return keep;
}

export function runAfterLogout() {
  for (const fn of after) {
    try {
      fn();
    } catch {
      /* việc phụ – không chặn đăng xuất */
    }
  }
}

/**
 * Xoá bản nháp của các thiết kế ĐÃ lưu lên máy chủ (trên máy chủ vẫn còn nguyên) + bản in thông số tạm. Giữ bản nháp thiết kế
 * mới chưa lưu ('new') và các thiết kế trong `keep`.
 */
export function clearAccountDrafts(keep = new Set()) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of keys) {
      if (k === PRINT_KEY || (SERVER_DRAFT.test(k) && !keep.has(k.slice(DRAFT_PREFIX.length)))) localStorage.removeItem(k);
    }
  } catch {
    /* trình duyệt chặn bộ nhớ */
  }
}
