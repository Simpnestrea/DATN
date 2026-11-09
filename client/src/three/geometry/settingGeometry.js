// Hình học ổ gắn đá: chấu (prong), ổ bao (bezel), chốt ngọc trai (peg).
// Toạ độ cục bộ của viên đá: gờ ở y = 0, mặt bàn hướng +Y, đơn vị mm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { offsetPolygon, rayDistance } from './outline.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function prongRadius(sizeMm) {
  return clamp(sizeMm * 0.055, 0.26, 0.65);
}

function prongAngles(count, aspect) {
  if (count === 4) {
    const a = Math.atan2(aspect * 0.5, 0.5); // hướng về các góc
    return [a, Math.PI - a, Math.PI + a, -a];
  }
  return Array.from({ length: count }, (_, i) => Math.PI / 2 + (i * Math.PI * 2) / count);
}

/** Chấu: các ống cong ôm vành đá + giỏ đỡ bên dưới, gộp thành 1 geometry. */
export function buildProngs(metrics, count) {
  const { outline, crownH, pavilionH, width, length } = metrics;
  const r = prongRadius(width);
  const aspect = length / width;
  const parts = [];

  for (const ang of prongAngles(count, aspect)) {
    const dist = rayDistance(outline, ang);
    const gx = Math.cos(ang) * dist;
    const gz = Math.sin(ang) * dist;
    const at = (k, y) => new THREE.Vector3(gx * k, y, gz * k);
    const curve = new THREE.CatmullRomCurve3([
      at(0.42, -pavilionH * 0.92),
      at(0.86, -pavilionH * 0.42),
      at(1.04 + r / dist, 0),
      at(0.9, crownH * 0.5),
    ]);
    parts.push(new THREE.TubeGeometry(curve, 20, r, 8, false));
    const tip = new THREE.SphereGeometry(r * 1.2, 12, 10);
    const p = at(0.9, crownH * 0.5);
    tip.translate(p.x, p.y, p.z);
    parts.push(tip);
  }

  // giỏ đỡ: vòng kim loại theo dáng đá nằm dưới gờ
  const basketPts = outline.map(([x, z]) => new THREE.Vector3(x * 0.7, -pavilionH * 0.5, z * 0.7));
  const basket = new THREE.CatmullRomCurve3(basketPts, true);
  parts.push(new THREE.TubeGeometry(basket, Math.max(24, outline.length * 3), r * 0.85, 8, true));

  const merged = mergeGeometries(parts.map(toNonIndexed));
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Ổ bao: thành kim loại bao quanh vành đá. */
export function buildBezel(metrics) {
  const { outline, crownH, pavilionH, width } = metrics;
  const wall = clamp(width * 0.08, 0.35, 0.8);
  const outer = offsetPolygon(outline, wall);
  const inner = offsetPolygon(outline, -width * 0.04);
  // Shape nằm trong mặt (x, -z) để sau khi xoay -90° quanh X thì trùng mặt x–z
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))));
  const bottom = -pavilionH * 0.55;
  const top = crownH * 0.35;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: top - bottom,
    bevelEnabled: true,
    bevelThickness: wall * 0.3,
    bevelSize: wall * 0.25,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bottom, 0);
  return geo;
}

/** Chốt + đế chén cho ngọc trai. */
export function buildPeg(sizeMm) {
  const cup = new THREE.CylinderGeometry(sizeMm * 0.2, sizeMm * 0.14, sizeMm * 0.1, 24);
  cup.translate(0, -sizeMm * 0.46, 0);
  const merged = mergeGeometries([toNonIndexed(cup)]);
  cup.dispose();
  return merged;
}

export function buildSetting(setting, metrics) {
  if (setting === 'bezel') return buildBezel(metrics);
  if (setting === 'peg') return buildPeg(metrics.width);
  return buildProngs(metrics, setting === 'prong6' ? 6 : 4);
}

function toNonIndexed(g) {
  // mergeGeometries yêu cầu tất cả cùng indexed hoặc cùng non-indexed và cùng thuộc tính
  const ni = g.index ? g.toNonIndexed() : g;
  if (ni !== g) g.dispose();
  for (const name of Object.keys(ni.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) ni.deleteAttribute(name);
  }
  return ni;
}
