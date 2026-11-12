// Trạng thái GIAO DIỆN của tính năng gắn đá tự do (không thuộc dữ liệu thiết kế):
// đang ở chế độ gắn, viên đang chọn, "cọ" (loại + cỡ đá sẽ gắn), cảnh báo từng viên, API thao tác từ khung 3D.
import { create } from 'zustand';

export const useFreeStoneStore = create((set) => ({
  mode: false,
  selectedId: null,
  brush: { stone: 'diamond', sizeMm: 1.6 },
  info: {}, // id → { hidden: bool, overhang: bool }
  api: null, // { duplicate(id), mirror(id) } do khung 3D đăng ký

  setMode: (mode) => set(mode ? { mode } : { mode, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
  setInfo: (info) => set({ info }),
  setApi: (api) => set({ api }),
}));

export const newStoneId = () => Math.random().toString(36).slice(2, 10);
