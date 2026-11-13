// Trạng thái GIAO DIỆN của trình dựng hình tự tạo (không thuộc dữ liệu thiết kế):
// khối đang chọn, chế độ tay cầm (gizmo), bắt lưới, chế độ "đặt lên bề mặt", hiện lưới.
import { create } from 'zustand';

export const useCustomStore = create((set, get) => ({
  selected: [], // id các khối đang chọn
  // Chế độ chuột: select | pan (kéo màn hình) | rotate (xoay khối tự do) | stretch (kéo giãn) | marquee (chọn vùng)
  // Phím giữ tạm thời ghi đè: Ctrl → pan/rotate, Alt → marquee/stretch (tùy bấm vào nền hay vào khối)
  tool: 'select',
  activeTool: null, // chế độ đang thực sự chạy trong lúc kéo (hiển thị trên thanh công cụ)
  gizmo: 'translate', // translate | rotate | scale
  snap: true,
  grid: true,
  placeMode: false, // bấm lên bề mặt khối khác để đặt khối đang chọn lên đó
  dragging: false,
  objects: new Map(), // id → Object3D (do khung 3D đăng ký, không gây render lại)
  viewRay: null, // () => { origin, dir, focusDist } – tia nhìn từ giữa màn hình, do khung 3D đăng ký

  select: (ids) =>
    set((s) => {
      const selected = Array.isArray(ids) ? ids : ids ? [ids] : [];
      // chọn khối khác khi đang sửa điểm của sợi → thoát chế độ sửa điểm
      const wire = s.wire?.mode === 'edit' && !(selected.length === 1 && selected[0] === s.wire.partId) ? null : s.wire;
      return { selected, placeMode: false, wire };
    }),
  toggle: (id) => {
    const cur = get().selected;
    set({ selected: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  setGizmo: (gizmo) => set({ gizmo }),
  setTool: (tool) => set({ tool }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSnap: (snap) => set({ snap }),
  setGrid: (grid) => set({ grid }),
  setPlaceMode: (placeMode) => set({ placeMode }),
  setDragging: (dragging) => set({ dragging }),

  // Bảng vẽ 2D: null = đóng; { partId: null } = vẽ khối mới; { partId } = sửa hình vẽ của khối đó
  sketchEdit: null,
  openSketch: (partId = null) => set({ sketchEdit: { partId }, carve: { ...get().carve, on: false } }),
  closeSketch: () => set({ sketchEdit: null }),

  // Sợi kim loại: null | { mode: 'draw', points: [[x,y,z]...] (thế giới) } | { mode: 'edit', partId, sel: số thứ tự điểm | -1 }
  wire: null,
  startWireDraw: () => set({ wire: { mode: 'draw', points: [] }, selected: [], carve: { ...get().carve, on: false }, placeMode: false }),
  editWire: (partId) => set({ wire: { mode: 'edit', partId, sel: -1 }, selected: [partId], carve: { ...get().carve, on: false }, placeMode: false }),
  setWire: (patch) => set((s) => (s.wire ? { wire: { ...s.wire, ...patch } } : {})),
  endWire: () => set({ wire: null }),

  // Cọ khoét (tạo hình trực tiếp trên khối đang chọn)
  carve: { on: false, shape: 'erase', size: 1.5, depth: 1.2 },
  setCarve: (patch) => set((s) => ({ carve: { ...s.carve, ...patch } })),
}));

// Chỉ khi chạy dev: mở store cho kiểm thử tự động
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__ngk = { ...(window.__ngk ?? {}), custom: useCustomStore };
}
