// Dựng viên đá giác cắt hoàn toàn bằng code (không cần file 3D).
//
// Ý tưởng: mọi giác cắt đều được mô tả bằng "đường viền gờ" (girdle outline) 2D.
// Từ đường viền đó dựng: mặt bàn (table) → các mặt vương miện (crown) → gờ (girdle)
// → các mặt đáy (pavilion) → đỉnh đáy (culet). Các mặt phẳng + flat shading tạo hiệu ứng giác.
// Đơn vị: viên đá có chiều RỘNG = 1 (theo trục x), chiều dài = aspect (trục z), mặt bàn hướng +Y.
import * as THREE from 'three';
import { ensurePositive } from './outline.js';

const TAU = Math.PI * 2;

function circle(n, rx = 0.5, rz = 0.5) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    return [Math.cos(a) * rx, Math.sin(a) * rz];
  });
}

function pearOutline(n = 20) {
  // teardrop: x = sin t · sin(t/2), z = -cos t  (đầu nhọn ở -z)
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    return [Math.sin(t) * Math.sin(t / 2), -Math.cos(t)];
  });
  const maxX = Math.max(...raw.map((p) => Math.abs(p[0])));
  return raw.map(([x, z]) => [(x / maxX) * 0.5, z * 0.75]);
}

function heartOutline(n = 28) {
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x, -y]; // mũi tim hướng +z
  });
  const xs = raw.map((p) => p[0]);
  const zs = raw.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const zMid = (Math.max(...zs) + Math.min(...zs)) / 2;
  return raw.map(([x, z]) => [x / w, (z - zMid) / w]);
}

function chamferRect(w, l, c) {
  const hw = w / 2;
  const hl = l / 2;
  return [
    [-hw + c, -hl],
    [hw - c, -hl],
    [hw, -hl + c],
    [hw, hl - c],
    [hw - c, hl],
    [-hw + c, hl],
    [-hw, hl - c],
    [-hw, -hl + c],
  ];
}

// Tỷ lệ của từng giác cắt (theo chiều rộng = 1)
const PROFILES = {
  round: { outline: () => circle(16), table: 0.56, crown: 0.16, girdle: 0.03, pavilion: 0.43 },
  oval: { outline: () => circle(18, 0.5, 0.675), table: 0.56, crown: 0.15, girdle: 0.03, pavilion: 0.42 },
  princess: {
    outline: () => [
      [-0.5, -0.5], [0, -0.5], [0.5, -0.5], [0.5, 0], [0.5, 0.5], [0, 0.5], [-0.5, 0.5], [-0.5, 0],
    ],
    table: 0.7, crown: 0.1, girdle: 0.03, pavilion: 0.52,
  },
  emerald: { outline: () => chamferRect(1, 1.4, 0.16), table: 0.64, crown: 0.12, girdle: 0.03, pavilion: 0.4 },
  pear: { outline: () => pearOutline(20), table: 0.54, crown: 0.15, girdle: 0.03, pavilion: 0.42 },
  heart: { outline: () => heartOutline(28), table: 0.56, crown: 0.14, girdle: 0.03, pavilion: 0.42 },
};

export function getGemProfile(cut) {
  const p = PROFILES[cut] ?? PROFILES.round;
  return { ...p, outline: ensurePositive(p.outline()) };
}

/** Kích thước thực (mm) của viên đá – dùng để đặt ổ chấu, halo, chỗ gắn. */
export function getGemMetrics(cut, sizeMm, isPearl = false) {
  if (isPearl) {
    return {
      width: sizeMm,
      length: sizeMm,
      crownH: sizeMm * 0.5,
      pavilionH: sizeMm * 0.5,
      outline: circle(24).map(([x, z]) => [x * sizeMm, z * sizeMm]),
    };
  }
  const p = getGemProfile(cut);
  const zs = p.outline.map((q) => q[1]);
  return {
    width: sizeMm,
    length: (Math.max(...zs) - Math.min(...zs)) * sizeMm,
    crownH: (p.crown + p.girdle / 2) * sizeMm,
    pavilionH: (p.pavilion + p.girdle / 2) * sizeMm,
    outline: p.outline.map(([x, z]) => [x * sizeMm, z * sizeMm]),
  };
}

function buildFaceted(profile) {
  const { outline: pts, table, crown, girdle, pavilion } = profile;
  const n = pts.length;
  const gTop = pts.map(([x, z]) => [x, girdle / 2, z]);
  const gBot = pts.map(([x, z]) => [x, -girdle / 2, z]);
  const mid = (i, k, y) => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    return [((a[0] + b[0]) / 2) * k, y, ((a[1] + b[1]) / 2) * k];
  };
  const T = pts.map((_, i) => mid(i, table, crown + girdle / 2)); // vành mặt bàn (lệch nửa bước → mặt sao)
  const P = pts.map((_, i) => mid(i, 0.48, -girdle / 2 - pavilion * 0.55)); // vành giữa đáy
  const tableCenter = [0, crown + girdle / 2, 0];
  const culet = [0, -girdle / 2 - pavilion, 0];

  const positions = [];
  const center = new THREE.Vector3(0, 0, 0);
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const cen = new THREE.Vector3();

  // thêm tam giác và tự xoay chiều để pháp tuyến hướng ra ngoài
  const tri = (a, b, c) => {
    va.fromArray(a);
    vb.fromArray(b);
    vc.fromArray(c);
    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    nrm.crossVectors(e1, e2);
    cen.copy(va).add(vb).add(vc).divideScalar(3).sub(center);
    if (nrm.dot(cen) < 0) positions.push(...a, ...c, ...b);
    else positions.push(...a, ...b, ...c);
  };

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const iPrev = (i - 1 + n) % n;
    // mặt bàn
    tri(tableCenter, T[i], T[j]);
    // vương miện
    tri(gTop[i], gTop[j], T[i]);
    tri(T[iPrev], gTop[i], T[i]);
    // gờ
    tri(gBot[i], gTop[i], gTop[j]);
    tri(gBot[i], gTop[j], gBot[j]);
    // đáy
    tri(gBot[i], gBot[j], P[i]);
    tri(P[iPrev], gBot[i], P[i]);
    tri(P[iPrev], P[i], culet);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals(); // không dùng index → mỗi mặt phẳng có pháp tuyến riêng (flat)
  geo.computeBoundingSphere();
  return geo;
}

// Cache hình học đơn vị theo giác cắt – mọi viên đá cùng giác dùng chung 1 geometry, chỉ đổi scale
const cache = new Map();

export function getUnitGemGeometry(cut, isPearl = false) {
  const key = isPearl ? 'pearl' : cut;
  if (!cache.has(key)) {
    const geo = isPearl ? new THREE.SphereGeometry(0.5, 48, 32) : buildFaceted(getGemProfile(cut));
    cache.set(key, geo);
  }
  return cache.get(key);
}
