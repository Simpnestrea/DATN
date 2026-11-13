// Hiển thị THIẾT KẾ TỰ TẠO: mỗi khối = hình học theo loại + vật liệu riêng + biến đổi (vị trí/xoay/co giãn).
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCatalogStore } from '../../store/catalogStore.js';
import { useCustomStore } from '../../store/customStore.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { createMetalMaterial, createStoneMaterial, resolveMetal, resolveStone } from '../materials/createMaterials.js';
import { useDisposable } from '../parts/useGeometry.js';
import { buildPartGeometry, partLocalBox } from './partGeometry.js';
import { computeCuts, cutKey } from './csg.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { baseBox, carveToLocal } from './partMath.js';
import { toast } from '../../store/toastStore.js';

// Dò chuột nhanh trên hình đã khoét (hàng chục nghìn tam giác) bằng cây BVH thay vì duyệt từng tam giác.
// Chỉ hình học đã gọi computeBoundsTree mới được tăng tốc; các hình khác vẫn dò như cũ.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const D2R = Math.PI / 180;
const outlineMat = new THREE.LineBasicMaterial({ color: '#f3d98b', transparent: true, opacity: 0.9, depthTest: false });

/** Bộ nhớ đệm vật liệu theo khóa (kim loại+bề mặt / loại đá) – tạo khi cần, giải phóng khi không còn khối nào dùng. */
function useMaterialCache(parts, quality, matte) {
  const lookup = useCatalogStore((s) => s.lookup);
  const cache = useRef(new Map());
  const m = matte ? 1 : 0;
  const keyOf = (p) => (p.kind === 'gem' ? `g|${p.mat.stone}|${quality}|${m}` : `m|${p.mat.metal}|${p.mat.finish}|${m}`);
  const metalKey = (p) => `m|${p.mat.metal}|${p.mat.finish}|${m}`;

  const get = (key) => {
    if (!cache.current.has(key)) {
      const [t, code, extra, mt] = key.split('|');
      const mat =
        t === 'g'
          ? createStoneMaterial(resolveStone(code, lookup), extra, mt === '1')
          : createMetalMaterial(resolveMetal({ code }, lookup), extra, mt === '1');
      cache.current.set(key, mat);
    }
    return cache.current.get(key);
  };

  const needed = new Set(parts.flatMap((p) => (p.kind === 'gem' ? [keyOf(p), metalKey(p)] : [keyOf(p)])));
  useEffect(() => {
    for (const [k, m] of cache.current) {
      if (!needed.has(k)) {
        m.dispose();
        cache.current.delete(k);
      }
    }
  });
  useEffect(
    () => () => {
      cache.current.forEach((m) => m.dispose());
      cache.current.clear();
    },
    [],
  );
  return { surface: (p) => get(keyOf(p)), metal: (p) => get(metalKey(p)) };
}

export function CustomModel({ config, interactive = false }) {
  const { quality, matte } = useMaterials();
  const mats = useMaterialCache(config.parts, quality, matte);
  const selected = useCustomStore((s) => s.selected);

  const { cuts, done } = useWorkerCuts(config.parts);

  return (
    <group>
      {config.parts.map((p) => (
        <PartView
          key={p.id}
          part={p}
          surfaceMat={mats.surface(p)}
          metalMat={mats.metal(p)}
          selected={interactive && selected.includes(p.id)}
          register={interactive}
          cutGeo={cuts.get(p.id)}
          doneCount={cuts.get(p.id)?.userData.carves ?? done.get(p.id) ?? 0}
        />
      ))}
    </group>
  );
}

