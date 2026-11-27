// Số liệu nhỏ của khu quản trị (số trên thanh bên, số trên các nút lọc) – tải lại khi chuyển trang con / sau mỗi thao tác.
import { create } from 'zustand';
import { get } from '../services/api.js';

export const useAdminStore = create((set) => ({
  summary: null, // { users, admins, locked, demo, unverified, openReports }
  async refresh() {
    try {
      set({ summary: await get('/api/admin/summary') });
    } catch {
      /* không tải được số liệu phụ – trang vẫn dùng bình thường */
    }
  },
}));
