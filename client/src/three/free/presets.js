// MẪU GẮN SẴN: sinh danh sách điểm neo cho đá tự do theo bố cục định sẵn.
// Các hàm ở đây chỉ tính toán hình học (thuần) – việc kiểm tra chồng lấn / bề mặt do FreeStonesLayer làm,
// viên nào không hợp lệ sẽ tự bị bỏ qua.

const TAU = Math.PI * 2;

/** Bộ sinh số giả ngẫu nhiên có hạt giống → cùng mẫu luôn cho cùng kết quả. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Mẫu cho ĐAI (nhẫn, vòng kiềng, cuff) ----------
// dots: hình xem trước (x, y ∈ −1…1, r = bán kính tương đối)
export const BAND_PRESETS = [
  { code: 'row', name: 'Hàng quanh thân', desc: 'Một hàng đá chạy quanh thân', dots: [-0.8, -0.4, 0, 0.4, 0.8].map((x) => [x, 0, 0.16]) },
  { code: 'double', name: 'Hai hàng', desc: 'Hai hàng so le nhau', dots: [-0.8, -0.4, 0, 0.4, 0.8].flatMap((x) => [[x, -0.3, 0.13], [x + 0.2, 0.3, 0.13]]).filter((d, i) => i < 9) },
  { code: 'edges', name: 'Viền mép', desc: 'Đá nhỏ chạy dọc hai mép đai', dots: [-0.8, -0.45, -0.1, 0.25, 0.6].flatMap((x) => [[x, -0.65, 0.1], [x, 0.65, 0.1]]) },
  { code: 'graduated', name: 'To dần', desc: 'Đá to dần về phía đá chủ', dots: [[-0.85, 0, 0.08], [-0.6, 0, 0.11], [-0.3, 0, 0.15], [0.3, 0, 0.15], [0.6, 0, 0.11], [0.85, 0, 0.08]] },
  { code: 'sides', name: 'Cặp hai bên', desc: 'Ba viên mỗi bên, nhỏ dần', dots: [[-0.25, 0, 0.17], [-0.55, 0, 0.13], [-0.8, 0, 0.1], [0.25, 0, 0.17], [0.55, 0, 0.13], [0.8, 0, 0.1]] },
  { code: 'zigzag', name: 'Zigzag', desc: 'Đá xen kẽ lên xuống', dots: [-0.8, -0.5, -0.2, 0.1, 0.4, 0.7].map((x, i) => [x, i % 2 ? 0.35 : -0.35, 0.13]) },
  { code: 'flower', name: 'Cụm hoa', desc: 'Một viên giữa và sáu cánh', dots: [[0, 0, 0.17], ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * TAU) / 6) * 0.42, Math.sin((k * TAU) / 6) * 0.42, 0.13])] },
  { code: 'scatter', name: 'Chòm sao', desc: 'Đá to nhỏ rải ngẫu nhiên', dots: [[-0.7, -0.3, 0.1], [-0.35, 0.4, 0.15], [0, -0.2, 0.08], [0.25, 0.35, 0.12], [0.6, -0.35, 0.16], [0.8, 0.3, 0.08]] },
];

/**
 * @param f { outer, hw, headAngle (rad), hasHead }
 * @returns [{ anchor: { k: 'cyl', th, a }, sizeMm }]
 */
