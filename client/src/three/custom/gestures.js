// THAO TÁC KÉO bằng chuột trong trình dựng hình tự tạo (toán học thuần, không phụ thuộc React):
//  - Xoay tự do 360° quanh tâm cụm khối (kéo ngang = xoay quanh trục dọc màn hình, kéo dọc = trục ngang)
//  - Kéo giãn theo điểm: bấm vào mặt nào thì mặt đó đi theo chuột, mặt đối diện đứng yên
//  - Chọn vùng: khung chữ nhật trên màn hình → các khối có tâm nằm trong khung
import * as THREE from 'three';
import { partMatrix } from './customOps.js';

const SNAP_ANGLE = (15 * Math.PI) / 180;

/** Hộp bao của khối trong toạ độ cục bộ của chính nó (chưa tính co giãn của khối). */
export function localBox(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)));
  });
  return box;
}

// ---------------------------------------------------------------- XOAY TỰ DO (ARCBALL)
// Cách làm giống Blender (R→R) / 3ds Max / Maya – "arcball" của Shoemake:
//  - Một quả cầu ảo đặt tại tâm khối trên màn hình. Kéo TRONG vòng tròn = lăn quả cầu (xoay tự do 2 chiều),
//    kéo NGOÀI vòng tròn = xoay quanh hướng nhìn (roll). Hai kiểu kết hợp → đạt được MỌI hướng.
//  - Xoay CỘNG DỒN theo từng bước chuột (không tính từ tổng quãng kéo) → cảm giác như cầm vật xoay bằng tay.
//  - Bấm X/Y/Z khi đang xoay → khóa quanh trục thế giới đó (góc = góc quét của chuột quanh tâm).
//  - Giữ Shift → bắt bước 15° (khi khóa trục: góc quét; khi tự do: góc Euler kết quả).

/** @param size kích thước canvas (px) – để đặt quả cầu ảo */
export function startRotate(parts, objects, camera, size, pointer) {
  const box = new THREE.Box3();
  for (const p of parts) if (objects.get(p.id)) box.expandByObject(objects.get(p.id));
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const c = center.clone().project(camera);
  const centerPx = new THREE.Vector2(((c.x + 1) / 2) * size.width, ((1 - c.y) / 2) * size.height);
  return {
    center,
    centerPx,
    radius: Math.min(size.width, size.height) * 0.32, // bán kính vòng tròn ảo (px)
    start: parts.map((p) => [p.id, partMatrix(p)]),
    camQuat: camera.quaternion.clone(),
    q: new THREE.Quaternion(), // phép xoay đã cộng dồn
    last: pointer.clone(), // vị trí chuột lần trước (px trong canvas)
    startPointer: pointer.clone(),
    lock: null, // 'x' | 'y' | 'z' | null
    lockAngle0: Math.atan2(pointer.y - centerPx.y, pointer.x - centerPx.x),
    qAtLock: new THREE.Quaternion(),
  };
}

/** Điểm trên quả cầu ảo (toạ độ camera: x phải, y lên, z hướng về người xem). */
function onBall(g, p) {
  const x = (p.x - g.centerPx.x) / g.radius;
  const y = -(p.y - g.centerPx.y) / g.radius;
  const d2 = x * x + y * y;
  return d2 <= 1 ? new THREE.Vector3(x, y, Math.sqrt(1 - d2)) : new THREE.Vector3(x, y, 0).normalize();
}

/** Khóa / mở khóa trục (bấm X/Y/Z khi đang xoay). */
export function setRotateLock(g, axis, pointer) {
  g.lock = g.lock === axis ? null : axis;
  g.qAtLock.copy(g.q);
  g.lockAngle0 = Math.atan2(pointer.y - g.centerPx.y, pointer.x - g.centerPx.x);
  g.last.copy(pointer);
}

