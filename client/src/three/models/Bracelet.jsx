// Mô hình VÒNG TAY.
//  - bangle / cuff: đai liền khối dựng đứng như nhẫn (mặt XY, đỉnh +Y)
//  - chain / charm / tennis: lắc nằm phẳng trên mặt XZ
import { useMemo } from 'react';
import * as THREE from 'three';
import { buildBandGeometry } from '../geometry/bandGeometry.js';
import { buildCircleCurve } from '../geometry/chainPath.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { ChainLinks, Clasp } from '../parts/ChainLinks.jsx';
import { InstancedBeads, InstancedStones } from '../parts/InstancedStones.jsx';
import { SetGem, useGemMetrics } from '../parts/SetGem.jsx';
import { BandEngraving } from '../parts/Engraving.jsx';
import { PendantPiece } from '../parts/PendantPiece.jsx';
import { useDisposable } from '../parts/useGeometry.js';
import { headLift, paveItems } from './Ring.jsx';

const CUFF_GAP = (50 * Math.PI) / 180;

export function Bracelet({ config }) {
  const { style } = config;
  if (style === 'bangle' || style === 'cuff') return <SolidBracelet config={config} />;
  if (style === 'tennis') return <TennisBracelet config={config} />;
  return <ChainBracelet config={config} />;
}

function SolidBracelet({ config }) {
  const mats = useMaterials();
  const { size, gem, deco, style } = config;
  const inner = size.circumference / (Math.PI * 2);
  const { width, thickness: thick } = size;
  const outer = inner + thick;
  const isCuff = style === 'cuff';
  const isPearl = mats.gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);

  const band = useDisposable(
    () => buildBandGeometry({ inner, width, thick, profile: 'comfort', segments: 200, gapAngle: isCuff ? CUFF_GAP : 0 }),
    [inner, width, thick, isCuff],
  );

  const pave = useMemo(() => {
    if (!deco.pave || isCuff) return null;
    const head = gem.enabled ? metrics.width / 2 + 1.2 : 0;
    return paveItems({ radius: outer, width, from: gem.enabled ? head / outer : 0.05, to: 0.75 });
  }, [deco.pave, isCuff, gem.enabled, metrics, outer, width]);

  // Đầu vòng cuff: 2 viên bi, hoặc 2 viên đá nếu bật đá chủ
  const ends = useMemo(() => {
    if (!isCuff) return [];
    const rc = inner + thick / 2;
    return [-1, 1].map((s) => {
      const th = s * (Math.PI - CUFF_GAP / 2);
      return { th, p: [Math.sin(th) * rc, Math.cos(th) * rc, 0] };
    });
  }, [isCuff, inner, thick]);
  const ball = Math.max(thick, width) * 0.62;

  return (
    <group>
      <mesh geometry={band} material={mats.metal} userData={{ band: true }} dispose={null} />

      {/* đá chủ + đá tấm mặt trên xoay quanh thân vòng theo vị trí người dùng chọn */}
      <group rotation={[0, 0, isCuff ? 0 : (-gem.place.u * Math.PI) / 180]}>
        {!isCuff && gem.enabled && (
          <group name="main-gem" position={[0, outer, (gem.place.v * width) / 2]} rotation={[0, 0, (-gem.place.tilt * Math.PI) / 180]}>
            <SetGem gem={gem} position={[0, headLift(metrics, gem.setting, isPearl, thick), 0]} />
          </group>
        )}
        {pave && (
          <>
            <InstancedStones items={pave.items} size={pave.stone} material={mats.accent} />
            <InstancedBeads points={pave.beads} radius={pave.stone * 0.13} material={mats.metal} />
          </>
        )}
      </group>

      {ends.map((e, i) =>
        gem.enabled ? (
          <group key={i} rotation={[0, 0, -e.th]}>
            <mesh position={[0, inner + thick / 2, 0]} material={mats.metal}>
              <sphereGeometry args={[ball * 0.8, 24, 16]} />
            </mesh>
            {/* đá đặt trên đầu vòng, mặt bàn hướng ra ngoài */}
            <SetGem gem={gem} position={[0, outer + headLift(metrics, gem.setting, isPearl, thick) - thick * 0.3, 0]} />
          </group>
        ) : (
          <mesh key={i} position={e.p} material={mats.metal}>
            <sphereGeometry args={[ball, 32, 20]} />
          </mesh>
        ),
      )}

      {/* cuff hở ở đáy → chữ lệch về phía trên; vòng kiềng có đá/pavé ở đỉnh → chữ lùi xuống thân vòng */}
      {deco.engraving && (
        <BandEngraving
          text={deco.engraving}
          inner={inner}
          width={width}
          thick={thick}
          position={deco.engravingPos}
          letterMm={deco.engravingSize}
          centerAngle={
            deco.engravingPos !== 'outside'
              ? isCuff ? 0 : Math.PI
              : gem.enabled || deco.pave ? Math.PI * 0.55 : Math.PI * 0.3
          }
        />
      )}
    </group>
  );
}

