// Schema (Zod) kiểm tra cấu trúc cấu hình thiết kế + chuyển đổi phiên bản schema.
// Thứ tự xử lý dữ liệu lạ (từ localStorage, API...):  migrate → kiểm tra kiểu (Zod) → normalize (quy tắc).
import { z } from 'zod';
import {
  CUT_CODES,
  FINISH_CODES,
  SCHEMA_VERSION,
  SETTING_CODES,
  STYLE_CODES,
  TYPE_CODES,
} from './constants.js';
import { normalizeConfig } from './rules.js';
import { localLookup } from './catalog.js';

const code = z.string().trim().min(1).max(60);
const num = z.number().finite();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const metalSnapshot = z.object({ name: z.string().max(80), color: hex, metalness: num, roughness: num }).partial();
const gemSnapshot = z.object({ name: z.string().max(80), color: hex, ior: num, kind: z.enum(['faceted', 'pearl']) }).partial();

const metalSchema = z.object({
  code,
  finish: z.enum(FINISH_CODES),
  snapshot: metalSnapshot.optional(),
});

const gemSchema = z.object({
  enabled: z.boolean(),
  stone: code,
  cut: z.enum(CUT_CODES),
  sizeMm: num,
  setting: z.enum(SETTING_CODES),
  color: hex.nullable(),
  place: z.object({ u: num, v: num, tilt: num }).partial().optional(), // thêm sau → optional
  snapshot: gemSnapshot.optional(),
});

// Đá gắn tự do – chi tiết điểm neo được kiểm tra kỹ trong normalizeFreeStones (rules.js)
const freeStoneSchema = z.object({
  id: z.string().max(12),
  stone: code,
  sizeMm: num,
  anchor: z.object({ k: z.enum(['cyl', 'side', 'face', 'free']) }).passthrough(),
});

const base = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  metal: metalSchema,
  gem: gemSchema,
  freeStones: z.array(freeStoneSchema).max(60).optional(),
  // khối của thiết kế tự tạo – kiểm tra chi tiết trong normalizeParts (custom.js)
  parts: z.array(z.object({ id: z.string().max(12), kind: code }).passthrough()).max(200).optional(),
};
const accentStone = code;
const engraving = z.string().max(80);
// Các trường thêm sau phiên bản đầu → optional để bản nháp/thiết kế cũ vẫn hợp lệ (normalize sẽ điền mặc định)
const engravingExtra = { engravingPos: code.optional(), engravingSize: num.optional() };

export const designConfigSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('ring'),
    style: z.enum(STYLE_CODES.ring),
    size: z.object({ ringSize: num, bandWidth: num, bandThickness: num, profile: code }),
    deco: z.object({ halo: z.boolean(), pave: z.boolean(), pattern: code, engraving, ...engravingExtra, accentStone, sideStone: code.optional() }),
  }),
  z.object({
    ...base,
    type: z.literal('bracelet'),
    style: z.enum(STYLE_CODES.bracelet),
    size: z.object({ circumference: num, width: num, thickness: num }),
    deco: z.object({ pave: z.boolean(), charmCount: num, charmShape: code, engraving, ...engravingExtra, accentStone }),
  }),
  z.object({
    ...base,
    type: z.literal('necklace'),
    style: z.enum(STYLE_CODES.necklace),
    size: z.object({ length: num, chainThickness: num, pendantSize: num }),
    deco: z.object({ pendantShape: code, halo: z.boolean(), hollow: z.boolean(), engraving: engraving.optional(), ...engravingExtra, accentStone }),
  }),
  z.object({
    ...base,
    type: z.literal('custom'),
    style: z.enum(STYLE_CODES.custom),
    size: z.object({}).passthrough(),
    deco: z.object({}).passthrough(),
  }),
  z.object({
    ...base,
    type: z.literal('earrings'),
    style: z.enum(STYLE_CODES.earrings),
    size: z.object({ hoopDiameter: num, dropLength: num, thickness: num }),
    deco: z.object({ halo: z.boolean(), pave: z.boolean(), accentStone }),
  }),
  z.object({
    ...base,
    type: z.literal('pendant'),
    style: z.enum(STYLE_CODES.pendant),
    size: z.object({ pendantSize: num, thickness: num }),
    deco: z.object({
      halo: z.boolean(),
      hollow: z.boolean(),
      bail: code,
      engraving,
      ...engravingExtra,
      showChain: z.boolean(),
      accentStone,
    }),
  }),
]);

/**
 * Chuyển cấu hình từ schema cũ lên schema hiện tại.
 * Hiện mới có phiên bản 1; khi thay đổi cấu trúc, thêm bước `if (v === 1) {...; v = 2}` tại đây.
 */
export function migrateConfig(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const c = structuredClone(raw);
  if (c.schemaVersion === undefined) c.schemaVersion = 1;
  return c;
}

/**
 * Kiểm tra + chuẩn hóa dữ liệu cấu hình bất kỳ.
 * @returns {{ ok: true, config } | { ok: false, error: string, issues?: any[] }}
 */
export function parseConfig(raw, lookup = localLookup) {
  const migrated = migrateConfig(raw);
  if (!migrated || !TYPE_CODES.includes(migrated.type)) {
    return { ok: false, error: 'Loại trang sức không hợp lệ' };
  }
  if (migrated.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Thiết kế được tạo bởi phiên bản mới hơn của ứng dụng' };
  }
  const result = designConfigSchema.safeParse(migrated);
  if (!result.success) {
    return { ok: false, error: 'Cấu hình thiết kế không hợp lệ', issues: result.error.issues };
  }
  return { ok: true, config: normalizeConfig(result.data, lookup) };
}
