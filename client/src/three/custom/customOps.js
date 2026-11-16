// CÁC THAO TÁC trên khối của thiết kế tự tạo: thêm, nhân bản, đối xứng, xếp vòng, nhóm, xóa...
// Mọi thao tác đi qua designStore.apply → có Undo/Redo và được chuẩn hóa (normalizeParts).
import * as THREE from 'three';
import { MAX_PARTS, PART_KIND_MAP, createPart, newPartId } from '@ngk/shared';
import { useDesignStore } from '../../store/designStore.js';
import { useCustomStore } from '../../store/customStore.js';
import { toast } from '../../store/toastStore.js';
import { buildPartGeometry, partLocalBox } from './partGeometry.js';
import { useViewerStore } from '../../store/viewerStore.js';
import { partMatrix, partQuaternion } from './partMath.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const r3 = (n) => Math.round(n * 1000) / 1000;

const parts = () => useDesignStore.getState().config.parts;
const apply = (fn, opts) => useDesignStore.getState().apply(fn, opts);
const store = () => useCustomStore.getState();

// toán học thuần của khối nằm ở partMath.js (dùng chung với Web Worker) – xuất lại để các file khác dùng như cũ
export { partMatrix, partQuaternion } from './partMath.js';
/** Ghi ma trận vào khối (vị trí / xoay độ / co giãn). */
export function setPartMatrix(p, m) {
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(pos, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  p.pos = pos.toArray().map(r3);
  p.rot = [e.x * R2D, e.y * R2D, e.z * R2D].map((v) => Math.round(v * 100) / 100);
  p.scale = s.toArray().map(r3);
}

function roomFor(n) {
  if (parts().length + n > MAX_PARTS) {
    toast(`Tối đa ${MAX_PARTS} khối trong một thiết kế.`, { tone: 'warning' });
    return false;
  }
  return true;
}

/** Hộp bao (thế giới) của các khối đang hiển thị – dùng để xếp khối mới không đè lên khối cũ. */
export function sceneBox(ids = null) {
  const box = new THREE.Box3();
  for (const [id, obj] of store().objects) {
    if (ids && !ids.includes(id)) continue;
    if (obj?.visible) box.expandByObject(obj);
  }
  return box;
}

/** Đáy (y nhỏ nhất) của khối (theo tham số cho trước hoặc mặc định), trong toạ độ cục bộ. */
function bottomOf(kind, params = createPart(kind).params) {
  const g = buildPartGeometry(kind, params);
  const minY = partLocalBox(g).min.y;
  g.owned.forEach((x) => x.dispose());
  return Number.isFinite(minY) ? minY : 0;
}

const spawnRay = new THREE.Raycaster();

/**
 * Vị trí đặt khối mới = CHỖ NGƯỜI DÙNG ĐANG NHÌN (tia từ giữa màn hình của camera):
 *  1. Tia trúng một khối  → đặt lên bề mặt khối đó tại điểm nhìn.
 *  2. Tia trúng mặt lưới ở khoảng cách hợp lý → đặt trên lưới tại đó.
 *  3. Nhìn lên trời / lưới quá xa → lơ lửng trước mặt camera ở khoảng cách đang nhìn.
 * Sau đó nếu cột (x, z) đó đã có khối thì xếp chồng lên trên để không đè vào nhau.
 * @returns {{ x, y, z, onSurface: boolean }} – y = độ cao ĐÁY khối mới (khi onSurface) hoặc TÂM khối (khi lơ lửng)
 */
function spawnSpot() {
  const st = store();
  const view = st.viewRay?.();
  if (!view) return { x: 0, y: 0, z: 0, onSurface: true };
  const { origin, dir, focusDist } = view;
  const maxReach = Math.max(30, focusDist * 1.6);

  // 1) trúng khối đang hiển thị
  const objs = [...st.objects.values()].filter((o) => o?.visible);
  spawnRay.set(origin, dir);
  spawnRay.far = maxReach;
  const hit = spawnRay.intersectObjects(objs, true).find((h) => h.object.isMesh); // bỏ qua khung chọn (đường kẻ)
  let spot;
  if (hit) spot = { x: hit.point.x, y: hit.point.y + 0.3, z: hit.point.z, onSurface: true };
  // 2) trúng mặt lưới
  if (!spot && dir.y < -1e-3) {
    const t = -origin.y / dir.y; // giao với y = 0
    if (t > 0 && t <= maxReach) spot = { x: origin.x + dir.x * t, y: 0, z: origin.z + dir.z * t, onSurface: true };
  }
  // 3) lơ lửng trước camera
  if (!spot) {
    const p = origin.clone().addScaledVector(dir, Math.min(focusDist, 80));
    return { x: p.x, y: p.y, z: p.z, onSurface: false };
  }
  // tránh đè lên khối khác ở cùng cột
  const box = new THREE.Box3();
  for (const obj of objs) {
    box.setFromObject(obj);
    const m = 0.5;
    const inColumn = spot.x >= box.min.x - m && spot.x <= box.max.x + m && spot.z >= box.min.z - m && spot.z <= box.max.z + m;
    if (inColumn && box.max.y > spot.y && box.min.y < spot.y + 1) spot.y = Math.max(spot.y, box.max.y + 0.3);
  }
  return spot;
}

/** Thêm khối mới tại vị trí đang làm việc (xem spawnSpot), đáy khối đặt đúng baseY, rồi chọn khối mới. */
export function addPart(kind, { params } = {}) {
  if (!roomFor(1)) return null;
  const box = sceneBox();
  const spot = spawnSpot();
  const base = createPart(kind);
  if (params) base.params = { ...base.params, ...params };
  const pos = [r3(spot.x), r3(spot.onSurface ? spot.y - bottomOf(kind, base.params) : spot.y), r3(spot.z)];
  const part = createPart(kind, { pos, name: uniqueName(kindName(kind)), params: base.params });
  apply((c) => {
    c.parts.push(part);
  });
  store().select([part.id]);
  // khối ĐẦU TIÊN của thiết kế trống → căn camera vào nó đúng một lần (sau khi khung 3D vẽ xong khối);
  // các lần sau camera hoàn toàn do người dùng điều khiển
  if (box.isEmpty()) {
    setTimeout(() => {
      const b = sceneBox([part.id]);
      if (!b.isEmpty()) useViewerStore.getState().focus(b);
    }, 60);
  }
  return part.id;
}

function kindName(kind) {
  return PART_KIND_MAP.get(kind)?.name ?? kind;
}
/** Tên không trùng; `taken` = các tên đã dùng (kể cả tên vừa cấp trong cùng một thao tác). */
function uniqueName(base, taken = new Set(parts().map((p) => p.name))) {
  const stem = base.replace(/ \d+$/, '');
  let name = taken.has(base) ? null : base;
  for (let i = 2; !name; i++) if (!taken.has(`${stem} ${i}`)) name = `${stem} ${i}`;
  taken.add(name);
  return name;
}

// tên đã dùng trong một loạt thao tác (xếp vòng tạo nhiều bản sao cùng lúc)
let batchNames = null;

/** Bản sao các khối; nếu nguyên một nhóm được chọn thì bản sao thành nhóm mới. */
function cloneSet(ids, transform) {
  const src = parts().filter((p) => ids.includes(p.id));
  const groupMap = new Map();
  const taken = batchNames ?? new Set(parts().map((p) => p.name));
  return src.map((p) => {
    const copy = structuredClone(p);
    copy.id = newPartId();
    copy.name = uniqueName(p.name, taken);
    if (p.group) {
      if (!groupMap.has(p.group)) groupMap.set(p.group, newPartId());
      copy.group = groupMap.get(p.group);
    }
    transform(copy, p);
    return copy;
  });
}

export function duplicate(ids) {
  if (!ids.length || !roomFor(ids.length)) return;
  const copies = cloneSet(ids, (c) => {
    c.pos = [r3(c.pos[0] + 3), c.pos[1], c.pos[2]];
  });
  apply((c) => {
    c.parts.push(...copies);
  });
  store().select(copies.map((c) => c.id));
}

/** Đối xứng qua mặt phẳng vuông góc trục `axis` đi qua gốc toạ độ (tạo bản sao). */
export function mirror(ids, axis = 'x') {
  if (!ids.length || !roomFor(ids.length)) return;
  const i = { x: 0, y: 1, z: 2 }[axis];
  const copies = cloneSet(ids, (c) => {
    c.pos[i] = r3(-c.pos[i]);
    // phản chiếu phép xoay: giữ thành phần quaternion của trục gương, đảo hai thành phần còn lại
    const q = partQuaternion(c);
    const comp = [q.x, q.y, q.z];
    for (let k = 0; k < 3; k++) if (k !== i) comp[k] = -comp[k];
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(comp[0], comp[1], comp[2], q.w), 'XYZ');
    c.rot = [e.x * R2D, e.y * R2D, e.z * R2D].map((v) => Math.round(v * 100) / 100);
  });
  apply((c) => {
    c.parts.push(...copies);
  });
  store().select([...ids, ...copies.map((c) => c.id)]);
  toast(`Đã tạo bản đối xứng qua trục ${axis.toUpperCase()}`, { tone: 'success' });
}

