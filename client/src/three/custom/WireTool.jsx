// CÔNG CỤ SỢI KIM LOẠI trong khung 3D:
//  - Vẽ: bấm lên bề mặt khối (sợi nằm sát lên mặt) / mặt lưới / khoảng không để đặt điểm; kéo nền vẫn xoay camera.
//    Bấm lại điểm đầu = khép vòng. Enter / bấm đúp = xong · Backspace = bỏ điểm cuối · Esc = huỷ.
//  - Sửa điểm: kéo các chấm tròn (trượt trên bề mặt khối; giữ Shift = di chuyển tự do song song màn hình),
//    bấm lên sợi = chèn điểm mới tại đó, Delete = xoá điểm đang chọn, Esc = xong.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCustomStore } from '../../store/customStore.js';
import { useDesignStore } from '../../store/designStore.js';
import { toast } from '../../store/toastStore.js';
import { wireCurve } from '../geometry/wireGeometry.js';
import { finishWireDraw, insertWirePointAt, rehugWire, removeWirePoint, setWirePoints, wireWorldPoints } from './wireOps.js';

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const CLICK = 5; // px
const HANDLE_PX = 7; // bán kính chấm điều khiển trên màn hình
const raycaster = new THREE.Raycaster();

export function WireTool() {
  const wire = useCustomStore((s) => s.wire);
  if (!wire) return null;
  return wire.mode === 'draw' ? <WireDraw /> : <WireEdit partId={wire.partId} sel={wire.sel} />;
}

/** Các hàm dò điểm dùng chung. */
function usePicker() {
  const { gl, camera } = useThree();
  return useMemo(() => {
    const el = gl.domElement;
    const ndc = (e) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const toScreen = (v) => {
      const r = el.getBoundingClientRect();
      const p = v.clone().project(camera);
      return new THREE.Vector2(((p.x + 1) / 2) * r.width + r.left, ((1 - p.y) / 2) * r.height + r.top);
    };
    const surfaces = (excludeId) => {
      const parts = useDesignStore.getState().config.parts;
      const out = [];
      for (const [id, obj] of useCustomStore.getState().objects) {
        const p = parts.find((q) => q.id === id);
        if (obj && p && !p.hidden && id !== excludeId) out.push(obj);
      }
      return out;
    };
    /** Điểm trên bề mặt khối dưới chuột (đã nâng lên `lift` theo pháp tuyến) hoặc null. */
    const surfaceAt = (e, excludeId, lift) => {
      raycaster.setFromCamera(ndc(e), camera);
      const hit = raycaster.intersectObjects(surfaces(excludeId), true).find((h) => h.object.isMesh && h.face && h.object.renderOrder !== 6);
      if (!hit) return null;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (n.dot(raycaster.ray.direction) > 0) n.negate(); // mặt sau / hình học lật → luôn nâng về phía người nhìn
      return hit.point.clone().addScaledVector(n, lift);
    };
    const floorAt = (e, lift) => {
      raycaster.setFromCamera(ndc(e), camera);
      const p = raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3());
      if (!p || p.distanceTo(camera.position) > camera.far * 0.5) return null;
      return p.setY(lift);
    };
    /** Giao với mặt phẳng song song màn hình đi qua `through`. */
    const screenPlaneAt = (e, through) => {
      raycaster.setFromCamera(ndc(e), camera);
      const n = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      return raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, through), new THREE.Vector3());
    };
    return { el, ndc, toScreen, surfaceAt, floorAt, screenPlaneAt, surfaces };
  }, [gl, camera]);
}

/** Kích thước chấm điều khiển cố định trên màn hình (không to/nhỏ theo khoảng cách camera). */
function useScreenSized(ref, px = HANDLE_PX) {
  const { camera, size } = useThree();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 45) / 2)) / size.height;
    for (const c of g.children) {
      if (!c.userData.handle) continue;
      c.scale.setScalar(Math.max(1e-3, camera.position.distanceTo(c.position) * k * px));
    }
  });
}

const handleGeo = new THREE.SphereGeometry(1, 16, 12);
const matIdle = new THREE.MeshBasicMaterial({ color: '#f3dc9c', depthTest: false, transparent: true });
const matSel = new THREE.MeshBasicMaterial({ color: '#e5675f', depthTest: false, transparent: true });
const matFirst = new THREE.MeshBasicMaterial({ color: '#6fc49a', depthTest: false, transparent: true });
const lineMat = new THREE.LineBasicMaterial({ color: '#f3dc9c', depthTest: false, transparent: true, opacity: 0.9 });
const rubberMat = new THREE.LineDashedMaterial({ color: '#f3dc9c', dashSize: 0.6, gapSize: 0.4, depthTest: false, transparent: true, opacity: 0.7 });

