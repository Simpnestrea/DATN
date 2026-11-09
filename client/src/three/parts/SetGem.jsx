// Viên đá chủ + ổ gắn (+ halo nếu có), trong toạ độ cục bộ: gờ đá ở y = 0, mặt bàn hướng +Y.
import { useMemo } from 'react';
import * as THREE from 'three';
import { getGemMetrics, getUnitGemGeometry } from '../geometry/gemGeometry.js';
import { buildSetting } from '../geometry/settingGeometry.js';
import { offsetPolygon, perimeter, resampleClosed } from '../geometry/outline.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { InstancedStones } from './InstancedStones.jsx';
import { useDisposable } from './useGeometry.js';

export function useGemMetrics(gem, isPearl) {
  return useMemo(() => getGemMetrics(gem.cut, gem.sizeMm, isPearl), [gem.cut, gem.sizeMm, isPearl]);
}

/**
 * @param gem      { cut, sizeMm, setting }
 * @param halo     có vòng đá halo quanh đá chủ
 * @param material vật liệu đá (mặc định: đá chủ)
 */
export function SetGem({ gem, halo = false, material, stoneIsPearl, ...groupProps }) {
  const mats = useMaterials();
  const isPearl = stoneIsPearl ?? mats.gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);
  const setting = isPearl ? 'peg' : gem.setting;
  const settingGeo = useDisposable(() => buildSetting(setting, metrics), [setting, metrics]);
  const unit = getUnitGemGeometry(gem.cut, isPearl);
  // ngọc trai: tâm cầu nằm ở y = 0 (không có gờ)
  const gemY = 0;

  return (
    <group {...groupProps}>
      <mesh geometry={unit} material={material ?? mats.gem} scale={gem.sizeMm} position={[0, gemY, 0]} dispose={null} />
      <mesh geometry={settingGeo} material={mats.metal} dispose={null} />
      {halo && <Halo metrics={metrics} />}
    </group>
  );
}

/** Vòng đá tấm bao quanh đá chủ + khung kim loại đỡ bên dưới. */
export function Halo({ metrics }) {
  const mats = useMaterials();
  const stone = Math.min(2.2, Math.max(0.9, metrics.width * 0.17));
  const gap = Math.max(0.25, metrics.width * 0.04);

  const { items, rail } = useMemo(() => {
    const ring = offsetPolygon(metrics.outline, gap + stone / 2);
    const count = Math.max(8, Math.floor(perimeter(ring) / (stone * 1.1)));
    const pts = resampleClosed(ring, count);
    const items = pts.map(([x, z]) => ({ p: [x, -stone * 0.12, z], n: [0, 1, 0] }));
    const railCurve = new THREE.CatmullRomCurve3(
      ring.map(([x, z]) => new THREE.Vector3(x, -stone * 0.5, z)),
      true,
    );
    const rail = new THREE.TubeGeometry(railCurve, Math.max(48, count * 3), stone * 0.48, 10, true);
    return { items, rail };
  }, [metrics, stone, gap]);
  const railGeo = useDisposable(() => rail, [rail]);

  return (
    <group>
      <InstancedStones items={items} size={stone} material={mats.accent} />
      <mesh geometry={railGeo} material={mats.metal} dispose={null} />
    </group>
  );
}
