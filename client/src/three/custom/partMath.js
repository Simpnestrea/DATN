// Toán học thuần cho khối tự tạo – KHÔNG phụ thuộc store/React, dùng được cả trong Web Worker.
import * as THREE from 'three';
import { buildPartGeometry, partLocalBox } from './partGeometry.js';

const D2R = Math.PI / 180;

export function partQuaternion(p) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0] * D2R, p.rot[1] * D2R, p.rot[2] * D2R, 'XYZ'));
}

export function partMatrix(p) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), partQuaternion(p), new THREE.Vector3(...p.scale));
}

// Hộp bao hình học gốc theo loại + tham số (cache vì gọi thường xuyên khi khoét)
const boxCache = new Map();
export function baseBox(kind, params) {
  const key = `${kind}|${JSON.stringify(params)}`;
  let b = boxCache.get(key);
  if (!b) {
    const g = buildPartGeometry(kind, params);
    b = partLocalBox(g);
    g.owned.forEach((x) => x.dispose());
    if (boxCache.size > 200) boxCache.clear();
    boxCache.set(key, b);
  }
  return b;
}

/**
 * Vết khoét lưu THEO TỈ LỆ hộp bao của khối (u: 1) → khi đổi kích thước khối, vết khoét co giãn theo
 * và vẫn nằm đúng trên bề mặt. Hàm này đổi vết khoét về mm thực tế của tham số hiện tại.
 * Vết cũ (không có u) đang ở mm tuyệt đối → giữ nguyên.
 */
export function carveToLocal(c, box) {
  if (!c.u) return c;
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const avg = (half.x + half.y + half.z) / 3 || 1;
  return {
    ...c,
    p: [center.x + c.p[0] * half.x, center.y + c.p[1] * half.y, center.z + c.p[2] * half.z],
    r: c.r * avg,
    d: c.d * avg,
  };
}

/** Ngược lại: mm cục bộ → tỉ lệ (dùng khi người dùng đặt vết khoét mới). */
export function carveFromLocal(c, box) {
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const avg = (half.x + half.y + half.z) / 3 || 1;
  const safe = (v) => (Math.abs(v) < 1e-6 ? 1e-6 : v);
  return {
    ...c,
    u: 1,
    p: [(c.p[0] - center.x) / safe(half.x), (c.p[1] - center.y) / safe(half.y), (c.p[2] - center.z) / safe(half.z)],
    r: c.r / avg,
    d: c.d / avg,
  };
}
