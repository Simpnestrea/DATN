// THIẾT KẾ TỰ TẠO (type = 'custom'): món trang sức ghép từ các KHỐI (part) tự do.
// Mỗi khối: loại khối + tham số kích thước (mm) + vị trí/xoay/co giãn + vật liệu riêng + nhóm.
// File này là "nguồn sự thật" về các loại khối – client dùng để dựng hình & giao diện, server dùng để kiểm tra dữ liệu.
import { CUT_CODES } from './constants.js';
import { localLookup } from './catalog.js';

export const MAX_PARTS = 80;

const r3 = (n) => Math.round(n * 1000) / 1000;
const num = (label, min, max, def, step = 0.1, unit = 'mm') => ({ type: 'number', label, min, max, def, step, unit });
const pick = (label, options, def) => ({ type: 'select', label, options, def });
const flag = (label, def = false) => ({ type: 'bool', label, def });

// HÌNH VẼ 2D (khối "sketch"): các đường viền khép kín [[x, y], ...] (mm, mặt phẳng XY của khối).
// Đường viền nằm trong một đường viền khác → thành LỖ (như chữ O); nằm trong lỗ → lại là khối đặc.
export const SKETCH_LIMITS = { paths: 60, points: 1500, total: 8000, extent: 200 };
// chữ thành khối: mỗi chữ có thể 3–5 đường viền (thân, lỗ, dấu) → cần nhiều đường viền hơn hình vẽ tay
export const TEXT_LIMITS = { paths: 220, points: 1500, total: 14000, extent: 200, chars: 40 };
export const TEXT_FONTS = [
  { code: 'sans', name: 'Không chân' },
  { code: 'serif', name: 'Có chân' },
  { code: 'script', name: 'Viết tay' },
];
const circlePath = (r, n = 48) =>
  Array.from({ length: n }, (_, i) => [Math.round(Math.cos((i / n) * Math.PI * 2) * r * 1000) / 1000, Math.round(Math.sin((i / n) * Math.PI * 2) * r * 1000) / 1000]);
const sketch = (label, limits = SKETCH_LIMITS) => ({ type: 'sketch', label, def: [circlePath(5)], limits });
// SỢI KIM LOẠI (khối "wire"): đường cong 3D qua các điểm điều khiển (toạ độ cục bộ của khối, mm)
export const WIRE_LIMITS = { points: 200, track: 2500, extent: 500 };
const pts3 = (label, def, max, min) => ({ type: 'points3', label, def, max, min });

/** Chuẩn hoá danh sách điểm 3D: bỏ điểm hỏng / trùng liền kề; ít hơn `min` điểm → mặc định. */
export function normalizePoints3(src, max, min, def) {
  const out = [];
  for (const pt of Array.isArray(src) ? src.slice(0, max * 2) : []) {
    if (out.length >= max) break;
    if (!Array.isArray(pt)) continue;
    const v = [0, 1, 2].map((i) => Number(pt[i]));
    if (!v.every(Number.isFinite)) continue;
    const q = v.map((x) => r3(Math.min(WIRE_LIMITS.extent, Math.max(-WIRE_LIMITS.extent, x))));
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - q[0], last[1] - q[1], last[2] - q[2]) < 1e-3) continue;
    out.push(q);
  }
  return out.length >= min ? out : def.map((q) => [...q]);
}

const str = (label, max, def) => ({ type: 'string', label, max, def });

/** Chuỗi chữ khắc/đùn: chuẩn hoá Unicode dựng sẵn (NFC – "ệ" gõ kiểu tổ hợp vẫn đúng), bỏ ký tự điều khiển, một dòng. */
export function normalizeText(v, max = TEXT_LIMITS.chars, def = '') {
  if (typeof v !== 'string') return def;
  const t = v.normalize('NFC').replace(/\s+/g, ' ').replace(/[\p{C}]/gu, '').trim();
  return [...t].slice(0, max).join('');
}

/** Chuẩn hoá danh sách đường viền: bỏ điểm hỏng/trùng, giới hạn số lượng; rỗng → hình tròn mặc định. */
export function normalizeSketchPaths(src, limits = SKETCH_LIMITS) {
  const { paths: maxPaths, points: maxPts, total: maxTotal, extent } = limits;
  const out = [];
  let total = 0;
  for (const path of Array.isArray(src) ? src.slice(0, maxPaths * 2) : []) {
    if (out.length >= maxPaths || total >= maxTotal) break;
    if (!Array.isArray(path)) continue;
    const pts = [];
    for (const pt of path.slice(0, maxPts)) {
      if (!Array.isArray(pt)) continue;
      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const q = [r3(Math.min(extent, Math.max(-extent, x))), r3(Math.min(extent, Math.max(-extent, y)))];
      const last = pts[pts.length - 1];
      if (last && Math.abs(last[0] - q[0]) < 1e-3 && Math.abs(last[1] - q[1]) < 1e-3) continue;
      pts.push(q);
    }
    if (pts.length > 2 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-3 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-3) pts.pop();
    if (pts.length < 3 || total + pts.length > maxTotal) continue;
    // diện tích quá nhỏ (nét chấm / đường thẳng) → bỏ
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) / 2 < 0.01) continue;
    out.push(pts);
    total += pts.length;
  }
  return out.length ? out : sketch().def;
}