/**
 * Xếp vòng: tạo (count − 1) bản sao xoay đều quanh trục `axis` qua gốc toạ độ.
 * Tất cả (gốc + bản sao) gom vào một nhóm mới để di chuyển cùng nhau.
 */
/** Đai tròn lớn nhất (không thuộc lựa chọn) – làm tâm/trục xếp vòng mặc định cho trang sức. */
export function referenceBand(excludeIds = []) {
  return parts()
    .filter((p) => p.kind === 'band' && !excludeIds.includes(p.id))
    .sort((a, b) => b.params.innerD * b.scale[0] - a.params.innerD * a.scale[0])[0] ?? null;
}

export function radialArray(ids, count, axis = 'z') {
  const n = Math.max(2, Math.min(48, Math.round(count)));
  if (!ids.length || !roomFor(ids.length * (n - 1))) return;
  // trục quay: X/Y/Z qua gốc toạ độ, hoặc 'band' = tâm + trục của đai tròn (đai nằm trên lưới không ở gốc)
  let center = new THREE.Vector3();
  let axisVec = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[axis];
  if (axis === 'band') {
    const band = referenceBand(ids);
    if (!band) return toast('Chưa có “Đai tròn” để xếp vòng quanh – hãy chọn trục X/Y/Z.', { tone: 'warning' });
    center = new THREE.Vector3(...band.pos);
    axisVec = new THREE.Vector3(0, 0, 1).applyQuaternion(partQuaternion(band)).normalize(); // trục đai = trục Z cục bộ
  }
  const groupId = newPartId();
  const all = [];
  batchNames = new Set(parts().map((p) => p.name));
  for (let k = 1; k < n; k++) {
    const rot = new THREE.Matrix4()
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axisVec, (k / n) * Math.PI * 2))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    all.push(
      ...cloneSet(ids, (c, orig) => {
        setPartMatrix(c, rot.clone().multiply(partMatrix(orig)));
        c.group = groupId;
      }),
    );
  }
  batchNames = null;
  apply((c) => {
    for (const p of c.parts) if (ids.includes(p.id)) p.group = groupId;
    c.parts.push(...all);
  });
  store().select([...ids, ...all.map((c) => c.id)]);
  toast(`Đã xếp ${n} bản quanh ${axis === 'band' ? 'đai tròn' : `trục ${axis.toUpperCase()}`} (gom thành một nhóm)`, { tone: 'success' });
}

