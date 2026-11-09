// Tiện ích xử lý đa giác 2D khép kín (mảng [x, z]).

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Đảm bảo đa giác có diện tích dương (ngược chiều kim đồng hồ trong hệ x–z). */
export function ensurePositive(pts) {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

export function perimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    p += Math.hypot(x2 - x1, z2 - z1);
  }
  return p;
}

/** Dịch đa giác ra ngoài (d > 0) hoặc vào trong (d < 0) theo pháp tuyến đỉnh. */
export function offsetPolygon(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    // pháp tuyến ngoài của cạnh (a→b) với đa giác diện tích dương: (dz, -dx)
    const n1 = normal2(prev, cur);
    const n2 = normal2(cur, next);
    let nx = n1[0] + n2[0];
    let nz = n1[1] + n2[1];
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    // bù góc để khoảng cách thực bằng d (giới hạn để tránh nhọn quá)
    const cos = Math.max(0.35, nx * n1[0] + nz * n1[1]);
    out.push([cur[0] + (nx * d) / cos, cur[1] + (nz * d) / cos]);
  }
  return out;
}

function normal2(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return [dz / len, -dx / len];
}

/** Lấy mẫu `count` điểm cách đều nhau trên chu vi đa giác. */
export function resampleClosed(pts, count) {
  const total = perimeter(pts);
  const step = total / count;
  const out = [];
  let seg = 0;
  let segStart = 0;
  const segLen = (i) => {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (segStart + segLen(seg) < target && seg < pts.length - 1) {
      segStart += segLen(seg);
      seg++;
    }
    const a = pts[seg];
    const b = pts[(seg + 1) % pts.length];
    const t = (target - segStart) / (segLen(seg) || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Khoảng cách từ tâm tới cạnh đa giác theo hướng góc `angle` (tia từ gốc tọa độ). */
export function rayDistance(pts, angle) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const ex = x2 - x1;
    const ez = z2 - z1;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (x1 * ez - z1 * ex) / den;
    const u = (x1 * dz - z1 * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0.5;
}
