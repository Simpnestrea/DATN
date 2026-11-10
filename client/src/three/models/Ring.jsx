// Mô hình NHẪN. Vòng nằm trong mặt XY (trục Z xuyên qua lòng nhẫn), đá chủ ở đỉnh +Y. Đơn vị mm.
import { useMemo } from 'react';
import { ringSizeToDiameter } from '@ngk/shared';
import { bandOuterRadiusAt, buildBandGeometry, buildTwistGeometries } from '../geometry/bandGeometry.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { InstancedBeads, InstancedStones } from '../parts/InstancedStones.jsx';
import { SetGem, useGemMetrics } from '../parts/SetGem.jsx';
import { BandEngraving } from '../parts/Engraving.jsx';
import { useDisposable } from '../parts/useGeometry.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Độ cao gờ đá so với mặt ngoài đai (để chân chấu chạm đai mà đáy đá không lọt vào lòng nhẫn). */
export function headLift(metrics, setting, isPearl, thick, haloStone = 0) {
  const pav = metrics.pavilionH;
  let lift;
  if (isPearl) lift = metrics.width * 0.56;
  else if (setting === 'bezel') lift = pav * 0.5;
  else lift = pav * 0.86;
  if (haloStone) lift = Math.max(pav - thick * 0.8, haloStone * 0.9 + 0.2);
  return lift;
}

/** Danh sách vị trí đá tấm dọc thân vòng, trong khoảng góc [from, to] (rad, tính từ đỉnh). */
export function paveItems({ radius, width, from, to, full = false }) {
  const twoRows = width >= 4.5;
  const stone = twoRows ? clamp(width * 0.36, 0.9, 2.2) : clamp(width * 0.6, 0.9, 2.4);
  const rows = twoRows ? [-width / 4, width / 4] : [0];
  const r = radius - stone * 0.08;
  const step = (stone * 1.1) / r;
  const angles = [];
  if (full) {
    const count = Math.floor((Math.PI * 2 * r) / (stone * 1.08));
    for (let i = 0; i < count; i++) angles.push((i / count) * Math.PI * 2);
  } else {
    for (let a = from; a <= to; a += step) angles.push(a, -a);
  }
  const items = [];
  const beads = [];
  for (const z of rows) {
    for (const a of angles) {
      const n = [Math.sin(a), Math.cos(a), 0];
      items.push({ p: [n[0] * r, n[1] * r, z], n });
      // hai hạt chấu nhỏ hai bên mỗi viên
      const ab = a + step / 2;
      for (const side of [-1, 1]) {
        const zb = z + side * stone * 0.52;
        beads.push([Math.sin(ab) * (radius + stone * 0.02), Math.cos(ab) * (radius + stone * 0.02), zb]);
      }
    }
  }
  return { items, beads, stone };
}