/** Xoay nhanh `deg` độ quanh trục THẾ GIỚI `axis` đi qua tâm cụm khối (kiểu nút xoay 90° của Tinkercad). */
export function rotateBy(ids, axis, deg) {
  if (!ids.length) return;
  const box = sceneBox(ids);
  const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const axisVec = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[axis];
  const about = new THREE.Matrix4()
    .makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axisVec, deg * D2R))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  apply((cfg) => {
    for (const p of cfg.parts) if (ids.includes(p.id)) setPartMatrix(p, about.clone().multiply(partMatrix(p)));
  });
}

export function removeParts(ids) {
  if (!ids.length) return;
  apply((c) => {
    c.parts = c.parts.filter((p) => !ids.includes(p.id));
  });
  store().select([]);
}

export function groupParts(ids) {
  if (ids.length < 2) return toast('Chọn ít nhất 2 khối để nhóm (giữ Ctrl/Shift khi bấm).', { tone: 'warning' });
  const g = newPartId();
  apply((c) => {
    for (const p of c.parts) if (ids.includes(p.id)) p.group = g;
  });
  toast(`Đã nhóm ${ids.length} khối`, { tone: 'success' });
}

export function ungroupParts(ids) {
  apply((c) => {
    for (const p of c.parts) if (ids.includes(p.id)) p.group = null;
  });
}

