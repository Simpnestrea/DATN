// Tùy chọn khung xem 3D (không thuộc thiết kế): nền, ánh sáng, chất lượng, tự xoay, cận cảnh.
import { create } from 'zustand';
import { readPref, writePref } from '../services/prefs.js';

// stops: điểm màu của gradient tròn – dùng cho cả CSS (khung xem) và canvas 2D (xuất ảnh)
const bg = (code, name, stops, swatch) => ({
  code,
  name,
  stops,
  swatch,
  css: `radial-gradient(circle at 50% 40%, ${stops.map(([p, c]) => `${c} ${p * 100}%`).join(', ')})`,
});

export const BACKGROUNDS = [
  bg('studio', 'Studio tối', [[0, '#2a2a31'], [0.55, '#131316'], [1, '#09090b']], '#1d1d22'),
  bg('ivory', 'Ngà sáng', [[0, '#fdfaf4'], [0.6, '#e9e3d8'], [1, '#d3ccbf']], '#ebe5da'),
  bg('velvet', 'Nhung đỏ', [[0, '#521628'], [0.6, '#24080f'], [1, '#12040a']], '#3a0f1b'),
  bg('navy', 'Xanh đêm', [[0, '#1f3152'], [0.6, '#0d1528'], [1, '#060a14']], '#15223d'),
];

export const getBackground = (code) => BACKGROUNDS.find((b) => b.code === code) ?? BACKGROUNDS[0];

export const LIGHTINGS = [
  { code: 'studio', name: 'Trung tính' },
  { code: 'warm', name: 'Ấm' },
  { code: 'cool', name: 'Lạnh' },
];

const saved = readPref('viewer', {});

export const useViewerStore = create((set, get) => ({
  autoRotate: saved.autoRotate ?? false,
  background: BACKGROUNDS.some((b) => b.code === saved.background) ? saved.background : 'studio',
  lighting: LIGHTINGS.some((l) => l.code === saved.lighting) ? saved.lighting : 'studio',
  quality: saved.quality === 'low' ? 'low' : 'high',
  matte: saved.matte === true, // chế độ dựng hình: tắt bóng / phản chiếu để dễ nhìn hình khối khi chỉnh sửa
  closeUp: false,
  refitToken: 0, // tăng lên để yêu cầu camera căn lại khung
  capture: null, // hàm chụp ảnh do canvas đăng ký

  set(patch) {
    set(patch);
    const { autoRotate, background, lighting, quality, matte } = get();
    writePref('viewer', { autoRotate, background, lighting, quality, matte });
  },
  refit() {
    set((s) => ({ refitToken: s.refitToken + 1 }));
  },
  // căn camera nhìn trọn một hộp bao (giữ hướng nhìn) – dùng cho phím F trong trình dựng hình
  focusBox: null,
  focusToken: 0,
  focus(box) {
    set((s) => ({ focusBox: box, focusToken: s.focusToken + 1 }));
  },
  registerCapture(fn) {
    set({ capture: fn });
  },
}));
