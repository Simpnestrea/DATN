// Mô hình VÒNG CỔ: dây đeo quanh cổ (nhìn chính diện) + mặt dây treo ở điểm thấp nhất.
import { useMemo } from 'react';
import { buildNecklaceCurve } from '../geometry/chainPath.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { ChainLinks } from '../parts/ChainLinks.jsx';
import { PendantPiece } from '../parts/PendantPiece.jsx';

export function Necklace({ config, focusRef }) {
  const mats = useMaterials();
  const { size, deco, gem, style } = config;
  const curve = useMemo(() => buildNecklaceCurve(size.length), [size.length]);
  const bottom = useMemo(() => curve.getPointAt(0.5), [curve]);
  const shape = deco.pendantShape;

  return (
    <group>
      <ChainLinks curve={curve} style={style} thickness={size.chainThickness} material={mats.metal} />
      {shape !== 'none' && (
        <group ref={focusRef} position={bottom}>
          <PendantPiece
            shape={shape}
            size={size.pendantSize}
            thickness={Math.min(3, Math.max(1.2, size.pendantSize * 0.11))}
            hollow={deco.hollow}
            gem={gem}
            gemEnabled={gem.enabled}
            halo={deco.halo}
            engraving={deco.engraving}
            engravingPos={deco.engravingPos}
            engravingSize={deco.engravingSize}
          />
        </group>
      )}
    </group>
  );
}
