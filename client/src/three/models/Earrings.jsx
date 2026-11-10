// Mô hình KHUYÊN TAI (một đôi, đối xứng). Mỗi chiếc: gốc toạ độ tại dái tai, mặt trước hướng +Z.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { ChainLinks } from '../parts/ChainLinks.jsx';
import { InstancedStones } from '../parts/InstancedStones.jsx';
import { PendantPiece } from '../parts/PendantPiece.jsx';
import { SetGem, useGemMetrics } from '../parts/SetGem.jsx';
import { useDisposable } from '../parts/useGeometry.js';

const FACE_FRONT = [Math.PI / 2, 0, 0];
const HOOP_GAP = 0.22;

export function Earrings({ config }) {
  const { style, size, gem } = config;
  const isPearl = useMaterials().gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);
  const sep =
    style === 'hoop'
      ? size.hoopDiameter / 2 + 5
      : Math.max(metrics.width, metrics.length) * (config.deco.halo ? 0.8 : 0.6) + 5;

  const Piece = style === 'hoop' ? Hoop : style === 'drop' ? Drop : Stud;
  return (
    <group>
      <group position={[-sep, 0, 0]} rotation={[0, 0.32, 0]}>
        <Piece config={config} metrics={metrics} />
      </group>
      <group position={[sep, 0, 0]} rotation={[0, -0.32, 0]} scale={[-1, 1, 1]}>
        <Piece config={config} metrics={metrics} />
      </group>
    </group>
  );
}

/** Chốt xỏ tai + chặn bướm phía sau. */
function PostAndBack({ from = 0 }) {
  const mats = useMaterials();
  return (
    <group>
      <mesh position={[0, 0, from - 5.5]} rotation={[Math.PI / 2, 0, 0]} material={mats.metal}>
        <cylinderGeometry args={[0.42, 0.42, 11, 12]} />
      </mesh>
      <group position={[0, 0, from - 8.5]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.metal}>
          <cylinderGeometry args={[2.4, 2.4, 0.45, 32]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.25, 0, 0.55]} material={mats.metal}>
            <torusGeometry args={[1.05, 0.32, 10, 24]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Stud({ config, metrics }) {
  const mats = useMaterials();
  const { gem, deco } = config;
  if (!gem.enabled) {
    return (
      <group>
        <mesh material={mats.metal}>
          <sphereGeometry args={[gem.sizeMm / 2, 32, 24]} />
        </mesh>
        <PostAndBack from={-gem.sizeMm * 0.3} />
      </group>
    );
  }
  return (
    <group>
      <SetGem gem={gem} halo={deco.halo} rotation={FACE_FRONT} />
      <PostAndBack from={-metrics.pavilionH} />
    </group>
  );
}

function Hoop({ config }) {
  const mats = useMaterials();
  const { size, deco } = config;
  const tube = size.thickness / 2;
  const R = size.hoopDiameter / 2 - tube;
  const geo = useDisposable(() => new THREE.TorusGeometry(R, tube, 16, 120, Math.PI * 2 - HOOP_GAP), [R, tube]);

  const pave = useMemo(() => {
    if (!deco.pave) return null;
    const stone = Math.min(tube * 1.2, 2.4);
    const span = 1.95; // nửa cung đính đá (rad) quanh đáy vòng
    const count = Math.max(3, Math.floor((2 * span * R) / (stone * 1.12)));
    const items = [];
    for (let i = 0; i < count; i++) {
      const phi = -Math.PI / 2 - span + (i / (count - 1)) * 2 * span;
      // đá nằm trên mặt trước ống vòng, mặt bàn hướng thẳng ra trước (+Z)
      items.push({ p: [Math.cos(phi) * R, Math.sin(phi) * R, tube * 0.82], n: [0, 0, 1] });
    }
    return { items, stone };
  }, [deco.pave, tube, R]);

  return (
    <group position={[0, -R, 0]}>
      <mesh geometry={geo} rotation={[0, 0, Math.PI / 2 + HOOP_GAP / 2]} material={mats.metal} dispose={null} />
      {pave && <InstancedStones items={pave.items} size={pave.stone} material={mats.accent} />}
    </group>
  );
}

function Drop({ config, metrics }) {
  const mats = useMaterials();
  const { size, gem, deco } = config;
  const link = Math.max(0.7, size.thickness * 0.7);
  const dangleH = gem.enabled ? metrics.length + 2.4 : 12.2;
  const chainLen = Math.max(2.5, size.dropLength - 3 - dangleH);
  const top = -2.2;
  const bottom = top - chainLen;
  const curve = useMemo(
    () => new THREE.LineCurve3(new THREE.Vector3(0, top, 0), new THREE.Vector3(0, bottom, 0)),
    [top, bottom],
  );
  const topGem = { cut: 'round', sizeMm: 3, setting: 'bezel' };

  return (
    <group>
      {/* nụ trên cùng */}
      {gem.enabled ? (
        <SetGem gem={topGem} material={mats.accent} stoneIsPearl={false} rotation={FACE_FRONT} />
      ) : (
        <mesh material={mats.metal}>
          <sphereGeometry args={[1.6, 24, 16]} />
        </mesh>
      )}
      <PostAndBack from={-1} />
      <mesh position={[0, top + 0.6, 0]} material={mats.metal}>
        <cylinderGeometry args={[0.35, 0.35, 1.8, 10]} />
      </mesh>
      <ChainLinks curve={curve} closed={false} style="cable" thickness={link} material={mats.metal} />
      <group position={[0, bottom - 0.6, 0]}>
        {gem.enabled ? (
          <PendantPiece shape="solitaire" size={8} thickness={1.2} gem={gem} gemEnabled halo={deco.halo} />
        ) : (
          <PendantPiece shape="teardrop" size={10} thickness={1.4} gem={gem} gemEnabled={false} />
        )}
      </group>
    </group>
  );
}