const PLATE = {
  size: num('Kích thước', 2, 60, 12),
  depth: num('Độ dày', 0.4, 10, 1.5),
  hollow: flag('Rỗng (chỉ còn viền)'),
};

/**
 * Danh mục loại khối. `category` dùng để nhóm trên bảng "Thêm khối".
 * Tham số `type: number` có min/max/def (đơn vị mm trừ khi ghi khác).
 */
export const PART_KINDS = [
  { code: 'sphere', name: 'Cầu', category: 'basic', params: { r: num('Bán kính', 0.2, 40, 3) } },
  {
    code: 'box',
    name: 'Hộp',
    category: 'basic',
    params: { x: num('Rộng', 0.2, 80, 6), y: num('Cao', 0.2, 80, 6), z: num('Sâu', 0.2, 80, 6), round: num('Bo góc', 0, 10, 0.4) },
  },
  { code: 'cylinder', name: 'Trụ', category: 'basic', params: { r: num('Bán kính', 0.2, 40, 3), h: num('Chiều cao', 0.2, 80, 6) } },
  { code: 'cone', name: 'Nón', category: 'basic', params: { r: num('Bán kính đáy', 0.2, 40, 3), h: num('Chiều cao', 0.2, 80, 6) } },
  { code: 'capsule', name: 'Viên nhộng', category: 'basic', params: { r: num('Bán kính', 0.2, 30, 2), h: num('Chiều dài thân', 0, 80, 6) } },
  {
    code: 'torus',
    name: 'Vòng xuyến',
    category: 'basic',
    params: { R: num('Bán kính vòng', 0.5, 80, 8), r: num('Độ dày sợi', 0.1, 15, 1.2), arc: num('Độ dài cung', 10, 360, 360, 1, '°') },
  },
  {
    code: 'band',
    name: 'Đai tròn',
    category: 'jewelry',
    params: {
      innerD: num('Đường kính trong', 6, 90, 16.6),
      width: num('Bề rộng', 0.5, 30, 2.5),
      thick: num('Độ dày', 0.5, 8, 1.6),
      profile: pick('Tiết diện', [{ code: 'comfort', name: 'Bo tròn' }, { code: 'flat', name: 'Phẳng' }, { code: 'knife', name: 'Sống dao' }], 'comfort'),
    },
  },
  { code: 'disc', name: 'Đĩa tròn', category: 'jewelry', params: PLATE },
  { code: 'heart', name: 'Trái tim', category: 'jewelry', params: PLATE },
  { code: 'star', name: 'Ngôi sao', category: 'jewelry', params: PLATE },
  { code: 'teardrop', name: 'Giọt nước', category: 'jewelry', params: PLATE },
  { code: 'bar', name: 'Thanh', category: 'jewelry', params: { size: num('Chiều dài', 2, 80, 16), depth: num('Độ dày', 0.4, 10, 1.5) } },
  {
    code: 'sketch',
    name: 'Hình vẽ',
    category: 'draw',
    params: { paths: sketch('Hình vẽ 2D'), depth: num('Độ dày', 0.3, 30, 1.5), bevel: num('Bo cạnh', 0, 3, 0.3, 0.05) },
  },
  {
    code: 'wire',
    name: 'Sợi kim loại',
    category: 'draw',
    params: {
      points: pts3('Điểm điều khiển', [[-6, 0, 0], [0, 4, 0], [6, 0, 0]], WIRE_LIMITS.points, 2),
      d: num('Độ dày sợi (đường kính)', 0.2, 8, 1),
      profile: pick('Tiết diện', [{ code: 'round', name: 'Tròn' }, { code: 'square', name: 'Vuông' }], 'round'),
      closed: flag('Khép thành vòng'),
      hug: flag('Bám sát bề mặt'),
      // đường tâm sợi đã ôm theo bề mặt các khối bên dưới (do trình duyệt tính khi bật "Bám sát bề mặt"); rỗng = sợi
      // cong tự do qua các điểm điều khiển. Lưu sẵn để mọi nơi dựng được sợi mà không cần các khối xung quanh.
      track: pts3('Đường bám bề mặt', [], WIRE_LIMITS.track, 0),
    },
  },
  {
    code: 'text',
    name: 'Chữ',
    category: 'draw',
    params: {
      text: str('Nội dung', TEXT_LIMITS.chars, 'NGK'),
      font: pick('Kiểu chữ', TEXT_FONTS, 'script'),
      size: num('Cỡ chữ (chiều cao chữ hoa)', 2, 40, 8),
      spacing: num('Khoảng cách chữ', -3, 10, 0, 0.05),
      depth: num('Độ dày', 0.3, 20, 1.2),
      bevel: num('Bo cạnh', 0, 2, 0.15, 0.05),
      // đường viền các chữ (mm) – do trình duyệt dựng từ font khi đổi chữ/kiểu/cỡ; lưu sẵn để mọi nơi (Web Worker,
      // máy chủ, trang xem) dựng được khối mà không cần nạp font
      paths: sketch('Đường viền chữ', TEXT_LIMITS),
    },
  },
  {
    code: 'gem',
    name: 'Viên đá',
    category: 'gem',
    params: {
      size: num('Kích thước', 0.8, 25, 5),
      cut: pick(
        'Giác cắt',
        CUT_CODES.map((c) => ({ code: c, name: { round: 'Tròn', oval: 'Oval', princess: 'Công chúa', emerald: 'Emerald', pear: 'Giọt nước', heart: 'Trái tim' }[c] })),
        'round',
      ),
      setting: pick('Ổ gắn', [{ code: 'none', name: 'Không' }, { code: 'prong4', name: '4 chấu' }, { code: 'prong6', name: '6 chấu' }, { code: 'bezel', name: 'Ổ bao' }], 'prong4'),
    },
  },
];

