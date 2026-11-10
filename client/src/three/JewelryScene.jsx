// Nội dung bên trong <Canvas>: ánh sáng, mô hình, điều khiển camera, tự căn khung, bóng đổ, chụp ảnh.
import { lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FrameScheduler, isCompiling } from './FrameScheduler.jsx';
import { SoftShadow } from './SoftShadow.jsx';
import { MaterialsProvider } from './materials/MaterialsContext.jsx';
import { JewelryModel, frameKey, hasFloorShadow, viewDirection } from './JewelryModel.jsx';
import { StudioLighting } from './StudioLighting.jsx';
import { FreeStonesLayer } from './free/FreeStonesLayer.jsx';
import { useFreeStoneStore } from '../store/freeStoneStore.js';
import { useCustomStore } from '../store/customStore.js';
import { useDesignStore } from '../store/designStore.js';
import { useViewerStore } from '../store/viewerStore.js';

// trình dựng "Tự tạo" (lưới, tay cầm, cọ gọt, sợi kim loại) chỉ tải khi chỉnh thiết kế Tự tạo – xem JewelryModel.jsx
const CustomEditor = lazy(() => import('./custom/CustomEditor.jsx').then((m) => ({ default: m.CustomEditor })));

/**
 * @param mode  'studio' (chỉnh sửa) | 'view' (trang xem công khai: xoay/phóng to, không chỉnh) | 'hero' (trang chủ, tự xoay)
 *              | 'bake' (chụp ảnh ẩn)
 * @param viewDir  hướng nhìn [x, y, z] thay cho hướng mặc định của loại trang sức (chụp nhiều góc cho bảng thông số)
 * @param bakeKey  khoá chụp – đổi khoá = chụp lại (mặc định: theo cấu hình)
 */
export function JewelryScene({
  config,
  mode = 'studio',
  quality = 'high',
  lighting = 'studio',
  autoRotate = false,
  closeUp = false,
  refitToken = 0,
  matte = false,
  onBaked,
  viewDir = null,
  bakeKey = null,
  lookupOverride = null,
  onFirstFrame,
}) {
  const modelRef = useRef();
  const focusRef = useRef();
  const useFocus = config.type === 'pendant' || (config.type === 'necklace' && closeUp);
  const key = frameKey(config, closeUp);
  const showShadow = quality === 'high' && hasFloorShadow(config);
  const placing = useFreeStoneStore((s) => s.mode) && mode === 'studio'; // đang gắn đá → dừng tự xoay
  // đang có thao tác dở (kéo tay cầm, kéo thanh trượt, kéo đá...) → camera không được tự di chuyển
  const dragging = useDesignStore((s) => s.txBase !== null);
  const partDragging = useCustomStore((s) => s.dragging); // Tự tạo: đang kéo khối bằng tay cầm
  // một lần mỗi khi cấu hình đổi (thiết kế Tự tạo có thể nặng hàng trăm KB – trước đây chuỗi hoá 3 lần mỗi lần render)
  const configJson = useMemo(() => JSON.stringify(config), [config]);

  return (
    <>
      <StudioLighting lighting={lighting} matte={matte} />
      <MaterialsProvider config={config} quality={quality} matte={matte} lookupOverride={lookupOverride}>
        <group ref={modelRef}>
          <JewelryModel config={config} focusRef={focusRef} interactive={mode === 'studio'} />
        </group>
        {/* trình dựng hình (lưới, tay cầm) nằm ngoài modelRef → không làm lệch khung camera; không đổ bóng xuống sàn */}
        {config.type === 'custom' && mode === 'studio' && (
          <group userData={{ noShadow: true }}>
            <CustomEditor config={config} />
          </group>
        )}
        {/* nằm NGOÀI modelRef: không tính vào khung camera và không bị raycast như bề mặt */}
        <FreeStonesLayer config={config} modelRef={modelRef} focusRef={focusRef} interactive={mode === 'studio'} />
      </MaterialsProvider>

      {mode !== 'bake' && (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enablePan={config.type === 'custom'}
          enableZoom={mode === 'studio' || mode === 'view'}
          autoRotate={autoRotate && !placing}
          autoRotateSpeed={mode === 'hero' ? 1.6 : 1.2}
          rotateSpeed={0.8}
        />
      )}

      <AutoFrame
        targetRef={useFocus ? focusRef : modelRef}
        fallbackRef={modelRef}
        frameKey={`${key}|${refitToken}|${viewDir ? viewDir.join(',') : ''}`}
        contentKey={configJson}
        dir={viewDir ?? viewDirection(config)}
        immediate={mode === 'bake'}
        margin={mode === 'hero' ? 1.02 : useFocus ? 1.25 : 1.12}
        autoFit={!(config.type === 'custom' && mode === 'studio')}
        freeCamera={config.type === 'custom' && mode === 'studio'}
        dragging={dragging}
      />
      {showShadow && (
        <FloorShadow
          targetRef={modelRef}
          configKey={configJson}
          fixedY={config.type === 'custom' ? 0 : undefined}
          live={config.type === 'custom' && partDragging}
          watchGeometry={config.type === 'custom'}
        />
      )}
      {mode === 'bake' && <BakeCapture bakeKey={bakeKey ?? configJson} onBaked={onBaked} />}
      {/* cuối cảnh: chạy sau khi mọi phần đã gắn vào scene → biên dịch đúng vật liệu đang dùng */}
      <FrameScheduler
        continuous={mode === 'bake' || (autoRotate && !placing)}
        onFirstFrame={onFirstFrame}
        onScreenOnly={mode !== 'bake'} // khung chụp ảnh ẩn nằm ngoài màn hình nhưng vẫn phải vẽ
        idleFps={mode === 'bake' ? 0 : 60}
      />
    </>
  );
}

