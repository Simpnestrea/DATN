// BẢNG VẼ 2D: vẽ tay / hình mẫu trên lưới mm → đùn thành khối "Hình vẽ" (sửa lại được bất kỳ lúc nào).
// Đường viền nằm trong đường viền khác tự thành LỖ. Có hoàn tác riêng trong bảng (Ctrl+Z / Ctrl+Y).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Brush,
  Circle,
  Copy,
  Droplet,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Heart,
  Hexagon,
  Maximize2,
  MousePointer2,
  Redo2,
  Sparkles,
  Square,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { PART_KIND_MAP, SKETCH_LIMITS } from '@ngk/shared';
import { useCustomStore } from '../../../../store/customStore.js';
import { useDesignStore } from '../../../../store/designStore.js';
import { toast } from '../../../../store/toastStore.js';
import { Button } from '../../../ui/Button.jsx';
import { Slider } from '../../../ui/controls.jsx';
import { addSketch, saveSketch } from '../../../../three/custom/customOps.js';
import {
  bounds,
  boundsOfPaths,
  chaikinClosed,
  classifyPaths,
  distToPolygon,
  finishFreehand,
  pointInPolygon,
  polygonArea,
  rotatePts,
  roundPts,
  scalePts,
  selfIntersects,
  simplifyClosed,
  softDrag,
  templateIn,
  translatePts,
} from './sketchMath.js';

const TOOLS = [
  { code: 'select', name: 'Chọn & sửa', key: 'V', Icon: MousePointer2 },
  { code: 'free', name: 'Vẽ tay', key: 'B', Icon: Brush },
  { code: 'circle', name: 'Tròn', Icon: Circle },
  { code: 'rect', name: 'Chữ nhật', Icon: Square },
  { code: 'polygon', name: 'Đa giác', Icon: Hexagon },
  { code: 'star', name: 'Ngôi sao', Icon: Star },
  { code: 'heart', name: 'Trái tim', Icon: Heart },
  { code: 'teardrop', name: 'Giọt nước', Icon: Droplet },
];
const TEMPLATE_CODES = ['circle', 'rect', 'polygon', 'star', 'heart', 'teardrop'];
const SNAP = 0.5; // mm
const HISTORY = 100;
const META = PART_KIND_MAP.get('sketch').params;

let uid = 0;
const newId = () => `s${++uid}`;
const snapV = (v, on) => (on ? Math.round(v / SNAP) * SNAP : v);
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

/** Bước lưới "đẹp" sao cho ô nhỏ trên màn hình ≥ 10px. */
function gridStep(zoom) {
  for (const s of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]) if (s * zoom >= 10) return s;
  return 100;
}

const pathD = (pts, toS) => {
  if (!pts.length) return '';
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = toS(pts[i]);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
};

export function SketchEditor() {
  const edit = useCustomStore((s) => s.sketchEdit);
  if (!edit) return null;
  return createPortal(<SketchEditorInner key={edit.partId ?? 'new'} partId={edit.partId} />, document.body);
}

