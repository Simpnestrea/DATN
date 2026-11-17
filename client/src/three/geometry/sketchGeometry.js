// ĐÙN HÌNH VẼ 2D thành khối: các đường viền khép kín (mm, mặt phẳng XY) → khối dày `depth` theo trục Z, tâm tại z = 0.
// Đường viền nằm trong đường viền khác thành LỖ (lồng nhau chẵn/lẻ như chữ O, Ô). Bo cạnh tròn `bevel` không làm to
// hình: viền ngoài cùng đúng nét vẽ, mặt trước/sau co vào một đoạn bằng `bevel`.
// Thuần three.js (không dùng store/DOM) → dùng được trong Web Worker tạo hình CSG.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// góc gãy lớn hơn mức này giữ cạnh sắc (đỉnh sao, góc chữ nhật, mép không bo); nhỏ hơn → bóng mượt (nét cong, phần bo)
const CREASE = (38 * Math.PI) / 180;

/** Điểm (x, y) có nằm trong đa giác không (tia ngang, chẵn/lẻ). */
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function box2(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Đường viền `inner` nằm TRỌN trong `outer` (thử tối đa ~24 điểm rải đều trên inner). */
function containsPath(outer, ob, inner, ib) {
  if (ib.minX < ob.minX || ib.maxX > ob.maxX || ib.minY < ob.minY || ib.maxY > ob.maxY) return false;
  const step = Math.max(1, Math.floor(inner.length / 24));
  for (let i = 0; i < inner.length; i += step) {
    const p = inner[i];
    const q = inner[(i + 1) % inner.length];
    // trung điểm cạnh – ít trùng đúng lên cạnh của hình kia hơn đỉnh
    if (!pointInPolygon((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, outer)) return false;
  }
  return true;
}

/**
 * Độ lồng của từng đường viền: đếm số đường viền chứa TRỌN nó – chẵn = khối đặc, lẻ = lỗ của đường viền nhỏ nhất
 * chứa nó (`parent` = chỉ số, -1 nếu không phải lỗ). Hai hình chỉ chồng một phần lên nhau → cả hai đều đặc (nhập vào nhau).
 */
export function nestPaths(paths, rule = 'evenodd') {
  if (rule === 'nonzero') return nestNonZero(paths);
  const area = paths.map((pts) => Math.abs(polygonArea(pts)));
  const boxes = paths.map(box2);
  return paths.map((pts, i) => {
    const parents = [];
    for (let j = 0; j < paths.length; j++) if (j !== i && area[j] > area[i] && containsPath(paths[j], boxes[j], pts, boxes[i])) parents.push(j);
    const hole = parents.length % 2 === 1;
    // cha trực tiếp của lỗ = đường viền chứa nó có diện tích nhỏ nhất
    const parent = hole ? parents.reduce((m, j) => (area[j] < area[m] ? j : m)) : -1;
    return { hole, parent };
  });
}

// đổi độ dày / bo cạnh (kéo thanh trượt) không đổi đường viền → giữ lại kết quả xếp lỗ của bản vẽ gần nhất
let lastShapes = { key: '', shapes: null };

/**
 * Quy tắc theo CHIỀU NÉT (dùng cho chữ từ font): đường viền ngược chiều với đường viền trực tiếp chứa nó = lỗ;
 * cùng chiều = phần đặc chồng lên (nét viết tay chồng nhau) – không bị khoét nhầm như quy tắc chẵn/lẻ.
 * @returns [{ hole, parent, skip }] – skip = đường viền bỏ qua (cùng chiều với một lỗ: phần lỗ chồng lỗ)
 */
function nestNonZero(paths) {
  const signed = paths.map(polygonArea);
  const area = signed.map(Math.abs);
  const boxes = paths.map(box2);
  const order = paths.map((_, i) => i).sort((a, b) => area[b] - area[a]); // lớn trước → cha luôn được xét trước con
  const out = paths.map(() => ({ hole: false, parent: -1, skip: false }));
  for (const i of order) {
    let parent = -1;
    for (const j of order) {
      if (j === i || area[j] <= area[i] || out[j].skip) continue;
      if ((parent < 0 || area[j] < area[parent]) && containsPath(paths[j], boxes[j], paths[i], boxes[i])) parent = j;
    }
    if (parent < 0) continue; // không nằm trong gì → phần đặc
    const opposite = Math.sign(signed[i]) !== Math.sign(signed[parent]);
    if (out[parent].hole) {
      if (opposite) continue; // đảo trong lỗ → phần đặc mới
      out[i].skip = true;
    } else if (opposite) {
      out[i].hole = true;
      out[i].parent = parent;
    }
    // cùng chiều với phần đặc chứa nó → phần đặc chồng lên (để nguyên là khối đặc riêng)
  }
  return out;
}

/** Xếp các đường viền thành THREE.Shape có lỗ (xem nestPaths). */
export function sketchShapes(paths, rule = 'evenodd') {
  const key = rule + JSON.stringify(paths);
  if (lastShapes.key === key) return lastShapes.shapes;
  const nest = nestPaths(paths, rule);
  const toVec = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const shapes = new Map();
  paths.forEach((pts, i) => !nest[i].hole && !nest[i].skip && shapes.set(i, new THREE.Shape(toVec(pts))));
  paths.forEach((pts, i) => nest[i].hole && shapes.get(nest[i].parent)?.holes.push(new THREE.Path(toVec(pts))));
  lastShapes = { key, shapes: [...shapes.values()] };
  return lastShapes.shapes;
}

/** Khối đùn từ hình vẽ – trả về BufferGeometry (pháp tuyến mượt theo góc gãy), tâm theo Z. */
export function buildSketchGeometry(paths, depth, bevel, rule = 'evenodd') {
  // bo cạnh co mặt trước/sau vào trong một đoạn = bevel → nét mảnh hơn 2×bevel sẽ bị lộn mặt; giới hạn theo hình hẹp nhất
  let narrow = Infinity;
  for (const pts of paths) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    narrow = Math.min(narrow, maxX - minX, maxY - minY);
  }
  const b = Math.max(0, Math.min(bevel, depth / 2 - 0.02, narrow * 0.2));
  const core = Math.max(0.02, depth - 2 * b);
  const geo = new THREE.ExtrudeGeometry(sketchShapes(paths, rule), {
    depth: core,
    bevelEnabled: b > 0.005,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b, // viền ngoài cùng đúng nét vẽ, không phình ra
    bevelSegments: b > 0.005 ? 4 : 0,
    curveSegments: 1, // đường viền đã là các điểm dày sẵn
  });
  geo.translate(0, 0, -core / 2);
  // ExtrudeGeometry tính pháp tuyến theo từng mặt tam giác → viền cong bị gợn từng mảng phẳng; làm mượt theo góc gãy
  const smooth = toCreasedNormals(geo, CREASE);
  geo.dispose();
  smooth.deleteAttribute('uv');
  return smooth;
}
