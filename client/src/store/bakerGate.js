// Cờ "đã có ảnh mẫu cần chụp" – tách khỏi thumbnailStore để gốc ứng dụng theo dõi được mà không phải nạp kho ảnh (đọc cả
// bộ đệm ảnh trong localStorage) ở mọi trang. Bật một lần rồi giữ nguyên (khung chụp tự giải phóng khi hết việc).
import { create } from 'zustand';

export const useBakerGate = create(() => ({ needed: false }));
