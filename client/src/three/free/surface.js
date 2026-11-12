// Tiện ích bề mặt cho tính năng gắn đá tự do: tìm bề mặt kim loại, raycast, chuyển điểm neo ↔ vị trí.
import * as THREE from 'three';
import { ringSizeToDiameter } from '@ngk/shared';

const raycaster = new THREE.Raycaster();
const m4 = new THREE.Matrix4();
const m3 = new THREE.Matrix3();

/** Các mesh kim loại (bề mặt được phép gắn đá) bên trong `root`. */
export function collectSurfaces(root, metalMaterial) {
  const out = [];
  root?.traverse((o) => {
    if (o.isMesh && o.material === metalMaterial) out.push(o);
  });
  return out;
}

/** Vị trí + bán kính các viên đá có sẵn (đá chủ, halo, pavé...) để tránh chồng lấn. */
export function collectGemSpheres(root, gemMaterials) {
  const out = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  root?.traverse((o) => {
    if (!o.isMesh || !gemMaterials.includes(o.material)) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        m4.premultiply(o.matrixWorld).decompose(pos, quat, scl);
        out.push({ p: pos.clone(), r: scl.x * 0.5 });
      }
    } else {
      o.matrixWorld.decompose(pos, quat, scl);
      out.push({ p: pos.clone(), r: scl.x * 0.5 });
    }
  });
  return out;
}

/** Pháp tuyến thế giới của điểm va chạm (xử lý cả InstancedMesh). */
export function hitNormal(hit) {
  const n = hit.face.normal.clone();
  if (hit.object.isInstancedMesh && hit.instanceId != null) {
    hit.object.getMatrixAt(hit.instanceId, m4);
    m4.premultiply(hit.object.matrixWorld);
  } else {
    m4.copy(hit.object.matrixWorld);
  }
  return n.applyMatrix3(m3.getNormalMatrix(m4)).normalize();
}

export function castRay(origin, dir, surfaces, far = Infinity) {
  raycaster.set(origin, dir);
  raycaster.far = far;
  const hit = raycaster.intersectObjects(surfaces, false)[0];
  raycaster.far = Infinity;
  return hit ? { p: hit.point.clone(), n: hitNormal(hit), object: hit.object } : null;
}

export function castFromCamera(ndc, camera, objects) {
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(objects, false)[0] ?? null;
}

/** Thông số đai (nhẫn, vòng kiềng, cuff) – null nếu loại khác. */
export function bandFrame(config) {
  const { type, style, size } = config;
  if (type === 'ring') {
    const inner = ringSizeToDiameter(size.ringSize) / 2;
    return { inner, thick: size.bandThickness, hw: size.bandWidth / 2 };
  }
  if (type === 'bracelet' && (style === 'bangle' || style === 'cuff')) {
    return { inner: size.circumference / (Math.PI * 2), thick: size.thickness, hw: size.width / 2 };
  }
  return null;
}

export const usesFace = (config) => config.type === 'pendant' || config.type === 'necklace';

/**
 * Từ điểm va chạm → điểm neo lưu vào thiết kế (hoặc lý do từ chối).
 * @returns {{ anchor } | { error: string }}
 */
export function anchorFromHit(hit, config, focus) {
  const { p, n } = hit;
  const band = bandFrame(config);
  if (band) {
    const th = Math.atan2(p.x, p.y);
    const r = Math.hypot(p.x, p.y);
    if (Math.abs(n.z) > 0.7) {
      return { anchor: { k: 'side', th, rr: (r - band.inner) / band.thick, s: Math.sign(n.z) } };
    }
    const radialDot = (n.x * p.x + n.y * p.y) / (r || 1);
    if (radialDot < -0.3) return { error: 'Không gắn đá ở mặt trong – chỗ này chạm vào da.' };
    return { anchor: { k: 'cyl', th, a: p.z / band.hw } };
  }
  if (usesFace(config) && focus) {
    const local = focus.worldToLocal(p.clone());
    const q = focus.getWorldQuaternion(new THREE.Quaternion()).invert();
    const nl = n.clone().applyQuaternion(q);
    if (nl.z < -0.6) return { error: 'Không gắn đá ở mặt sau – chỗ này chạm vào da.' };
    if (nl.z > 0.6) {
      const size = config.size.pendantSize;
      return { anchor: { k: 'face', x: local.x / size, y: local.y / size, s: 1 } };
    }
    return { anchor: { k: 'free', p: p.toArray(), n: n.toArray() } };
  }
  if (config.type === 'earrings' && n.z < -0.6) {
    return { error: 'Không gắn đá ở mặt sau khuyên tai.' };
  }
  return { anchor: { k: 'free', p: p.toArray(), n: n.toArray() } };
}

/** Từ điểm neo → vị trí + pháp tuyến hiện tại trên bề mặt (raycast lại). null nếu không còn bề mặt. */
export function resolveAnchor(anchor, config, surfaces, focus) {
  const band = bandFrame(config);
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  switch (anchor.k) {
    case 'cyl': {
      if (!band) return null;
      const R = band.inner + band.thick + 40;
      origin.set(Math.sin(anchor.th) * R, Math.cos(anchor.th) * R, anchor.a * band.hw);
      dir.set(-Math.sin(anchor.th), -Math.cos(anchor.th), 0);
      break;
    }
    case 'side': {
      if (!band) return null;
      const r = band.inner + anchor.rr * band.thick;
      origin.set(Math.sin(anchor.th) * r, Math.cos(anchor.th) * r, anchor.s * (band.hw + 20));
      dir.set(0, 0, -anchor.s);
      break;
    }
    case 'face': {
      if (!focus) return null;
      const size = config.size.pendantSize;
      origin.set(anchor.x * size, anchor.y * size, anchor.s * 30);
      focus.localToWorld(origin);
      dir.set(0, 0, -anchor.s).applyQuaternion(focus.getWorldQuaternion(new THREE.Quaternion()));
      break;
    }
    case 'free': {
      const n = new THREE.Vector3().fromArray(anchor.n);
      origin.fromArray(anchor.p).addScaledVector(n, 6);
      dir.copy(n).negate();
      break;
    }
    default:
      return null;
  }
  return castRay(origin, dir, surfaces);
}

/** Đối xứng điểm neo qua mặt phẳng x = 0 (trái ↔ phải). */
export function mirrorAnchor(a) {
  switch (a.k) {
    case 'cyl':
    case 'side':
      return { ...a, th: -a.th };
    case 'face':
      return { ...a, x: -a.x };
    case 'free':
      return { ...a, p: [-a.p[0], a.p[1], a.p[2]], n: [-a.n[0], a.n[1], a.n[2]] };
    default:
      return a;
  }
}

/** Kiểm tra viên đá có nhô ra ngoài mép bề mặt không (lấy mẫu 4 điểm quanh vành đá). */
export function overhangs(p, n, size, surfaces) {
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
  const back = n.clone().negate();
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = p.clone().addScaledVector(t1, a * size * 0.42).addScaledVector(t2, b * size * 0.42).addScaledVector(n, size);
    if (!castRay(o, back, surfaces, size * 2.2)) return true;
  }
  return false;
}
