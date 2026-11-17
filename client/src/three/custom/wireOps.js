// THAO TÁC trên SỢI KIM LOẠI: tạo sợi từ các điểm bấm, sửa / chèn / xoá điểm, tính đường BÁM SÁT BỀ MẶT.
// Điểm điều khiển lưu ở toạ độ cục bộ của khối sợi; giao diện làm việc với toạ độ thế giới.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { WIRE_LIMITS } from '@ngk/shared';
import { useDesignStore } from '../../store/designStore.js';
import { useCustomStore } from '../../store/customStore.js';
import { toast } from '../../store/toastStore.js';
import { addPartAt } from './customOps.js';
import { partMatrix } from './partMath.js';
import { wireCurve } from '../geometry/wireGeometry.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
const design = () => useDesignStore.getState();
const findPart = (id) => design().config.parts.find((p) => p.id === id);

/** Các điểm điều khiển của sợi theo toạ độ THẾ GIỚI. */
export function wireWorldPoints(part) {
  const m = partMatrix(part);
  return part.params.points.map((p) => new THREE.Vector3(...p).applyMatrix4(m));
}

const toLocal = (part, pts) => {
  const inv = partMatrix(part).invert();
  return pts.map((v) => v.clone().applyMatrix4(inv).toArray().map(r3));
};

/** Tạo khối sợi từ các điểm thế giới (tâm khối = trọng tâm các điểm → tay cầm nằm giữa sợi). */
export function createWire(worldPts, { closed = false, d = 1 } = {}) {
  if (worldPts.length < 2) return null;
  const c = new THREE.Vector3();
  for (const v of worldPts) c.add(v);
  c.divideScalar(worldPts.length);
  const points = worldPts.map((v) => v.clone().sub(c).toArray().map(r3));
  return addPartAt('wire', c.toArray(), { points, closed: closed && worldPts.length > 2, d });
}

/** Kết thúc chế độ vẽ sợi: tạo khối từ các điểm đã bấm. @returns id khối mới hoặc null */
export function finishWireDraw(closed = false) {
  const st = useCustomStore.getState();
  const pts = st.wire?.mode === 'draw' ? st.wire.points : [];
  if (pts.length < 2) {
    toast('Cần ít nhất 2 điểm để tạo sợi – bấm lên bề mặt khối hoặc mặt lưới để đặt điểm.', { tone: 'warning' });
    return null;
  }
  const id = createWire(pts, { closed, d: st.wire.d ?? 1 });
  st.endWire();
  if (id) {
    st.select([id]);
    toast(closed && pts.length > 2 ? 'Đã tạo vòng sợi kim loại' : 'Đã tạo sợi kim loại', { tone: 'success' });
  }
  return id;
}

/**
 * Ghi lại toàn bộ điểm điều khiển (toạ độ thế giới). Sợi đang "bám sát bề mặt" và thao tác đã xong (không transient)
 * → tính lại đường bám.
 */
export function setWirePoints(partId, worldPts, { transient = false } = {}) {
  const part = findPart(partId);
  if (!part || part.kind !== 'wire') return;
  const points = toLocal(part, worldPts);
  const track = part.params.hug && !transient ? hugTrack({ ...part, params: { ...part.params, points } }) : null;
  design().apply(
    (c) => {
      const p = c.parts.find((q) => q.id === partId);
      if (!p) return;
      p.params.points = points;
      // đang kéo điểm của sợi bám bề mặt → tạm cho sợi đi theo điểm điều khiển (đường bám tính lại khi thả chuột)
      if (track) p.params.track = track;
      else if (transient && p.params.hug) p.params.track = [];
    },
    { transient },
  );
}

