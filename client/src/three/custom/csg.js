// TẠO HÌNH KHỐI bằng CSG (thư viện three-bvh-csg, boolean trên cây BVH): tạo hình trực tiếp trên khối
// (part.shape – lưu trong toạ độ cục bộ của khối): cọ khoét (lõm tròn / khoan / vuông), làm rỗng, cắt phẳng.
// Không phá huỷ: dữ liệu gốc giữ nguyên, xoá vết khoét / tắt rỗng / tắt cắt là trở lại như cũ.
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { isShaped } from '@ngk/shared';
import { buildPartGeometry } from './partGeometry.js';
import { carveToLocal } from './partMath.js'; // thuần, không dùng store → chạy được trong Web Worker

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

const UP = new THREE.Vector3(0, 1, 0);

function clean(geo) {
  const ni = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(ni.attributes)) if (name !== 'position' && name !== 'normal') ni.deleteAttribute(name);
  if (!ni.attributes.normal) ni.computeVertexNormals();
  return ni;
}

/** Hình học khép kín phần kim loại của khối (toạ độ cục bộ). */
function solidGeometry(part) {
  const g = buildPartGeometry(part.kind, part.params);
  const metal = g.metal ? clean(g.metal) : null;
  g.owned.forEach((x) => x.dispose());
  return metal;
}

/** Brush cho một vết khoét, trong toạ độ cục bộ của khối. */
function carveBrush(c) {
  const n = new THREE.Vector3(...c.n).normalize();
  const p = new THREE.Vector3(...c.p);
  let geo;
  let center;
  // Cọ GỌT: khối cắt chạy từ độ sâu d dưới điểm bấm thẳng RA NGOÀI (về phía người nhìn) một đoạn dài OUT
  // → xoá mọi vật liệu nằm giữa người nhìn và đáy vết gọt: gọt từ ngoài vào, không bao giờ khoét rỗng bên trong.
  const OUT = Math.max(40, c.d * 4 + c.r * 4);
  if (c.s === 'scoop') {
    // dữ liệu cũ: quả cầu ăn sâu d theo pháp tuyến bề mặt
    geo = new THREE.SphereGeometry(c.r, 18, 12);
    center = p.clone().addScaledVector(n, c.r - c.d);
  } else if (c.s === 'erase') {
    // gọt tròn: hình viên nhộng, đáy bo tròn sâu đúng d
    const len = OUT + Math.max(0, c.d - c.r); // phần thân thẳng
    geo = new THREE.CapsuleGeometry(c.r, len, 8, 20);
    // tâm bán cầu đáy ở p − n·(d − r) → điểm sâu nhất đúng p − n·d
    center = p.clone().addScaledVector(n, -(c.d - c.r) + len / 2);
  } else {
    // đục thẳng (trụ) / gọt vuông (hộp): đáy phẳng ở độ sâu d
    const len = c.d + OUT;
    geo = c.s === 'drill' ? new THREE.CylinderGeometry(c.r, c.r, len, 24) : new THREE.BoxGeometry(c.r * 2, len, c.r * 2);
    center = p.clone().addScaledVector(n, -c.d + len / 2);
  }
  const b = new Brush(clean(geo));
  geo.dispose();
  b.position.copy(center);
  b.quaternion.setFromUnitVectors(UP, n);
  b.updateMatrixWorld(true);
  return b;
}