function curveLine(points, closed) {
  if (points.length < 2) return new THREE.BufferGeometry().setFromPoints(points);
  const curve = wireCurve(points.map((v) => v.toArray()), closed);
  return new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(Math.max(16, points.length * 24)));
}

// ── VẼ SỢI ────────────────────────────────────────────────────────────────────────────────────────
function WireDraw() {
  const points = useCustomStore((s) => s.wire.points);
  const d = useCustomStore((s) => s.wire.d ?? 1);
  const { camera, controls } = useThree();
  const pick = usePicker();
  const group = useRef();
  const rubber = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry(), rubberMat);
    l.renderOrder = 40;
    l.frustumCulled = false;
    return l;
  }, []);
  const cursor = useRef();
  useScreenSized(group);

  const line = useMemo(() => {
    const l = new THREE.Line(curveLine(points, false), lineMat);
    l.renderOrder = 40;
    l.frustumCulled = false;
    return l;
  }, [points]);
  useEffect(() => () => line.geometry.dispose(), [line]);

  useEffect(() => {
    const el = pick.el;
    // nghe ở phần tử BAO NGOÀI khung vẽ (pha capture) → chạy trước mọi xử lý chuột của khung 3D và camera,
    // kể cả khi giữ Shift / Ctrl (nếu không, Shift + kéo điểm sẽ bị hiểu là kéo cả khối)
    const host = el.parentElement ?? el;
    let down = null;
    const st = () => useCustomStore.getState();
    const cur = () => st().wire?.points ?? [];
    const pointFor = (e) => {
      const lift = (st().wire?.d ?? 1) / 2;
      const last = cur()[cur().length - 1];
      return pick.surfaceAt(e, null, lift) ?? pick.floorAt(e, lift) ?? pick.screenPlaneAt(e, last ?? controls?.target ?? new THREE.Vector3());
    };
    const finish = (closed = false) => finishWireDraw(closed);
    const onDown = (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const pts = cur();
      const p = pointFor(e);
      if (cursor.current) {
        cursor.current.visible = !!p;
        if (p) cursor.current.position.copy(p);
      }
      if (pts.length && p) {
        rubber.geometry.setFromPoints([pts[pts.length - 1], p]);
        rubber.computeLineDistances();
        rubber.visible = true;
      } else rubber.visible = false;
    };
    const onUp = (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK) return; // kéo = xoay camera
      // KHÔNG chặn sự kiện thả chuột: camera đã nhận cú bấm xuống, phải nhận cả cú thả (nếu không camera tưởng
      // chuột vẫn đang giữ → xoay theo chuột mãi). Khung 3D bỏ qua cú bấm khi đang vẽ sợi.
      const pts = cur();
      // bấm lại vào điểm đầu → khép vòng
      if (pts.length >= 3 && pick.toScreen(pts[0]).distanceTo(new THREE.Vector2(e.clientX, e.clientY)) <= HANDLE_PX + 5) {
        finish(true);
        return;
      }
      const p = pointFor(e);
      if (!p) return;
      if (pts.length && p.distanceTo(pts[pts.length - 1]) < 0.05) return;
      if (pts.length >= 200) return toast('Tối đa 200 điểm trên một sợi.', { tone: 'warning' });
      st().setWire({ points: [...pts, p] });
    };
    const onDbl = (e) => {
      e.stopImmediatePropagation();
      // bấm đúp = 2 cú bấm đã thêm 2 điểm gần trùng → bỏ điểm thừa rồi xong
      const pts = cur();
      if (pts.length >= 2 && pts[pts.length - 1].distanceTo(pts[pts.length - 2]) < 0.06) st().setWire({ points: pts.slice(0, -1) });
      finish(false);
    };
    const onKey = (e) => {
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (k === 'Enter') finish(false);
      else if (k === 'Escape') {
        st().endWire();
        toast('Đã huỷ vẽ sợi');
      } else if (k === 'Backspace' || k === 'Delete' || (mod && k.toLowerCase() === 'z')) st().setWire({ points: cur().slice(0, -1) });
      else return;
      e.preventDefault();
      e.stopImmediatePropagation(); // không để Delete xoá khối / Esc bỏ chọn / Ctrl+Z hoàn tác thiết kế
    };
    host.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('dblclick', onDbl);
    window.addEventListener('keydown', onKey, { capture: true });
    const cursorStyle = el.style.cursor;
    el.style.cursor = 'crosshair';
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('dblclick', onDbl);
      window.removeEventListener('keydown', onKey, { capture: true });
      el.style.cursor = cursorStyle;
      rubber.geometry.dispose();
    };
  }, [pick, controls, camera, rubber]);

  return (
    <group ref={group}>
      <primitive object={line} />
      <primitive object={rubber} />
      {points.map((p, i) => (
        <mesh key={i} position={p} geometry={handleGeo} material={i === 0 ? matFirst : matIdle} renderOrder={41} userData={{ handle: true }} />
      ))}
      <mesh ref={cursor} geometry={handleGeo} material={matIdle} renderOrder={41} visible={false} userData={{ handle: true }} scale={d / 2} />
    </group>
  );
}

