// Đường cong của dây chuyền (vòng cổ) và lắc tay.
import * as THREE from 'three';

const NECK_HALF_WIDTH = 58; // nửa bề ngang cổ (mm)
const NECK_DEPTH = 64; // độ sâu phần dây vòng ra sau gáy (mm)

/**
 * Dây chuyền đeo trên cổ, nhìn chính diện: điểm θ = 0 ở sau gáy (khóa), θ = π ở đáy trước ngực.
 * Độ võng `drop` được giải sao cho chiều dài đường cong ≈ chiều dài dây.
 */
function necklacePoints(drop, n = 96) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const down = (1 - Math.cos(t)) / 2; // 0 ở gáy → 1 ở đáy
    // phần dưới hơi chữ V do sức nặng của mặt dây
    const x = NECK_HALF_WIDTH * Math.sin(t) * (1 - 0.18 * down ** 3);
    const y = -drop * down ** 1.15;
    const z = -NECK_DEPTH * ((1 + Math.cos(t)) / 2);
    return new THREE.Vector3(x, y, z);
  });
}

export function buildNecklaceCurve(lengthMm) {
  let lo = 0;
  let hi = lengthMm;
  let curve = null;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    curve = new THREE.CatmullRomCurve3(necklacePoints(mid), true, 'centripetal');
    if (curve.getLength() < lengthMm) lo = mid;
    else hi = mid;
  }
  return curve;
}

/** Lắc tay nằm phẳng (mặt XZ), tâm gốc toạ độ. */
export function buildCircleCurve(circumference) {
  const r = circumference / (Math.PI * 2);
  const pts = Array.from({ length: 64 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(t) * r, 0, Math.cos(t) * r);
  });
  return new THREE.CatmullRomCurve3(pts, true);
}