/** Cập nhật xoay theo vị trí chuột mới; trả về Map id → ma trận mới. */
export function rotateMatrices(g, pointer, snap) {
  if (g.lock) {
    // góc quét của chuột quanh tâm khối trên màn hình → xoay quanh trục thế giới
    const axis = new THREE.Vector3(g.lock === 'x' ? 1 : 0, g.lock === 'y' ? 1 : 0, g.lock === 'z' ? 1 : 0);
    let ang = Math.atan2(pointer.y - g.centerPx.y, pointer.x - g.centerPx.x) - g.lockAngle0;
    // trục hướng về phía người xem thì chiều quét ngược lại để "kéo theo chiều nào xoay chiều đó"
    const toViewer = new THREE.Vector3(0, 0, 1).applyQuaternion(g.camQuat);
    if (axis.dot(toViewer) > 0) ang = -ang;
    if (snap) ang = Math.round(ang / SNAP_ANGLE) * SNAP_ANGLE;
    g.q.copy(new THREE.Quaternion().setFromAxisAngle(axis, ang).multiply(g.qAtLock));
  } else {
    const v1 = onBall(g, g.last);
    const v2 = onBall(g, pointer);
    const axisCam = new THREE.Vector3().crossVectors(v1, v2);
    if (axisCam.lengthSq() > 1e-10) {
      const angle = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2)))) * 1.4;
      const axisWorld = axisCam.normalize().applyQuaternion(g.camQuat);
      g.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axisWorld, angle));
    }
    g.last.copy(pointer);
  }
  const about = new THREE.Matrix4()
    .makeTranslation(g.center.x, g.center.y, g.center.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(g.q))
    .multiply(new THREE.Matrix4().makeTranslation(-g.center.x, -g.center.y, -g.center.z));
  const out = new Map(g.start.map(([id, m]) => [id, about.clone().multiply(m)]));
  if (snap && !g.lock) {
    // xoay tự do + Shift: làm tròn góc Euler của từng khối về bội số 15° (giữ nguyên vị trí đã xoay)
    for (const [id, m] of out) {
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      m.decompose(pos, q, s);
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      const r = (a) => Math.round(a / SNAP_ANGLE) * SNAP_ANGLE;
      q.setFromEuler(new THREE.Euler(r(e.x), r(e.y), r(e.z), 'XYZ'));
      out.set(id, new THREE.Matrix4().compose(pos, q, s));
    }
  }
  return out;
}

/** Góc đã xoay (độ) – hiển thị cho người dùng. */
export function rotatedDegrees(g) {
  return Math.round((2 * Math.acos(Math.min(1, Math.abs(g.q.w))) * 180) / Math.PI);
}

// ---------------------------------------------------------------- KÉO GIÃN THEO ĐIỂM
/**
 * Bắt đầu kéo giãn. Trục giãn CHƯA chọn ngay: đợi chuột di một đoạn rồi chọn trục (cục bộ) của khối
 * có hình chiếu trên màn hình khớp nhất với hướng kéo → "kéo hướng nào giãn hướng đó", và không bao giờ
 * chọn trục đang chĩa thẳng vào camera (sẽ khiến khối giãn vọt rất mạnh).
 * @param hitPoint điểm (thế giới) bấm trúng trên khối
 */
export function startStretch(part, obj, hitPoint) {
  const box = localBox(obj);
  return {
    id: part.id,
    axis: null,
    center: box.getCenter(new THREE.Vector3()),
    half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
    local: obj.worldToLocal(hitPoint.clone()),
    M0: partMatrix(part),
    grab: hitPoint.clone(),
    scale0: [...part.scale],
  };
}

const toScreen = (p, camera, size) => {
  const v = p.clone().project(camera);
  return new THREE.Vector2(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height);
};