// ---- CSG chạy ở LUỒNG NỀN (Web Worker) ----
// Tính khoét có thể mất hàng trăm ms khi nhiều vết khoét; làm trên luồng chính sẽ khiến cả trang đứng hình
// (xoá khối, kéo thanh kích thước bị khựng). Worker tính ở nền; trong lúc chờ khối vẫn hiện kết quả gần nhất.
let worker = null;
let workerBroken = false;
function getWorker() {
  if (workerBroken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./csg.worker.js', import.meta.url), { type: 'module' });
      worker.addEventListener('error', () => {
        workerBroken = true; // trình duyệt không chạy được module worker → tính trên luồng chính
      });
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}
let instanceSeq = 0;

function toGeometry({ position, normal, carves = 0 }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.computeBoundsTree(); // dò chuột (rê cọ, bấm chọn) nhanh dù khối có rất nhiều vết khoét
  g.userData.carves = carves; // số vết khoét đã có trong hình này (để biết vết nào còn đang chờ tính)
  return g;
}

// vệt khoét "đang chờ": hiện NGAY khi bấm, trước khi luồng nền tính xong → cảm giác phản hồi tức thì
const pendingMat = new THREE.MeshBasicMaterial({ color: '#e5675f', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
// Vệt chờ = DẤU VẾT TRÊN BỀ MẶT (miệng vết khoét) đặt đúng tại điểm bấm, luôn nhìn thấy.
// (Trước đây vẽ nguyên quả cầu cọ – tâm cầu lệch ra ngoài theo pháp tuyến nên trên mặt nghiêng trông như khoét chỗ khác.)
const pendingGeos = {
  round: new THREE.CircleGeometry(1, 32),
  square: new THREE.PlaneGeometry(2, 2),
};
const Z = new THREE.Vector3(0, 0, 1);

/** Bán kính miệng vết khoét trên bề mặt: cọ lõm tròn chỉ cắt một chỏm cầu → miệng nhỏ hơn bán kính cọ. */
export function carveFootprint(shape, r, d) {
  if (shape !== 'scoop' || d >= r) return r;
  return Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
}

/** Các vết khoét chưa có trong hình đang hiển thị → vẽ tạm dấu vết đỏ đúng chỗ, đúng cỡ. */
function PendingCarves({ part, doneCount }) {
  const carves = part.shape?.carves ?? [];
  if (carves.length <= doneCount) return null;
  const box = baseBox(part.kind, part.params);
  return carves.slice(doneCount).map((raw, i) => {
    const c = carveToLocal(raw, box);
    const n = new THREE.Vector3(...c.n).normalize();
    const pos = new THREE.Vector3(...c.p).addScaledVector(n, 0.03);
    const q = new THREE.Quaternion().setFromUnitVectors(Z, n);
    const f = carveFootprint(c.s, c.r, c.d);
    return (
      <mesh
        key={doneCount + i}
        geometry={c.s === 'square' ? pendingGeos.square : pendingGeos.round}
        material={pendingMat}
        position={pos}
        quaternion={q}
        scale={[f, f, 1]}
        renderOrder={6}
        raycast={() => null} // không chặn tia dò chuột
        dispose={null}
      />
    );
  });
}

/**
 * Kết quả khoét (Map partId → geometry) – tính lại khi khối liên quan thay đổi.
 * Chỉ một yêu cầu chạy cùng lúc; thay đổi dồn dập (kéo thanh trượt) chỉ tính phiên bản MỚI NHẤT.
 */
function useWorkerCuts(parts) {
  const key = cutKey(parts);
  const [cuts, setCuts] = useState(() => new Map());
  const latest = useRef(parts);
  latest.current = parts;
  const st = useRef({ inst: ++instanceSeq, req: 0, busy: false, pending: false });
  const doneRef = useRef(new Map()); // partId → số vết gọt đã tính xong
  const replace = (next) =>
    setCuts((prev) => {
      prev.forEach((g) => g.dispose());
      return next;
    });

  const send = () => {
    const w = getWorker();
    const s = st.current;
    s.pending = false;
    if (!w) {
      // dự phòng: tính trên luồng chính
      const next = computeCutsSafe(latest.current);
      doneRef.current = new Map(latest.current.map((p) => [p.id, p.shape?.carves.length ?? 0]));
      for (const [id, g] of next) g.userData.carves = doneRef.current.get(id);
      replace(next);
      return;
    }
    s.busy = true;
    s.req += 1;
    w.postMessage({ reqId: `${s.inst}:${s.req}`, parts: latest.current });
  };

  useEffect(() => {
    const w = getWorker();
    if (!w) return undefined;
    const onMsg = (e) => {
      const s = st.current;
      if (e.data.reqId !== `${s.inst}:${s.req}`) return; // của phiên bản khác
      s.busy = false;
      if (e.data.error) console.warn('[NGK] Không khoét được khối:', e.data.error);
      else {
        // số vết đã tính xong của từng khối (kể cả khối mà phép gọt không đổi hình) → vệt đỏ "đang chờ" luôn được xoá
        doneRef.current = new Map(e.data.results.map((r) => [r.id, r.carves]));
        replace(new Map(e.data.results.filter((r) => r.position).map((r) => [r.id, toGeometry(r)])));
        if (e.data.failed?.length) toast('Không gọt được ở vị trí vừa chọn – thử cỡ cọ / độ sâu khác.', { tone: 'warning' });
      }
      if (s.pending) send();
    };
    w.addEventListener('message', onMsg);
    return () => w.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!key) {
      replace(new Map());
      return;
    }
    if (st.current.busy) st.current.pending = true;
    else send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => setCuts((prev) => (prev.forEach((g) => g.dispose()), new Map())), []);
  return { cuts, done: doneRef.current };
}

/** CSG có thể lỗi với hình học quá phức tạp/hở → không làm sập khung 3D, hiển thị khối chưa khoét. */
function computeCutsSafe(parts) {
  try {
    return computeCuts(parts);
  } catch (err) {
    console.warn('[NGK] Không khoét được khối:', err);
    return new Map();
  }
}

function PartView({ part, surfaceMat, metalMat, selected, register, cutGeo, doneCount }) {
  const geo = useDisposable(() => buildPartGeometry(part.kind, part.params), [part.kind, JSON.stringify(part.params)]);
  // dispose thủ công vì `geo` là object chứa nhiều geometry
  useEffect(() => () => geo.owned.forEach((g) => g.dispose()), [geo]);
  const outline = useMemo(() => {
    if (!selected) return null;
    const box = partLocalBox(geo);
    const size = box.getSize(new THREE.Vector3()).addScalar(0.4);
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    return { g, center: box.getCenter(new THREE.Vector3()) };
  }, [selected, geo]);
  useEffect(() => () => outline?.g.dispose(), [outline]);

  const ref = (obj) => {
    if (!register) return;
    const objects = useCustomStore.getState().objects;
    if (obj) {
      obj.userData.partId = part.id;
      objects.set(part.id, obj);
    } else objects.delete(part.id);
  };

  return (
    <group
      ref={ref}
      position={part.pos}
      rotation={[part.rot[0] * D2R, part.rot[1] * D2R, part.rot[2] * D2R]}
      scale={part.scale}
      visible={!part.hidden}
    >
      {geo.metal && <mesh geometry={cutGeo ?? geo.metal} material={surfaceMat} dispose={null} />}
      {geo.gem && <mesh geometry={geo.gem} material={surfaceMat} scale={geo.gemScale} dispose={null} />}
      {geo.setting && <mesh geometry={geo.setting} material={metalMat} dispose={null} />}
      {outline && <lineSegments geometry={outline.g} material={outlineMat} position={outline.center} renderOrder={20} />}
      {register && geo.metal && <PendingCarves part={part} doneCount={doneCount} />}
    </group>
  );
}