function SketchEditorInner({ partId }) {
  const close = useCustomStore((s) => s.closeSketch);
  const part = useDesignStore((s) => (partId ? s.config.parts.find((p) => p.id === partId) : null));

  // ── tài liệu ───────────────────────────────────────────────────────────────────────────────────
  const [paths, setPaths] = useState(() => (part ? part.params.paths.map((pts) => ({ id: newId(), pts })) : []));
  const [depth, setDepth] = useState(part?.params.depth ?? META.depth.def);
  const [bevel, setBevel] = useState(part?.params.bevel ?? META.bevel.def);
  const [selId, setSelId] = useState(null);
  const [tool, setTool] = useState(part ? 'select' : 'free');
  const [snap, setSnap] = useState(true);
  const [soft, setSoft] = useState(1.5);
  const [sides, setSides] = useState(6);
  const [points, setPoints] = useState(5);
  const [keep, setKeep] = useState(true);
  const [dirty, setDirty] = useState(false);
  const hist = useRef({ past: [], future: [] });
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  /** Ghi thay đổi có lịch sử hoàn tác. `before` = trạng thái trước khi thay đổi (mặc định: hiện tại). */
  const commit = useCallback((next, before = pathsRef.current) => {
    const h = hist.current;
    h.past.push(before);
    if (h.past.length > HISTORY) h.past.shift();
    h.future = [];
    setPaths(next);
    setDirty(true);
  }, []);
  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(pathsRef.current);
    const prev = h.past.pop();
    setPaths(prev);
    setSelId((id) => (prev.some((p) => p.id === id) ? id : null));
  }, []);
  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(pathsRef.current);
    const next = h.future.pop();
    setPaths(next);
    setSelId((id) => (next.some((p) => p.id === id) ? id : null));
  }, []);

  const sel = paths.find((p) => p.id === selId) ?? null;
  const updateSel = (fn) => sel && commit(paths.map((p) => (p.id === sel.id ? { ...p, pts: roundPts(fn(p.pts)) } : p)));
  const removeSel = () => {
    if (!sel) return;
    commit(paths.filter((p) => p.id !== sel.id));
    setSelId(null);
  };
  const duplicateSel = () => {
    if (!sel) return;
    if (paths.length >= SKETCH_LIMITS.paths) return toast(`Tối đa ${SKETCH_LIMITS.paths} hình trong một bản vẽ.`, { tone: 'warning' });
    const copy = { id: newId(), pts: roundPts(translatePts(sel.pts, 2, -2)) };
    commit([...paths, copy]);
    setSelId(copy.id);
  };
  const addPaths = (list) => {
    const room = SKETCH_LIMITS.paths - pathsRef.current.length;
    if (room < list.length) toast(`Tối đa ${SKETCH_LIMITS.paths} hình trong một bản vẽ.`, { tone: 'warning' });
    if (room <= 0) return;
    const added = list.slice(0, room).map((pts) => ({ id: newId(), pts }));
    commit([...pathsRef.current, ...added]);
    setSelId(added[added.length - 1].id);
  };
  const addPath = (pts) => addPaths([pts]);

  // ── khung nhìn ─────────────────────────────────────────────────────────────────────────────────
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ cx: 0, cy: 0, z: 18 }); // z = điểm ảnh / mm
  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(
    (list = pathsRef.current) => {
      const all = list.flatMap((p) => p.pts);
      if (!all.length) return setView({ cx: 0, cy: 0, z: Math.max(4, Math.min(size.w, size.h) / 40) });
      const b = bounds(all);
      const z = Math.min((size.w * 0.7) / Math.max(b.w, 1), (size.h * 0.7) / Math.max(b.h, 1), 120);
      setView({ cx: b.cx, cy: b.cy, z: Math.max(1.5, z) });
    },
    [size.w, size.h],
  );
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !size.w) return; // chờ đo kích thước thật
    fitted.current = true;
    fit();
  }, [size, fit]);

  const toS = useCallback(([x, y]) => [(x - view.cx) * view.z + size.w / 2, (view.cy - y) * view.z + size.h / 2], [view, size]);
  const toMM = useCallback(
    (e) => {
      const r = svgRef.current.getBoundingClientRect();
      return [view.cx + (e.clientX - r.left - size.w / 2) / view.z, view.cy - (e.clientY - r.top - size.h / 2) / view.z];
    },
    [view, size],
  );

  // lăn chuột = phóng to/thu nhỏ quanh con trỏ (chặn cả Ctrl + lăn phóng to trang)
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const z = Math.min(400, Math.max(1, v.z * Math.exp(-e.deltaY * 0.0015)));
        const mx = v.cx + (e.clientX - r.left - r.width / 2) / v.z;
        const my = v.cy - (e.clientY - r.top - r.height / 2) / v.z;
        return { z, cx: mx - (e.clientX - r.left - r.width / 2) / z, cy: my + (e.clientY - r.top - r.height / 2) / z };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Ctrl + lăn chuột ở bất kỳ đâu trên bảng (kể cả cột bên phải) không được phóng to cả trang
  const rootRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    const block = (e) => e.ctrlKey && e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  // ── thao tác chuột ─────────────────────────────────────────────────────────────────────────────
  const drag = useRef(null);
  const [preview, setPreview] = useState(null); // nét đang vẽ / hình mẫu đang kéo
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const px = 1 / view.z; // 1 điểm ảnh = ? mm

  const selBox = sel ? bounds(sel.pts) : null;
  const handles = useMemo(() => {
    if (!selBox) return [];
    const { minX, minY, maxX, maxY, cx, cy } = selBox;
    const out = [];
    for (const fx of [-1, 0, 1])
      for (const fy of [-1, 0, 1]) {
        if (!fx && !fy) continue;
        out.push({ fx, fy, x: fx < 0 ? minX : fx > 0 ? maxX : cx, y: fy < 0 ? minY : fy > 0 ? maxY : cy });
      }
    return out;
  }, [selBox?.minX, selBox?.minY, selBox?.maxX, selBox?.maxY]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotHandle = selBox ? [selBox.cx, selBox.maxY + 26 * px] : null;

  const pickPath = (x, y) => {
    let best = null;
    for (const p of pathsRef.current) {
      const inside = pointInPolygon(x, y, p.pts);
      if (!inside && distToPolygon(x, y, p.pts) > 6 * px) continue;
      const a = Math.abs(polygonArea(p.pts));
      if (!best || a < best.a) best = { p, a };
    }
    return best?.p ?? null;
  };

  const onPointerDown = (e) => {
    if (drag.current) return;
    const el = svgRef.current;
    el.setPointerCapture(e.pointerId);
    const [x, y] = toMM(e);
    // kéo khung nhìn: chuột giữa / chuột phải / Space / Ctrl + kéo
    if (e.button === 1 || e.button === 2 || spaceHeld || e.ctrlKey || e.metaKey) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: view };
      setDragging(true);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'free') {
      drag.current = { kind: 'free', raw: [[x, y]] };
      setPreview({ kind: 'free', pts: [[x, y]] });
      setDragging(true);
      return;
    }
    if (TEMPLATE_CODES.includes(tool)) {
      const sx = snapV(x, snap);
      const sy = snapV(y, snap);
      drag.current = { kind: 'template', x0: sx, y0: sy, x1: sx, y1: sy, moved: false };
      setDragging(true);
      return;
    }
    // công cụ Chọn
    if (sel) {
      const near = (hx, hy, r = 8) => Math.hypot((hx - x) / px, (hy - y) / px) <= r;
      if (near(...rotHandle)) {
        drag.current = { kind: 'rotate', id: sel.id, c: [selBox.cx, selBox.cy], a0: Math.atan2(y - selBox.cy, x - selBox.cx), orig: sel.pts, before: paths };
        setDragging(true);
        return;
      }
      const h = handles.find((q) => near(q.x, q.y, 7));
      if (h) {
        // điểm neo = phía đối diện tay nắm
        const ax = h.fx < 0 ? selBox.maxX : h.fx > 0 ? selBox.minX : selBox.cx;
        const ay = h.fy < 0 ? selBox.maxY : h.fy > 0 ? selBox.minY : selBox.cy;
        drag.current = { kind: 'scale', id: sel.id, h, a: [ax, ay], box: selBox, orig: sel.pts, before: paths };
        setDragging(true);
        return;
      }
      let idx = -1;
      let bestD = 6 * px;
      sel.pts.forEach(([qx, qy], i) => {
        const d = Math.hypot(qx - x, qy - y);
        if (d <= bestD) {
          bestD = d;
          idx = i;
        }
      });
      if (idx >= 0) {
        drag.current = { kind: 'point', id: sel.id, index: idx, start: [x, y], orig: sel.pts, before: paths };
        setDragging(true);
        return;
      }
    }
    const hit = pickPath(x, y);
    if (hit) {
      setSelId(hit.id);
      drag.current = { kind: 'move', id: hit.id, start: [x, y], orig: hit.pts, before: paths, moved: false };
      setDragging(true);
      return;
    }
    setSelId(null);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: view };
    setDragging(true);
  };

  const setPath = (id, pts) => setPaths((list) => list.map((p) => (p.id === id ? { ...p, pts } : p)));

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setView({ ...d.v0, cx: d.v0.cx - (e.clientX - d.sx) / d.v0.z, cy: d.v0.cy + (e.clientY - d.sy) / d.v0.z });
      return;
    }
    const [x, y] = toMM(e);
    if (d.kind === 'free') {
      const last = d.raw[d.raw.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) >= 1.5 * px) {
        d.raw.push([x, y]);
        setPreview({ kind: 'free', pts: d.raw.slice() });
      }
    } else if (d.kind === 'template') {
      d.x1 = snapV(x, snap);
      d.y1 = snapV(y, snap);
      d.moved = d.moved || Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 3 * px;
      if (d.moved) setPreview({ kind: 'tpl', pts: templateIn(tool, d.x0, d.y0, d.x1, d.y1, { sides, points, keep: keep !== e.shiftKey }) });
    } else if (d.kind === 'move') {
      let dx = x - d.start[0];
      let dy = y - d.start[1];
      if (snap) {
        dx = snapV(dx, true);
        dy = snapV(dy, true);
      }
      d.moved = d.moved || dx || dy;
      setPath(d.id, translatePts(d.orig, dx, dy));
    } else if (d.kind === 'point') {
      const tx = snapV(d.orig[d.index][0] + x - d.start[0], snap);
      const ty = snapV(d.orig[d.index][1] + y - d.start[1], snap);
      setPath(d.id, softDrag(d.orig, d.index, tx - d.orig[d.index][0], ty - d.orig[d.index][1], e.altKey ? 0 : soft));
    } else if (d.kind === 'scale') {
      const { h, a, box } = d;
      const sxRaw = h.fx ? (x - a[0]) / ((h.fx > 0 ? box.maxX : box.minX) - a[0] || 1e-6) : 1;
      const syRaw = h.fy ? (y - a[1]) / ((h.fy > 0 ? box.maxY : box.minY) - a[1] || 1e-6) : 1;
      let sx = Math.max(0.01, sxRaw);
      let sy = Math.max(0.01, syRaw);
      // tay nắm GÓC giữ tỉ lệ (Shift = tự do); tay nắm CẠNH chỉ giãn một chiều
      if (h.fx && h.fy && !e.shiftKey) sx = sy = Math.max(sx, sy);
      setPath(d.id, scalePts(d.orig, a[0], a[1], sx, sy));
    } else if (d.kind === 'rotate') {
      let ang = Math.atan2(y - d.c[1], x - d.c[0]) - d.a0;
      if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); // bước 15°
      setPath(d.id, rotatePts(d.orig, d.c[0], d.c[1], ang));
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (svgRef.current.hasPointerCapture?.(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (d.kind === 'free') {
      setPreview(null);
      const loops = finishFreehand(d.raw, px);
      if (!loops.length) return d.raw.length > 3 && toast('Nét vẽ quá nhỏ – hãy vẽ một vòng khép kín lớn hơn.', { tone: 'warning' });
      addPaths(loops);
      if (loops.length > 1) toast(`Nét vẽ cắt chéo qua chính nó → đã tách thành ${loops.length} hình riêng.`);
    } else if (d.kind === 'template') {
      setPreview(null);
      // bấm không kéo → hình 10 mm đặt giữa tại chỗ bấm
      const pts = d.moved
        ? templateIn(tool, d.x0, d.y0, d.x1, d.y1, { sides, points, keep: keep !== e.shiftKey })
        : templateIn(tool, d.x0 - 5, d.y0 - 5, d.x0 + 5, d.y0 + 5, { sides, points, keep: true });
      const b = bounds(pts);
      if (b.w < 0.2 || b.h < 0.2) return;
      addPath(pts);
    } else if (d.kind !== 'pan') {
      // kết thúc kéo: làm tròn số và ghi một bước hoàn tác
      const cur = pathsRef.current;
      const changed = cur.find((p) => p.id === d.id)?.pts !== d.orig;
      if (changed && (d.kind !== 'move' || d.moved)) commit(cur.map((p) => (p.id === d.id ? { ...p, pts: roundPts(p.pts) } : p)), d.before);
      else setPaths(d.before);
    }
  };

  // ── phím ───────────────────────────────────────────────────────────────────────────────────────
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === ' ') {
      setSpaceHeld(true);
      e.preventDefault();
      return;
    }
    if (mod && k === 'z' && !e.shiftKey) undo();
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) redo();
    else if (mod && k === 'd') duplicateSel();
    else if (!mod && (k === 'delete' || k === 'backspace')) removeSel();
    else if (!mod && k === 'v') setTool('select');
    else if (!mod && k === 'b') setTool('free');
    else if (!mod && k === 'f') fit();
    else if (k === 'escape') {
      if (drag.current) {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        setPreview(null);
        if (d.before) setPaths(d.before);
      } else if (selId) setSelId(null);
      else if (tool !== 'select') setTool('select');
    } else if (sel && k.startsWith('arrow')) {
      const s = e.shiftKey ? 1 : 0.1;
      const [dx, dy] = { arrowleft: [-s, 0], arrowright: [s, 0], arrowup: [0, s], arrowdown: [0, -s] }[k];
      updateSel((pts) => translatePts(pts, dx, dy));
    } else return;
    e.preventDefault();
  };
  useEffect(() => {
    const down = (e) => keyRef.current(e);
    const up = (e) => e.key === ' ' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── thông tin / cảnh báo (tính khi đã thả chuột, không tính lại liên tục trong lúc kéo) ──────
  const roles = useMemo(() => classifyPaths(paths), [paths]);
  const warnRef = useRef(new Set());
  const warn = useMemo(() => {
    if (dragging) return warnRef.current;
    const s = new Set(paths.filter((p) => selfIntersects(p.pts)).map((p) => p.id));
    warnRef.current = s;
    return s;
  }, [paths, dragging]);
  const total = paths.length ? boundsOfPaths(paths) : null;
  const holes = [...roles.values()].filter((r) => r.hole).length;
  const pointCount = paths.reduce((n, p) => n + p.pts.length, 0);

  // ── lưu ────────────────────────────────────────────────────────────────────────────────────────
  const save = () => {
    if (!paths.length) return;
    if (pointCount > SKETCH_LIMITS.total) {
      toast(`Bản vẽ quá nhiều điểm (${pointCount}/${SKETCH_LIMITS.total}) – bấm “Làm mượt” để giảm bớt điểm.`, { tone: 'warning' });
      return;
    }
    const list = paths.map((p) => p.pts);
    if (part) saveSketch(part.id, list, { depth, bevel });
    else {
      const id = addSketch(list, { depth, bevel });
      if (!id) return;
    }
    close();
  };
  const cancel = () => {
    if (dirty && !window.confirm('Bỏ các thay đổi trong bảng vẽ?')) return;
    close();
  };

  const step = gridStep(view.z);
  const major = step * 5;
  const left = view.cx - size.w / 2 / view.z;
  const right = view.cx + size.w / 2 / view.z;
  const bottom = view.cy - size.h / 2 / view.z;
  const top = view.cy + size.h / 2 / view.z;
  const lines = [];
  for (let gx = Math.ceil(left / step) * step; gx <= right; gx += step) lines.push({ v: true, at: gx, major: Math.abs(gx / major - Math.round(gx / major)) < 1e-6 });
  for (let gy = Math.ceil(bottom / step) * step; gy <= top; gy += step) lines.push({ v: false, at: gy, major: Math.abs(gy / major - Math.round(gy / major)) < 1e-6 });

  const cursor = dragging && drag.current?.kind === 'pan' ? 'grabbing' : spaceHeld ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const outers = paths.filter((p) => !roles.get(p.id)?.hole);

  return (
    <div
      ref={rootRef}
      data-keytrap
      className="fixed inset-0 z-50 flex bg-ink-950/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Bảng vẽ 2D"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl">
        {/* khung vẽ */}
        <div ref={wrapRef} className="relative min-w-0 flex-1 bg-ink-950">
          <svg
            ref={svgRef}
            data-testid="sketch-canvas"
            width={size.w}
            height={size.h}
            className="absolute inset-0 touch-none select-none"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            {lines.map((l, i) => {
              const [sx, sy] = toS(l.v ? [l.at, 0] : [0, l.at]);
              return l.v ? (
                <line key={i} x1={sx} x2={sx} y1={0} y2={size.h} stroke={l.major ? '#3a3a42' : '#24242a'} strokeWidth={1} />
              ) : (
                <line key={i} y1={sy} y2={sy} x1={0} x2={size.w} stroke={l.major ? '#3a3a42' : '#24242a'} strokeWidth={1} />
              );
            })}
            {/* trục */}
            <line x1={toS([0, 0])[0]} x2={toS([0, 0])[0]} y1={0} y2={size.h} stroke="#6fc49a" strokeOpacity={0.35} />
            <line y1={toS([0, 0])[1]} y2={toS([0, 0])[1]} x1={0} x2={size.w} stroke="#e5675f" strokeOpacity={0.35} />
            {/* số đo trên lưới chính */}
            {lines
              .filter((l) => l.major)
              .map((l, i) => {
                const [sx, sy] = toS(l.v ? [l.at, 0] : [0, l.at]);
                return l.v ? (
                  <text key={`t${i}`} x={sx + 3} y={size.h - 6} fontSize={10} fill="#6b6b75">
                    {fmt(l.at)}
                  </text>
                ) : (
                  <text key={`t${i}`} x={4} y={sy - 3} fontSize={10} fill="#6b6b75">
                    {fmt(l.at)}
                  </text>
                );
              })}

            {/* phần đặc (mỗi khối đặc kèm các lỗ của nó, tô chẵn-lẻ) */}
            {outers.map((o) => (
              <path
                key={`f${o.id}`}
                d={[o, ...paths.filter((p) => roles.get(p.id)?.parent === o.id)].map((p) => pathD(p.pts, toS)).join(' ')}
                fillRule="evenodd"
                fill="#d9b766"
                fillOpacity={0.22}
              />
            ))}
            {paths.map((p) => {
              const hole = roles.get(p.id)?.hole;
              const isSel = p.id === selId;
              return (
                <path
                  key={p.id}
                  d={pathD(p.pts, toS)}
                  fill="none"
                  stroke={warn.has(p.id) ? '#e5675f' : isSel ? '#f3dc9c' : '#c9a75a'}
                  strokeWidth={isSel ? 2 : 1.4}
                  strokeDasharray={hole ? '5 4' : undefined}
                />
              );
            })}

            {/* hình đang chọn: điểm, khung co giãn, tay xoay */}
            {sel && tool === 'select' && (
              <g>
                {sel.pts.map((q, i) => {
                  const [sx, sy] = toS(q);
                  return <circle key={i} cx={sx} cy={sy} r={2.6} fill="#1a1a1f" stroke="#f3dc9c" strokeWidth={1.2} />;
                })}
                <rect
                  x={toS([selBox.minX, selBox.maxY])[0]}
                  y={toS([selBox.minX, selBox.maxY])[1]}
                  width={selBox.w * view.z}
                  height={selBox.h * view.z}
                  fill="none"
                  stroke="#8b8b96"
                  strokeDasharray="4 3"
                />
                <line x1={toS([selBox.cx, selBox.maxY])[0]} y1={toS([selBox.cx, selBox.maxY])[1]} x2={toS(rotHandle)[0]} y2={toS(rotHandle)[1]} stroke="#8b8b96" />
                <circle cx={toS(rotHandle)[0]} cy={toS(rotHandle)[1]} r={6} fill="#d9b766" data-handle="rotate" />
                {handles.map((h) => {
                  const [sx, sy] = toS([h.x, h.y]);
                  return <rect key={`${h.fx}${h.fy}`} x={sx - 5} y={sy - 5} width={10} height={10} fill="#f5efe1" stroke="#1a1a1f" data-handle={`${h.fx},${h.fy}`} />;
                })}
              </g>
            )}

            {preview && (
              <path
                d={preview.kind === 'free' ? preview.pts.map((q, i) => `${i ? 'L' : 'M'}${toS(q).join(' ')}`).join('') : pathD(preview.pts, toS)}
                fill={preview.kind === 'tpl' ? '#d9b766' : 'none'}
                fillOpacity={0.15}
                stroke="#f3dc9c"
                strokeWidth={1.6}
              />
            )}
          </svg>

          {!paths.length && !preview && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-cream-500">
              {tool === 'free' ? 'Giữ chuột trái và vẽ một vòng khép kín' : 'Chọn công cụ bên phải rồi kéo trên lưới để vẽ'}
              <div className="mt-1 text-xs text-cream-600">Lăn chuột = phóng to · Space / chuột phải / Ctrl + kéo = kéo khung</div>
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink-850/90 px-3 py-1 text-[11px] text-cream-400">
            Ô lưới {step} mm{total ? ` · bản vẽ ${fmt(total.w)} × ${fmt(total.h)} mm` : ''}
          </div>
        </div>

        {/* bảng bên phải */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-ink-700 bg-ink-850">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="font-display text-lg font-semibold text-cream-50">{part ? 'Sửa hình vẽ' : 'Vẽ hình 2D'}</h2>
            <button type="button" onClick={cancel} aria-label="Đóng" className="rounded-full p-1.5 text-cream-500 hover:bg-ink-700 hover:text-cream-50">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {TOOLS.map(({ code, name, key, Icon }) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={tool === code}
                    title={key ? `${name} (${key})` : name}
                    onClick={() => setTool(code)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] transition-colors ${
                      tool === code ? 'border-gold-500/70 bg-gold-400/10 text-gold-200' : 'border-ink-700 text-cream-300 hover:border-ink-500 hover:text-cream-50'
                    }`}
                  >
                    <Icon size={17} />
                    {name}
                  </button>
                ))}
              </div>
              {tool === 'polygon' && <NumberRow label="Số cạnh" value={sides} min={3} max={16} onChange={setSides} />}
              {tool === 'star' && <NumberRow label="Số cánh" value={points} min={3} max={16} onChange={setPoints} />}
              {TEMPLATE_CODES.includes(tool) && (
                <label className="flex items-center gap-2 text-xs text-cream-400">
                  <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-gold-400" />
                  Giữ tỉ lệ hình (giữ Shift khi kéo để đổi)
                </label>
              )}
              <p className="text-xs leading-relaxed text-cream-600">
                {tool === 'free' && 'Giữ chuột vẽ một vòng – thả ra là tự khép kín và làm mượt. Vẽ hình nằm trong hình khác để đục lỗ.'}
                {TEMPLATE_CODES.includes(tool) && 'Kéo trên lưới để vẽ theo kích thước, hoặc bấm một lần để đặt hình 10 mm.'}
                {tool === 'select' && 'Bấm chọn hình · kéo để di chuyển · ô vuông = co giãn (góc giữ tỉ lệ, Shift = tự do) · chấm tròn trên = xoay (Shift = bước 15°) · kéo các điểm trên viền để nắn hình (Alt = chỉ 1 điểm) · mũi tên = nhích 0.1 mm.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={undo} disabled={!hist.current.past.length} title="Hoàn tác (Ctrl+Z)">
                <Undo2 size={14} />
              </Button>
              <Button size="sm" variant="ghost" onClick={redo} disabled={!hist.current.future.length} title="Làm lại (Ctrl+Y)">
                <Redo2 size={14} />
              </Button>
              <Button size="sm" variant={snap ? 'secondary' : 'ghost'} onClick={() => setSnap(!snap)} title="Bắt lưới 0.5 mm">
                <Grid3x3 size={14} /> {snap ? 'Bắt lưới' : 'Tự do'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => fit()} title="Xem toàn bộ (F)">
                <Maximize2 size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!paths.length}
                onClick={() => {
                  commit([]);
                  setSelId(null);
                }}
              >
                Xoá hết
              </Button>
            </div>

            {sel && (
              <div className="space-y-3 rounded-xl border border-ink-700 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-cream-100">Hình đang chọn {roles.get(sel.id)?.hole ? '(lỗ)' : ''}</span>
                  <span className="text-cream-600">{sel.pts.length} điểm</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <SizeInput label="Rộng" value={selBox.w} onCommit={(w) => updateSel((pts) => scalePts(pts, selBox.cx, selBox.cy, w / selBox.w, keep ? w / selBox.w : 1))} />
                  <SizeInput label="Cao" value={selBox.h} onCommit={(h) => updateSel((pts) => scalePts(pts, selBox.cx, selBox.cy, keep ? h / selBox.h : 1, h / selBox.h))} />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <Button size="sm" variant="ghost" title="Lật ngang" onClick={() => updateSel((pts) => scalePts(pts, selBox.cx, selBox.cy, -1, 1))}>
                    <FlipHorizontal2 size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Lật dọc" onClick={() => updateSel((pts) => scalePts(pts, selBox.cx, selBox.cy, 1, -1))}>
                    <FlipVertical2 size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Nhân bản (Ctrl+D)" onClick={duplicateSel}>
                    <Copy size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Xoá (Delete)" onClick={removeSel}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  title="Bo mượt góc gãy và giảm bớt điểm thừa"
                  onClick={() => updateSel((pts) => simplifyClosed(chaikinClosed(pts, 1), Math.max(0.01, Math.min(selBox.w, selBox.h) * 0.002)))}
                >
                  <Sparkles size={14} /> Làm mượt
                </Button>
                <Slider label="Kéo điểm mềm (bán kính)" min={0} max={10} step={0.5} value={soft} format={(v) => (v ? `${v} mm` : 'Chỉ 1 điểm')} onChange={setSoft} onCommit={() => {}} />
              </div>
            )}

            <div className="space-y-4">
              <Slider label="Độ dày khối" min={META.depth.min} max={META.depth.max} step={0.1} value={depth} format={(v) => `${v.toFixed(1)} mm`} onChange={setDepth} onCommit={() => setDirty(true)} />
              <Slider
                label="Bo cạnh"
                min={0}
                max={META.bevel.max}
                step={0.05}
                value={bevel}
                format={(v) => (v > 0 ? `${v.toFixed(2)} mm` : 'Sắc vuông')}
                onChange={setBevel}
                onCommit={() => setDirty(true)}
                hint="Bo tròn mép trước/sau – không làm hình to ra. Không bo quá một nửa độ dày; nét vẽ mảnh nên bo nhỏ."
              />
            </div>

            <div className="space-y-1 text-xs text-cream-500">
              <p>
                {paths.length} hình{holes ? ` (${holes} lỗ)` : ''} · {pointCount} điểm
              </p>
              {warn.size > 0 && <p className="text-danger">Có {warn.size} hình tự cắt qua chính nó (viền đỏ) – nên vẽ lại hoặc nắn điểm cho khỏi chéo nhau.</p>}
            </div>
          </div>

          <div className="flex gap-2 border-t border-ink-700 px-4 py-3">
            <Button variant="ghost" className="flex-1" onClick={cancel}>
              Huỷ
            </Button>
            <Button variant="primary" className="flex-1" onClick={save} disabled={!paths.length}>
              {part ? 'Cập nhật khối' : 'Tạo khối'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NumberRow({ label, value, min, max, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-cream-300">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min))))}
        className="h-8 w-20 rounded-lg border border-ink-600 bg-ink-900 px-2 text-center text-cream-50"
      />
    </label>
  );
}

/** Ô nhập kích thước (mm) – áp dụng khi Enter / rời ô. */
function SizeInput({ label, value, onCommit }) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => setText(value.toFixed(2)), [value]);
  const apply = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0.2 && n <= 400 && Math.abs(n - value) > 1e-4 && value > 1e-6) onCommit(n);
    else setText(value.toFixed(2));
  };
  return (
    <label className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-900 px-2">
      <span className="text-[10px] font-semibold text-cream-600">{label}</span>
      <input
        aria-label={`${label} (mm)`}
        type="number"
        step={0.1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-8 w-full min-w-0 bg-transparent text-right text-xs text-cream-50 tabular-nums focus:outline-none"
      />
      <span className="text-[10px] text-cream-600">mm</span>
    </label>
  );
}