export function Ring({ config }) {
  const mats = useMaterials();
  const { size, gem, deco, style } = config;
  const inner = ringSizeToDiameter(size.ringSize) / 2;
  const width = size.bandWidth;
  const thick = size.bandThickness;
  const outer = inner + thick;
  const isPearl = mats.gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);
  const isTwist = style === 'twist';

  // --- Đai ---
  const band = useDisposable(
    () =>
      isTwist
        ? buildTwistGeometries({ inner, width, thick })
        : [buildBandGeometry({ inner, width, thick, profile: size.profile })],
    [isTwist, inner, width, thick, size.profile],
  );

  // --- Đá chủ ---
  const haloStone = deco.halo ? clamp(metrics.width * 0.17, 0.9, 2.2) : 0;
  const lift = headLift(metrics, gem.setting, isPearl, thick, haloStone);
  // vị trí do người dùng chỉnh: u = góc quanh thân (độ, dương = sang phải), tilt = độ nghiêng
  const headAngle = gem.enabled ? (gem.place.u * Math.PI) / 180 : 0;
  const headTilt = gem.enabled ? (-gem.place.tilt * Math.PI) / 180 : 0;

  // Ba viên: 2 đá phụ nhỏ hơn hai bên, xoay quanh trục Z để bám theo cung đai
  const side = useMemo(() => {
    if (style !== 'three-stone') return null;
    const sideGem = { ...gem, sizeMm: Math.round(gem.sizeMm * 0.62 * 10) / 10 };
    const r = outer + metrics.pavilionH * 0.5;
    const angle = (metrics.width / 2 + sideGem.sizeMm / 2 + 0.45) / r;
    return { sideGem, angle };
  }, [style, gem, outer, metrics]);
  const sideMetrics = useGemMetrics(side?.sideGem ?? gem, false);
  const sideSetting = gem.setting === 'bezel' ? 'bezel' : 'prong4';

  // --- Đá tấm (pavé / eternity) ---
  const pave = useMemo(() => {
    if (!deco.pave) return null;
    const full = style === 'eternity';
    let head = gem.enabled ? metrics.width / 2 + (haloStone ? haloStone * 1.4 : 0) : 0;
    if (side) head = side.angle * outer + sideMetrics.width / 2;
    const from = gem.enabled ? (head + 1.2) / outer : 0.12;
    return paveItems({ radius: outer, width, from, to: 1.3, full });
  }, [deco.pave, style, gem.enabled, metrics, haloStone, side, sideMetrics, outer, width]);

  // --- Hoa văn ---
  const pattern = useMemo(() => {
    if (isTwist || deco.pattern === 'none') return null;
    if (deco.pattern === 'milgrain') {
      const br = clamp(thick * 0.12, 0.14, 0.26);
      const points = [];
      for (const s of [-1, 1]) {
        const a = s * (width / 2 - br * 1.3);
        const r = bandOuterRadiusAt(size.profile, inner, width, thick, a) + br * 0.2;
        const count = Math.floor((Math.PI * 2 * r) / (br * 2.15));
        for (let i = 0; i < count; i++) {
          const t = (i / count) * Math.PI * 2;
          points.push([Math.sin(t) * r, Math.cos(t) * r, a]);
        }
      }
      return { kind: 'milgrain', points, br };
    }
    const a = width / 2 - 0.32;
    const r = bandOuterRadiusAt(size.profile, inner, width, thick, a);
    return { kind: 'ridges', zs: [-a, a], r, tube: Math.min(0.24, width * 0.07) };
  }, [isTwist, deco.pattern, thick, width, inner, size.profile]);

  return (
    <group>
      {band.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.metal} userData={{ band: true }} dispose={null} />
      ))}

      {/* Cụm đầu nhẫn (đá chủ + đá phụ + đá tấm vai) xoay quanh thân theo vị trí người dùng chọn */}
      <group rotation={[0, 0, -headAngle]}>
        {gem.enabled && (
          // điểm tựa nằm trên mặt đai → nghiêng đá quanh chính chân ổ
          <group name="main-gem" position={[0, outer, (gem.place.v * width) / 2]} rotation={[0, 0, headTilt]}>
            <SetGem gem={gem} halo={deco.halo} position={[0, lift, 0]} />
          </group>
        )}

        {side &&
          [-1, 1].map((s) => (
            <group key={s} rotation={[0, 0, s * side.angle]}>
              <SetGem
                gem={{ ...side.sideGem, setting: sideSetting }}
                material={mats.side}
                stoneIsPearl={false}
                position={[0, outer + headLift(sideMetrics, sideSetting, false, thick), 0]}
              />
            </group>
          ))}

        {pave && (
          <>
            <InstancedStones items={pave.items} size={pave.stone} material={mats.accent} />
            <InstancedBeads points={pave.beads} radius={pave.stone * 0.13} material={mats.metal} />
          </>
        )}
      </group>

      {pattern?.kind === 'milgrain' && <InstancedBeads points={pattern.points} radius={pattern.br} material={mats.metal} />}
      {pattern?.kind === 'ridges' &&
        pattern.zs.map((z) => (
          <mesh key={z} position={[0, 0, z]} material={mats.metal}>
            <torusGeometry args={[pattern.r, pattern.tube, 10, 160]} />
          </mesh>
        ))}

      {/* mặt trong: ở đáy (nhìn xuyên lòng nhẫn). Mặt ngoài: vùng đối diện camera mặc định (chếch phải),
          lùi xa hơn khi có đầu nhẫn/đá tấm để không đè lên đá */}
      {deco.engraving && (
        <BandEngraving
          text={deco.engraving}
          inner={inner}
          width={width}
          thick={thick}
          profile={size.profile}
          position={deco.engravingPos}
          letterMm={deco.engravingSize}
          centerAngle={deco.engravingPos !== 'outside' ? Math.PI : gem.enabled || deco.pave ? Math.PI * 0.62 : Math.PI * 0.3}
        />
      )}
    </group>
  );
}