/** Chọn trục giãn theo hướng kéo trên màn hình (gọi khi chuột đã di đủ xa). */
export function chooseStretchAxis(g, drag, camera, size) {
  const dragDir = drag.clone().normalize();
  const g2 = toScreen(g.grab, camera, size);
  let best = { score: -1 };
  for (let i = 0; i < 3; i++) {
    const dirWorld = new THREE.Vector3().setComponent(i, 1).transformDirection(g.M0).normalize();
    // hình chiếu 1 mm dọc trục lên màn hình
    const s2 = toScreen(g.grab.clone().add(dirWorld), camera, size).sub(g2);
    const len = s2.length();
    if (len < 1e-3) continue;
    const cos = s2.clone().divideScalar(len).dot(dragDir);
    const score = Math.abs(cos) * Math.min(1, len / 4); // phạt trục bị chiếu quá ngắn (gần hướng nhìn)
    if (score > best.score) best = { score, i, dirWorld, cos };
  }
  const i = best.i ?? 0;
  // phía của điểm bấm so với tâm khối dọc trục này → mặt đó di chuyển, mặt đối diện là điểm neo
  const off = g.local.getComponent(i) - g.center.getComponent(i);
  const sign = Math.abs(off) > g.half.getComponent(i) * 0.15 ? Math.sign(off) : Math.sign(best.cos || 1);
  g.axis = i;
  g.anchor = g.center.clone().setComponent(i, g.center.getComponent(i) - sign * g.half.getComponent(i));
  g.dirWorld = (best.dirWorld ?? new THREE.Vector3(1, 0, 0)).clone().multiplyScalar(sign);
  g.worldLen = 2 * g.half.getComponent(i) * Math.abs(g.scale0[i]);
}

/** Độ dời (mm) của điểm bấm dọc theo trục giãn, theo tia chuột hiện tại. */
function alongAxis(g, ray) {
  // điểm gần nhất giữa đường thẳng (grab + u·dir) và tia chuột (origin + v·b)
  const a = g.dirWorld;
  const b = ray.direction;
  const w = g.grab.clone().sub(ray.origin);
  const c = a.dot(b);
  const denom = 1 - c * c;
  if (denom < 1e-6) return 0; // trục gần như song song tia nhìn
  return (c * b.dot(w) - a.dot(w)) / denom;
}

/** @returns ma trận mới của khối khi kéo giãn; `uniform` = giãn đều cả 3 chiều. */
export function stretchMatrix(g, ray, { uniform = false, snap = false } = {}) {
  const d = alongAxis(g, ray);
  let k = Math.min(20, Math.max(0.05, (g.worldLen + d) / Math.max(1e-6, g.worldLen)));
  if (snap) {
    const target = Math.round(g.scale0[g.axis] * k * 20) / 20; // bước 0.05×
    k = Math.max(0.05, target) / g.scale0[g.axis];
  }
  const s = uniform ? new THREE.Vector3(k, k, k) : new THREE.Vector3(1, 1, 1).setComponent(g.axis, k);
  // co giãn trong toạ độ cục bộ quanh điểm neo: M0 · T(A) · S · T(−A)
  return g.M0.clone()
    .multiply(new THREE.Matrix4().makeTranslation(g.anchor.x, g.anchor.y, g.anchor.z))
    .multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z))
    .multiply(new THREE.Matrix4().makeTranslation(-g.anchor.x, -g.anchor.y, -g.anchor.z));
}

// ---------------------------------------------------------------- CHỌN VÙNG
/** Id các khối có tâm hộp bao (chiếu lên màn hình) nằm trong khung chữ nhật (toạ độ pixel trong canvas). */
export function partsInRect(rect, objects, camera, size, isSelectable) {
  const out = [];
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const [id, obj] of objects) {
    if (!obj || !isSelectable(id)) continue;
    box.setFromObject(obj);
    if (box.isEmpty()) continue;
    box.getCenter(c).project(camera);
    if (c.z > 1) continue; // sau lưng camera
    const x = ((c.x + 1) / 2) * size.width;
    const y = ((1 - c.y) / 2) * size.height;
    if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) out.push(id);
  }
  return out;
}
