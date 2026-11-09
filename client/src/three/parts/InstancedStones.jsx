// Vẽ hàng chục viên đá nhỏ (pavé, halo, tennis...) chỉ bằng 1 lệnh vẽ nhờ InstancedMesh.
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { getUnitGemGeometry } from '../geometry/gemGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpObj = new THREE.Object3D();
const tmpN = new THREE.Vector3();

/**
 * @param items  [{ p: [x,y,z], n: [nx,ny,nz], s?: size }]  – vị trí gờ đá và hướng mặt bàn
 * @param size   kích thước mặc định (mm)
 */
export function InstancedStones({ items, size, material, cut = 'round', isPearl = false }) {
  const ref = useRef();
  const geometry = getUnitGemGeometry(cut, isPearl);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      tmpObj.position.fromArray(it.p);
      tmpN.fromArray(it.n).normalize();
      tmpObj.quaternion.setFromUnitVectors(UP, tmpN);
      if (it.spin) tmpObj.rotateY(it.spin);
      tmpObj.scale.setScalar(it.s ?? size);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    // geometry/material nằm trong `args` → đổi chúng thì R3F tạo InstancedMesh MỚI,
    // nên phải đặt lại ma trận (nếu không mọi viên đá dồn về gốc toạ độ).
  }, [items, size, geometry, material]);

  if (!items.length) return null;
  return (
    <instancedMesh
      key={items.length} // số lượng thay đổi → tạo lại buffer
      ref={ref}
      args={[geometry, material, items.length]}
      dispose={null}
    />
  );
}

/** Hạt kim loại nhỏ (chấu giữ đá tấm, viền milgrain...). */
export function InstancedBeads({ points, radius, material }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    points.forEach((p, i) => {
      tmpObj.position.fromArray(p);
      tmpObj.quaternion.identity();
      tmpObj.scale.setScalar(radius);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [points, radius, material]);

  if (!points.length) return null;
  return (
    <instancedMesh key={points.length} ref={ref} args={[undefined, material, points.length]}>
      <sphereGeometry args={[1, 10, 8]} />
    </instancedMesh>
  );
}
