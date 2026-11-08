// Cấu hình mặc định cho từng loại trang sức.
import { SCHEMA_VERSION, STYLE_CODES, TYPE_CODES } from './constants.js';
import { normalizeConfig } from './rules.js';

const METAL = { code: 'gold-yellow-18k', finish: 'polished' };
const GEM = { enabled: true, stone: 'diamond', cut: 'round', sizeMm: 6.5, setting: 'prong6', color: null, place: { u: 0, v: 0, tilt: 0 } };

export const TYPE_DEFAULTS = {
  ring: {
    style: 'solitaire',
    gem: { ...GEM },
    size: { ringSize: 12, bandWidth: 2.2, bandThickness: 1.7, profile: 'comfort' },
    deco: { halo: false, pave: false, pattern: 'none', engraving: '', engravingPos: 'inside', engravingSize: 1.2, accentStone: 'diamond', sideStone: 'diamond' },
  },
  bracelet: {
    style: 'bangle',
    gem: { ...GEM, sizeMm: 5, setting: 'bezel' },
    size: { circumference: 175, width: 4, thickness: 2.2 },
    deco: { pave: false, charmCount: 5, charmShape: 'heart', engraving: '', engravingPos: 'inside', engravingSize: 2, accentStone: 'diamond' },
  },
  necklace: {
    style: 'cable',
    gem: { ...GEM, cut: 'pear', sizeMm: 6, setting: 'prong4' },
    size: { length: 450, chainThickness: 1.4, pendantSize: 14 },
    deco: { pendantShape: 'solitaire', halo: false, hollow: false, engraving: '', engravingPos: 'back', engravingSize: 2, accentStone: 'diamond' },
  },
  earrings: {
    style: 'stud',
    gem: { ...GEM, sizeMm: 5, setting: 'prong4' },
    size: { hoopDiameter: 18, dropLength: 28, thickness: 1.6 },
    deco: { halo: false, pave: false, accentStone: 'diamond' },
  },
  pendant: {
    style: 'heart',
    gem: { ...GEM, sizeMm: 5, setting: 'bezel' },
    size: { pendantSize: 16, thickness: 1.8 },
    deco: { halo: false, hollow: false, bail: 'simple', engraving: '', engravingPos: 'back', engravingSize: 2.2, showChain: true, accentStone: 'diamond' },
  },
  // Thiết kế tự tạo: mọi thứ nằm trong danh sách khối parts; gem/size/deco chỉ để giữ cấu trúc chung
  custom: {
    style: 'free',
    gem: { ...GEM, enabled: false },
    size: {},
    deco: {},
  },
};

/** Cấu hình "thô" (chưa chuẩn hóa) – dùng nội bộ để điền giá trị còn thiếu. */
export function rawDefaults(type) {
  const t = TYPE_CODES.includes(type) ? type : 'ring';
  const d = TYPE_DEFAULTS[t];
  return {
    schemaVersion: SCHEMA_VERSION,
    type: t,
    style: d.style,
    metal: { ...METAL },
    gem: { ...d.gem },
    size: { ...d.size },
    deco: { ...d.deco },
    freeStones: [],
    parts: [],
  };
}

/** Tạo cấu hình mặc định hợp lệ cho một loại (và kiểu dáng nếu có). */
export function createDefaultConfig(type, style) {
  const c = rawDefaults(type);
  if (style && STYLE_CODES[c.type].includes(style)) c.style = style;
  return normalizeConfig(c);
}

/**
 * Ghép phần ghi đè (ví dụ từ mẫu gợi ý) lên cấu hình mặc định.
 * Chỉ ghép 1 cấp cho các nhóm metal/gem/size/deco.
 */
export function mergeConfig(base, override = {}) {
  const out = { ...base, ...override };
  for (const k of ['metal', 'gem', 'size', 'deco']) {
    out[k] = { ...(base[k] ?? {}), ...(override[k] ?? {}) };
  }
  return out;
}

export function buildConfigFromTemplate(template) {
  const base = rawDefaults(template.type);
  return normalizeConfig(mergeConfig(base, { ...template.config, type: base.type }));
}
