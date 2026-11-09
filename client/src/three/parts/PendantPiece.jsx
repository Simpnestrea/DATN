// MẶT DÂY – dùng chung cho Vòng cổ và Mặt dây riêng (và charm nhỏ).
// Gốc toạ độ = tâm móc treo (nơi dây luồn qua); mặt trước hướng +Z, treo xuôi xuống -Y. Đơn vị mm.
import { useMemo } from 'react';
import { buildExtruded, outlineBounds, SHAPE_META, shapeOutline, centroid } from '../geometry/shapes.js';
import { perimeter, resampleClosed } from '../geometry/outline.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { InstancedStones } from './InstancedStones.jsx';
import { SetGem, useGemMetrics } from './SetGem.jsx';
import { FlatEngraving, engraveBandHeight } from './Engraving.jsx';
import { useDisposable } from './useGeometry.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FACE_FRONT = [Math.PI / 2, 0, 0]; // xoay đá: mặt bàn (+Y) → hướng +Z

/** Độ nhô của gờ đá so với mặt phẳng gắn. */
function gemStandoff(metrics, setting, isPearl) {
  if (isPearl) return metrics.width * 0.48;
  if (setting === 'bezel') return metrics.pavilionH * 0.45;
  return metrics.pavilionH * 0.75;
}

