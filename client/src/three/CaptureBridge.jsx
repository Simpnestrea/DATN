// Đăng ký hàm chụp ảnh của canvas 3D vào viewerStore để nút "Xuất ảnh" bên ngoài Canvas gọi được.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useViewerStore } from '../store/viewerStore.js';

export function CaptureBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const registerCapture = useViewerStore((s) => s.registerCapture);

  useEffect(() => {
    /**
     * @param scale       hệ số phân giải (1 = như màn hình, 2 = gấp đôi)
     * @param background  object nền (có stops) hoặc null = trong suốt
     */
    const capture = ({ scale = 1, background = null } = {}) => {
      const prevRatio = gl.getPixelRatio();
      gl.setPixelRatio(Math.min(4, prevRatio * scale));
      gl.render(scene, camera);
      const src = gl.domElement;
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext('2d');
      if (background) {
        const cx = out.width / 2;
        const cy = out.height * 0.4;
        const r = Math.hypot(Math.max(cx, out.width - cx), Math.max(cy, out.height - cy));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        background.stops.forEach(([p, c]) => grad.addColorStop(p, c));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(src, 0, 0);
      gl.setPixelRatio(prevRatio);
      gl.render(scene, camera);
      return out.toDataURL('image/png');
    };
    registerCapture(capture);
    return () => registerCapture(null);
  }, [gl, scene, camera, registerCapture]);

  return null;
}