export function updatePart(id, mutator, opts) {
  apply((c) => {
    const p = c.parts.find((x) => x.id === id);
    if (p) mutator(p);
  }, opts);
}

export function updateParts(ids, mutator, opts) {
  apply((c) => {
    for (const p of c.parts) if (ids.includes(p.id)) mutator(p);
  }, opts);
}

/** Đặt đáy các khối chạm mặt lưới (y = 0). */
export function dropToGrid(ids) {
  const box = sceneBox(ids);
  if (box.isEmpty()) return;
  const dy = -box.min.y;
  updateParts(ids, (p) => {
    p.pos[1] = r3(p.pos[1] + dy);
  });
}

/** Đưa tâm các khối về trục giữa (x = z = 0). */
export function centerParts(ids) {
  const box = sceneBox(ids);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  updateParts(ids, (p) => {
    p.pos[0] = r3(p.pos[0] - c.x);
    p.pos[2] = r3(p.pos[2] - c.z);
  });
}

/** Căn camera vào các khối (giữ hướng nhìn); đợi một nhịp để khung 3D kịp hiện khối vừa bỏ ẩn. */
export function focusParts(ids) {
  setTimeout(() => {
    const box = sceneBox(ids.length ? ids : null);
    if (!box.isEmpty()) useViewerStore.getState().focus(box);
  }, 50);
}

/** Đổi tên khối (bỏ khoảng trắng thừa, tối đa 40 ký tự); tên rỗng → giữ tên cũ. */
export function renamePart(id, name) {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!clean) return false;
  updatePart(id, (p) => {
    p.name = clean;
  });
  return true;
}

/** Mở rộng lựa chọn: bấm một khối trong nhóm → chọn cả nhóm. */
export function expandToGroups(ids) {
  const list = parts();
  const groups = new Set(list.filter((p) => ids.includes(p.id) && p.group).map((p) => p.group));
  return list.filter((p) => ids.includes(p.id) || (p.group && groups.has(p.group))).map((p) => p.id);
}

/**
 * Ghi hình vẽ 2D mới vào khối "Hình vẽ". Đường viền được đưa về tâm (0, 0) để tay cầm nằm giữa hình;
 * phần lệch tâm được bù vào vị trí khối → hình không nhảy chỗ trên mô hình khi sửa.
 * @param paths mảng đường viền [[x, y], ...] (mm, toạ độ bảng vẽ)
 */
export function saveSketch(partId, paths, { depth, bevel }) {
  const b = new THREE.Box2();
  for (const pts of paths) for (const [x, y] of pts) b.expandByPoint(new THREE.Vector2(x, y));
  const c = b.getCenter(new THREE.Vector2());
  const centered = paths.map((pts) => pts.map(([x, y]) => [r3(x - c.x), r3(y - c.y)]));
  apply((cfg) => {
    const p = cfg.parts.find((q) => q.id === partId);
    if (!p || p.kind !== 'sketch') return;
    const off = new THREE.Vector3(c.x, c.y, 0).multiply(new THREE.Vector3(...p.scale)).applyQuaternion(partQuaternion(p));
    p.pos = p.pos.map((v, i) => r3(v + off.getComponent(i)));
    p.params.paths = centered;
    p.params.depth = depth;
    p.params.bevel = bevel;
  });
}

