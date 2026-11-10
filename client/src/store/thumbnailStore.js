// Hàng đợi tạo ảnh thumbnail từ cấu hình (dùng 1 canvas ẩn duy nhất, chụp lần lượt).
// Kết quả lưu trong bộ nhớ + localStorage (giữ qua các lần mở web – trước đây sessionStorage: mỗi lần mở trình duyệt lại phải
// dựng lại toàn bộ ảnh mẫu, trang chủ đứng hình). Giới hạn MAX_ENTRIES ảnh, ảnh lâu không dùng bị bỏ trước.
import { useEffect } from 'react';
import { create } from 'zustand';
import { useBakerGate } from './bakerGate.js';

const LS_KEY = 'ngk:thumbs:v3'; // đổi số khi cách chụp thay đổi → ảnh cũ không còn được dùng
const MAX_ENTRIES = 40; // ~20–40 KB mỗi ảnh WebP 360px → tối đa ~1,5 MB

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    return data && typeof data.items === 'object' ? data.items : {};
  } catch {
    return {};
  }
}
function writeCache(items) {
  // giữ MAX_ENTRIES mục dùng gần nhất (thứ tự chèn của object = thứ tự dùng – mục vừa dùng được chèn lại ở cuối)
  let keys = Object.keys(items).slice(-MAX_ENTRIES);
  while (keys.length) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ items: Object.fromEntries(keys.map((k) => [k, items[k]])) }));
      return;
    } catch {
      keys = keys.slice(Math.ceil(keys.length / 2)); // đầy bộ nhớ → bỏ bớt nửa cũ rồi thử lại
    }
  }
}

export const useThumbnailStore = create((set, get) => ({
  cache: readCache(), // key → dataURL
  queue: [], // [{ key, config }]

  request(key, config) {
    const { cache, queue } = get();
    if (cache[key] || queue.some((q) => q.key === key)) return;
    set({ queue: [...queue, { key, config }] });
    if (!useBakerGate.getState().needed) useBakerGate.setState({ needed: true }); // gốc ứng dụng mới tải khung chụp
  },
  complete(key, url) {
    const { [key]: _old, ...rest } = get().cache;
    const cache = { ...rest, [key]: url };
    writeCache(cache);
    set((s) => ({ cache, queue: s.queue.filter((q) => q.key !== key) }));
  },
}));

/** Lấy thumbnail cho một cấu hình; nếu chưa có thì xếp hàng tạo. */
export function useThumbnail(key, config) {
  const url = useThumbnailStore((s) => s.cache[key]);
  const request = useThumbnailStore((s) => s.request);
  useEffect(() => {
    if (!url && config) request(key, config);
  }, [url, key, config, request]);
  return url ?? null;
}