/** Áp tạo hình (part.shape) lên brush của khối – mọi thứ ở toạ độ cục bộ (brush gốc có ma trận đơn vị). */
function applyShape(brush, part) {
  const { carves, shell, slice } = part.shape;
  let result = brush;
  const sub = (other) => {
    const next = evaluator.evaluate(result, other, SUBTRACTION);
    if (result !== brush) result.geometry.dispose();
    other.geometry.dispose();
    result = next;
  };
  result.geometry.computeBoundingBox();
  const box = result.geometry.boundingBox.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  if (shell > 0) {
    // lõi bên trong = chính khối co nhỏ quanh tâm hộp bao, chừa thành dày `shell` mỗi phía
    const k = [0, 1, 2].map((i) => Math.max(0.02, (size.getComponent(i) - 2 * shell) / Math.max(1e-6, size.getComponent(i))));
    if (k.every((v) => v > 0.03)) {
      const inner = new Brush(brush.geometry.clone());
      inner.scale.set(k[0], k[1], k[2]);
      inner.position.copy(center).sub(center.clone().multiply(new THREE.Vector3(...k)));
      inner.updateMatrixWorld(true);
      sub(inner);
    }
  }
  if (slice) {
    // khối hộp rất lớn chiếm nửa không gian bị bỏ
    const i = { x: 0, y: 1, z: 2 }[slice.axis];
    const big = Math.max(size.x, size.y, size.z) * 4 + 10;
    const cutAt = box.min.getComponent(i) + slice.at * size.getComponent(i);
    const dims = [big, big, big];
    const geo = new THREE.BoxGeometry(...dims);
    const b = new Brush(clean(geo));
    geo.dispose();
    b.position.copy(center).setComponent(i, cutAt + (slice.side * big) / 2);
    b.updateMatrixWorld(true);
    sub(b);
  }
  // vết khoét lưu theo tỉ lệ hộp bao → đổi về mm của kích thước hiện tại (khối to/nhỏ, vết khoét theo)
  for (const c of carves) sub(carveBrush(carveToLocal(c, box)));
  return result;
}

/**
 * TẠO HÌNH CỘNG DỒN (dùng trong Web Worker): giữ lại kết quả của lần trước; nếu chỉ THÊM vết khoét mới
 * (phần còn lại giống hệt) thì chỉ trừ đúng các vết mới → mỗi vết khoét tốn thời gian gần như cố định,
 * không tăng dần theo số vết đã có. Các trường hợp khác (đổi kích thước, bỏ vết, làm rỗng...) tính lại từ đầu.
 * @param prev trạng thái lần trước của khối này (hoặc null)
 * @returns trạng thái mới { baseKey, done, brush, box, shaped }
 */
export function shapePartIncremental(part, prev) {
  const { shell, slice, carves } = part.shape;
  const baseKey = JSON.stringify([part.kind, part.params, shell, slice]);
  const done = carves.map((c) => JSON.stringify(c));
  const canAppend =
    prev && prev.baseKey === baseKey && prev.done.length <= done.length && prev.done.every((c, i) => c === done[i]);

  if (canAppend) {
    let brush = prev.brush;
    for (let i = prev.done.length; i < carves.length; i++) {
      const cut = carveBrush(carveToLocal(carves[i], prev.box));
      const next = evaluator.evaluate(brush, cut, SUBTRACTION);
      brush.geometry.dispose();
      cut.geometry.dispose();
      brush = next;
    }
    return { baseKey, done, brush, box: prev.box, shaped: prev.shaped || carves.length > prev.done.length };
  }

  prev?.brush.geometry.dispose();
  const geo = solidGeometry(part);
  const base = new Brush(geo);
  base.updateMatrixWorld(true);
  geo.computeBoundingBox();
  const box = geo.boundingBox.clone();
  const shaped = shell > 0 || !!slice || carves.length > 0;
  let brush = base;
  if (shaped) {
    brush = applyShape(base, part);
    if (brush !== base) base.geometry.dispose();
  }
  return { baseKey, done, brush, box, shaped };
}

/**
 * Tính lại toàn bộ (dự phòng khi trình duyệt không chạy được Web Worker).
 * @returns Map partId → BufferGeometry (toạ độ CỤC BỘ của khối) cho các khối kim loại đã được tạo hình.
 */
export function computeCuts(parts) {
  const out = new Map();
  for (const s of parts) {
    if (s.kind === 'gem' || s.hidden || !isShaped(s)) continue; // đá quý không bị khoét
    const state = shapePartIncremental(s, null);
    if (state.shaped) {
      state.brush.geometry.computeBoundingSphere();
      state.brush.geometry.computeBoundingBox();
      out.set(s.id, state.brush.geometry);
    } else state.brush.geometry.dispose();
  }
  return out;
}

/** Khóa thay đổi: chỉ tính lại khi hình dạng / vết khoét của khối thay đổi (di chuyển, xoay khối thì không). */
export function cutKey(parts) {
  const shaped = parts.filter(isShaped);
  if (!shaped.length) return '';
  return JSON.stringify(shaped.map((p) => [p.id, p.kind, p.params, p.hidden, p.shape]));
}