export const PART_KIND_MAP = new Map(PART_KINDS.map((k) => [k.code, k]));

const clampNum = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const vec = (v, def, min, max) =>
  [0, 1, 2].map((i) => r3(clampNum(Array.isArray(v) ? v[i] : undefined, min, max, def[i])));

export function defaultParams(kind) {
  const meta = PART_KIND_MAP.get(kind);
  return Object.fromEntries(Object.entries(meta?.params ?? {}).map(([k, p]) => [k, p.type === 'sketch' || p.type === 'points3' ? p.def.map((pts) => [...pts].map((q) => (Array.isArray(q) ? [...q] : q))) : p.def]));
}

function normalizeParams(kind, params) {
  const meta = PART_KIND_MAP.get(kind);
  const src = params && typeof params === 'object' ? params : {};
  const out = {};
  for (const [k, p] of Object.entries(meta.params)) {
    if (p.type === 'number') out[k] = r3(clampNum(src[k], p.min, p.max, p.def));
    else if (p.type === 'sketch') out[k] = normalizeSketchPaths(src[k], p.limits);
    else if (p.type === 'points3') out[k] = normalizePoints3(src[k], p.max, p.min, p.def);
    else if (p.type === 'string') out[k] = normalizeText(src[k], p.max, p.def) || p.def;
    else if (p.type === 'select') out[k] = p.options.some((o) => o.code === src[k]) ? src[k] : p.def;
    else out[k] = typeof src[k] === 'boolean' ? src[k] : p.def;
  }
  return out;
}

const ID_RE = /^[a-z0-9]{1,12}$/;

export const MAX_CARVES = 150;
// Cọ GỌT: xoá vật liệu từ phía người nhìn vào (hướng nhìn lúc bấm), sâu d tính từ bề mặt – như tẩy bớt / gọt lại hình.
const CARVE_CODES = ['erase', 'drill', 'square', 'scoop'];
export const CARVE_SHAPES = [
  { code: 'erase', name: 'Gọt tròn' },
  { code: 'drill', name: 'Đục thẳng' },
  { code: 'square', name: 'Gọt vuông' },
];

/**
 * TẠO HÌNH trực tiếp trên khối (lưu trong toạ độ CỤC BỘ của khối, chưa tính co giãn):
 *  - carves: các vết gọt { s: 'erase'|'drill'|'square' ('scoop' = dữ liệu cũ), p: điểm trên bề mặt,
 *    n: hướng về phía người nhìn lúc bấm (dữ liệu cũ: pháp tuyến bề mặt), r: bán kính, d: độ sâu }
 *  - shell : độ dày thành khi làm rỗng (0 = đặc)
 *  - slice : cắt phẳng { axis: 'x'|'y'|'z', side: 1 (bỏ phía +) | -1 (bỏ phía −), at: vị trí 0…1 theo hộp bao }
 */
