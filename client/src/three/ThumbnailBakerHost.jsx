// Canvas ẩn chụp thumbnail theo hàng đợi.
//  - Chỉ bắt đầu khi trình duyệt RẢNH (requestIdleCallback): không tranh luồng chính lúc trang đang tải / khung 3D chính đang dựng.
//  - Hết việc vẫn giữ khung thêm KEEP_MS: chuyển sang trang khác có ảnh mới (trang chủ → Mẫu gợi ý) thì dùng lại ngữ cảnh WebGL
//    + shader đã biên dịch thay vì tạo lại từ đầu; sau đó mới giải phóng.
import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useThumbnailStore } from '../store/thumbnailStore.js';
import { JewelryScene } from './JewelryScene.jsx';

const KEEP_MS = 20000;
// đợi tối đa 0,6 giây: shader đã được biên dịch không chặn trang (FrameScheduler) nên không cần chờ lâu hơn
const idle = (cb) => (window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 600 }) : setTimeout(cb, 300));
const cancelIdle = (id) => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));

export default function ThumbnailBakerHost() {
  const current = useThumbnailStore((s) => s.queue[0]);
  const complete = useThumbnailStore((s) => s.complete);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (current && !active) {
      const id = idle(() => setActive(true));
      return () => cancelIdle(id);
    }
    if (!current && active) {
      const t = setTimeout(() => setActive(false), KEEP_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [current, active]);

  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', left: -10000, top: 0, width: 360, height: 360, pointerEvents: 'none' }}
    >
      <Canvas
        dpr={1}
        frameloop={current ? 'always' : 'never'} // đang giữ khung chờ việc: không vẽ gì
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: 28, position: [30, 24, 70] }}
      >
        <Suspense fallback={null}>
          {/* KHÔNG gắn key theo từng ảnh: gắn lại cả cảnh = dựng lại ánh sáng môi trường (cube camera + bộ lọc PMREM, rất nặng
              với GPU) cho mỗi ảnh. Cảnh tự xử lý đổi cấu hình: căn khung ngay (bake), bóng đổ, BakeCapture đếm lại theo bakeKey. */}
          {current && (
            <JewelryScene
              config={current.config}
              mode="bake"
              quality="high"
              closeUp={current.config.type === 'necklace'} // cận mặt dây – cả sợi dây thu vào ảnh nhỏ thì mặt dây chỉ còn một chấm
              onBaked={(url) => complete(current.key, url)}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
