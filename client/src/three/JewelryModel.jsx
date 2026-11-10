// Chọn mô hình 3D theo loại trang sức. Mỗi mô hình chỉ là "hàm vẽ" từ cấu hình JSON.
import { Ring } from './models/Ring.jsx';
import { Bracelet } from './models/Bracelet.jsx';
import { Necklace } from './models/Necklace.jsx';
import { Earrings } from './models/Earrings.jsx';
import { lazy } from 'react';
import { Pendant } from './models/Pendant.jsx';

// "Tự tạo" (gọt khối CSG, cây BVH… ~0,5 MB) chỉ tải khi gặp thiết kế Tự tạo. Cảnh 3D nằm trong MỘT <Suspense> (khung 3D /
// khung chụp ảnh) → đợi tải xong mới hiện cả cảnh: camera căn khung, bóng đổ, chụp ảnh đều thấy đủ mô hình.
const CustomModel = lazy(() => import('./custom/CustomModel.jsx').then((m) => ({ default: m.CustomModel })));

const MODELS = { ring: Ring, bracelet: Bracelet, necklace: Necklace, earrings: Earrings, pendant: Pendant, custom: CustomModel };

export function JewelryModel({ config, focusRef, interactive = false }) {
  const Model = MODELS[config.type] ?? Ring;
  return <Model config={config} focusRef={focusRef} interactive={interactive} />;
}

/** Hướng nhìn mặc định của camera cho từng loại (vector từ tâm vật thể tới camera). */
export function viewDirection(config) {
  switch (config.type) {
    case 'ring':
      return [0.55, 0.42, 1];
    case 'bracelet':
      return ['bangle', 'cuff'].includes(config.style) ? [0.5, 0.45, 1] : [0, 1.15, 1];
    case 'necklace':
      return [0, 0.05, 1];
    case 'earrings':
      return [0, 0.12, 1];
    case 'pendant':
      return [0.25, 0.08, 1];
    case 'custom':
      return [0.55, 0.5, 1];
    default:
      return [0, 0.3, 1];
  }
}

/**
 * Khóa quyết định khi nào camera căn lại khung ĐẦY ĐỦ.
 * Cố ý KHÔNG chứa kích thước: khi chỉnh size, camera đứng yên để người dùng thấy món đồ to/nhỏ thật
 * (việc lùi camera khi vật thể tràn khung do AutoFrame xử lý riêng).
 */
export function frameKey(config, closeUp) {
  const usesCloseUp = config.type === 'necklace' && closeUp && config.deco.pendantShape !== 'none';
  return `${config.type}|${config.style}|${usesCloseUp ? 'close' : 'full'}`;
}

/** Loại nào có "mặt sàn" để đổ bóng (đồ treo như dây chuyền, khuyên tai thì không). */
export function hasFloorShadow(config) {
  return config.type === 'ring' || config.type === 'bracelet' || config.type === 'custom';
}