export function PendantPiece({
  shape,
  size,
  thickness,
  hollow = false,
  gem,
  gemEnabled,
  halo = false,
  bail = 'simple',
  engraving = '',
  engravingPos = 'back',
  engravingSize = 2,
}) {
  const mats = useMaterials();
  const isPearl = mats.gemIsPearl;
  const metrics = useGemMetrics(gem, isPearl);
  const rb = clamp(size * 0.09, 1.1, 2.4); // bán kính móc
  const tube = clamp(thickness * 0.3, 0.45, 0.9);

  if (shape === 'solitaire') {
    // Giọt đá: chỉ có viên đá + ổ + móc
    const top = metrics.length / 2 + (gem.setting === 'bezel' ? 0.6 : 0.4);
    const standoff = 0;
    return (
      <group>
        <Bail rb={rb} tube={tube} kind={bail} />
        <group position={[0, -(top + rb * 0.85), standoff]}>
          <SetGem gem={gem} halo={halo} rotation={FACE_FRONT} />
          {/* chân nối từ ổ lên móc */}
          <mesh position={[0, top - 0.2, -metrics.pavilionH * 0.2]} material={mats.metal}>
            <cylinderGeometry args={[tube * 0.7, tube * 0.7, 1.4, 12]} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <ShapedPendant
      {...{ shape, size, thickness, hollow, gem, gemEnabled, halo, bail, engraving, engravingPos, engravingSize, metrics, rb, tube, isPearl }}
    />
  );
}

/**
 * Bố cục chữ khắc trên mặt dây: thanh dọc → chữ chạy dọc; mặt trước có đá chủ → chữ đặt bên dưới đá.
 * @returns {{ length: number, y: number, vertical: boolean }}
 */
function engravingLayout({ shape, size, bounds, engravingPos, engravingSize, halo, showGem, metrics, gemCenterY }) {
  const h = engraveBandHeight(engravingSize);
  const front = engravingPos === 'front';
  const avoidGem = front && showGem;
  if (shape === 'bar') {
    const bottom = bounds.minY + size * 0.06;
    const topLimit = avoidGem ? gemCenterY - metrics.length / 2 - 0.6 : bounds.maxY - size * 0.06;
    return { vertical: true, length: Math.max(h, topLimit - bottom), y: (topLimit + bottom) / 2 };
  }
  const width = bounds.maxX - bounds.minX;
  if (avoidGem) {
    return { vertical: false, length: width * 0.5, y: gemCenterY - metrics.length / 2 - h * 0.75 };
  }
  return { vertical: false, length: width * (front && halo ? 0.6 : 0.72), y: shape === 'heart' ? size * 0.06 : 0 };
}

function ShapedPendant({
  shape, size, thickness, hollow, gem, gemEnabled, halo, bail, engraving, engravingPos, engravingSize, metrics, rb, tube, isPearl,
}) {
  const mats = useMaterials();
  const body = useDisposable(() => buildExtruded(shape, size, thickness, hollow).geometry, [shape, size, thickness, hollow]);
  const { front, bevel } = useMemo(() => {
    const b = Math.min(size * 0.04, thickness * 0.35, 0.7);
    return { front: thickness / 2 + b, bevel: b };
  }, [size, thickness]);

  const outline = useMemo(() => shapeOutline(shape, size), [shape, size]);
  const bounds = useMemo(() => outlineBounds(outline), [outline]);
  const meta = SHAPE_META[shape] ?? SHAPE_META.round;
  const top = bounds.maxY + bevel;

  // Đá viền quanh mặt (rim)
  const rim = useMemo(() => {
    if (!halo) return null;
    const c = hollow ? centroid(outline) : [0, 0];
    let k;
    let stone;
    if (hollow) {
      k = (1 + meta.hole) / 2;
      stone = clamp(size * 0.5 * (1 - meta.hole) * 0.72, 0.8, 2.4);
    } else {
      stone = clamp(size * 0.075, 0.9, 2.2);
      k = Math.max(0.5, 1 - (2 * stone * 0.85) / size);
    }
    const scaled = outline.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
    const count = Math.max(6, Math.floor(perimeter(scaled) / (stone * 1.15)));
    const pts = resampleClosed(scaled, count);
    return { items: pts.map(([x, y]) => ({ p: [x, y, front - stone * 0.1], n: [0, 0, 1] })), stone };
  }, [halo, hollow, outline, meta.hole, size, front]);

  const showGem = gemEnabled && !hollow;
  // đá chủ trượt trên mặt: u, v ∈ [−1, 1] → phạm vi sao cho đá không tràn khỏi viền
  const gemPos = useMemo(() => {
    const p = gem.place ?? {};
    const hx = Math.max(0, (bounds.maxX - bounds.minX) / 2 - metrics.width / 2 - size * 0.06);
    const hy = Math.max(0, (bounds.maxY - bounds.minY) / 2 - metrics.length / 2 - size * 0.06);
    // hx, hy, baseY được gắn vào userData để khung 3D tính ngược vị trí khi người dùng kéo đá chủ
    return { x: (p.u ?? 0) * hx, y: meta.gemY * size + (p.v ?? 0) * hy, hx, hy, baseY: meta.gemY * size };
  }, [gem.place, bounds, metrics, size, meta.gemY]);
  const gemZ = front + gemStandoff(metrics, gem.setting, isPearl) - (isPearl ? 0 : metrics.pavilionH * 0.05);

  return (
    <group>
      <Bail rb={rb} tube={tube} kind={bail} />
      <group position={[0, -(top + rb * 0.7), 0]}>
        <mesh geometry={body} material={mats.metal} userData={{ body: true }} dispose={null} />
        {showGem && (
          <group
            name="main-gem"
            userData={{ hx: gemPos.hx, hy: gemPos.hy, baseY: gemPos.baseY }}
            position={[gemPos.x, gemPos.y, gemZ]} rotation={[0, (gem.place?.tilt ?? 0) * (Math.PI / 180), 0]}>
            <SetGem gem={gem} rotation={FACE_FRONT} />
          </group>
        )}
        {rim && <InstancedStones items={rim.items} size={rim.stone} material={mats.accent} />}
        {engraving && (
          <FlatEngraving
            text={engraving}
            letterMm={engravingSize}
            side={engravingPos}
            z={engravingPos === 'front' ? front + 0.02 : -front - 0.02}
            {...engravingLayout({ shape, size, bounds, engravingPos, engravingSize, halo, showGem, metrics, gemCenterY: gemPos.y })}
          />
        )}
      </group>
    </group>
  );
}

/** Móc treo: vòng xuyến trục X (dây luồn ngang qua); kiểu "gem" đính 3 viên đá mặt trước. */
export function Bail({ rb, tube, kind = 'simple' }) {
  const mats = useMaterials();
  const stones = useMemo(() => {
    if (kind !== 'gem') return [];
    const stone = tube * 1.35;
    return [-0.5, 0, 0.5].map((d) => {
      const phi = d; // góc lệch khỏi điểm trước nhất
      const n = [0, Math.sin(phi), Math.cos(phi)];
      const r = rb + tube * 0.82;
      return { p: [0, n[1] * r, n[2] * r], n, s: stone };
    });
  }, [kind, rb, tube]);
  return (
    <group>
      <mesh rotation={[0, Math.PI / 2, 0]} material={mats.metal}>
        <torusGeometry args={[rb, tube, 14, 40]} />
      </mesh>
      {stones.length > 0 && <InstancedStones items={stones} size={tube * 1.35} material={mats.accent} />}
    </group>
  );
}
