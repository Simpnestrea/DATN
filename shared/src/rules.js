// Quy tắc ràng buộc giữa các tùy chọn. Chạy sau MỌI thay đổi (client) và trước khi lưu (server)
// để đảm bảo cấu hình luôn hợp lệ, ví dụ: nhẫn trơn thì không có đá chủ, ngọc trai luôn dáng tròn...
import {
  BAIL_STYLES,
  CHARM_SHAPES,
  CUT_CODES,
  ENGRAVING_MAX,
  FINISH_CODES,
  HOLLOW_SHAPES,
  LIMITS,
  PENDANT_SHAPE_CODES,
  RING_PATTERNS,
  RING_PROFILES,
  SCHEMA_VERSION,
  SETTING_CODES,
  STYLE_CODES,
  TYPE_CODES,
} from './constants.js';
import { localLookup } from './catalog.js';
import { rawDefaults } from './defaults.js';
import { normalizeParts } from './custom.js';

/** Hình dạng mặt dây hiện tại (vòng cổ lấy từ deco, mặt dây riêng lấy từ style). */
export function getPendantShape(config) {
  if (config.type === 'pendant') return config.style;
  if (config.type === 'necklace') return config.deco?.pendantShape ?? 'none';
  return null;
}

/**
 * Trả về những gì kiểu dáng hiện tại cho phép.
 *  gem/halo/pave: 'none' | 'optional' | 'required'/'forced'
 */
export function getStyleRules(config) {
  const { type, style } = config;
  const L = LIMITS[type] ?? LIMITS.ring;
  const r = {
    gem: 'optional',
    halo: 'none',
    pave: 'none',
    hollow: false,
    engraving: false,
    charms: false,
    pendant: false,
    bail: false,
    gemSize: [...L.gemSize],
    haloLabel: 'Vòng đá halo',
  };

  if (type === 'ring') {
    r.engraving = true;
    r.pattern = style !== 'twist';
    r.profile = style !== 'twist';
    const map = {
      plain: { gem: 'none', pave: 'optional' },
      solitaire: { gem: 'required', pave: 'optional' },
      halo: { gem: 'required', halo: 'forced', pave: 'optional' },
      'three-stone': { gem: 'required', pave: 'optional', gemSize: [3, 9] },
      eternity: { gem: 'none', pave: 'forced' },
      twist: { gem: 'optional' },
    };
    Object.assign(r, map[style] ?? {});
  } else if (type === 'bracelet') {
    const map = {
      bangle: { gem: 'optional', pave: 'optional', engraving: true },
      cuff: { gem: 'optional', engraving: true, gemSize: [2, 8] },
      chain: { gem: 'none' },
      charm: { gem: 'none', charms: true },
      tennis: { gem: 'required', gemSize: [2, 5] },
    };
    Object.assign(r, map[style] ?? {});
  } else if (type === 'necklace' || type === 'pendant') {
    const shape = getPendantShape(config);
    r.pendant = true;
    if (type === 'pendant') r.bail = true;
    if (shape === 'none') {
      r.gem = 'none';
    } else if (shape === 'solitaire') {
      r.gem = 'required';
      r.halo = 'optional';
      r.gemSize = [3, type === 'pendant' ? 14 : 12];
    } else {
      r.hollow = HOLLOW_SHAPES.includes(shape);
      r.gem = r.hollow && config.deco?.hollow ? 'none' : 'optional';
      r.halo = 'optional';
      r.haloLabel = 'Đá viền quanh mặt';
      r.engraving = !(r.hollow && config.deco?.hollow); // mặt rỗng không còn chỗ khắc
      const pSize = Number(config.size?.pendantSize) || 14;
      const factor = shape === 'bar' ? 0.22 : shape === 'star' ? 0.4 : 0.55; // đá không được tràn khỏi mặt
      r.gemSize = [2, Math.max(2.5, Math.min(L.gemSize[1], Math.round(pSize * factor * 10) / 10))];
    }
  } else if (type === 'custom') {
    r.gem = 'none'; // đá là các khối riêng trong `parts`
  } else if (type === 'earrings') {
    const map = {
      stud: { gem: 'optional', halo: 'optional', gemSize: [2, 9] },
      hoop: { gem: 'none', pave: 'optional' },
      drop: { gem: 'optional', halo: 'optional' },
    };
    Object.assign(r, map[style] ?? {});
  }

  // Halo của đá chủ chỉ có nghĩa khi có đá chủ (trừ "đá viền quanh mặt" của mặt dây)
  if (r.halo === 'optional' && r.haloLabel === 'Vòng đá halo' && r.gem === 'none') r.halo = 'none';

  // Di chuyển đá chủ: 'band' = trượt quanh thân đai + lệch trước/sau; 'face' = trượt trên mặt dây; null = cố định
  r.gemMove = null;
  if (r.gem !== 'none') {
    if (type === 'ring' && style !== 'eternity') r.gemMove = 'band';
    else if (type === 'bracelet' && style === 'bangle') r.gemMove = 'band';
    else if ((type === 'pendant' || type === 'necklace') && r.pendant && getPendantShape(config) !== 'solitaire') r.gemMove = 'face';
  }

  // Khắc chữ: vị trí theo thông lệ nghề kim hoàn + giới hạn cỡ chữ (chiều cao chữ, mm) theo bề mặt
  r.engravingPositions = [];
  r.engravingSize = [0.8, 2];
  if (r.engraving) {
    const s = config.size ?? {};
    if (type === 'ring') {
      // nhẫn xoắn / eternity: mặt ngoài là sợi xoắn hoặc kín đá → chỉ khắc mặt trong
      r.engravingPositions = ['twist', 'eternity'].includes(style) ? ['inside'] : ['inside', 'outside'];
      r.engravingSize = [0.8, Math.max(1, Math.min(3.5, round1((Number(s.bandWidth) || 2) * 0.6)))];
    } else if (type === 'bracelet') {
      r.engravingPositions = ['inside', 'outside'];
      r.engravingSize = [1, Math.max(1.2, Math.min(6, round1((Number(s.width) || 4) * 0.6)))];
    } else {
      r.engravingPositions = ['back', 'front'];
      const p = Number(s.pendantSize) || 14;
      const shape = getPendantShape(config);
      r.engravingSize = [1, Math.max(1.4, round1(p * (shape === 'bar' ? 0.16 : 0.22)))];
    }
  }
  return r;
}