const CHARM_CYCLE = ['heart', 'star', 'round'];

function ChainBracelet({ config }) {
  const mats = useMaterials();
  const { size, deco, style, gem } = config;
  const thickness = Math.min(size.width, 6);
  const curve = useMemo(() => buildCircleCurve(size.circumference), [size.circumference]);
  const r = size.circumference / (Math.PI * 2);

  const charms = useMemo(() => {
    if (style !== 'charm') return [];
    const n = deco.charmCount;
    return Array.from({ length: n }, (_, i) => {
      // rải đều, chừa khoảng trống ở khóa (θ = 0)
      const th = ((i + 1) / (n + 1)) * Math.PI * 2;
      const shape = deco.charmShape === 'mixed' ? CHARM_CYCLE[i % 3] : deco.charmShape;
      return { th, shape };
    });
  }, [style, deco.charmCount, deco.charmShape]);

  const charmSize = Math.max(8, thickness * 2.4);
  return (
    <group>
      <ChainLinks curve={curve} style="cable" thickness={thickness} material={mats.metal} />
      <Clasp curve={curve} u={0} thickness={thickness} material={mats.metal} />
      {charms.map((c, i) => (
        // charm nằm phẳng, treo ra phía ngoài lắc
        <group key={i} rotation={[0, c.th, 0]}>
          {/* xoay -90° quanh X: chiều treo (-Y) → hướng ra ngoài (+Z), mặt trước → hướng lên; nghiêng nhẹ cho tự nhiên */}
          <group position={[0, -thickness * 0.2, r + thickness * 0.15]} rotation={[-Math.PI / 2 + 0.22, 0, 0]}>
            <PendantPiece
              shape={c.shape}
              size={charmSize}
              thickness={1.3}
              gem={{ ...gem, sizeMm: 2 }}
              gemEnabled={false}
            />
          </group>
        </group>
      ))}
    </group>
  );
}

function TennisBracelet({ config }) {
  const mats = useMaterials();
  const { size, gem } = config;
  const isPearl = mats.gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);
  const r = size.circumference / (Math.PI * 2);
  const s = gem.sizeMm;

  const { items, cups, prongs, count } = useMemo(() => {
    const pitch = Math.max(metrics.width, metrics.length) * 1.12;
    const count = Math.floor((Math.PI * 2 * r) / pitch);
    const items = [];
    const cups = [];
    const prongs = [];
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2;
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      items.push({ p: [x, metrics.pavilionH * 0.7, z], n: [0, 1, 0], spin: th });
      cups.push({ x, z, th });
      // 4 chấu tròn quanh mỗi viên
      for (let k = 0; k < 4; k++) {
        const a = th + Math.PI / 4 + (k * Math.PI) / 2;
        const d = s * 0.5;
        prongs.push([x + Math.sin(a) * d, metrics.pavilionH * 0.7 + metrics.crownH * 0.25, z + Math.cos(a) * d]);
      }
    }
    return { items, cups, prongs, count };
  }, [metrics, r, s]);

  // chén đỡ đá: hình nón cụt nhỏ dưới mỗi viên + thanh nối giữa các chén
  const cupGeo = useDisposable(
    () => new THREE.CylinderGeometry(s * 0.4, s * 0.26, metrics.pavilionH * 1.05, 20),
    [s, metrics],
  );

  return (
    <group>
      <InstancedStones items={items} size={s} material={mats.gem} cut={gem.cut} isPearl={isPearl} />
      <InstancedCups cups={cups} geometry={cupGeo} y={metrics.pavilionH * 0.2} material={mats.metal} key={count} />
      <InstancedBeads points={prongs} radius={Math.max(0.28, s * 0.09)} material={mats.metal} />
      {/* thanh nối các chén thành một vòng liền */}
      <mesh position={[0, metrics.pavilionH * 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.metal}>
        <torusGeometry args={[r, Math.max(0.35, s * 0.14), 10, 200]} />
      </mesh>
    </group>
  );
}

const tmp = new THREE.Object3D();
function InstancedCups({ cups, geometry, y, material }) {
  return (
    <instancedMesh
      args={[geometry, material, cups.length]}
      dispose={null}
      ref={(mesh) => {
        if (!mesh) return;
        cups.forEach((c, i) => {
          tmp.position.set(c.x, y, c.z);
          tmp.rotation.set(0, c.th, 0);
          tmp.updateMatrix();
          mesh.setMatrixAt(i, tmp.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
      }}
    />
  );
}
