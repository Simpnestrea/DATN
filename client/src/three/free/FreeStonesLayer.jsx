// LỚP ĐÁ GẮN TỰ DO trong khung 3D.
//  - Mỗi lần cấu hình đổi: raycast lại từng điểm neo lên bề mặt hiện tại → đá luôn bám đúng chỗ
//    kể cả khi đổi size nhẫn, kích thước mặt dây...
//  - Ở chế độ gắn đá (tab "Gắn đá"): bấm bề mặt = gắn đá, kéo viên đá = di chuyển, Delete = xóa.
//  - Chặn: chồng lên đá khác, mặt trong / mặt sau (chạm da), quá 30 viên. Cảnh báo: đá nhô khỏi mép.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FREE_STONE_MAX, getStyleRules } from '@ngk/shared';
import { generateBand, generateFace } from './presets.js';
import { useDesignStore } from '../../store/designStore.js';
import { useCatalogStore } from '../../store/catalogStore.js';
import { newStoneId, useFreeStoneStore } from '../../store/freeStoneStore.js';
import { toast } from '../../store/toastStore.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { createStoneMaterial, resolveStone } from '../materials/createMaterials.js';
import { getUnitGemGeometry } from '../geometry/gemGeometry.js';
import {
  anchorFromHit,
  bandFrame,
  castFromCamera,
  castRay,
  collectGemSpheres,
  collectSurfaces,
  hitNormal,
  mirrorAnchor,
  overhangs,
  resolveAnchor,
  usesFace,
} from './surface.js';

const UP = new THREE.Vector3(0, 1, 0);
const CLICK_TOLERANCE = 5; // px – di chuột ít hơn mức này mới tính là "bấm"
const BAND_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // mặt phẳng chứa vòng nhẫn/vòng kiềng
const dragRay = new THREE.Raycaster();