export const ENGRAVING_POSITIONS = [
  { code: 'inside', name: 'Mặt trong', hint: 'Vị trí truyền thống – kín đáo, chỉ người đeo biết.' },
  { code: 'outside', name: 'Mặt ngoài', hint: 'Điểm nhấn nổi bật, ai cũng nhìn thấy.' },
  { code: 'back', name: 'Mặt sau', hint: 'Lời nhắn riêng tư sát người đeo.' },
  { code: 'front', name: 'Mặt trước', hint: 'Điểm nhấn như dây chuyền khắc tên.' },
];

export const FREE_STONE_MAX = 30;
export const FREE_STONE_SIZE = [0.8, 6];

// ---- tiện ích ----
const clamp = (v, [min, max], fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const round1 = (n) => Math.round(n * 10) / 10;
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export function sanitizeEngraving(text) {
  if (typeof text !== 'string') return '';
  // bỏ ký tự điều khiển, gộp khoảng trắng, giới hạn theo số ký tự Unicode
  const cleaned = text.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ');
  return Array.from(cleaned).slice(0, ENGRAVING_MAX).join('');
}

const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Điểm neo của đá gắn tự do – lưu theo BỀ MẶT (không phải toạ độ tuyệt đối) để khi đổi kích thước
 * món đồ, viên đá vẫn bám đúng chỗ:
 *  - cyl : mặt ngoài đai (nhẫn/vòng kiềng)  { th: góc quanh trục, a: vị trí dọc trục / nửa bề rộng }
 *  - side: mặt bên đai                       { th, rr: (r − bán kính trong)/độ dày, s: ±1 phía }
 *  - face: mặt phẳng mặt dây                 { x, y: toạ độ / kích thước mặt, s: ±1 trước/sau }
 *  - free: còn lại                           { p: điểm, n: pháp tuyến } trong toạ độ mô hình (mm)
 */
function normalizeAnchor(a) {
  if (!a || typeof a !== 'object') return null;
  const sign = (v) => (Number(v) < 0 ? -1 : 1);
  switch (a.k) {
    case 'cyl':
      return { k: 'cyl', th: round4(finite(a.th) % (Math.PI * 2)), a: round4(Math.max(-1, Math.min(1, finite(a.a)))) };
    case 'side':
      return { k: 'side', th: round4(finite(a.th) % (Math.PI * 2)), rr: round4(Math.max(0, Math.min(1, finite(a.rr, 0.5)))), s: sign(a.s) };
    case 'face':
      return { k: 'face', x: round4(Math.max(-3, Math.min(3, finite(a.x)))), y: round4(Math.max(-3, Math.min(3, finite(a.y)))), s: sign(a.s) };
    case 'free': {
      if (!Array.isArray(a.p) || !Array.isArray(a.n) || a.p.length !== 3 || a.n.length !== 3) return null;
      const p = a.p.map((v) => round4(Math.max(-1000, Math.min(1000, finite(v)))));
      const len = Math.hypot(...a.n.map((v) => finite(v))) || 1;
      const n = a.n.map((v) => round4(finite(v) / len));
      return { k: 'free', p, n };
    }
    default:
      return null;
  }
}

export function normalizeFreeStones(list, lookup = localLookup) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const s of list.slice(0, FREE_STONE_MAX)) {
    if (!s || typeof s !== 'object') continue;
    const anchor = normalizeAnchor(s.anchor);
    const id = typeof s.id === 'string' && /^[a-z0-9]{1,12}$/.test(s.id) ? s.id : null;
    if (!anchor || !id || ids.has(id)) continue;
    ids.add(id);
    const stone = typeof s.stone === 'string' && s.stone && lookup.gemKind(s.stone) !== 'pearl' ? s.stone : 'diamond';
    out.push({ id, stone, sizeMm: round1(clamp(s.sizeMm, FREE_STONE_SIZE, 1.5)), anchor });
  }
  return out;
}

