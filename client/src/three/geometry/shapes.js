// Hình dạng 2D cho mặt dây & charm (trong mặt phẳng XY, cao = 1 đơn vị, tâm tại gốc).
import * as THREE from 'three';

const TAU = Math.PI * 2;

function sample(fn, n) {
  return Array.from({ length: n }, (_, i) => fn((i / n) * TAU));
}

function normalizeHeight(pts) {
  const ys = pts.map((p) => p[1]);
  const xs = pts.map((p) => p[0]);
  const h = Math.max(...ys) - Math.min(...ys);
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  return pts.map(([x, y]) => [(x - cx) / h, (y - cy) / h]);
}

const OUTLINES = {
  round: () => sample((t) => [Math.cos(t) * 0.5, Math.sin(t) * 0.5], 72),
  // giọt nước: đầu nhọn hướng lên (nơi gắn móc)
  teardrop: () => normalizeHeight(sample((t) => [Math.sin(t) * Math.sin(t / 2) * 0.62, Math.cos(t)], 72)),
  heart: () =>
    normalizeHeight(
      sample(
        (t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)],
        96,
      ),
    ),
  star: () =>
    normalizeHeight(
      Array.from({ length: 10 }, (_, i) => {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.46;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }),
    ),
  bar: () => {
    const w = 0.13;
    const h = 0.5;
    const c = 0.07;
    const pts = [];
    const corner = (cx, cy, start) => {
      for (let i = 0; i <= 6; i++) {
        const a = start + (i / 6) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * c, cy + Math.sin(a) * c]);
      }
    };
    corner(w - c, h - c, 0);
    corner(-w + c, h - c, Math.PI / 2);
    corner(-w + c, -h + c, Math.PI);
    corner(w - c, -h + c, (3 * Math.PI) / 2);
    return pts;
  },
};

// Vị trí tâm đá chủ (theo tỉ lệ chiều cao) và hệ số lỗ khi làm rỗng
export const SHAPE_META = {
  round: { gemY: 0, hole: 0.7 },
  teardrop: { gemY: -0.14, hole: 0.62 },
  heart: { gemY: 0.06, hole: 0.64 },
  star: { gemY: 0.03, hole: 0.5 },
  bar: { gemY: 0.28, hole: 0 },
};

/** Đường viền (mảng [x, y]) đã nhân theo kích thước `size` (mm). */
export function shapeOutline(code, size) {
  const fn = OUTLINES[code] ?? OUTLINES.round;
  return fn().map(([x, y]) => [x * size, y * size]);
}

/** THREE.Shape (có lỗ nếu hollow) để đùn khối. */
export function buildShape(code, size, hollow = false) {
  const outline = shapeOutline(code, size);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const meta = SHAPE_META[code] ?? SHAPE_META.round;
  if (hollow && meta.hole > 0) {
    // tâm co lỗ: trọng tâm hình (giúp viền đều hơn với tim/giọt nước)
    const [cx, cy] = centroid(outline);
    shape.holes.push(
      new THREE.Path(outline.map(([x, y]) => new THREE.Vector2(cx + (x - cx) * meta.hole, cy + (y - cy) * meta.hole))),
    );
  }
  return shape;
}

export function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** Khối đùn có vát cạnh, tâm theo trục Z. */
export function buildExtruded(code, size, thickness, hollow = false) {
  const shape = buildShape(code, size, hollow);
  const bevel = Math.min(size * 0.04, thickness * 0.35, 0.7);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();
  return { geometry: geo, bevel, front: thickness / 2 + bevel };
}

export function outlineBounds(outline) {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
