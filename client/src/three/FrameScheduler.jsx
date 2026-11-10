// LỊCH VẼ của khung 3D (đặt trong <Canvas>, tự đảm nhận việc vẽ cảnh):
//  1) BIÊN DỊCH SHADER KHÔNG CHẶN TRANG: trước MỖI khung hình kiểm tra cảnh có vật liệu / kiểu lưới mới không (bật đá tấm,
//     đổi sang ngọc trai, khối mới…, kể cả phần được thêm ở lượt render sau hay thêm thủ công). Có → tạo mọi shader cần dùng,
//     shader chưa biên dịch xong thì CHƯA VẼ (khung 3D giữ hình cũ), đợi GPU biên dịch ở luồng riêng (KHR_parallel_shader_compile)
//     rồi vẽ tiếp. Trước đây shader được biên dịch ngay lúc vẽ, chặn luồng chính 0,3–2 giây (trang đứng hình).
//  2) ĐỨNG YÊN THÌ KHÔNG VẼ LIÊN TỤC: đang thao tác (chuột / phím / cảm ứng) → vẽ mọi khung; im 2 giây → chỉ vẽ khi có thay
//     đổi (R3F tự vẽ khi props đổi, camera tự báo khi xoay) + 2 khung / giây làm lưới an toàn → CPU / GPU gần như nghỉ.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const IDLE_MS = 2000;
const HEARTBEAT_MS = 500;
const COMPILE_GUARD_MS = 8000;
const WAKE_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'];

const compiling = new WeakMap(); // renderer → số lượt đang đợi shader
/** Khung 3D đang đợi shader (chưa vẽ cảnh mới) – khung chụp ảnh ẩn dùng để không chụp hình cũ / trống. */
export const isCompiling = (gl) => (compiling.get(gl) ?? 0) > 0;

/**
 * Dấu vân tay (số) các vật liệu đang dùng kèm kiểu lưới (thường / instanced…) – đổi = có thể cần shader mới.
 * Dùng material.id (số tăng dần, không đổi theo thời gian); KHÔNG dùng material.version vì three.js tự tăng nó khi chuẩn bị
 * vật liệu trong suốt 2 mặt. (Code NGK không sửa vật liệu tại chỗ – đổi thuộc tính là tạo vật liệu mới.)
 */
function materialSignature(scene) {
  let h = 2166136261;
  let n = 0;
  scene.traverse((o) => {
    const mat = o.material;
    if (!mat) return;
    const k = o.isInstancedMesh ? 1 : o.isPoints ? 2 : o.isLine ? 3 : 4;
    if (Array.isArray(mat)) {
      for (const m of mat) h = Math.imul(h ^ (m.id * 8 + k), 16777619);
      n += mat.length;
    } else {
      h = Math.imul(h ^ (mat.id * 8 + k), 16777619);
      n++;
    }
  });
  return (h >>> 0) * 1024 + n;
}

const offscreen = new WeakMap(); // renderer → vùng đệm 1×1 dùng để tạo biến thể shader "vẽ vào vùng đệm"

/**
 * Tạo (chưa đợi) mọi shader cảnh cần:
 *  - lượt vẽ chính (ra màn hình);
 *  - nếu có đá trong suốt (transmission): three.js vẽ thêm các vật đục vào một vùng đệm → mỗi vật liệu cần biến thể khác
 *    (không tone mapping, màu tuyến tính; vật liệu trong suốt 2 mặt còn vẽ mặt sau) – compileAsync của three không tạo các
 *    biến thể này, nên đổi sang đá màu từng đứng hình ~0,3–0,5 giây.
 */
function createPrograms(gl, scene, camera) {
  gl.compile(scene, camera);
  // lượt vẽ vào vùng đệm chỉ vẽ VẬT ĐỤC (+ mặt sau của đá trong suốt 2 mặt) – mỗi vật liệu + kiểu lưới một lần
  let transmissive = false;
  const opaque = new Map();
  const twoSided = new Map();
  scene.traverse((o) => {
    if (!o.material) return;
    const k = o.isInstancedMesh ? 'i' : 'm';
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transmission > 0) {
        transmissive = true;
        if (m.side === THREE.DoubleSide) twoSided.set(`${m.id}${k}`, [o, m]);
      } else if (!m.transparent) opaque.set(`${m.id}${k}`, o);
    }
  });
  if (!transmissive) return;
  let rt = offscreen.get(gl);
  if (!rt) offscreen.set(gl, (rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })));
  const prevTarget = gl.getRenderTarget();
  const prevTone = gl.toneMapping;
  gl.setRenderTarget(rt);
  gl.toneMapping = THREE.NoToneMapping;
  try {
    for (const o of opaque.values()) gl.compile(o, camera, scene); // đèn + môi trường lấy từ cảnh
    for (const [o, m] of twoSided.values()) {
      m.side = THREE.BackSide;
      try {
        gl.compile(o, camera, scene);
      } finally {
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    }
  } finally {
    gl.setRenderTarget(prevTarget);
    gl.toneMapping = prevTone;
  }
}

/** Mọi shader đã tạo đều biên dịch xong? (hỏi trạng thái không chặn; trình duyệt không hỗ trợ → luôn "xong") */
const allReady = (gl) => (gl.info.programs ?? []).every((p) => p.isReady());

