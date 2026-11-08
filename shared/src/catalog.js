// Danh mục MẶC ĐỊNH (dữ liệu khởi tạo). Kim loại + đá quý: máy chủ nạp vào MongoDB ở lần chạy đầu, sau đó quản trị viên
// chỉnh trong trang Quản trị; trang web lấy qua GET /api/catalog (máy chủ không chạy → dùng bản này). Kiểu dáng + mẫu gợi ý
// vẫn lấy từ đây.
import materials from '../catalog/materials.json' with { type: 'json' };
import gemstones from '../catalog/gemstones.json' with { type: 'json' };
import styles from '../catalog/styles.json' with { type: 'json' };
import templates from '../catalog/templates.json' with { type: 'json' };

export const localCatalog = { materials, gemstones, styles, templates };

/** Tạo bộ tra cứu nhanh từ một danh mục (local hoặc từ API). */
export function createCatalogLookup(catalog) {
  const materialMap = new Map(catalog.materials.map((m) => [m.code, m]));
  const gemMap = new Map(catalog.gemstones.map((g) => [g.code, g]));
  const styleMap = new Map(catalog.styles.map((s) => [`${s.type}:${s.code}`, s]));
  return {
    material: (code) => materialMap.get(code) ?? null,
    gem: (code) => gemMap.get(code) ?? null,
    style: (type, code) => styleMap.get(`${type}:${code}`) ?? null,
    gemKind: (code) => gemMap.get(code)?.kind ?? 'faceted',
  };
}

export const localLookup = createCatalogLookup(localCatalog);