function normalizeShape(shape) {
  const src = shape && typeof shape === 'object' ? shape : {};
  const carves = [];
  for (const c of Array.isArray(src.carves) ? src.carves.slice(0, MAX_CARVES * 2) : []) {
    if (carves.length >= MAX_CARVES) break; // lọc vết hỏng trước, rồi mới giới hạn số lượng
    if (!c || !CARVE_CODES.includes(c.s) || !Array.isArray(c.p) || !Array.isArray(c.n)) continue;
    const p = vec(c.p, [0, 0, 0], -500, 500);
    const nRaw = vec(c.n, [0, 1, 0], -1, 1);
    const len = Math.hypot(...nRaw) || 1;
    // u = 1: toạ độ & kích thước theo TỈ LỆ hộp bao khối (co giãn theo khi đổi size khối); không có u: mm tuyệt đối (dữ liệu cũ)
    const rel = c.u === 1;
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    carves.push({
      s: c.s,
      ...(rel ? { u: 1 } : {}),
      p: rel ? vec(c.p, [0, 0, 0], -5, 5).map(r5) : p,
      n: nRaw.map((v) => r3(v / len)),
      r: rel ? r5(clampNum(c.r, 0.0005, 10, 0.1)) : r3(clampNum(c.r, 0.1, 40, 1)),
      d: rel ? r5(clampNum(c.d, 0.0005, 20, 0.1)) : r3(clampNum(c.d, 0.1, 80, 1)),
    });
  }
  const shell = r3(clampNum(src.shell, 0, 20, 0));
  let slice = null;
  if (src.slice && typeof src.slice === 'object' && ['x', 'y', 'z'].includes(src.slice.axis)) {
    slice = { axis: src.slice.axis, side: src.slice.side === -1 ? -1 : 1, at: r3(clampNum(src.slice.at, 0, 1, 0.5)) };
  }
  return { carves, shell, slice };
}

/** Khối có đang được tạo hình không (để biết có cần chạy CSG). */
export const isShaped = (p) => !!p.shape && (p.shape.carves.length > 0 || p.shape.shell > 0 || !!p.shape.slice);

/** Kiểm tra + chuẩn hóa danh sách khối (dữ liệu từ người dùng/localStorage/API). */
export function normalizeParts(list, lookup = localLookup) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const p of list.slice(0, MAX_PARTS)) {
    if (!p || typeof p !== 'object' || !PART_KIND_MAP.has(p.kind)) continue;
    const id = typeof p.id === 'string' && ID_RE.test(p.id) && !ids.has(p.id) ? p.id : null;
    if (!id) continue;
    ids.add(id);
    const meta = PART_KIND_MAP.get(p.kind);
    const m = p.mat && typeof p.mat === 'object' ? p.mat : {};
    const stone = typeof m.stone === 'string' && m.stone && lookup.gemKind(m.stone) !== 'pearl' ? m.stone : 'diamond';
    out.push({
      id,
      kind: p.kind,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.replace(/[\p{C}]/gu, '').slice(0, 40) : meta.name,
      params: normalizeParams(p.kind, p.params),
      pos: vec(p.pos, [0, 0, 0], -500, 500),
      rot: vec(p.rot, [0, 0, 0], -360, 360),
      scale: vec(p.scale, [1, 1, 1], 0.02, 50),
      mat: {
        metal: typeof m.metal === 'string' && m.metal ? m.metal : 'gold-yellow-18k',
        finish: ['polished', 'brushed', 'matte'].includes(m.finish) ? m.finish : 'polished',
        stone,
      },
      group: typeof p.group === 'string' && ID_RE.test(p.group) ? p.group : null,
      // Tính năng "khối khoét" kiểu Tinkercad đã bỏ. Dữ liệu cũ có khối khoét → chuyển thành khối ẨN
      // (để không bất ngờ hiện ra như khối kim loại đặc); người dùng có thể hiện lại hoặc xoá trong tab Lớp.
      hidden: p.hidden === true || p.hole === true,
      locked: p.locked === true,
      shape: normalizeShape(p.shape),
    });
  }
  return out;
}

export const newPartId = () => Math.random().toString(36).slice(2, 10);

/** Tạo khối mới với tham số mặc định. */
export function createPart(kind, overrides = {}) {
  const meta = PART_KIND_MAP.get(kind);
  return {
    id: newPartId(),
    kind,
    name: meta?.name ?? kind,
    params: defaultParams(kind),
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    scale: [1, 1, 1],
    mat: { metal: 'gold-yellow-18k', finish: 'polished', stone: 'diamond' },
    group: null,
    hidden: false,
    locked: false,
    shape: { carves: [], shell: 0, slice: null },
    ...overrides,
  };
}