/** Tạo khối "Hình vẽ" mới từ bảng vẽ (đặt ở chỗ đang nhìn như khối thường). */
export function addSketch(paths, { depth, bevel }) {
  const b = new THREE.Box2();
  for (const pts of paths) for (const [x, y] of pts) b.expandByPoint(new THREE.Vector2(x, y));
  const c = b.getCenter(new THREE.Vector2());
  const centered = paths.map((pts) => pts.map(([x, y]) => [r3(x - c.x), r3(y - c.y)]));
  return addPart('sketch', { params: { paths: centered, depth, bevel } });
}

// ── KHỐI CHỮ ───────────────────────────────────────────────────────────────────────────────────────
// Đường viền chữ dựng từ font (bất đồng bộ: nạp font lần đầu) rồi mới ghi vào thiết kế. Gõ nhanh / kéo thanh trượt
// liên tục → chỉ kết quả của lần đổi MỚI NHẤT được ghi (các lần cũ về sau bị bỏ).
const textJobs = new Map(); // partId → { seq, promise }
const textOutline = () => import('../geometry/textOutline.js');

function warnMissing(missing) {
  if (missing.length) toast(`Kiểu chữ này không có ký tự: ${[...new Set(missing)].join(' ')} – đã bỏ qua.`, { tone: 'warning' });
}

/** Thêm khối "Chữ" mới (chữ mặc định), đặt ở chỗ đang nhìn như khối thường. */
export async function addText() {
  if (!roomFor(1)) return null;
  const params = createPart('text').params;
  try {
    const { textToPaths } = await textOutline();
    const res = await textToPaths(params);
    return addPart('text', { params: { ...params, paths: res.paths } });
  } catch {
    toast('Không tải được kiểu chữ – kiểm tra kết nối rồi thử lại.', { tone: 'warning' });
    return null;
  }
}

/**
 * Đổi chữ / kiểu chữ / cỡ / khoảng cách của khối chữ (dựng lại đường viền).
 * @param patch các tham số thay đổi, ví dụ { text: 'Anh' }
 * @param opts.transient true = đang gõ / đang kéo (chưa ghi lịch sử Undo – gọi commitText khi xong)
 * @returns Promise<{ missing: string[], empty: boolean }>
 */
export function updateText(partId, patch, opts = {}) {
  const part = parts().find((p) => p.id === partId);
  if (!part || part.kind !== 'text') return Promise.resolve({ missing: [], empty: false });
  const seq = (textJobs.get(partId)?.seq ?? 0) + 1;
  const next = { ...part.params, ...patch };
  const promise = textOutline()
    .then(({ textToPaths }) => textToPaths(next))
    .then((res) => {
      if (textJobs.get(partId)?.seq !== seq) return { missing: res.missing, empty: false }; // đã có lần đổi mới hơn
      if (!opts.transient) warnMissing(res.missing);
      if (!res.paths.length) return { missing: res.missing, empty: true }; // không còn chữ nào dựng được → giữ khối cũ
      apply((c) => {
        const p = c.parts.find((q) => q.id === partId);
        if (!p) return;
        Object.assign(p.params, patch);
        p.params.paths = res.paths;
      }, opts);
      return { missing: res.missing, empty: false };
    })
    .catch(() => {
      toast('Không tải được kiểu chữ – kiểm tra kết nối rồi thử lại.', { tone: 'warning' });
      return { missing: [], empty: false };
    });
  textJobs.set(partId, { seq, promise });
  return promise;
}

/** Kết thúc một lần gõ / kéo: chờ lần dựng chữ cuối cùng xong rồi ghi một bước Undo. */
export async function commitText(partId) {
  const res = await textJobs.get(partId)?.promise;
  if (res) warnMissing(res.missing);
  useDesignStore.getState().commit();
}

/** Thêm khối tại vị trí cho trước (không dò chỗ đặt) – dùng cho sợi kim loại vẽ bằng các điểm bấm. */
export function addPartAt(kind, pos, params) {
  if (!roomFor(1)) return null;
  const base = createPart(kind);
  const part = createPart(kind, { pos: pos.map(r3), name: uniqueName(kindName(kind)), params: { ...base.params, ...params } });
  apply((c) => {
    c.parts.push(part);
  });
  store().select([part.id]);
  return part.id;
}
