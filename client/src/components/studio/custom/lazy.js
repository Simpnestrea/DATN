// "TỰ TẠO" TẢI RIÊNG: giao diện trình dựng kéo theo công cụ gọt khối (CSG), cây BVH, sợi kim loại… (~0,7 MB JavaScript)
// → chỉ tải khi mở thiết kế Tự tạo. Trước đây trang nào có khung 3D (trang chủ, trang thiết kế, Studio nhẫn…) cũng tải.
// Studio gọi preloadCustom() lúc trình duyệt rảnh → bấm "Tự tạo" là có ngay, không phải đợi tải.
import { lazy } from 'react';

const load = () => import('./customUi.js');
const part = (name) => lazy(() => load().then((m) => ({ default: m[name] })));

export const AddPartsPanel = part('AddPartsPanel');
export const PropertiesPanel = part('PropertiesPanel');
export const LayersPanel = part('LayersPanel');
export const CustomToolbar = part('CustomToolbar');
export const WireBanner = part('WireBanner');
export const SketchEditor = part('SketchEditor');

/** Tải trước toàn bộ phần Tự tạo: giao diện + mô hình 3D + trình dựng (cùng tệp với các lần tải lười ở JewelryModel / JewelryScene). */
export function preloadCustom() {
  load().catch(() => {});
  import('../../../three/custom/CustomModel.jsx').catch(() => {});
  import('../../../three/custom/CustomEditor.jsx').catch(() => {});
}