/** Chèn điểm mới vào giữa điểm `i` và điểm kế tiếp (sau điểm cuối của sợi hở = nối dài). @returns chỉ số điểm mới */
export function insertWirePoint(partId, i) {
  const part = findPart(partId);
  if (!part) return -1;
  const pts = wireWorldPoints(part);
  if (pts.length >= WIRE_LIMITS.points) {
    toast(`Tối đa ${WIRE_LIMITS.points} điểm trên một sợi.`, { tone: 'warning' });
    return -1;
  }
  const n = pts.length;
  let at;
  let v;
  if (i >= n - 1 && !part.params.closed) {
    const dir = pts[n - 1].clone().sub(pts[n - 2]);
    v = pts[n - 1].clone().add(dir.multiplyScalar(0.5));
    at = n;
  } else {
    // lấy điểm trên chính đường cong → sợi giữ nguyên dáng sau khi chèn
    const curve = wireCurve(part.params.points, part.params.closed);
    const segs = curve.closed ? n : n - 1;
    v = curve.getPoint((i + 0.5) / segs).applyMatrix4(partMatrix(part));
    at = i + 1;
  }
  pts.splice(at, 0, v);
  setWirePoints(partId, pts);
  return at;
}

/** Chèn điểm tại chỗ bấm trên sợi (vào đúng đoạn chứa điểm đó). @returns chỉ số điểm mới */
export function insertWirePointAt(partId, world) {
  const part = findPart(partId);
  if (!part) return -1;
  const pts = wireWorldPoints(part);
  if (pts.length >= WIRE_LIMITS.points) {
    toast(`Tối đa ${WIRE_LIMITS.points} điểm trên một sợi.`, { tone: 'warning' });
    return -1;
  }
  const curve = wireCurve(part.params.points, part.params.closed);
  const m = partMatrix(part);
  const n = pts.length;
  const segs = curve.closed ? n : n - 1;
  let best = 0;
  let bestD = Infinity;
  const v = new THREE.Vector3();
  const N = Math.max(200, segs * 40);
  for (let k = 0; k <= N; k++) {
    curve.getPoint(k / N, v).applyMatrix4(m);
    const d = v.distanceToSquared(world);
    if (d < bestD) {
      bestD = d;
      best = k / N;
    }
  }
  const at = Math.min(segs - 1, Math.floor(best * segs)) + 1;
  pts.splice(at, 0, curve.getPoint(best).applyMatrix4(m));
  setWirePoints(partId, pts);
  return at;
}

export function removeWirePoint(partId, i) {
  const part = findPart(partId);
  if (!part) return false;
  const pts = wireWorldPoints(part);
  if (pts.length <= 2) {
    toast('Sợi cần ít nhất 2 điểm – muốn bỏ cả sợi thì xoá khối.', { tone: 'warning' });
    return false;
  }
  pts.splice(i, 1);
  setWirePoints(partId, pts);
  return true;
}

/** Bật/tắt bám sát bề mặt (bật → tính đường bám ngay). */
export function setWireHug(partId, on) {
  const part = findPart(partId);
  if (!part) return;
  const track = on ? hugTrack(part) : [];
  design().apply((c) => {
    const p = c.parts.find((q) => q.id === partId);
    if (!p) return;
    p.params.hug = on;
    p.params.track = track;
  });
  if (on && !track.length) toast('Không có bề mặt khối nào đủ gần sợi để bám vào – đặt các điểm lên bề mặt khối trước.', { tone: 'warning' });
}

/** Tính lại đường bám (sau khi di chuyển sợi / các khối bên dưới, hoặc đổi độ dày sợi). */
export function rehugWire(partId, opts) {
  const part = findPart(partId);
  if (!part?.params.hug) return;
  const track = hugTrack(part);
  design().apply((c) => {
    const p = c.parts.find((q) => q.id === partId);
    if (p) p.params.track = track;
  }, opts);
}

// ── BÁM SÁT BỀ MẶT ──────────────────────────────────────────────────────────────────────────────────
// Rải điểm dày dọc đường cong; mỗi điểm tìm điểm GẦN NHẤT trên bề mặt các khối khác (cây BVH – rất nhanh).
// Bề mặt đủ gần (≤ max(1.5 mm, 3 × đường kính)) → tâm sợi đặt cách bề mặt đúng bán kính theo pháp tuyến (sợi nằm
// sát lên mặt, không chìm vào trong); xa hơn → giữ đường cong tự do. Cuối cùng làm mượt chỗ chuyển tiếp.
const tri = new THREE.Triangle();
const tmpN = new THREE.Vector3();

