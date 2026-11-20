// Nguồn dữ liệu danh mục (chất liệu, đá quý, kiểu dáng, mẫu gợi ý).
// Kim loại + đá quý do quản trị viên quản lý trên máy chủ (GET /api/catalog). Máy chủ chưa chạy / mất mạng → dùng bản mặc
// định đóng gói trong @ngk/shared để Studio vẫn dùng được (thiết kế cho khách không cần máy chủ).
import { localCatalog } from '@ngk/shared';
import { get } from './api.js';

export async function fetchCatalog() {
  try {
    const c = await get('/api/catalog');
    if (Array.isArray(c?.materials) && c.materials.length && Array.isArray(c.gemstones) && c.gemstones.length) return c;
  } catch {
    /* không kết nối được máy chủ – dùng bản mặc định bên dưới */
  }
  return structuredClone(localCatalog);
}
