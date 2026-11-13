// TRÌNH DỰNG HÌNH trong khung 3D (chỉ ở Studio, loại "Tự tạo"):
//  - Lưới đo mm trên mặt phẳng y = 0
//  - Tay cầm (gizmo) kéo / xoay / co giãn; nhiều khối được biến đổi quanh một điểm tựa chung
//  - Bấm để chọn khối (bấm khối trong nhóm → chọn cả nhóm, giữ Shift/Ctrl để chọn thêm)
//  - Chế độ "đặt lên bề mặt": bấm lên khối khác / mặt lưới → khối đang chọn đặt đáy lên đó, dựng theo pháp tuyến
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Grid, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDesignStore } from '../../store/designStore.js';
import { useCustomStore } from '../../store/customStore.js';
import { toast } from '../../store/toastStore.js';
import { MAX_CARVES } from '@ngk/shared';
import { expandToGroups, partMatrix, setPartMatrix } from './customOps.js';
import { baseBox, carveFromLocal } from './partMath.js';
import { carveFootprint } from './CustomModel.jsx';
import { WireTool } from './WireTool.jsx';
import {
  chooseStretchAxis,
  localBox,
  partsInRect,
  rotateMatrices,
  rotatedDegrees,
  setRotateLock,
  startRotate,
  startStretch,
  stretchMatrix,
} from './gestures.js';

const UP = new THREE.Vector3(0, 1, 0);
export const FLOOR_Y = 0; // độ cao mặt lưới (mặt bàn) – cố định
const raycaster = new THREE.Raycaster();
const CLICK_TOLERANCE = 5;
const STROKE_SPACING = 0.35; // khoảng cách giữa các vết khoét trong một nét kéo (× cỡ cọ) – nhỏ = rãnh mượt

// ---- KÉO "TRỰC TIẾP" ----
// Trong lúc kéo / xoay / giãn: chỉ đổi vị trí vật 3D trên màn hình (rẻ, mượt), KHÔNG cập nhật dữ liệu thiết kế
// mỗi lần chuột nhích (việc đó khiến cả giao diện vẽ lại → giật). Thả chuột mới ghi vào thiết kế: 1 bước Undo.
function liveApply(live, id, m) {
  const obj = useCustomStore.getState().objects.get(id);
  if (!obj) return;
  m.decompose(obj.position, obj.quaternion, obj.scale);
  live.set(id, m);
}
function liveCommit(live) {
  if (!live?.size) return;
  useDesignStore.getState().apply((c) => {
    for (const p of c.parts) {
      const m = live.get(p.id);
      if (m) setPartMatrix(p, m);
    }
  });
}