/**
 * @param continuous luôn vẽ mọi khung (đang tự xoay, khung chụp ảnh ẩn)
 * @param onFirstFrame gọi MỘT lần khi cảnh được vẽ lần đầu (shader đã sẵn sàng) – để ẩn chữ "Đang dựng mô hình 3D…"
 * @param onScreenOnly khung bị cuộn khuất (trang chủ, trang thiết kế) → ngừng vẽ hẳn. Khung chụp ảnh ẩn (nằm ngoài màn hình) tắt.
 * @param idleFps    khi tự xoay mà không ai thao tác: tối đa bao nhiêu khung / giây (màn 144 Hz không cần vẽ 144 lần / giây
 *                   cho một vòng xoay chậm). Đang thao tác thì không giới hạn.
 */
export function FrameScheduler({ continuous = false, onFirstFrame, onScreenOnly = true, idleFps = 60 }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const st = useRef({ waiting: false, awake: true, continuous, sig: null, alive: true, drawn: false, visible: true, lastDraw: 0 });
  st.current.continuous = continuous;
  const firstFrame = useRef(onFirstFrame);
  firstFrame.current = onFirstFrame;

  const apply = useCallback(() => {
    const s = st.current;
    if (!s.alive) return;
    const want = !s.visible ? 'never' : s.continuous || s.awake ? 'always' : 'demand';
    const state = get();
    if (state.frameloop === want) return;
    state.setFrameloop(want);
    state.invalidate();
  }, [get]);

  useLayoutEffect(() => {
    gl.debug.checkShaderErrors = !!import.meta.env.DEV; // bản thật: bỏ các lệnh đọc log shader (mỗi lệnh phải chờ GPU)
    if (import.meta.env.DEV) window.__ngkGl = gl; // chỉ khi dev: cho kiểm thử tự động đọc thống kê WebGL (gl.info)
  }, [gl]);

  // (1) mức ưu tiên 1: R3F không tự vẽ nữa, khung này vẽ cảnh SAU mọi cập nhật khác (camera, bóng đổ…)
  useFrame((state) => {
    const s = st.current;
    const sig = materialSignature(state.scene);
    if (sig !== s.sig) {
      s.sig = sig;
      try {
        createPrograms(state.gl, state.scene, state.camera);
      } catch {
        /* lỗi tạo shader → để lượt vẽ dưới báo lỗi như bình thường */
      }
      if (!s.waiting && !allReady(state.gl)) {
        s.waiting = true;
        compiling.set(state.gl, (compiling.get(state.gl) ?? 0) + 1);
        const t0 = performance.now();
        const poll = () => {
          if (allReady(state.gl) || performance.now() - t0 > COMPILE_GUARD_MS) {
            s.waiting = false;
            compiling.set(state.gl, (compiling.get(state.gl) ?? 1) - 1);
            get().invalidate();
          } else setTimeout(poll, 16);
        };
        setTimeout(poll, 16);
      }
    }
    if (s.waiting) return;
    const now = performance.now();
    // tự xoay khi không ai thao tác → giới hạn idleFps (bỏ qua khung này; vòng xoay tính theo thời gian nên vẫn đều)
    // (ngưỡng trừ 4 ms: màn 60 Hz không bỏ khung nào, màn 120 / 144 Hz vẽ cách một khung)
    if (idleFps && s.continuous && !s.awake && s.drawn && now - s.lastDraw < 1000 / idleFps - 4) return;
    s.lastDraw = now;
    state.gl.render(state.scene, state.camera);
    if (!s.drawn) {
      s.drawn = true;
      firstFrame.current?.();
    }
  }, 1);

  // (2) thao tác → vẽ liên tục; im lặng IDLE_MS → chỉ vẽ khi cần
  useEffect(() => {
    const s = st.current;
    s.alive = true;
    let timer;
    const sleep = () => {
      s.awake = false;
      apply();
    };
    const wake = () => {
      clearTimeout(timer);
      timer = setTimeout(sleep, IDLE_MS);
      if (!s.awake) {
        s.awake = true;
        apply();
      }
    };
    for (const e of WAKE_EVENTS) window.addEventListener(e, wake, { passive: true });
    const beat = setInterval(() => {
      if (!s.awake && !s.continuous) get().invalidate();
    }, HEARTBEAT_MS);
    wake();
    return () => {
      s.alive = false;
      clearTimeout(timer);
      clearInterval(beat);
      for (const e of WAKE_EVENTS) window.removeEventListener(e, wake);
    };
  }, [apply, get]);

  // (3) khung bị cuộn khuất khỏi màn hình → ngừng vẽ; hiện lại → vẽ tiếp
  useEffect(() => {
    if (!onScreenOnly || typeof IntersectionObserver === 'undefined') return undefined;
    const s = st.current;
    const io = new IntersectionObserver(([e]) => {
      s.visible = e.isIntersecting;
      apply();
    });
    io.observe(gl.domElement);
    return () => {
      io.disconnect();
      s.visible = true;
    };
  }, [gl, onScreenOnly, apply]);

  // bật / tắt tự xoay, khung chụp ảnh → áp dụng ngay
  useEffect(() => {
    apply();
  }, [continuous, apply]);

  return null;
}