/**
 * Chuẩn hóa cấu hình: điền giá trị thiếu, kẹp số trong giới hạn, áp quy tắc kiểu dáng.
 * Hàm thuần (không sửa input). `lookup` cho biết loại đá (ngọc trai hay đá giác).
 */
export function normalizeConfig(input, lookup = localLookup) {
  const src = input && typeof input === 'object' ? input : {};
  const type = TYPE_CODES.includes(src.type) ? src.type : 'ring';
  const def = rawDefaults(type);

  // Chỉ giữ các khóa đã biết – khóa lạ trong dữ liệu đầu vào bị loại bỏ
  const fill = (defaults, given) => {
    const out = {};
    const g = given && typeof given === 'object' ? given : {};
    for (const k of Object.keys(defaults)) out[k] = k in g ? g[k] : defaults[k];
    return out;
  };

  const c = {
    schemaVersion: SCHEMA_VERSION,
    type,
    style: pick(src.style, STYLE_CODES[type], def.style),
    metal: fill(def.metal, src.metal),
    gem: fill(def.gem, src.gem),
    size: fill(def.size, src.size),
    deco: fill(def.deco, src.deco),
  };

  // --- kim loại ---
  c.metal.code = typeof c.metal.code === 'string' && c.metal.code ? c.metal.code : def.metal.code;
  c.metal.finish = pick(c.metal.finish, FINISH_CODES, 'polished');

  // --- mặt dây (vòng cổ) ---
  if (type === 'necklace') {
    c.deco.pendantShape = pick(c.deco.pendantShape, ['none', ...PENDANT_SHAPE_CODES], def.deco.pendantShape);
  }
  if (type === 'necklace' || type === 'pendant') {
    const shape = getPendantShape(c);
    c.deco.hollow = Boolean(c.deco.hollow) && HOLLOW_SHAPES.includes(shape);
  }

  // --- kích thước ---
  const L = LIMITS[type];
  for (const [key, range] of Object.entries(L)) {
    if (key === 'gemSize' || key === 'charmCount') continue;
    c.size[key] = round1(clamp(c.size[key], range, def.size[key]));
  }
  if (type === 'ring') {
    c.size.ringSize = Math.round(c.size.ringSize);
    c.size.profile = pick(c.size.profile, RING_PROFILES.map((p) => p.code), 'comfort');
  }

  const rules = getStyleRules(c);

  // --- đá chủ ---
  const g = c.gem;
  g.enabled = rules.gem === 'required' ? true : rules.gem === 'none' ? false : Boolean(g.enabled);
  g.stone = typeof g.stone === 'string' && g.stone ? g.stone : 'diamond';
  const isPearl = lookup.gemKind(g.stone) === 'pearl';
  if (type === 'bracelet' && c.style === 'tennis' && isPearl) g.stone = 'diamond';
  const pearl = lookup.gemKind(g.stone) === 'pearl';
  g.cut = pearl ? 'round' : pick(g.cut, CUT_CODES, 'round');
  g.setting = pearl ? 'peg' : pick(g.setting, SETTING_CODES, 'prong4');
  if (!pearl && g.setting === 'peg') g.setting = 'prong4';
  g.sizeMm = round1(clamp(g.sizeMm, rules.gemSize, rules.gemSize[0]));
  g.color = typeof g.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.color) ? g.color.toUpperCase() : null;
  // vị trí đá chủ: band → u = góc quanh thân (độ), v = lệch trước/sau (−1…1); face → u, v = lệch ngang/dọc (−1…1)
  const place = g.place && typeof g.place === 'object' ? g.place : {};
  g.place = rules.gemMove
    ? {
        u: round1(clamp(place.u, rules.gemMove === 'band' ? [-180, 180] : [-1, 1], 0)),
        v: Math.round(clamp(place.v, [-1, 1], 0) * 100) / 100,
        tilt: Math.round(clamp(place.tilt, [-35, 35], 0)),
      }
    : { u: 0, v: 0, tilt: 0 };
  if (rules.gemMove === 'face') g.place.u = Math.round(g.place.u * 100) / 100;

  // --- trang trí ---
  const d = c.deco;
  d.accentStone =
    typeof d.accentStone === 'string' && d.accentStone && lookup.gemKind(d.accentStone) !== 'pearl'
      ? d.accentStone
      : 'diamond';
  // đá phụ hai bên (nhẫn Ba viên) – chọn riêng, không dùng ngọc trai (cần ổ chấu/bao)
  if ('sideStone' in d) {
    d.sideStone =
      typeof d.sideStone === 'string' && d.sideStone && lookup.gemKind(d.sideStone) !== 'pearl'
        ? d.sideStone
        : 'diamond';
  }
  if ('halo' in d) d.halo = rules.halo === 'forced' ? true : rules.halo === 'none' ? false : Boolean(d.halo);
  // halo bao quanh đá chủ thì phải có đá chủ (khác với "đá viền quanh mặt" của mặt dây)
  if (d.halo && rules.haloLabel === 'Vòng đá halo' && !g.enabled) d.halo = false;
  if ('pave' in d) d.pave = rules.pave === 'forced' ? true : rules.pave === 'none' ? false : Boolean(d.pave);
  if ('engraving' in d) d.engraving = rules.engraving ? sanitizeEngraving(d.engraving) : '';
  if ('engravingPos' in d) {
    d.engravingPos = pick(d.engravingPos, rules.engravingPositions, rules.engravingPositions[0] ?? def.deco.engravingPos);
    d.engravingSize = round1(clamp(d.engravingSize, rules.engravingSize, rules.engravingSize[0]));
  }
  if (type === 'ring') {
    d.pattern = c.style === 'twist' ? 'none' : pick(d.pattern, RING_PATTERNS.map((p) => p.code), 'none');
  }
  if (type === 'bracelet') {
    d.charmCount = Math.round(clamp(d.charmCount, LIMITS.bracelet.charmCount, 5));
    d.charmShape = pick(d.charmShape, CHARM_SHAPES.map((s) => s.code), 'heart');
  }
  if (type === 'pendant') {
    d.bail = pick(d.bail, BAIL_STYLES.map((b) => b.code), 'simple');
    d.showChain = d.showChain !== false;
  }

  // --- đá gắn tự do ---
  // Vòng cổ không có mặt dây thì không còn bề mặt để gắn
  // (thiết kế tự tạo không dùng đá tự do – đá là các khối riêng)
  const noSurface = (type === 'necklace' && c.deco.pendantShape === 'none') || type === 'custom';
  c.freeStones = noSurface ? [] : normalizeFreeStones(src.freeStones, lookup);

  // --- khối của thiết kế tự tạo ---
  c.parts = type === 'custom' ? normalizeParts(src.parts, lookup) : [];

  // Giữ lại snapshot thuộc tính (được thêm khi lưu ở GĐ2) để thiết kế cũ vẫn hiển thị đúng
  if (src.metal?.snapshot) c.metal.snapshot = src.metal.snapshot;
  if (src.gem?.snapshot) c.gem.snapshot = src.gem.snapshot;

  return c;
}