export function generateBand(code, s, f) {
  const out = [];
  const add = (th, a, size = s) => {
    if (Math.abs(a) <= 1) out.push({ anchor: { k: 'cyl', th: wrapAngle(th), a }, sizeMm: Math.round(size * 10) / 10 });
  };
  const step = (size) => (size * 1.12) / f.outer;
  const h = f.headAngle;
  switch (code) {
    case 'row': {
      const n = Math.floor((TAU * f.outer) / (s * 1.12));
      for (let i = 0; i < n; i++) add(h + Math.PI + (i - n / 2) * (TAU / n), 0);
      break;
    }
    case 'double': {
      const a = Math.min(0.55, (s * 0.6) / f.hw);
      const n = Math.floor((TAU * f.outer) / (s * 1.15));
      for (let i = 0; i < n; i++) {
        const th = h + (i / n) * TAU;
        add(th, a);
        add(th + TAU / n / 2, -a);
      }
      break;
    }
    case 'edges': {
      const small = Math.max(0.8, s * 0.7);
      const a = Math.max(0, 1 - (small * 0.7) / f.hw);
      const n = Math.floor((TAU * f.outer) / (small * 1.15));
      for (let i = 0; i < n; i++) {
        add(h + (i / n) * TAU, a, small);
        add(h + (i / n) * TAU, -a, small);
      }
      break;
    }
    case 'graduated':
    case 'sides': {
      const sizes = code === 'sides' ? [1, 0.85, 0.7] : [1.35, 1.2, 1.05, 0.9, 0.75, 0.62];
      for (const dir of [1, -1]) {
        let th = h + dir * (f.hasHead ? f.headHalf : step(s) * 0.6);
        for (const k of sizes) {
          const size = Math.max(0.8, s * k);
          th += dir * (size * 1.12) / f.outer / 2;
          add(th, 0, size);
          th += dir * (size * 1.12) / f.outer / 2;
        }
      }
      break;
    }
    case 'zigzag': {
      const a = Math.min(0.5, (s * 0.55) / f.hw);
      const n = Math.floor((TAU * f.outer) / (s * 0.95));
      for (let i = 0; i < n; i++) add(h + Math.PI + (i - n / 2) * (TAU / n), i % 2 ? a : -a);
      break;
    }
    case 'flower': {
      // đặt ở bên phải đá chủ (hoặc ở đỉnh nếu nhẫn trơn)
      const c = f.hasHead ? h + Math.PI / 2 : h;
      // đai hẹp: ép hoa thành hình elip theo bề rộng đai, cánh nhỏ lại cho vừa
      const r = s * 1.08;
      const ra = Math.min(r, f.hw * 0.72);
      const center = Math.min(s * 1.15, f.hw * 1.3);
      const petal = Math.max(0.8, Math.min(s * 0.9, ra * 0.95));
      add(c, 0, center);
      for (let k = 0; k < 6; k++) {
        const ang = (k * TAU) / 6;
        add(c + (Math.cos(ang) * (center / 2 + petal * 0.62)) / f.outer, (Math.sin(ang) * ra) / f.hw, petal);
      }
      break;
    }
    case 'scatter': {
      const rand = rng(7);
      for (let i = 0; i < 40; i++) {
        add(h + rand() * TAU, (rand() * 2 - 1) * 0.7, s * (0.6 + rand() * 0.7));
      }
      break;
    }
    default:
  }
  return out;
}

function wrapAngle(th) {
  return Math.atan2(Math.sin(th), Math.cos(th));
}

// ---------- Mẫu cho MẶT DÂY ----------
export const FACE_PRESETS = [
  { code: 'around', name: 'Vòng quanh đá', desc: 'Vòng đá ôm quanh đá chủ', dots: Array.from({ length: 10 }, (_, k) => [Math.cos((k * TAU) / 10) * 0.6, Math.sin((k * TAU) / 10) * 0.6, 0.12]) },
  { code: 'flower', name: 'Cụm hoa', desc: 'Một viên giữa và sáu cánh', dots: [[0, 0, 0.17], ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * TAU) / 6) * 0.42, Math.sin((k * TAU) / 6) * 0.42, 0.13])] },
  { code: 'scatter', name: 'Chòm sao', desc: 'Bầu trời sao lấp lánh', dots: [[-0.6, -0.5, 0.1], [-0.3, 0.3, 0.14], [0.1, -0.1, 0.08], [0.4, 0.5, 0.12], [0.6, -0.3, 0.15], [-0.1, 0.7, 0.07]] },
  { code: 'column', name: 'Hàng dọc', desc: 'Một hàng đá từ trên xuống', dots: [-0.75, -0.4, -0.05, 0.3, 0.65].map((y) => [0, y, 0.14]) },
  { code: 'heart', name: 'Trái tim nhỏ', desc: 'Các viên xếp thành hình tim', dots: heartPoints(12).map(([x, y]) => [x * 0.75, y * 0.75, 0.1]) },
  { code: 'triangle', name: 'Tam giác', desc: 'Xếp kim tự tháp 4 tầng', dots: triangleGrid(4).map(([x, y]) => [x * 0.3, y * 0.3, 0.12]) },
  { code: 'spiral', name: 'Xoắn ốc', desc: 'Đá xoáy từ tâm ra ngoài', dots: Array.from({ length: 10 }, (_, i) => [Math.cos(i * 0.9) * i * 0.08, Math.sin(i * 0.9) * i * 0.08, 0.06 + i * 0.008]) },
];