export function CustomEditor({ config }) {
  const { gl, camera, controls } = useThree();
  const { selected, gizmo, snap, grid, placeMode, tool } = useCustomStore();
  const pivot = useMemo(() => new THREE.Object3D(), []);
  const tc = useRef();
  const drag = useRef(null);
  const parts = config.parts;
  const selParts = parts.filter((p) => selected.includes(p.id) && !p.locked);
  const selKey = selParts.map((p) => p.id).join(',');
  // Lưới = "mặt bàn" CỐ ĐỊNH ở y = 0 (giống Blender / Tinkercad). Không cho lưới bám theo khối thấp nhất:
  // khi kéo khối lên xuống, lưới chạy theo rồi bật về sẽ gây hoa mắt. Khối mới được đặt nằm sẵn trên lưới.
  const floorY = FLOOR_Y;

  // Cho phép đặt khối mới vào giữa khung nhìn hiện tại (tâm xoay camera, chiếu xuống mặt lưới)
  // Đang giữ Ctrl/Alt → tay cầm (gizmo) tạm khóa: với khối nhỏ (đá, mặt dây) tay cầm che kín cả khối,
  // nếu không khóa thì bấm vào khối luôn trúng tay cầm và Ctrl-xoay / Alt-giãn / Alt-chọn vùng không chạy được.
  const [modHeld, setModHeld] = useState(false);
  useEffect(() => {
    const upd = (e) => setModHeld(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
    const reset = () => setModHeld(false);
    window.addEventListener('keydown', upd);
    window.addEventListener('keyup', upd);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', upd);
      window.removeEventListener('keyup', upd);
      window.removeEventListener('blur', reset);
    };
  }, []);
  const carveOn = useCustomStore((s) => s.carve.on);
  const wireMode = useCustomStore((s) => s.wire?.mode ?? null);
  // đang kéo/xoay/giãn trực tiếp → ẩn tay cầm (nó nằm ở vị trí cũ cho tới khi thả chuột)
  const liveGesture = useCustomStore((s) => ['move', 'rotate', 'stretch'].includes(s.activeTool));
  const gizmoEnabled = !modHeld && tool === 'select' && !carveOn && !wireMode;
  const previewRef = useRef();

  // chỉ khi dev: cho kiểm thử tự động dùng THREE (dò điểm trên bề mặt khối)
  useEffect(() => {
    if (import.meta.env?.DEV) window.__ngk = { ...(window.__ngk ?? {}), THREE };
  }, []);

  // Tia nhìn từ GIỮA MÀN HÌNH của camera → dùng để đặt khối mới ngay chỗ người dùng đang nhìn
  useEffect(() => {
    useCustomStore.setState({
      viewRay: () => {
        const origin = camera.position.clone();
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const focusDist = controls ? camera.position.distanceTo(controls.target) : 60;
        return { origin, dir, focusDist };
      },
    });
    return () => useCustomStore.setState({ viewRay: null });
  }, [camera, controls]);

  // Đặt điểm tựa theo lựa chọn (không làm khi đang kéo)
  useLayoutEffect(() => {
    if (drag.current || !selParts.length) return;
    if (selParts.length === 1) {
      partMatrix(selParts[0]).decompose(pivot.position, pivot.quaternion, pivot.scale);
    } else {
      const c = new THREE.Vector3();
      for (const p of selParts) c.add(new THREE.Vector3(...p.pos));
      pivot.position.copy(c.divideScalar(selParts.length));
      pivot.quaternion.identity();
      pivot.scale.set(1, 1, 1);
    }
    pivot.updateMatrix();
    pivot.updateMatrixWorld(true);
  });

  const onMouseDown = () => {
    pivot.updateMatrix();
    drag.current = { M0inv: pivot.matrix.clone().invert(), start: selParts.map((p) => [p.id, partMatrix(p)]), live: new Map() };
    useCustomStore.getState().setDragging(true);
  };
  const onObjectChange = () => {
    if (!drag.current) return;
    pivot.updateMatrix();
    const delta = pivot.matrix.clone().multiply(drag.current.M0inv);
    for (const [id, m] of drag.current.start) liveApply(drag.current.live, id, delta.clone().multiply(m));
  };
  const onMouseUp = () => {
    if (!drag.current) return;
    const { live } = drag.current;
    drag.current = null;
    liveCommit(live);
    useCustomStore.getState().setDragging(false);
  };

  // ---- chế độ chuột: chọn / kéo màn hình / xoay khối / kéo giãn / chọn vùng (sự kiện DOM + raycast thủ công) ----
  // Kéo màn hình dùng chức năng "pan" có sẵn của OrbitControls: Ctrl + kéo chuột trái = pan;
  // chế độ "Kéo màn hình" trên thanh công cụ thì chuột trái pan luôn không cần giữ phím.
  useEffect(() => {
    if (!controls) return undefined;
    controls.enablePan = true;
    controls.mouseButtons.LEFT = tool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    return () => {
      controls.enablePan = false;
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    };
  }, [controls, tool]);

  useEffect(() => {
    const el = gl.domElement;
    let down = null;
    let gesture = null; // { kind: 'rotate' | 'stretch' | 'marquee', ... }
    const box = document.createElement('div'); // khung chọn vùng
    Object.assign(box.style, {
      position: 'absolute',
      border: '1px dashed #d9b766',
      background: 'rgba(217,183,102,0.08)',
      pointerEvents: 'none',
      display: 'none',
      zIndex: 5,
    });
    el.parentElement?.appendChild(box);

    // vòng tròn arcball + nhãn hướng dẫn khi đang xoay
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'absolute',
      border: '1.5px dashed rgba(217,183,102,0.75)',
      borderRadius: '50%',
      pointerEvents: 'none',
      display: 'none',
      zIndex: 5,
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.12) inset',
    });
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'absolute',
      transform: 'translate(-50%, 8px)',
      padding: '4px 10px',
      borderRadius: '999px',
      background: 'rgba(14,14,16,0.85)',
      color: '#f3e2b3',
      font: '500 11px "Be Vietnam Pro", sans-serif',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      display: 'none',
      zIndex: 6,
    });
    el.parentElement?.append(ring, label);
    const showRing = (g) => {
      Object.assign(ring.style, {
        display: 'block',
        left: `${g.centerPx.x - g.radius}px`,
        top: `${g.centerPx.y - g.radius}px`,
        width: `${g.radius * 2}px`,
        height: `${g.radius * 2}px`,
        borderColor: g.lock ? { x: '#e5675f', y: '#6fc49a', z: '#6f9fe5' }[g.lock] : 'rgba(217,183,102,0.75)',
      });
      const mode = g.lock ? `Khóa trục ${g.lock.toUpperCase()} (bấm lại để mở)` : 'Trong vòng: xoay tự do · Ngoài vòng: xoay quanh hướng nhìn';
      label.textContent = `${rotatedDegrees(g)}° · ${mode} · X/Y/Z khóa trục · Shift bước 15°`;
      Object.assign(label.style, { display: 'block', left: `${g.centerPx.x}px`, top: `${g.centerPx.y + g.radius}px` });
    };
    const hideRing = () => {
      ring.style.display = 'none';
      label.style.display = 'none';
    };
    const ptr = (e) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
    };
    let lastPtr = null;

    const ndcOf = (e) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pickables = (exclude = []) => {
      const out = [];
      for (const [id, obj] of useCustomStore.getState().objects) {
        const p = useDesignStore.getState().config.parts.find((x) => x.id === id);
        if (obj && p && !p.hidden && !p.locked && !exclude.includes(id)) out.push(obj);
      }
      return out;
    };
    const partIdOf = (o) => {
      while (o && !o.userData.partId) o = o.parent;
      return o?.userData.partId ?? null;
    };

    const design = () => useDesignStore.getState();
    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    const lockOrbit = (e) => {
      if (controls) controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    };

    // capture → chạy TRƯỚC OrbitControls để kịp khóa xoay camera khi bắt đầu thao tác trên khối
    // ---- CỌ KHOÉT: bấm / kéo trên khối kim loại để xoá bớt vật liệu ----
    // Bề mặt "đóng băng" lúc bắt đầu nét kéo: cả nét bám theo bề mặt này để rãnh sâu đều,
    // không bị lún dần vào đáy của chính vết vừa khoét (muốn sâu hơn thì kéo thêm nét nữa).
    const freezeSurface = (id) => {
      const obj = useCustomStore.getState().objects.get(id);
      const src = [];
      obj?.traverse((o) => o.isMesh && o.material !== undefined && src.push(o));
      // Giữ THAM CHIẾU tới hình học đang hiển thị (không sao chép – tốn kém với khối nhiều tam giác).
      // Khi CSG tính xong, hình hiển thị được thay bằng hình mới, nhưng hình cũ vẫn còn nguyên dữ liệu CPU
      // và cây BVH → nét kéo tiếp tục bám đúng bề mặt lúc bắt đầu, dò chuột vẫn nhanh.
      const meshes = src.map((m) => {
        const frozen = new THREE.Mesh(m.geometry, m.material);
        frozen.matrixAutoUpdate = false;
        frozen.matrixWorld.copy(m.matrixWorld);
        return frozen;
      });
      return { meshes, dispose: () => {} };
    };
    const strokeHit = (e, stroke) => {
      raycaster.setFromCamera(ndcOf(e), camera);
      const h = raycaster.intersectObjects(stroke.meshes, false)[0];
      return h ? { point: h.point } : null;
    };

    const carveHit = (e, onlyId = null) => {
      raycaster.setFromCamera(ndcOf(e), camera);
      const hits = raycaster.intersectObjects(pickables(), true).filter((h) => h.object.isMesh);
      for (const h of hits) {
        const id = partIdOf(h.object);
        const part = design().config.parts.find((p) => p.id === id);
        if (!part || part.kind === 'gem') continue; // chỉ khoét khối kim loại
        if (onlyId && id !== onlyId) continue;
        return { h, id, part };
      }
      return null;
    };
    const stampFrom = ({ h, id, part }) => {
      const obj = useCustomStore.getState().objects.get(id);
      obj.updateWorldMatrix(true, false);
      const local = obj.worldToLocal(h.point.clone()); // toạ độ hình học (đã bỏ co giãn của khối)
      // HƯỚNG GỌT = hướng về phía người nhìn (không dùng pháp tuyến bề mặt: ở chỗ nhọn / mặt cong / khối co giãn
      // không đều, pháp tuyến có thể bị tính ngược vào trong → khoét rỗng bên trong thay vì gọt từ ngoài vào)
      const toCam = camera.position.clone().sub(h.point).normalize();
      const n = toCam.transformDirection(obj.matrixWorld.clone().invert());
      const avgScale = (Math.abs(part.scale[0]) + Math.abs(part.scale[1]) + Math.abs(part.scale[2])) / 3 || 1;
      const { shape, size, depth } = useCustomStore.getState().carve;
      // lưu THEO TỈ LỆ hộp bao của khối → đổi kích thước khối thì vết khoét co giãn theo, không bị "mất"
      return carveFromLocal(
        { s: shape, p: local.toArray(), n: n.toArray(), r: size / avgScale, d: depth / avgScale },
        baseBox(part.kind, part.params),
      );
    };
    const addStamp = (id, stamp, transient) => {
      const p = design().config.parts.find((x) => x.id === id);
      if (p && p.shape.carves.length >= MAX_CARVES) {
        if (!addStamp.warned) toast(`Tối đa ${MAX_CARVES} vết khoét trên một khối.`, { tone: 'warning' });
        addStamp.warned = true;
        return;
      }
      design().apply(
        (c) => {
          const part = c.parts.find((x) => x.id === id);
          if (part) part.shape.carves.push(stamp);
        },
        { transient },
      );
    };
    const updatePreview = (e) => {
      const pv = previewRef.current;
      if (!pv) return;
      const st = useCustomStore.getState();
      const hit = st.carve.on ? carveHit(e) : null;
      if (!hit) {
        pv.visible = false;
        return;
      }
      // vòng xem trước quay mặt về phía người nhìn – đúng hướng cọ sẽ gọt
      const toCam = camera.position.clone().sub(hit.h.point).normalize();
      pv.position.copy(hit.h.point).addScaledVector(toCam, 0.05);
      pv.quaternion.copy(camera.quaternion);
      pv.scale.setScalar(carveFootprint(st.carve.shape, st.carve.size, st.carve.depth));
      pv.visible = true;
    };

    const onDown = (e) => {
      if (e.button !== 0) return;
      const st = useCustomStore.getState();
      if (st.wire?.mode === 'draw') return; // đang vẽ sợi: chỉ xoay camera (WireTool xử lý cú bấm)
      if (st.carve.on && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
        const hit = carveHit(e);
        if (!hit) return; // bấm nền → xoay khung nhìn như thường
        if (!st.selected.includes(hit.id)) st.select([hit.id]);
        addStamp.warned = false;
        const stroke = freezeSurface(hit.id); // chụp bề mặt TRƯỚC khi khoét vết đầu tiên
        addStamp(hit.id, stampFrom(hit), true);
        gesture = { kind: 'carve', id: hit.id, last: hit.h.point.clone(), stroke };
        down = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        e.stopImmediatePropagation();
        lockOrbit(e);
        st.setActiveTool('carve');
        return;
      }
      // có phím giữ hoặc đang ở chế độ thao tác → ưu tiên thao tác trên khối, bỏ qua tay cầm đang nằm dưới chuột
      const overrides = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || st.tool !== 'select';
      if (tc.current?.axis && !overrides) return; // đang cầm tay cầm gizmo
      down = { x: e.clientX, y: e.clientY };
      if (st.placeMode) return;
      raycaster.setFromCamera(ndcOf(e), camera);
      const hit = raycaster.intersectObjects(pickables(), true)[0];
      const id = hit ? partIdOf(hit.object) : null;

      // phím giữ ghi đè chế độ: Ctrl → xoay khối / kéo màn hình; Alt → kéo giãn / chọn vùng
      let tool = st.tool;
      if (e.ctrlKey || e.metaKey) tool = id ? 'rotate' : 'pan';
      else if (e.altKey) tool = id ? 'stretch' : 'marquee';
      else if (e.shiftKey && id) tool = 'move'; // Shift + kéo khối = di chuyển tự do theo chuột

      if (tool === 'move') {
        // kéo trên mặt phẳng song song màn hình, đi qua điểm bấm (giống phím G của Blender)
        const ids = st.selected.includes(id) ? st.selected : expandToGroups([id]);
        const parts = design().config.parts.filter((p) => ids.includes(p.id) && !p.locked);
        const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        gesture = {
          kind: 'move',
          ids,
          clickId: id,
          moved: false,
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
          p0: hit.point.clone(),
          start: new Map(parts.map((p) => [p.id, partMatrix(p)])),
          live: new Map(),
        };
        e.preventDefault();
        e.stopImmediatePropagation(); // không cho camera pan (OrbitControls mặc định Shift + kéo = pan)
        lockOrbit(e);
        return;
      }

      // Shift + kéo NỀN: OrbitControls mặc định coi Shift như Ctrl (kéo màn hình) → gây nhầm lẫn.
      // OrbitControls "đảo" chức năng chuột trái khi có Shift, nên ta đảo trước một lần cho triệt tiêu:
      // kết quả Shift + kéo nền = kéo nền bình thường (xoay khung nhìn, hoặc kéo màn hình ở chế độ Kéo màn hình).
      if (e.shiftKey && !id && !e.ctrlKey && !e.metaKey && !e.altKey && controls) {
        const normal = controls.mouseButtons.LEFT;
        controls.mouseButtons.LEFT = normal === THREE.MOUSE.PAN ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
        const restore = () => {
          controls.mouseButtons.LEFT = normal;
          window.removeEventListener('pointerup', restore, true);
        };
        window.addEventListener('pointerup', restore, true);
        if (tool === 'pan') st.setActiveTool('pan');
        return;
      }

      if (tool === 'pan') {
        st.setActiveTool('pan'); // OrbitControls tự xử lý (Ctrl+kéo = pan, hoặc LEFT = PAN)
        return;
      }
      if (tool === 'rotate' && id) {
        const cfgParts = design().config.parts;
        const ids = st.selected.includes(id) ? st.selected : expandToGroups([id]);
        if (!st.selected.includes(id)) st.select(ids);
        const r = el.getBoundingClientRect();
        gesture = {
          kind: 'rotate',
          g: startRotate(cfgParts.filter((p) => ids.includes(p.id)), st.objects, camera, { width: r.width, height: r.height }, ptr(e)),
        };
        lastPtr = ptr(e);
        showRing(gesture.g);
      } else if (tool === 'stretch' && id) {
        const part = design().config.parts.find((p) => p.id === id);
        st.select([id]);
        gesture = { kind: 'stretch', g: startStretch(part, st.objects.get(id), hit.point) };
      } else if (tool === 'marquee') {
        const p = local(e);
        gesture = { kind: 'marquee', x0: p.x, y0: p.y, add: e.shiftKey };
      } else {
        return; // chế độ Chọn, hoặc Xoay/Giãn mà bấm vào nền → xoay camera như bình thường
      }
      e.preventDefault();
      e.stopImmediatePropagation(); // tay cầm / camera không nhận cú bấm này
      lockOrbit(e);
      st.setActiveTool(gesture.kind);
    };

    const onMove = (e) => {
      if (!gesture || gesture.kind === 'carve') updatePreview(e);
      if (!gesture || !down) return;
      const st = useCustomStore.getState();
      if (gesture.kind === 'carve') {
        // kéo cọ: thêm vết khoét mỗi khi chuột đi được STROKE_SPACING × cỡ cọ trên bề mặt (chỉ trên khối đang khoét)
        const obj = st.objects.get(gesture.id);
        const sh = obj && strokeHit(e, gesture.stroke);
        if (!sh || sh.point.distanceTo(gesture.last) < st.carve.size * STROKE_SPACING) return;
        // lấp khoảng trống nếu chuột đi nhanh: rải vết đều giữa điểm trước và điểm hiện tại
        const part = design().config.parts.find((p) => p.id === gesture.id);
        const step = st.carve.size * STROKE_SPACING;
        const dist = sh.point.distanceTo(gesture.last);
        const n = Math.min(12, Math.floor(dist / step));
        for (let k = 1; k <= n; k++) {
          const pt = gesture.last.clone().lerp(sh.point, k / n);
          addStamp(gesture.id, stampFrom({ h: { point: pt }, id: gesture.id, part }), true);
        }
        gesture.last.copy(sh.point);
        return;
      }
      if (gesture.kind === 'move') {
        if (!gesture.moved) {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK_TOLERANCE) return; // còn là cú bấm
          gesture.moved = true;
          if (!st.selected.includes(gesture.clickId)) st.select(gesture.ids);
          st.setActiveTool('move');
        }
        raycaster.setFromCamera(ndcOf(e), camera);
        const p = raycaster.ray.intersectPlane(gesture.plane, new THREE.Vector3());
        if (!p) return;
        const d = p.sub(gesture.p0);
        const t = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z);
        for (const [id, m] of gesture.start) liveApply(gesture.live, id, t.clone().multiply(m));
        return;
      }
      if (gesture.kind === 'rotate') {
        lastPtr = ptr(e);
        const mats = rotateMatrices(gesture.g, lastPtr, e.shiftKey); // Shift = bắt bước 15°
        showRing(gesture.g);
        gesture.live ??= new Map();
        for (const [id, m] of mats) liveApply(gesture.live, id, m);
      } else if (gesture.kind === 'stretch') {
        if (gesture.g.axis === null) {
          const drag = new THREE.Vector2(e.clientX - down.x, e.clientY - down.y);
          if (drag.length() < 6) return; // đợi đủ hướng kéo rồi mới chọn trục
          const r = el.getBoundingClientRect();
          chooseStretchAxis(gesture.g, drag, camera, { width: r.width, height: r.height });
        }
        raycaster.setFromCamera(ndcOf(e), camera);
        const m = stretchMatrix(gesture.g, raycaster.ray, { uniform: e.shiftKey, snap: st.snap });
        gesture.live ??= new Map();
        liveApply(gesture.live, gesture.g.id, m);
      } else if (gesture.kind === 'marquee') {
        const p = local(e);
        const x0 = Math.min(gesture.x0, p.x);
        const y0 = Math.min(gesture.y0, p.y);
        Object.assign(box.style, {
          display: 'block',
          left: `${x0}px`,
          top: `${y0}px`,
          width: `${Math.abs(p.x - gesture.x0)}px`,
          height: `${Math.abs(p.y - gesture.y0)}px`,
        });
      }
    };

    const endGesture = (e) => {
      const st = useCustomStore.getState();
      if (gesture.kind === 'marquee') {
        box.style.display = 'none';
        const p = local(e);
        const rect = {
          x0: Math.min(gesture.x0, p.x),
          x1: Math.max(gesture.x0, p.x),
          y0: Math.min(gesture.y0, p.y),
          y1: Math.max(gesture.y0, p.y),
        };
        if (rect.x1 - rect.x0 < CLICK_TOLERANCE && rect.y1 - rect.y0 < CLICK_TOLERANCE) {
          if (!gesture.add) st.select([]);
        } else {
          const parts = design().config.parts;
          const ids = partsInRect(rect, st.objects, camera, { width: p.w, height: p.h }, (id) => {
            const part = parts.find((x) => x.id === id);
            return part && !part.hidden && !part.locked;
          });
          st.select(gesture.add ? [...new Set([...st.selected, ...ids])] : ids);
          if (ids.length) toast(`Đã chọn ${ids.length} khối trong vùng`, { tone: 'success' });
        }
      } else if (gesture.live) {
        liveCommit(gesture.live); // kéo / xoay / giãn: ghi vào thiết kế một lần
      } else {
        design().commit(); // cọ khoét
      }
      gesture?.stroke?.dispose();
      gesture = null;
      hideRing();
      if (controls) controls.enabled = true;
    };

    // X / Y / Z khi đang xoay → khóa / mở khóa trục (kiểu Blender)
    const onKey = (e) => {
      if (gesture?.kind !== 'rotate' || !lastPtr) return;
      const k = e.key.toLowerCase();
      if (k !== 'x' && k !== 'y' && k !== 'z') return;
      // đang giữ Ctrl để xoay → Ctrl+Z / Ctrl+X không được kích hoạt Undo / Cắt
      e.preventDefault();
      e.stopImmediatePropagation();
      setRotateLock(gesture.g, k, lastPtr);
      showRing(gesture.g);
    };

    const onUp = (e) => {
      if (!down) return;
      if (useCustomStore.getState().wire?.mode === 'draw') {
        down = null;
        return;
      }
      useCustomStore.getState().setActiveTool(null);
      // Shift + bấm mà KHÔNG kéo → không phải di chuyển, xử lý như cú bấm thường (Shift = chọn thêm)
      if (gesture?.kind === 'move' && !gesture.moved) {
        gesture = null;
        if (controls) controls.enabled = true;
      }
      if (gesture) {
        endGesture(e);
        down = null;
        return;
      }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      const modClick = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey; // có phím giữ → bỏ qua tay cầm
      if (moved > CLICK_TOLERANCE || (tc.current?.axis && !modClick) || useCustomStore.getState().dragging) return;
      raycaster.setFromCamera(ndcOf(e), camera);
      const st = useCustomStore.getState();

      if (st.placeMode && st.selected.length) {
        const hit = raycaster.intersectObjects(pickables(st.selected), true)[0];
        let point;
        let normal;
        if (hit) {
          point = hit.point;
          normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        } else {
          point = raycaster.ray.intersectPlane(new THREE.Plane(UP, -FLOOR_Y), new THREE.Vector3());
          normal = UP.clone();
        }
        if (!point) return;
        placeOnSurface(st.selected, point, normal);
        st.setPlaceMode(false);
        toast('Đã đặt khối lên bề mặt', { tone: 'success' });
        return;
      }

      const hit = raycaster.intersectObjects(pickables(), true)[0];
      const id = hit ? partIdOf(hit.object) : null;
      if (!id) {
        if (!e.shiftKey && !e.ctrlKey) st.select([]);
        return;
      }
      const ids = expandToGroups([id]);
      // Shift = chọn thêm (Ctrl đã dành cho xoay khối / kéo màn hình)
      if (e.shiftKey) {
        const allIn = ids.every((x) => st.selected.includes(x));
        st.select(allIn ? st.selected.filter((x) => !ids.includes(x)) : [...new Set([...st.selected, ...ids])]);
      } else st.select(ids);
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, { capture: true }); // chạy trước phím tắt Undo của trang
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, { capture: true });
      box.remove();
      ring.remove();
      label.remove();
      if (controls) controls.enabled = true;
    };
  }, [gl, camera, controls]);

  // con trỏ chuột theo chế độ
  useEffect(() => {
    const cursors = { select: '', pan: 'grab', rotate: 'alias', stretch: 'ew-resize', marquee: 'crosshair' };
    gl.domElement.style.cursor = placeMode || carveOn ? 'crosshair' : cursors[tool] ?? '';
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [placeMode, tool, gl, carveOn]);

  return (
    <>
      {grid && (
        <Grid
          position={[0, floorY - 0.01, 0]}
          args={[200, 200]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#3a3a44"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#8a7440"
          fadeDistance={160}
          fadeStrength={1.5}
          infiniteGrid
        />
      )}
      <primitive object={pivot} />
      {/* vòng xem trước cọ khoét (cập nhật trực tiếp khi rê chuột, không qua React) */}
      <group ref={previewRef} visible={false}>
        <mesh renderOrder={30}>
          <ringGeometry args={[0.92, 1, 48]} />
          <meshBasicMaterial color="#f3d98b" transparent opacity={0.95} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh renderOrder={29}>
          <circleGeometry args={[0.92, 48]} />
          <meshBasicMaterial color="#e5675f" transparent opacity={0.22} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <WireTool />
      {selParts.length > 0 && !carveOn && !liveGesture && !wireMode && (
        <TransformControls
          key={selKey + gizmo}
          ref={tc}
          object={pivot}
          mode={gizmo}
          enabled={gizmoEnabled}
          space={selParts.length === 1 ? 'local' : 'world'}
          size={0.75}
          translationSnap={snap ? 0.5 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
          scaleSnap={snap ? 0.05 : null}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onObjectChange={onObjectChange}
        />
      )}
    </>
  );
}

/** Đặt khối lên bề mặt: 1 khối → dựng theo pháp tuyến, đáy chạm điểm bấm; nhiều khối → tịnh tiến cả cụm. */
function placeOnSurface(ids, point, normal) {
  const objects = useCustomStore.getState().objects;
  const apply = useDesignStore.getState().apply;
  if (ids.length === 1) {
    const obj = objects.get(ids[0]);
    if (!obj) return;
    const box = localBox(obj);
    apply((c) => {
      const p = c.parts.find((x) => x.id === ids[0]);
      if (!p) return;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, normal);
      const offset = -box.min.y * p.scale[1];
      const pos = point.clone().addScaledVector(normal, offset);
      setPartMatrix(p, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(...p.scale)));
    });
    return;
  }
  const box = new THREE.Box3();
  for (const id of ids) if (objects.get(id)) box.expandByObject(objects.get(id));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const d = point.clone().sub(new THREE.Vector3(c.x, box.min.y, c.z));
  apply((cfg) => {
    for (const p of cfg.parts) {
      if (!ids.includes(p.id)) continue;
      p.pos = [p.pos[0] + d.x, p.pos[1] + d.y, p.pos[2] + d.z].map((v) => Math.round(v * 1000) / 1000);
    }
  });
}
