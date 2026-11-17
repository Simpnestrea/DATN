// Toán học 2D cho bảng vẽ: làm mượt nét vẽ tay, giảm điểm, hình mẫu, biến đổi, kiểm tra nét tự cắt.
// Điểm là [x, y] (mm, trục y hướng lên).
import { SKETCH_LIMITS } from '@ngk/shared';
import { shapeOutline } from '../../../../three/geometry/shapes.js';
import { nestPaths, pointInPolygon, polygonArea } from '../../../../three/geometry/sketchGeometry.js';

export { pointInPolygon, polygonArea };

const r3 = (n) => Math.round(n * 1000) / 1000;
export const roundPts = (pts) => pts.map(([x, y]) => [r3(x), r3(y)]);

export function bounds(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export const boundsOfPaths = (paths) => bounds(paths.flatMap((p) => p.pts));

/** Khoảng cách từ điểm tới đoạn thẳng ab. */
export function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolygon(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(px, py, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

/** Giảm điểm Ramer–Douglas–Peucker (đường hở). */
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1;
    let bestD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i][0], pts[i][1], pts[s], pts[e]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Giảm điểm cho đường KHÉP KÍN: tách ở điểm xa điểm đầu nhất để hai nửa đều được giữ hình. */
export function simplifyClosed(pts, tol) {
  if (pts.length < 8) return pts;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = rdp(pts.slice(0, far + 1), tol);
  const b = rdp([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Làm mượt Chaikin cho đường khép kín (mỗi lần lặp nhân đôi số điểm, bo tròn các góc gãy của nét tay). */
export function chaikinClosed(pts, iterations = 2) {
  let cur = pts;
  for (let k = 0; k < iterations; k++) {
    const next = [];
    for (let i = 0; i < cur.length; i++) {
      const [ax, ay] = cur[i];
      const [bx, by] = cur[(i + 1) % cur.length];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    cur = next;
  }
  return cur;
}

/** Hai đoạn ab và cd có cắt nhau (không tính chung đầu mút). */
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Giao điểm của hai đoạn ab, cd (đã biết là cắt nhau). */
function crossPoint(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  const t = den ? ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den : 0.5;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/**
 * Tách nét khép kín TỰ CẮT thành các vòng đơn (hình số 8 → 2 vòng): đi dọc nét, hễ đoạn mới cắt một đoạn cũ
 * thì phần nét giữa hai lần đi qua giao điểm thành một vòng riêng. Nét không tự cắt → trả về nguyên [pts].
 */
export function splitSelfIntersections(pts) {
  if (pts.length < 4 || pts.length > 3000) return [pts];
  const loops = [];
  let cur = [pts[0]];
  const seq = [...pts.slice(1), pts[0]]; // đi hết vòng, kể cả đoạn khép về điểm đầu
  for (const q of seq) {
    const p = cur[cur.length - 1];
    let cut = -1;
    // tìm đoạn cũ (không kề) bị đoạn p→q cắt – lấy đoạn GẦN NHẤT phía sau để tách vòng nhỏ nhất
    for (let j = cur.length - 3; j >= 0; j--) {
      if (segmentsCross(cur[j], cur[j + 1], p, q)) {
        cut = j;
        break;
      }
    }
    if (cut >= 0) {
      const x = crossPoint(cur[cut], cur[cut + 1], p, q);
      loops.push([x, ...cur.slice(cut + 1)]);
      cur = [...cur.slice(0, cut + 1), x];
    }
    cur.push(q);
  }
  cur.pop(); // điểm cuối = điểm đầu
  loops.push(cur);
  return loops.filter((l) => l.length >= 3);
}

/** Đường khép kín có tự cắt chéo qua chính nó không (hình số 8) – khối đùn từ hình như vậy sẽ bị lỗi mặt. */
export function selfIntersects(pts) {
  const n = pts.length;
  if (n < 4 || n > 3000) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // hai cạnh kề nhau qua điểm đầu
      if (segmentsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Nét vẽ tay (các điểm chuột, mm) → các đường viền khép kín gọn: bỏ rung tay, tách chỗ nét tự cắt thành vòng riêng,
 * bo mượt, giữ số điểm vừa phải.
 * @param px1 kích thước 1 điểm ảnh tính theo mm (độ phóng hiện tại) – sai số giảm điểm tính theo màn hình.
 * @returns mảng các đường viền (rỗng nếu nét quá nhỏ).
 */
export function finishFreehand(raw, px1) {
  if (raw.length < 6) return [];
  const pts = simplifyClosed(raw, px1 * 0.8); // bỏ rung tay
  if (pts.length < 3) return [];
  // vòng nhỏ hơn ~6×6 điểm ảnh (nút thắt do rung tay ở chỗ nét khép lại) → bỏ
  return splitSelfIntersections(pts)
    .filter((l) => Math.abs(polygonArea(l)) > 36 * px1 * px1)
    .map((l) => smoothLoop(l, px1))
    .filter(Boolean);
}

function smoothLoop(loop, px1) {
  let pts = chaikinClosed(loop, 2);
  pts = simplifyClosed(pts, Math.max(0.005, px1 * 0.15));
  // vẫn quá nhiều điểm → thưa bớt đều
  const max = Math.min(SKETCH_LIMITS.points, 600);
  if (pts.length > max) {
    const step = pts.length / max;
    pts = Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]);
  }
  const b = bounds(pts);
  if (Math.abs(polygonArea(pts)) < 0.05 || b.w < 0.2 || b.h < 0.2) return null;
  return roundPts(pts);
}

// ── Hình mẫu (danh sách nút: SketchEditor.jsx) ─────────────────────────────────────────────────

/** Đường viền đơn vị (gần đúng trong hộp [-0.5, 0.5]²) của hình mẫu. */
function unitTemplate(code, { sides = 6, points = 5, inner = 0.45 } = {}) {
  const TAU = Math.PI * 2;
  switch (code) {
    case 'circle':
      return Array.from({ length: 72 }, (_, i) => [Math.cos((i / 72) * TAU) * 0.5, Math.sin((i / 72) * TAU) * 0.5]);
    case 'rect':
      return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'polygon':
      return Array.from({ length: sides }, (_, i) => {
        const a = Math.PI / 2 + (i / sides) * TAU;
        return [Math.cos(a) * 0.5, Math.sin(a) * 0.5];
      });
    case 'star':
      return Array.from({ length: points * 2 }, (_, i) => {
        const a = Math.PI / 2 + (i / (points * 2)) * TAU;
        const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
    case 'heart':
    case 'teardrop':
      return shapeOutline(code, 1);
    default:
      return unitTemplate('circle');
  }
}

/** Hình mẫu vừa khít hộp (x0, y0)–(x1, y1) (mm). `keep` = giữ tỉ lệ gốc của hình (vuông / tròn đều). */
export function templateIn(code, x0, y0, x1, y1, opts) {
  const unit = unitTemplate(code, opts);
  const ub = bounds(unit);
  let w = Math.abs(x1 - x0);
  let h = Math.abs(y1 - y0);
  if (opts?.keep) {
    const s = Math.max(w / ub.w, h / ub.h);
    w = ub.w * s;
    h = ub.h * s;
  }
  // hộp theo hướng kéo chuột (kéo sang trái / xuống dưới vẫn đúng)
  const cx = x0 + (Math.sign(x1 - x0) || 1) * (w / 2);
  const cy = y0 + (Math.sign(y1 - y0) || 1) * (h / 2);
  return roundPts(unit.map(([x, y]) => [cx + ((x - ub.cx) / ub.w) * w, cy + ((y - ub.cy) / ub.h) * h]));
}

// ── Biến đổi ────────────────────────────────────────────────────────────────────────────────────
export const translatePts = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const scalePts = (pts, ox, oy, sx, sy) => pts.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
export function rotatePts(pts, ox, oy, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

/**
 * Kéo mềm một điểm: các điểm lân cận (trong bán kính `radius` mm quanh điểm đang kéo) đi theo, giảm dần theo
 * khoảng cách – nắn được nét vẽ tay dày điểm mà không tạo gai nhọn.
 */
export function softDrag(orig, index, dx, dy, radius) {
  const [ox, oy] = orig[index];
  return orig.map(([x, y], i) => {
    if (i === index) return [x + dx, y + dy];
    if (radius <= 0) return [x, y];
    const d = Math.hypot(x - ox, y - oy);
    if (d >= radius) return [x, y];
    const t = 1 - d / radius;
    const w = t * t * (3 - 2 * t); // smoothstep
    return [x + dx * w, y + dy * w];
  });
}

/**
 * Vai trò từng đường viền giống hệt khi đùn khối (xem sketchShapes): lỗ = nằm trong số lẻ đường viền khác.
 * @returns Map id → { hole: boolean, parent: id|null }
 */
export function classifyPaths(paths) {
  const nest = nestPaths(paths.map((p) => p.pts));
  return new Map(paths.map((p, i) => [p.id, { hole: nest[i].hole, parent: nest[i].hole ? paths[nest[i].parent].id : null }]));
}