function heartPoints(n) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x / 17, (y + 3) / 17];
  });
}

function triangleGrid(rows) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) pts.push([c - r / 2, rows / 2 - r - 0.5]);
  }
  return pts;
}

/**
 * @param f { cx, cy, w, h: khung mặt dây (mm, toạ độ cục bộ của nhóm mặt dây), gem: { x, y, r } | null, pendantSize }
 * @returns [{ anchor: { k: 'face', x, y, s: 1 }, sizeMm }]
 */
export function generateFace(code, s, f) {
  const out = [];
  const add = (x, y, size = s) =>
    out.push({ anchor: { k: 'face', x: x / f.pendantSize, y: y / f.pendantSize, s: 1 }, sizeMm: Math.round(size * 10) / 10 });
  const minSide = Math.min(f.w, f.h);
  // tâm bố cục: tránh đá chủ nếu có (đặt nửa dưới mặt)
  const free = f.gem ? { x: f.cx, y: f.gem.y - f.gem.r - minSide * 0.22 } : { x: f.cx, y: f.cy };
  switch (code) {
    case 'around': {
      const c = f.gem ?? { x: f.cx, y: f.cy, r: minSide * 0.18 };
      const r = c.r + s * 0.75;
      const n = Math.max(6, Math.floor((TAU * r) / (s * 1.15)));
      for (let i = 0; i < n; i++) add(c.x + Math.cos((i / n) * TAU) * r, c.y + Math.sin((i / n) * TAU) * r);
      break;
    }
    case 'flower': {
      const r = s * 1.08;
      add(free.x, free.y, s * 1.15);
      for (let k = 0; k < 6; k++) add(free.x + Math.cos((k * TAU) / 6) * r, free.y + Math.sin((k * TAU) / 6) * r, s * 0.9);
      break;
    }
    case 'scatter': {
      const rand = rng(11);
      for (let i = 0; i < 45; i++) {
        add(f.cx + (rand() - 0.5) * f.w * 0.85, f.cy + (rand() - 0.5) * f.h * 0.85, s * (0.55 + rand() * 0.75));
      }
      break;
    }
    case 'column': {
      const n = Math.floor((f.h * 0.85) / (s * 1.15));
      for (let i = 0; i < n; i++) add(f.cx, f.cy + f.h * 0.42 - s * 0.6 - i * s * 1.15);
      break;
    }
    case 'heart': {
      // tim ôm quanh đá chủ (điểm gần tâm nhất của đường tim cách tâm ≈ 0.47 đơn vị)
      const c = f.gem ?? { x: f.cx, y: f.cy, r: 0 };
      const scale = f.gem ? (f.gem.r + s * 0.85) / 0.47 : minSide * 0.32;
      const n = Math.max(10, Math.min(24, Math.round((scale * 5.6) / (s * 1.15))));
      for (const [x, y] of heartPoints(n)) add(c.x + x * scale, c.y + y * scale);
      break;
    }
    case 'triangle': {
      for (const [x, y] of triangleGrid(4)) add(free.x + x * s * 1.15, free.y + y * s * 1.05);
      break;
    }
    case 'spiral': {
      const c = f.gem ?? { x: f.cx, y: f.cy, r: 0 };
      for (let i = 0; i < 24; i++) {
        const r = c.r + s * 0.7 + i * s * 0.32;
        const a = i * 0.85;
        add(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, s * (0.7 + i * 0.015));
      }
      break;
    }
    default:
  }
  return out;
}
