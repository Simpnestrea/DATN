// Khung 3D dùng trong Studio và trang chủ.
import { Component, Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useViewerStore, getBackground } from '../store/viewerStore.js';
import { JewelryScene } from './JewelryScene.jsx';
import { CaptureBridge } from './CaptureBridge.jsx';

class WebGLBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-cream-500">
          <div>
            <p className="font-display text-xl text-cream-100">Không thể hiển thị mô hình 3D</p>
            <p className="mt-2">Trình duyệt hoặc card đồ họa chưa hỗ trợ WebGL. Hãy thử Chrome/Edge bản mới nhất.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * @param mode 'studio' (chỉnh sửa) | 'view' (trang xem thiết kế: chỉ xoay / phóng to) | 'hero' (trang chủ)
 * @param lookupOverride bộ tra cứu danh mục thay thế (xem trước chất liệu chưa lưu ở trang quản trị)
 */
export default function JewelryCanvas({ config, mode = 'studio', className = '', lookupOverride = null }) {
  const viewer = useViewerStore();
  const isHero = mode === 'hero';
  const background = getBackground(viewer.background);
  const quality = isHero ? 'high' : viewer.quality;
  // lần đầu mở web, card đồ hoạ cần 1–3 giây biên dịch shader (không chặn trang) → báo đang dựng thay vì để khung trống
  const [drawn, setDrawn] = useState(false);

  return (
    <div className={`relative h-full w-full ${className}`} style={isHero ? undefined : { background: background.css }}>
      {!drawn && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
          <span className="animate-pulse text-xs tracking-wide text-cream-600">Đang dựng mô hình 3D…</span>
        </div>
      )}
      <WebGLBoundary>
        {/* không preserveDrawingBuffer: tuỳ chọn này bắt GPU chép cả khung hình mỗi lần vẽ; chụp ảnh (CaptureBridge) tự vẽ lại
            ngay trước khi đọc trong cùng một tác vụ nên không cần */}
        <Canvas
          dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 28, position: [30, 24, 70], near: 0.1, far: 4000 }}
          className="touch-none"
        >
          <Suspense fallback={null}>
            <JewelryScene
              config={config}
              mode={mode}
              quality={quality}
              lighting={isHero ? 'studio' : viewer.lighting}
              autoRotate={isHero ? true : viewer.autoRotate}
              closeUp={viewer.closeUp}
              refitToken={viewer.refitToken}
              matte={mode === 'studio' && viewer.matte} // tắt bóng chỉ là chế độ dựng hình khi chỉnh sửa
              lookupOverride={lookupOverride}
              onFirstFrame={() => setDrawn(true)}
            />
          </Suspense>
          {!isHero && <CaptureBridge />}
        </Canvas>
      </WebGLBoundary>
    </div>
  );
}
