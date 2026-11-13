// Dựng hình học cho từng KHỐI của thiết kế tự tạo – dùng lại các hàm dựng sẵn của Studio
// (đai nhẫn, mặt dây đùn khối, viên đá giác cắt, ổ chấu/ổ bao). Đơn vị mm, tâm khối tại gốc toạ độ cục bộ.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildBandGeometry } from '../geometry/bandGeometry.js';
import { buildExtruded } from '../geometry/shapes.js';
import { getGemMetrics, getUnitGemGeometry } from '../geometry/gemGeometry.js';
import { buildSetting } from '../geometry/settingGeometry.js';
import { buildSketchGeometry } from '../geometry/sketchGeometry.js';
import { buildWireGeometry } from '../geometry/wireGeometry.js';

// Hình vẽ 2D có thể tới hàng nghìn điểm – dựng 1 lần rồi nhân bản (cùng tham số được dựng lại ở nhiều nơi:
// đặt khối, hiển thị, khung chọn, hộp bao vết gọt...)
const sketchCache = new Map();
function sketchMetal(p, rule = 'evenodd') {
  const key = JSON.stringify([rule, p.paths, p.depth, p.bevel]);
  let g = sketchCache.get(key);
  if (!g) {
    g = buildSketchGeometry(p.paths, p.depth, p.bevel, rule);
    sketchCache.set(key, g);
    if (sketchCache.size > 8) {
      const [oldKey, old] = sketchCache.entries().next().value;
      sketchCache.delete(oldKey);
      old.dispose();
    }
  } else {
    // dùng gần đây → đưa xuống cuối (bỏ ra khỏi bộ nhớ đệm sau cùng)
    sketchCache.delete(key);
    sketchCache.set(key, g);
  }
  return g.clone();
}

const PLATE_SHAPE = { disc: 'round', heart: 'heart', star: 'star', teardrop: 'teardrop', bar: 'bar' };

/**
 * @returns {{ metal: BufferGeometry|null, gem: BufferGeometry|null, gemScale: number, setting: BufferGeometry|null,
 *             owned: BufferGeometry[] }}  `owned` = geometry tự tạo (cần dispose); gem đơn vị dùng chung thì không.
 */
export function buildPartGeometry(kind, p) {
  let metal; // mọi nhánh của switch (kể cả default) đều gán
  switch (kind) {
    case 'sphere':
      metal = new THREE.SphereGeometry(p.r, 48, 32);
      break;
    case 'box': {
      const rad = Math.min(p.round, Math.min(p.x, p.y, p.z) / 2 - 0.001);
      metal = rad > 0.01 ? new RoundedBoxGeometry(p.x, p.y, p.z, 4, rad) : new THREE.BoxGeometry(p.x, p.y, p.z);
      break;
    }
    case 'cylinder':
      metal = new THREE.CylinderGeometry(p.r, p.r, p.h, 64);
      break;
    case 'cone':
      metal = new THREE.CylinderGeometry(0, p.r, p.h, 64);
      break;
    case 'capsule':
      metal = new THREE.CapsuleGeometry(p.r, p.h, 10, 40);
      break;
    case 'torus':
      metal = new THREE.TorusGeometry(p.R, p.r, 24, 160, (p.arc * Math.PI) / 180);
      break;
    case 'band':
      metal = buildBandGeometry({ inner: p.innerD / 2, width: p.width, thick: p.thick, profile: p.profile });
      break;
    case 'disc':
    case 'heart':
    case 'star':
    case 'teardrop':
    case 'bar':
      metal = buildExtruded(PLATE_SHAPE[kind], p.size, p.depth, kind !== 'bar' && p.hollow).geometry;
      break;
    case 'sketch':
      metal = sketchMetal(p);
      break;
    case 'wire':
      metal = buildWireGeometry(p);
      break;
    case 'text':
      metal = sketchMetal(p, 'nonzero'); // đường viền chữ đã dựng sẵn từ font (xem textOutline.js)
      break;
    case 'gem': {
      const gem = getUnitGemGeometry(p.cut, false);
      const setting = p.setting !== 'none' ? buildSetting(p.setting, getGemMetrics(p.cut, p.size, false)) : null;
      return { metal: null, gem, gemScale: p.size, setting, owned: setting ? [setting] : [] };
    }
    default:
      metal = new THREE.SphereGeometry(1, 16, 12);
  }
  metal.computeBoundingBox();
  return { metal, gem: null, gemScale: 1, setting: null, owned: [metal] };
}

/** Hộp bao cục bộ của khối (để vẽ khung chọn). */
export function partLocalBox(g) {
  const box = new THREE.Box3();
  if (g.metal) {
    g.metal.computeBoundingBox();
    box.union(g.metal.boundingBox);
  }
  if (g.gem) {
    g.gem.computeBoundingBox();
    box.union(g.gem.boundingBox.clone().applyMatrix4(new THREE.Matrix4().makeScale(g.gemScale, g.gemScale, g.gemScale)));
  }
  if (g.setting) {
    g.setting.computeBoundingBox();
    box.union(g.setting.boundingBox);
  }
  return box;
}