const box3 = new THREE.Box3();
const sphere = new THREE.Sphere();

/** Khoảng cách camera cần để thấy trọn một khối cầu bán kính r. */
function fitDistance(camera, r, margin) {
  const fov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
  return (r / Math.sin(Math.min(fov, hFov) / 2)) * margin;
}

/**
 * Điều khiển camera:
 *  - Căn khung ĐẦY ĐỦ (đặt lại góc nhìn) khi `frameKey` đổi: đổi loại, kiểu dáng, cận cảnh, bấm nút căn khung.
 *  - Khi chỉ chỉnh kích thước/chi tiết (`contentKey` đổi): camera ĐỨNG YÊN để người dùng cảm nhận được
 *    món đồ to lên/nhỏ đi; chỉ lùi ra (giữ nguyên góc nhìn) khi vật thể sắp tràn khỏi khung, không bao giờ tự phóng to.
 */
function AutoFrame({ targetRef, fallbackRef, frameKey: fk, contentKey, dir, immediate, margin, autoFit, freeCamera, dragging }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const focusToken = useViewerStore((s) => s.focusToken);
  const anim = useRef(null);
  const first = useRef(true);

  // chỉ khi dev: cho kiểm thử tự động đọc vị trí camera
  useEffect(() => {
    if (import.meta.env?.DEV && !immediate) window.__ngk = { ...(window.__ngk ?? {}), camera };
  }, [camera, immediate]);

  // Chỉ lùi camera ra khi vật thể không còn vừa khung.
  // KHÔNG chạy khi: đang kéo / kéo thanh trượt (camera phải đứng yên – nếu không sẽ "đuổi theo" vật gây chóng mặt),
  // hoặc ở chế độ camera tự do (trình dựng hình Tự tạo: camera chỉ do người dùng điều khiển).
  // Thả chuột → `dragging` về false → kiểm tra lại đúng một lần.
  useLayoutEffect(() => {
    if (!autoFit || dragging) return;
    if (immediate || !controls || first.current || anim.current?.full) return;
    const obj = targetRef.current ?? fallbackRef.current;
    if (!obj) return;
    obj.updateWorldMatrix(true, true);
    box3.setFromObject(obj);
    if (box3.isEmpty()) return;
    box3.getBoundingSphere(sphere);
    const target = anim.current?.toT ?? controls.target;
    const reach = sphere.center.distanceTo(target) + sphere.radius;
    const need = fitDistance(camera, reach, margin);
    controls.maxDistance = Math.max(controls.maxDistance, need * 3);
    const fromPos = camera.position.clone();
    const current = fromPos.distanceTo(controls.target);
    if (need <= current * 1.01) return;
    const viewDir = fromPos.clone().sub(controls.target).normalize();
    anim.current = {
      full: false,
      fromPos,
      toPos: target.clone().addScaledVector(viewDir, need),
      fromT: controls.target.clone(),
      toT: target.clone(),
      t: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, dragging]);

  // Phím F / nút "căn khung khối đang chọn": trượt camera nhìn trọn một hộp bao, GIỮ NGUYÊN hướng nhìn hiện tại
  useEffect(() => {
    const box = useViewerStore.getState().focusBox;
    if (!focusToken || !box || box.isEmpty() || !controls) return;
    box.getBoundingSphere(sphere);
    const dist = fitDistance(camera, Math.max(sphere.radius, 1.5), 1.35);
    const viewDir = camera.position.clone().sub(controls.target).normalize();
    anim.current = {
      full: true,
      fromPos: camera.position.clone(),
      toPos: sphere.center.clone().addScaledVector(viewDir, dist),
      fromT: controls.target.clone(),
      toT: sphere.center.clone(),
      t: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  useLayoutEffect(() => {
    const obj = targetRef.current ?? fallbackRef.current;
    if (!obj) return;
    obj.updateWorldMatrix(true, true);
    box3.setFromObject(obj);
    // cảnh trống (thiết kế tự tạo chưa có khối) → khung mặc định quanh gốc toạ độ, cỡ một chiếc nhẫn
    if (box3.isEmpty()) sphere.set(new THREE.Vector3(0, 0, 0), 14);
    else box3.getBoundingSphere(sphere);
    const dist = fitDistance(camera, sphere.radius, margin);
    const toPos = sphere.center.clone().addScaledVector(new THREE.Vector3(...dir).normalize(), dist);
    const toTarget = sphere.center.clone();

    // camera tự do (Tự tạo): không giới hạn chặt khoảng zoom vì món đồ có thể lớn dần khi dựng
    camera.near = freeCamera ? 0.05 : Math.max(0.05, dist / 300);
    camera.far = freeCamera ? 5000 : dist * 40;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.minDistance = freeCamera ? 4 : sphere.radius * 0.8; // không cho camera chui sát/xuyên qua lưới
      controls.maxDistance = freeCamera ? 2000 : dist * 3;
    }
    if (immediate || first.current || !controls) {
      camera.position.copy(toPos);
      camera.lookAt(toTarget);
      if (controls) {
        controls.target.copy(toTarget);
        controls.update();
      }
      anim.current = null;
      if (controls) first.current = false;
    } else {
      anim.current = { full: true, fromPos: camera.position.clone(), toPos, fromT: controls.target.clone(), toT: toTarget, t: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fk, controls, camera]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + delta / 0.7);
    const e = 1 - (1 - a.t) ** 3; // ease-out
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromT, a.toT, e);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/**
 * Bóng đổ mềm dưới vật thể – vị trí tính lại khi cấu hình đổi.
 * @param fixedY độ cao mặt sàn cố định (Tự tạo: mặt lưới y = 0) – không cho bóng tụt theo khối khi kéo
 * @param live   vẽ bóng lại MỌI khung hình (Tự tạo: đang kéo khối bằng tay cầm). Còn lại: chỉ vẽ lại khi cấu hình / hình khối
 *               đổi – trước đây mỗi khung hình (kể cả khi chỉ xoay camera) vẽ thêm cả mô hình + 2 lượt làm mờ chỉ để ra cùng
 *               một cái bóng.
 * @param watchGeometry Tự tạo: hình khối còn đổi SAU khi cấu hình đổi (kết quả gọt khối tính ở luồng nền, khối chữ dựng từ font)
 *               → 2 lần / giây so mã hình khối, đổi thì vẽ lại bóng.
 */
function FloorShadow({ targetRef, configKey, fixedY, live, watchGeometry }) {
  const [params, setParams] = useState(null);
  const [geomTick, setGeomTick] = useState(0);
  useEffect(() => {
    if (!watchGeometry) return undefined;
    let last = '';
    const t = setInterval(() => {
      const ids = [];
      targetRef.current?.traverse((o) => o.geometry && ids.push(o.geometry.id));
      const sig = ids.join(',');
      if (sig !== last) {
        last = sig;
        setGeomTick((n) => n + 1);
      }
    }, 500);
    return () => clearInterval(t);
  }, [watchGeometry, targetRef]);
  useLayoutEffect(() => {
    const obj = targetRef.current;
    if (!obj) return;
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const far = Math.max(size.y, 4) * 0.9;
    setParams((p) => ({
      position: [c.x, fixedY ?? b.min.y - 0.15, c.z],
      size: Math.max(size.x, size.z) * 2.4,
      far,
      // sàn cố định (Tự tạo): chụp cả phần khối cắm xuống dưới lưới + một chút cho mặt đáy nằm đúng trên lưới
      below: fixedY == null ? 0 : Math.min(Math.max(fixedY - b.min.y, 0), far) + far * 0.01,
      version: (p?.version ?? 0) + 1, // hình khối đổi mà khung bao giữ nguyên (đổi kiểu dáng, thêm đá…) → vẫn vẽ lại bóng
    }));
  }, [targetRef, configKey, fixedY, geomTick]);
  if (!params) return null;
  return <SoftShadow {...params} live={live} />;
}

/**
 * Ảnh WebP (data URL) của canvas: toBlob chụp điểm ảnh ngay lúc gọi nhưng MÃ HOÁ ở luồng riêng của trình duyệt – trước đây
 * toDataURL mã hoá ngay trên luồng chính (vài chục ms mỗi ảnh, trang chủ dựng ~10 ảnh mẫu → khựng).
 */
function canvasToWebp(canvas, quality) {
  return new Promise((resolve) => {
    const fallback = () => resolve(canvas.toDataURL('image/webp', quality));
    canvas.toBlob(
      (blob) => {
        if (!blob) return fallback();
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = fallback;
        reader.readAsDataURL(blob);
      },
      'image/webp',
      quality,
    );
  });
}

/** Chế độ chụp thumbnail: chờ vài khung hình cho môi trường + vật liệu sẵn sàng rồi chụp. */
function BakeCapture({ bakeKey, onBaked }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const done = useRef(false);
  useLayoutEffect(() => {
    frames.current = 0;
    done.current = false;
  }, [bakeKey]);
  useFrame(() => {
    if (done.current) return;
    // khung 3D đang đợi shader → cảnh mới chưa được vẽ: đếm lại từ đầu (không chụp hình cũ / khung trống)
    if (isCompiling(gl)) {
      frames.current = 0;
      return;
    }
    frames.current += 1;
    if (frames.current >= 5) {
      done.current = true;
      canvasToWebp(gl.domElement, 0.86).then((url) => onBaked?.(url));
    }
  });
  return null;
}
