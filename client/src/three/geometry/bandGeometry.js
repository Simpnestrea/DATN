// Đai nhẫn / vòng kiềng: xoay một tiết diện (profile) quanh trục bằng LatheGeometry.
// Kết quả: vòng nằm trong mặt phẳng XY, trục vòng là trục Z, đỉnh vòng ở +Y. Đơn vị mm.
import * as THREE from 'three';

const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

/**
 * Tiết diện đai (r = bán kính, a = vị trí dọc trục), khép kín.
 * @param inner bán kính trong   @param width bề rộng   @param thick độ dày
 */
function profilePoints(profile, inner, width, thick) {
  const hw = width / 2;
  const rc = inner + thick / 2;
  const pts = [];
  if (profile === 'knife') {
    // sống dao: mặt trong bo nhẹ, mặt ngoài nhọn ở giữa
    const e = Math.min(0.25, thick * 0.15);
    const raw = [
      [inner + e, -hw],
      [inner + thick * 0.45, -hw],
      [inner + thick, 0],
      [inner + thick * 0.45, hw],
      [inner + e, hw],
      [inner, hw - e],
      [inner, -hw + e],
    ];
    // nhân đôi đỉnh góc để có cạnh sắc (pháp tuyến không bị làm mượt)
    for (const p of raw) pts.push(p, p);
    pts.push(raw[0]);
    return pts.map(([r, a]) => new THREE.Vector2(r, a));
  }
  const n = profile === 'flat' ? 7 : 2.6; // số mũ siêu elip: lớn → vuông vức hơn
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const phi = (i / steps) * Math.PI * 2;
    const r = rc + (thick / 2) * sgnPow(Math.cos(phi), 2 / n);
    const a = hw * sgnPow(Math.sin(phi), 2 / n);
    pts.push(new THREE.Vector2(r, a));
  }
  return pts;
}

/**
 * @param opts.gapAngle  góc hở (radian) ở đáy vòng – dùng cho vòng cuff, 0 = vòng kín
 */
export function buildBandGeometry({ inner, width, thick, profile = 'comfort', segments = 160, gapAngle = 0 }) {
  const pts = profilePoints(profile, inner, width, thick);
  const phiStart = gapAngle / 2;
  const phiLength = Math.PI * 2 - gapAngle;
  const geo = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  // Lathe quay quanh Y với phi = 0 ở +Z; xoay +90° quanh X → trục vòng thành Z, phi = 0 ở đáy (-Y)
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Đường tâm của sợi xoắn cho nhẫn xoắn. */
class TwistCurve extends THREE.Curve {
  constructor(rc, ampR, ampA, twists, phase) {
    super();
    Object.assign(this, { rc, ampR, ampA, twists, phase });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const th = t * Math.PI * 2;
    const k = this.twists * th + this.phase;
    const r = this.rc + this.ampR * Math.cos(k);
    return target.set(Math.sin(th) * r, Math.cos(th) * r, this.ampA * Math.sin(k));
  }
}

export function buildTwistGeometries({ inner, width, thick, twists = 7 }) {
  const strand = Math.min(thick, width) * 0.36;
  const rc = inner + thick / 2;
  const ampR = Math.max(0.05, thick / 2 - strand) + thick * 0.12;
  const ampA = Math.max(0.1, width / 2 - strand);
  return [0, Math.PI].map(
    (phase) => new THREE.TubeGeometry(new TwistCurve(rc, ampR, ampA, twists, phase), 480, strand, 14, true),
  );
}

/** Bán kính mặt ngoài của đai tại vị trí dọc trục `a` (dùng để đặt hạt milgrain, gờ...). */
export function bandOuterRadiusAt(profile, inner, width, thick, a) {
  const hw = width / 2;
  const u = Math.min(1, Math.abs(a) / hw);
  if (profile === 'knife') return inner + thick - thick * 0.55 * u;
  const n = profile === 'flat' ? 7 : 2.6;
  return inner + thick / 2 + (thick / 2) * (1 - u ** n) ** (1 / n);
}
