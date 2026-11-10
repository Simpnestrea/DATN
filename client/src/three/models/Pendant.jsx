// Mô hình MẶT DÂY riêng: tập trung chi tiết mặt dây, dây chỉ hiển thị một đoạn ngắn để minh họa.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { ChainLinks } from '../parts/ChainLinks.jsx';
import { PendantPiece } from '../parts/PendantPiece.jsx';

export function Pendant({ config, focusRef }) {
  const mats = useMaterials();
  const { size, deco, gem, style } = config;
  const k = Math.max(0.8, size.pendantSize / 16);

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-26 * k, 44 * k, -10 * k),
        new THREE.Vector3(-11 * k, 15 * k, -3.5 * k),
        new THREE.Vector3(-3 * k, 1.8 * k, -0.6),
        new THREE.Vector3(0, 0.6, 0),
        new THREE.Vector3(3 * k, 1.8 * k, -0.6),
        new THREE.Vector3(11 * k, 15 * k, -3.5 * k),
        new THREE.Vector3(26 * k, 44 * k, -10 * k),
      ]),
    [k],
  );

  return (
    <group>
      <group ref={focusRef}>
        <PendantPiece
          shape={style}
          size={size.pendantSize}
          thickness={size.thickness}
          hollow={deco.hollow}
          gem={gem}
          gemEnabled={gem.enabled}
          halo={deco.halo}
          bail={deco.bail}
          engraving={deco.engraving}
          engravingPos={deco.engravingPos}
          engravingSize={deco.engravingSize}
        />
      </group>
      {deco.showChain && <ChainLinks curve={curve} closed={false} style="cable" thickness={1.1} material={mats.metal} />}
    </group>
  );
}