export function FreeStonesLayer({ config, modelRef, focusRef, interactive }) {
  const mats = useMaterials();
  const lookup = useCatalogStore((s) => s.lookup);
  const { camera, gl, controls } = useThree();
  const mode = useFreeStoneStore((s) => s.mode) && interactive;
  const selectedId = useFreeStoneStore((s) => s.selectedId);
  const [resolved, setResolved] = useState([]); // [{ id, p, n, size, stone, overhang }]
  const stoneMeshes = useRef(new Map()); // mesh → id (để bấm chọn)
  const ctx = useRef({}); // dữ liệu mới nhất cho các handler DOM
  const mirrorPair = config.type === 'earrings'; // khuyên tai: đá tự nhân đôi sang chiếc còn lại

  // ---- vật liệu theo loại đá ----
  const codes = useMemo(() => [...new Set(config.freeStones.map((s) => s.stone))].sort().join(','), [config.freeStones]);
  const stoneMats = useMemo(() => {
    const map = new Map();
    for (const code of codes.split(',').filter(Boolean)) {
      map.set(code, createStoneMaterial(resolveStone(code, lookup), mats.quality, mats.matte));
    }
    return map;
  }, [codes, lookup, mats.quality, mats.matte]);
  useEffect(() => () => stoneMats.forEach((m) => m.dispose()), [stoneMats]);

  const bezelGeo = useMemo(() => new THREE.TorusGeometry(0.52, 0.085, 8, 32), []);
  const ringGeo = useMemo(() => new THREE.TorusGeometry(0.8, 0.05, 6, 40), []);
  const highlight = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#f3d98b', transparent: true, opacity: 0.95, depthTest: false }),
    [],
  );
  useEffect(() => () => [bezelGeo, ringGeo, highlight].forEach((x) => x.dispose()), [bezelGeo, ringGeo, highlight]);

  // ---- bề mặt hợp lệ để gắn ----
  // đọc cấu hình MỚI NHẤT qua ctx (các handler/API được đăng ký một lần nên không được giữ closure cũ)
  const getSurfaces = () => {
    const cfg = ctx.current.config ?? config;
    const root = usesFace(cfg) ? focusRef.current : modelRef.current;
    return collectSurfaces(root, (ctx.current.mats ?? mats).metal);
  };

  // ---- raycast lại toàn bộ điểm neo khi thiết kế thay đổi ----
  useLayoutEffect(() => {
    const surfaces = getSurfaces();
    const focus = focusRef.current;
    modelRef.current?.updateWorldMatrix(true, true);
    const out = [];
    const info = {};
    for (const s of config.freeStones) {
      const hit = surfaces.length ? resolveAnchor(s.anchor, config, surfaces, focus) : null;
      if (!hit) {
        info[s.id] = { hidden: true };
        continue;
      }
      const over = overhangs(hit.p, hit.n, s.sizeMm, surfaces);
      info[s.id] = { hidden: false, overhang: over };
      out.push({ id: s.id, p: hit.p, n: hit.n, size: s.sizeMm, stone: s.stone });
    }
    setResolved(out);
    if (interactive) useFreeStoneStore.getState().setInfo(info);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, mats.metal]);

  // ---- kiểm tra hợp lệ của một vị trí ứng viên ----
  const validate = (p, size, excludeId) => {
    const all = ctx.current.resolved ?? [];
    for (const r of all) {
      if (r.id === excludeId) continue;
      const others = mirrorPair ? [r.p, new THREE.Vector3(-r.p.x, r.p.y, r.p.z)] : [r.p];
      for (const q of others) {
        if (q.distanceTo(p) < ((r.size + size) / 2) * 0.92) return 'Vị trí này chồng lên một viên đá khác.';
      }
    }
    for (const g of collectGemSpheres(modelRef.current, [mats.gem, mats.accent, mats.side])) {
      if (g.p.distanceTo(p) < (g.r + size / 2) * 0.88) return 'Vị trí này chồng lên đá có sẵn của thiết kế.';
    }
    return null;
  };

  /** Raycast từ chuột → { anchor, p } hoặc { error } hoặc null (không trúng gì). */
  const pickSurface = (ndc, size, excludeId) => {
    const surfaces = getSurfaces();
    const hitRaw = castFromCamera(ndc, camera, surfaces);
    if (!hitRaw) return null;
    const hit = { p: hitRaw.point.clone(), n: hitNormal(hitRaw) };
    const res = anchorFromHit(hit, config, focusRef.current);
    if (res.error) return res;
    const err = validate(hit.p, size, excludeId);
    return err ? { error: err } : { anchor: res.anchor, p: hit.p };
  };

  // ---- đá chủ (nhóm "main-gem" do mô hình đặt tên) ----
  const findMainGem = () => {
    let found = null;
    modelRef.current?.traverse((o) => {
      if (!found && o.name === 'main-gem') found = o;
    });
    return found;
  };
  const meshesIn = (obj, pred = () => true) => {
    const out = [];
    obj?.traverse((o) => o.isMesh && pred(o) && out.push(o));
    return out;
  };

  /** Kéo đá chủ: chỉ trượt trên thân đai (band) hoặc trên mặt dây (face). */
  const dragMainGem = (ndc) => {
    const cfg = ctx.current.config;
    const move = getStyleRules(cfg).gemMove;
    if (move === 'band') {
      const band = bandFrame(cfg);
      if (!band) return;
      // Góc: giao tia chuột với MẶT PHẲNG vòng (z = 0) → kéo ở đâu quanh vòng cũng xoay được, như núm vặn
      // (đai rất mảnh nên nếu bắt buộc chuột nằm trên đai thì rất khó kéo).
      dragRay.setFromCamera(ndc, camera);
      const onPlane = dragRay.ray.intersectPlane(BAND_PLANE, new THREE.Vector3());
      if (!onPlane || Math.hypot(onPlane.x, onPlane.y) < band.inner * 0.15) return;
      const u = Math.round((Math.atan2(onPlane.x, onPlane.y) * 180) / Math.PI);
      // Lệch trước/sau: chỉ cập nhật khi chuột nằm trên thân đai
      const hit = castFromCamera(ndc, camera, meshesIn(modelRef.current, (o) => o.userData.band));
      useDesignStore.getState().apply((c) => {
        c.gem.place.u = u;
        if (hit) c.gem.place.v = Math.max(-1, Math.min(1, hit.point.z / band.hw));
      }, { transient: true });
    } else if (move === 'face') {
      const body = meshesIn(focusRef.current, (o) => o.userData.body)[0];
      const mg = findMainGem();
      if (!body || !mg) return;
      // giao tia chuột với mặt phẳng mặt dây (đi qua đá chủ) → kéo ra ngoài viền vẫn mượt, đá tự kẹp trong viền
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mg.getWorldPosition(new THREE.Vector3()));
      dragRay.setFromCamera(ndc, camera);
      const onPlane = dragRay.ray.intersectPlane(plane, new THREE.Vector3());
      if (!onPlane) return;
      const local = body.parent.worldToLocal(onPlane);
      const { hx, hy, baseY } = mg.userData;
      const clamp1 = (x) => Math.max(-1, Math.min(1, x));
      useDesignStore.getState().apply((c) => {
        c.gem.place.u = hx ? clamp1(local.x / hx) : 0;
        c.gem.place.v = hy ? clamp1((local.y - baseY) / hy) : 0;
      }, { transient: true });
    }
  };

  ctx.current = { config, mats, resolved, pickSurface, validate, findMainGem, meshesIn, dragMainGem };

  // ---- API cho panel: nhân bản & đối xứng ----
  useEffect(() => {
    if (!interactive) return undefined;
    const tryAdd = (base, anchor) => {
      const { config: cfg } = ctx.current;
      if (cfg.freeStones.length >= FREE_STONE_MAX) return `Tối đa ${FREE_STONE_MAX} viên đá tự do.`;
      const hit = resolveAnchor(anchor, cfg, getSurfaces(), focusRef.current);
      if (!hit) return 'Không có bề mặt ở vị trí đó.';
      const err = ctx.current.validate(hit.p, base.sizeMm, null);
      if (err) return err;
      const id = newStoneId();
      useDesignStore.getState().apply((c) => {
        c.freeStones.push({ id, stone: base.stone, sizeMm: base.sizeMm, anchor });
      });
      useFreeStoneStore.getState().select(id);
      return null;
    };
    const api = {
      duplicate(id) {
        const { config: cfg, resolved: res } = ctx.current;
        const s = cfg.freeStones.find((x) => x.id === id);
        const r = res.find((x) => x.id === id);
        if (!s || !r) return;
        const band = bandFrame(cfg);
        const step = s.sizeMm * 1.25;
        const candidates = [];
        for (const k of [1, -1, 2, -2, 3, -3]) {
          const a = s.anchor;
          if ((a.k === 'cyl' || a.k === 'side') && band) {
            const radius = a.k === 'cyl' ? band.inner + band.thick : band.inner + a.rr * band.thick;
            candidates.push({ ...a, th: a.th + (k * step) / radius });
          } else if (a.k === 'face') {
            candidates.push({ ...a, x: a.x + (k * step) / cfg.size.pendantSize });
          } else {
            // dịch theo tiếp tuyến rồi chiếu lại xuống bề mặt
            const t = new THREE.Vector3().crossVectors(r.n, Math.abs(r.n.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
            const o = r.p.clone().addScaledVector(t, k * step).addScaledVector(r.n, 3);
            const hit = castRay(o, r.n.clone().negate(), getSurfaces(), 8);
            if (hit) candidates.push({ k: 'free', p: hit.p.toArray(), n: hit.n.toArray() });
          }
        }
        let lastErr = 'Không còn chỗ trống bên cạnh viên đá này.';
        for (const anchor of candidates) {
          const err = tryAdd(s, anchor);
          if (!err) return;
          if (err.startsWith('Tối đa')) return toast(err, { tone: 'warning' });
          lastErr = err;
        }
        toast(lastErr, { tone: 'warning' });
      },
      mirror(id) {
        const s = ctx.current.config.freeStones.find((x) => x.id === id);
        if (!s) return;
        const err = tryAdd(s, mirrorAnchor(s.anchor));
        if (err) toast(err.includes('chồng') ? 'Vị trí đối xứng đã có đá (hoặc viên đá nằm ngay trục giữa).' : err, { tone: 'warning' });
      },

      /** Gắn cả một bố cục mẫu; viên trùng đá / ngoài bề mặt / chạm da tự bỏ qua. Một lần = một bước Undo. */
      applyPreset(code, { stone, sizeMm, replace }) {
        const { config: cfg, resolved: res, findMainGem: mainGem } = ctx.current;
        const focus = focusRef.current;
        const band = bandFrame(cfg);
        let items; // đai hoặc mặt dây gán; loại khác đã báo + dừng
        if (band) {
          const move = getStyleRules(cfg).gemMove;
          const hasHead = Boolean(cfg.gem.enabled && move === 'band');
          const outer = band.inner + band.thick;
          const headWidth = cfg.gem.sizeMm * (cfg.style === 'three-stone' ? 1.9 : 0.6) + (cfg.deco.halo ? 2 : 0) + 0.8;
          items = generateBand(code, sizeMm, {
            outer,
            hw: band.hw,
            hasHead,
            headAngle: hasHead ? (cfg.gem.place.u * Math.PI) / 180 : 0,
            headHalf: headWidth / outer,
          });
        } else if (usesFace(cfg) && focus) {
          const body = ctx.current.meshesIn(focus, (o) => o.userData.body)[0];
          if (!body) {
            toast('Mẫu gắn sẵn cần một mặt dây có bề mặt kim loại.', { tone: 'warning' });
            return;
          }
          const box = new THREE.Box3().setFromObject(body);
          const c = focus.worldToLocal(box.getCenter(new THREE.Vector3()));
          const dim = box.getSize(new THREE.Vector3());
          const mg = mainGem();
          const gp = mg ? focus.worldToLocal(mg.getWorldPosition(new THREE.Vector3())) : null;
          items = generateFace(code, sizeMm, {
            cx: c.x,
            cy: c.y,
            w: dim.x,
            h: dim.y,
            gem: gp ? { x: gp.x, y: gp.y, r: cfg.gem.sizeMm * 0.6 } : null,
            pendantSize: cfg.size.pendantSize,
          });
        } else {
          toast('Mẫu gắn sẵn hiện có cho nhẫn, vòng kiềng/cuff và mặt dây.', { tone: 'warning' });
          return;
        }

        const surfaces = getSurfaces();
        const m = ctx.current.mats;
        const gems = collectGemSpheres(modelRef.current, [m.gem, m.accent, m.side]);
        const placed = replace ? [] : res.map((r) => ({ p: r.p, size: r.size }));
        const room = FREE_STONE_MAX - (replace ? 0 : cfg.freeStones.length);
        const accepted = [];
        for (const it of items) {
          if (accepted.length >= room) break;
          const hit = resolveAnchor(it.anchor, cfg, surfaces, focus);
          if (!hit || anchorFromHit(hit, cfg, focus).error) continue;
          if (placed.some((o) => o.p.distanceTo(hit.p) < ((o.size + it.sizeMm) / 2) * 0.95)) continue;
          if (gems.some((g) => g.p.distanceTo(hit.p) < (g.r + it.sizeMm / 2) * 0.9)) continue;
          placed.push({ p: hit.p, size: it.sizeMm });
          accepted.push({ id: newStoneId(), stone, sizeMm: it.sizeMm, anchor: it.anchor });
        }
        if (!accepted.length) {
          toast('Không còn chỗ trống phù hợp cho mẫu này – thử cỡ đá nhỏ hơn.', { tone: 'warning' });
          return;
        }
        useDesignStore.getState().apply((d) => {
          d.freeStones = replace ? accepted : [...d.freeStones, ...accepted];
        });
        useFreeStoneStore.getState().select(null);
        const skipped = items.length - accepted.length;
        toast(`Đã gắn ${accepted.length} viên${skipped > 0 && accepted.length >= room ? ' (đạt giới hạn 30)' : ''} – bấm từng viên để chỉnh`, {
          tone: 'success',
        });
      },
    };
    useFreeStoneStore.getState().setApi(api);
    return () => useFreeStoneStore.getState().setApi(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // ---- tương tác chuột trên canvas (chỉ ở chế độ gắn đá) ----
  useEffect(() => {
    if (!mode) return undefined;
    const el = gl.domElement;
    el.style.cursor = 'crosshair';
    let down = null;
    let drag = null;
    const ndcOf = (e) => {
      const rect = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const store = () => useFreeStoneStore.getState();
    const design = () => useDesignStore.getState();

    const onDown = (e) => {
      if (e.button !== 0) return;
      const hit = castFromCamera(ndcOf(e), camera, [...stoneMeshes.current.keys()]);
      if (hit) {
        const id = stoneMeshes.current.get(hit.object);
        store().select(id);
        drag = { id, moved: false };
        if (controls) controls.enabled = false; // không xoay camera khi đang kéo đá
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        return;
      }
      // bấm trúng đá chủ → kéo đá chủ trượt theo thân / mặt
      if (getStyleRules(ctx.current.config).gemMove) {
        const mg = ctx.current.findMainGem();
        if (mg && castFromCamera(ndcOf(e), camera, ctx.current.meshesIn(mg))) {
          store().select(null);
          drag = { main: true };
          if (controls) controls.enabled = false;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = 'grabbing';
          return;
        }
      }
      down = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e) => {
      if (!drag) return;
      if (drag.main) {
        ctx.current.dragMainGem(ndcOf(e));
        return;
      }
      const stone = ctx.current.config.freeStones.find((s) => s.id === drag.id);
      if (!stone) return;
      const res = ctx.current.pickSurface(ndcOf(e), stone.sizeMm, drag.id);
      if (!res || res.error) return; // giữ vị trí hợp lệ gần nhất
      drag.moved = true;
      design().apply(
        (c) => {
          const s = c.freeStones.find((x) => x.id === drag.id);
          if (s) s.anchor = res.anchor;
        },
        { transient: true },
      );
    };

    const onUp = (e) => {
      if (drag) {
        design().commit();
        if (controls) controls.enabled = true;
        el.style.cursor = 'crosshair';
        drag = null;
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_TOLERANCE) return; // đó là thao tác xoay camera
      const { brush } = store();
      const res = ctx.current.pickSurface(ndcOf(e), brush.sizeMm, null);
      if (!res) {
        store().select(null);
        return;
      }
      if (res.error) {
        toast(res.error, { tone: 'warning' });
        return;
      }
      if (ctx.current.config.freeStones.length >= FREE_STONE_MAX) {
        toast(`Tối đa ${FREE_STONE_MAX} viên đá tự do trên một thiết kế.`, { tone: 'warning' });
        return;
      }
      const id = newStoneId();
      design().apply((c) => {
        c.freeStones.push({ id, stone: brush.stone, sizeMm: brush.sizeMm, anchor: res.anchor });
      });
      store().select(id);
    };

    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const id = store().selectedId;
      if (!id) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        design().apply((c) => {
          c.freeStones = c.freeStones.filter((s) => s.id !== id);
        });
        store().select(null);
      } else if (e.key === 'Escape') {
        store().select(null);
      }
    };

    // capture: chạy TRƯỚC OrbitControls để kịp tắt xoay camera khi bấm trúng viên đá
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.style.cursor = '';
      if (controls) controls.enabled = true;
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [mode, gl, camera, controls]);

  // ---- hiển thị ----
  const items = mirrorPair
    ? resolved.flatMap((r) => [r, { ...r, key: `${r.id}-m`, p: new THREE.Vector3(-r.p.x, r.p.y, r.p.z), n: new THREE.Vector3(-r.n.x, r.n.y, r.n.z) }])
    : resolved;
  const unit = getUnitGemGeometry('round');
  stoneMeshes.current = new Map();

  return (
    <group>
      {items.map((r) => {
        const q = new THREE.Quaternion().setFromUnitVectors(UP, r.n);
        const pos = r.p.clone().addScaledVector(r.n, r.size * 0.06);
        const selected = mode && r.id === selectedId;
        return (
          <group key={r.key ?? r.id} position={pos} quaternion={q}>
            <mesh
              ref={(m) => m && stoneMeshes.current.set(m, r.id)}
              geometry={unit}
              material={stoneMats.get(r.stone) ?? mats.accent}
              scale={r.size}
              dispose={null}
            />
            <mesh geometry={bezelGeo} material={mats.metal} scale={r.size} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
            {selected && (
              <mesh geometry={ringGeo} material={highlight} scale={r.size} rotation={[Math.PI / 2, 0, 0]} renderOrder={10} dispose={null} />
            )}
          </group>
        );
      })}
    </group>
  );
}
