// Tạo vật liệu PBR cho kim loại và đá quý từ dữ liệu danh mục.
import * as THREE from 'three';
import { FINISHES } from '@ngk/shared';

/** Thuộc tính kim loại: ưu tiên danh mục, nếu mục đã bị xoá thì dùng snapshot lưu trong thiết kế. */
export function resolveMetal(metal, lookup) {
  const m = lookup.material(metal.code);
  return {
    color: m?.color ?? metal.snapshot?.color ?? '#E9BC62',
    metalness: m?.metalness ?? metal.snapshot?.metalness ?? 1,
    roughness: m?.roughness ?? metal.snapshot?.roughness ?? 0.12,
  };
}

export function resolveStone(code, lookup, override = null, snapshot = null) {
  const g = lookup.gem(code);
  return {
    color: override ?? g?.color ?? snapshot?.color ?? '#FFFFFF',
    ior: g?.ior ?? snapshot?.ior ?? 1.6,
    kind: g?.kind ?? snapshot?.kind ?? 'faceted',
    isDiamond: code === 'diamond' && !override,
  };
}

/**
 * CHẾ ĐỘ DỰNG HÌNH (tắt bóng): vật liệu mờ như đất sét, giữ màu gốc để vẫn phân biệt kim loại / đá,
 * nhưng không phản chiếu môi trường → nhìn rõ hình khối, vết khoét, rãnh, lỗ khi chỉnh sửa.
 */
function matteMetal(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color('#a8a29a'), 0.3), // dịu màu để mặt sáng / tối rõ hơn
    metalness: 0.05,
    roughness: 0.8,
    // ánh sáng môi trường chiếu đều mọi phía làm khối trông phẳng → giảm đi, để đèn có hướng tạo khối
    envMapIntensity: 0.12,
  });
}

function matteStone(stone) {
  // kim cương trắng tinh trên nền mờ khó thấy → ngả xám xanh nhạt; đá màu giữ màu, giác cạnh vẫn rõ
  const color = stone.isDiamond ? '#d8e0ea' : stone.color;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0,
    roughness: stone.kind === 'pearl' ? 0.6 : 0.42,
    envMapIntensity: 0.2,
    flatShading: stone.kind !== 'pearl',
  });
}

export function createMetalMaterial({ color, metalness, roughness }, finish, matte = false) {
  if (matte) return matteMetal(color);
  const add = FINISHES.find((f) => f.code === finish)?.roughnessAdd ?? 0;
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness,
    roughness: Math.min(1, roughness + add),
    envMapIntensity: 1.35,
    clearcoat: finish === 'polished' ? 0.25 : 0,
    clearcoatRoughness: 0.08,
  });
  if (finish === 'brushed') {
    mat.anisotropy = 0.7; // vân xước theo một hướng
  }
  return mat;
}

/** Màu tối của kim loại – dùng cho chữ khắc. */
export function createEngraveMaterial({ color }) {
  const c = new THREE.Color(color).multiplyScalar(0.28);
  return new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.55, transparent: true });
}

export function createStoneMaterial(stone, quality = 'high', matte = false) {
  if (matte) return matteStone(stone);
  if (stone.kind === 'pearl') {
    // Ngọc trai: lớp xà cừ mỏng → ánh cầu vồng nhẹ (iridescence) + ánh lụa (sheen) + lớp bóng ngoài
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(stone.color).multiplyScalar(0.78),
      roughness: 0.16,
      metalness: 0.05,
      sheen: 1,
      sheenColor: new THREE.Color('#ffd6e4'),
      sheenRoughness: 0.3,
      iridescence: 1,
      iridescenceIOR: 1.45,
      iridescenceThicknessRange: [260, 620],
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.4,
    });
  }
  const high = quality === 'high';
  if (stone.isDiamond) {
    // Kim cương: không màu, phản xạ mạnh + giao thoa cầu vồng (iridescence) giả lập "lửa" kim cương
    // metalness cao → viên đá gần như chỉ phản xạ môi trường, mỗi mặt giác sáng/tối khác nhau
    // tạo độ tương phản đen–trắng đặc trưng của kim cương (thay vì trắng đục như sứ).
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffffff'),
      metalness: 0.88,
      roughness: 0,
      ior: stone.ior,
      specularIntensity: 1,
      envMapIntensity: high ? 2.6 : 2.2,
      iridescence: high ? 1 : 0.6,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [150, 650],
      clearcoat: 1,
      clearcoatRoughness: 0,
      flatShading: true,
    });
  }
  const color = new THREE.Color(stone.color);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.12,
    roughness: 0.02,
    ior: stone.ior,
    specularIntensity: 1,
    envMapIntensity: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0,
    emissive: color.clone().multiplyScalar(0.12), // giữ độ bão hoà màu trên nền tối
    flatShading: true,
  });
  if (high) {
    // độ trong: ánh sáng xuyên qua và bị hấp thụ theo màu đá
    mat.transmission = 0.35;
    mat.thickness = 2.5;
    mat.attenuationColor = color.clone();
    mat.attenuationDistance = 1.2;
  }
  return mat;
}