// ── SỬA ĐIỂM ──────────────────────────────────────────────────────────────────────────────────────
function WireEdit({ partId, sel }) {
  const part = useDesignStore((s) => s.config.parts.find((p) => p.id === partId));
  const { controls, camera } = useThree();
  const pick = usePicker();
  const group = useRef();
  useScreenSized(group);
  const world = useMemo(() => (part ? wireWorldPoints(part) : []), [part]);
  const line = useMemo(() => {
    const l = new THREE.Line(curveLine(world, part?.params.closed), lineMat);
    l.renderOrder = 40;
    l.frustumCulled = false;
    return l;
  }, [world, part?.params.closed]);
  useEffect(() => () => line.geometry.dispose(), [line]);

  // khối bị xoá / Undo mất khối → thoát
  useEffect(() => {
    if (!part || part.kind !== 'wire') useCustomStore.getState().endWire();
  }, [part]);

  useEffect(() => {
    const el = pick.el;
    // nghe ở phần tử BAO NGOÀI khung vẽ (pha capture) → chạy trước mọi xử lý chuột của khung 3D và camera,
    // kể cả khi giữ Shift / Ctrl (nếu không, Shift + kéo điểm sẽ bị hiểu là kéo cả khối)
    const host = el.parentElement ?? el;
    let drag = null;
    let down = null;
    const st = () => useCustomStore.getState();
    const getPart = () => useDesignStore.getState().config.parts.find((p) => p.id === partId);
    const handleAt = (e) => {
      const p = getPart();
      if (!p) return -1;
      const pts = wireWorldPoints(p);
      const m = new THREE.Vector2(e.clientX, e.clientY);
      let best = -1;
      let bestD = HANDLE_PX + 5;
      pts.forEach((v, i) => {
        const dd = pick.toScreen(v).distanceTo(m);
        if (dd <= bestD) {
          bestD = dd;
          best = i;
        }
      });
      return best;
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      const i = handleAt(e);
      if (i < 0) return;
      const p = getPart();
      e.preventDefault();
      e.stopImmediatePropagation(); // không xoay camera / không chọn khối
      if (controls) controls.enabled = false;
      el.setPointerCapture(e.pointerId);
      st().setWire({ sel: i });
      drag = { i, pts: wireWorldPoints(p), orig: wireWorldPoints(p)[i], moved: false };
    };
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK) return;
      drag.moved = true;
      const p = getPart();
      const lift = p.params.d / 2;
      // mặc định trượt trên bề mặt khối khác; Shift (hoặc không có mặt nào dưới chuột) → song song màn hình
      const target = (!e.shiftKey && pick.surfaceAt(e, partId, lift)) || pick.screenPlaneAt(e, drag.orig);
      if (!target) return;
      drag.pts[drag.i] = target;
      setWirePoints(partId, drag.pts, { transient: true });
    };
    const onUp = (e) => {
      if (drag) {
        e.stopImmediatePropagation();
        if (controls) controls.enabled = true;
        if (drag.moved) {
          rehugWire(partId, { transient: true });
          useDesignStore.getState().commit();
        }
        drag = null;
        down = null;
        return;
      }
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK) return;
      // bấm lên chính sợi → chèn điểm tại đó (bấm chỗ khác: khung 3D xử lý như thường – chọn khối khác / bỏ chọn)
      const obj = st().objects.get(partId);
      if (!obj) return;
      raycaster.setFromCamera(pick.ndc(e), camera);
      const hit = raycaster.intersectObject(obj, true).find((h) => h.object.isMesh);
      if (!hit) return;
      // không chặn sự kiện (camera cần nhận cú thả chuột); khung 3D xử lý tiếp = chọn lại chính sợi này → không đổi gì
      const at = insertWirePointAt(partId, hit.point);
      if (at >= 0) st().setWire({ sel: at });
    };
    const onKey = (e) => {
      const k = e.key;
      const w = st().wire;
      if (k === 'Escape' || k === 'Enter') st().endWire();
      else if ((k === 'Delete' || k === 'Backspace') && w?.sel >= 0) {
        if (removeWirePoint(partId, w.sel)) st().setWire({ sel: Math.min(w.sel, getPart().params.points.length - 1) });
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    host.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
      if (controls) controls.enabled = true;
    };
  }, [pick, controls, camera, partId]);

  if (!part) return null;
  return (
    <group ref={group}>
      <primitive object={line} />
      {world.map((p, i) => (
        <mesh key={i} position={p} geometry={handleGeo} material={i === sel ? matSel : matIdle} renderOrder={41} userData={{ handle: true }} />
      ))}
    </group>
  );
}