function surfaceMeshes(excludeId) {
  const st = useCustomStore.getState();
  const parts = design().config.parts;
  const out = [];
  for (const [id, obj] of st.objects) {
    const p = parts.find((q) => q.id === id);
    if (!obj || !p || p.hidden || id === excludeId) continue;
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.renderOrder === 6 || !o.geometry?.attributes.position) return;
      o.geometry.boundsTree ??= new MeshBVH(o.geometry);
      out.push({ mesh: o, inv: o.matrixWorld.clone().invert(), nm: new THREE.Matrix3().getNormalMatrix(o.matrixWorld) });
    });
  }
  return out;
}

function closestOnSurface(meshes, world, maxD) {
  let best = null;
  const local = new THREE.Vector3();
  for (const m of meshes) {
    local.copy(world).applyMatrix4(m.inv);
    const res = m.mesh.geometry.boundsTree.closestPointToPoint(local, {});
    if (!res) continue;
    const p = res.point.clone().applyMatrix4(m.mesh.matrixWorld);
    const d = p.distanceTo(world);
    if (d > maxD || (best && d >= best.d)) continue;
    const g = m.mesh.geometry;
    const f = res.faceIndex * 3;
    tri.a.fromBufferAttribute(g.attributes.position, g.index ? g.index.getX(f) : f);
    tri.b.fromBufferAttribute(g.attributes.position, g.index ? g.index.getX(f + 1) : f + 1);
    tri.c.fromBufferAttribute(g.attributes.position, g.index ? g.index.getX(f + 2) : f + 2);
    tri.getNormal(tmpN);
    best = { p, n: tmpN.clone().applyMatrix3(m.nm).normalize(), d };
  }
  return best;
}

/** @returns đường tâm bám bề mặt (toạ độ cục bộ của khối sợi), [] nếu không có bề mặt nào đủ gần. */
export function hugTrack(part) {
  const { points, closed, d } = part.params;
  const r = d / 2;
  const m = partMatrix(part);
  const curve = wireCurve(points, closed);
  const scale = Math.max(...new THREE.Vector3().setFromMatrixScale(m).toArray());
  const n = Math.max(16, Math.min(WIRE_LIMITS.track - 1, Math.ceil((curve.getLength() * scale) / 0.35)));
  const samples = curve.getSpacedPoints(n).map((v) => v.applyMatrix4(m));
  if (curve.closed) samples.pop();
  const meshes = surfaceMeshes(part.id);
  if (!meshes.length) return [];
  const maxD = Math.max(1.5, d * 3);
  // đặt điểm cách bề mặt đúng bán kính: đẩy ra theo hướng (điểm gần nhất → điểm đang xét) – hướng này đổi TRƠN dọc
  // sợi; pháp tuyến từng mặt tam giác thì nhảy bậc ở cạnh giữa các mặt (sợi bị gợn). Điểm nằm sát / lọt vào trong
  // khối → dùng pháp tuyến mặt.
  const project = (v, maxDist) => {
    const hit = closestOnSurface(meshes, v, maxDist);
    if (!hit) return null;
    const dir = v.clone().sub(hit.p);
    const out = dir.length() > 1e-3 && dir.dot(hit.n) > 0 ? dir.normalize() : hit.n;
    return hit.p.addScaledVector(out, r);
  };
  const snapped = samples.map((s) => !!closestOnSurface(meshes, s, maxD));
  if (!snapped.some(Boolean)) return [];
  let pts = samples.map((s, i) => (snapped[i] ? project(s, maxD) ?? s : s));
  // xen kẽ "làm mượt (Laplace) → đặt lại sát bề mặt": sợi vừa trơn vừa giữ đúng khoảng cách tới mặt; giữ 2 đầu sợi hở
  for (let it = 0; it < 5; it++) {
    const next = pts.map((v) => v.clone());
    for (let i = 0; i < pts.length; i++) {
      if (!curve.closed && (i === 0 || i === pts.length - 1)) continue;
      const pa = pts[(i - 1 + pts.length) % pts.length];
      const pb = pts[(i + 1) % pts.length];
      next[i].lerp(pa.clone().add(pb).multiplyScalar(0.5), 0.5);
    }
    pts = next.map((v, i) => (snapped[i] ? project(v, maxD + r) ?? v : v));
  }
  const inv = m.clone().invert();
  return pts.map((v) => v.applyMatrix4(inv).toArray().map(r3));
}
