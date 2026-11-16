// WEB WORKER tính CSG (khoét / làm rỗng / cắt phẳng) ở LUỒNG NỀN → giao diện không bao giờ bị đứng hình.
//  - Tạo hình CỘNG DỒN theo từng khối: thêm vết khoét chỉ trừ đúng vết mới (không tính lại cả khối).
//  - Bộ nhớ đệm kết quả theo khóa: quay lại trạng thái cũ (Undo/Redo) trả kết quả ngay.
import { shapePartIncremental } from './csg.js';

const shapeState = new Map(); // partId → trạng thái tạo hình cộng dồn (giữ brush kết quả)
const resultCache = new Map(); // khóa đầy đủ → { position, normal, carves }
const MAX_CACHE = 120;

// tạo hình nằm trong toạ độ cục bộ của khối → vị trí / xoay khối không ảnh hưởng kết quả
const fullKey = (s) => JSON.stringify([s.kind, s.params, s.shape]);

/**
 * Tính hình đã gọt của một khối. Nếu phép CSG cộng dồn lỗi (hình học quá phức tạp / suy biến) → bỏ trạng thái cũ,
 * tính lại từ đầu; vẫn lỗi → bỏ qua dần các vết gọt mới nhất cho tới khi tính được. Luôn trả về đủ số vết
 * (`carves`) để luồng chính xoá vệt đỏ "đang chờ" – không bao giờ để vệt đỏ kẹt lại.
 */
function computeEntry(s) {
  const pack = (state, failed) => {
    const geometry = state.shaped ? state.brush.geometry : null;
    return {
      position: geometry ? geometry.attributes.position.array.slice() : null,
      normal: geometry ? geometry.attributes.normal.array.slice() : null,
      carves: s.shape.carves.length,
      failed,
    };
  };
  try {
    const state = shapePartIncremental(s, shapeState.get(s.id) ?? null);
    shapeState.set(s.id, state);
    return pack(state, false);
  } catch {
    shapeState.get(s.id)?.brush.geometry.dispose();
    shapeState.delete(s.id);
  }
  // thử lại từ đầu, bớt dần vết gọt cuối
  for (let keep = s.shape.carves.length; keep >= 0; keep--) {
    try {
      const trimmed = { ...s, shape: { ...s.shape, carves: s.shape.carves.slice(0, keep) } };
      const state = shapePartIncremental(trimmed, null);
      shapeState.set(s.id, state);
      return pack(state, keep < s.shape.carves.length);
    } catch {
      /* thử ít vết hơn */
    }
  }
  return { position: null, normal: null, carves: s.shape.carves.length, failed: true };
}

function remember(key, entry) {
  if (resultCache.size >= MAX_CACHE) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, entry);
}

self.onmessage = (e) => {
  const { reqId, parts } = e.data;
  const t0 = performance.now();

  const results = [];
  const failed = [];
  const transfers = [];
  const alive = new Set();
  try {
    for (const s of parts) {
      if (s.kind === 'gem' || s.hidden) continue;
      const shaped = s.shape.carves.length > 0 || s.shape.shell > 0 || !!s.shape.slice;
      if (!shaped) continue;
      alive.add(s.id);
      const key = fullKey(s);

      let entry = resultCache.get(key);
      if (!entry) {
        entry = computeEntry(s);
        remember(key, entry);
        if (entry.failed) failed.push(s.id);
      }
      if (entry.position) {
        // gửi bản sao và CHUYỂN quyền (transfer) để không phải sao chép thêm lần nữa khi gửi về luồng chính
        const position = entry.position.slice();
        const normal = entry.normal.slice();
        transfers.push(position.buffer, normal.buffer);
        results.push({ id: s.id, position, normal, carves: entry.carves });
      } else {
        results.push({ id: s.id, position: null, normal: null, carves: entry.carves }); // để luồng chính xoá vệt chờ
      }
    }
  } catch (err) {
    self.postMessage({ reqId, error: String(err?.message ?? err) });
    return;
  }
  // giải phóng trạng thái của khối đã bị xoá / không còn tạo hình
  for (const [id, st] of shapeState) {
    if (!alive.has(id)) {
      st.brush.geometry.dispose();
      shapeState.delete(id);
    }
  }
  self.postMessage({ reqId, results, failed, ms: Math.round(performance.now() - t0) }, transfers);
};
