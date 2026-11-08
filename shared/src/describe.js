// Mô tả cấu hình thiết kế bằng tiếng Việt – dùng cho thanh tóm tắt, bảng thông số, trang in PDF.
import {
  BAIL_STYLES,
  CHARM_SHAPES,
  CUTS,
  FINISHES,
  JEWELRY_TYPES,
  PENDANT_SHAPES,
  RING_PATTERNS,
  RING_PROFILES,
  SETTINGS,
  diameterToUsSize,
  ringSizeToDiameter,
} from './constants.js';
import { localLookup } from './catalog.js';
import { ENGRAVING_POSITIONS, getPendantShape, getStyleRules } from './rules.js';

const nameOf = (list, code) => list.find((x) => x.code === code)?.name ?? code;
const mm = (n) => `${Number(n).toFixed(1).replace(/\.0$/, '')} mm`;
const cm = (n) => `${(Number(n) / 10).toFixed(1).replace(/\.0$/, '')} cm`;

function gemText(gem, lookup) {
  const stone = lookup.gem(gem.stone)?.name ?? gem.snapshot?.name ?? gem.stone;
  const isPearl = gem.setting === 'peg';
  const parts = [stone];
  if (!isPearl) parts.push(nameOf(CUTS, gem.cut).toLowerCase());
  parts.push(mm(gem.sizeMm));
  return parts.join(' ');
}

/**
 * @returns {{ group: string, label: string, value: string }[]}
 */
/** Bảng thông số cho thiết kế tự tạo: liệt kê khối theo vật liệu. */
function describeCustom(config, lookup) {
  const rows = [{ group: 'Tổng quan', label: 'Loại trang sức', value: 'Thiết kế tự tạo' }];
  const parts = config.parts ?? [];
  const gems = parts.filter((p) => p.kind === 'gem');
  const metals = parts.filter((p) => p.kind !== 'gem');
  rows.push({ group: 'Tổng quan', label: 'Số khối', value: `${parts.length} (${metals.length} kim loại, ${gems.length} đá)` });
  const groups = new Set(parts.map((p) => p.group).filter(Boolean));
  if (groups.size) rows.push({ group: 'Tổng quan', label: 'Nhóm', value: `${groups.size} nhóm` });
  const count = (arr, key) => {
    const m = new Map();
    for (const p of arr) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m].map(([k, n]) => `${k} ×${n}`).join(', ');
  };
  if (metals.length) rows.push({ group: 'Chất liệu', label: 'Kim loại', value: count(metals, (p) => lookup.material(p.mat.metal)?.name ?? p.mat.metal) });
  if (gems.length) {
    rows.push({ group: 'Đá quý', label: 'Loại đá', value: count(gems, (p) => (lookup.gem(p.mat.stone)?.name ?? p.mat.stone).replace(/\s*\(.*\)/, '')) });
    rows.push({ group: 'Đá quý', label: 'Kích thước', value: [...new Set(gems.map((g) => `${g.params.size} mm`))].join(', ') });
  }
  return rows;
}

export function describeConfig(config, lookup = localLookup) {
  if (config.type === 'custom') return describeCustom(config, lookup);
  const rows = [];
  const add = (group, label, value) => rows.push({ group, label, value });
  const rules = getStyleRules(config);
  const { type, metal, gem, size, deco } = config;

  add('Tổng quan', 'Loại trang sức', nameOf(JEWELRY_TYPES, type));
  add('Tổng quan', 'Kiểu dáng', lookup.style(type, config.style)?.name ?? config.style);

  const metalName = lookup.material(metal.code)?.name ?? metal.snapshot?.name ?? metal.code;
  add('Chất liệu', 'Kim loại', metalName);
  add('Chất liệu', 'Bề mặt', nameOf(FINISHES, metal.finish));

  if (gem.enabled) {
    add('Đá chủ', 'Loại đá', lookup.gem(gem.stone)?.name ?? gem.snapshot?.name ?? gem.stone);
    if (gem.setting !== 'peg') add('Đá chủ', 'Giác cắt', nameOf(CUTS, gem.cut));
    add('Đá chủ', 'Kích thước', mm(gem.sizeMm));
    add('Đá chủ', 'Kiểu ổ', gem.setting === 'peg' ? 'Chốt ngọc trai' : nameOf(SETTINGS, gem.setting));
    if (gem.color) add('Đá chủ', 'Màu tùy chỉnh', gem.color);
    const pl = gem.place ?? {};
    if (pl.u || pl.v || pl.tilt) {
      const parts = [];
      if (rules.gemMove === 'band') {
        if (pl.u) parts.push(`lệch ${Math.abs(pl.u)}° quanh thân`);
        if (pl.v) parts.push(`${pl.v > 0 ? 'ra trước' : 'vào sau'} ${Math.round(Math.abs(pl.v) * 100)}%`);
      } else if (pl.u || pl.v) {
        parts.push('lệch khỏi tâm mặt dây');
      }
      if (pl.tilt) parts.push(`nghiêng ${Math.abs(pl.tilt)}°`);
      add('Đá chủ', 'Vị trí', parts.join(', '));
    }
  } else {
    add('Đá chủ', 'Đá chủ', 'Không');
  }

  if (type === 'ring') {
    const d = ringSizeToDiameter(size.ringSize);
    add('Kích thước', 'Size nhẫn', `Size ${size.ringSize} (VN) · ~US ${diameterToUsSize(d)}`);
    add('Kích thước', 'Đường kính trong', mm(d));
    add('Kích thước', 'Bề rộng đai', mm(size.bandWidth));
    add('Kích thước', 'Độ dày đai', mm(size.bandThickness));
    if (config.style !== 'twist') add('Kích thước', 'Dáng đai', nameOf(RING_PROFILES, size.profile));
    if (deco.pattern !== 'none') add('Trang trí', 'Hoa văn', nameOf(RING_PATTERNS, deco.pattern));
  } else if (type === 'bracelet') {
    add('Kích thước', 'Chu vi', cm(size.circumference));
    if (config.style !== 'tennis') add('Kích thước', 'Bề rộng', mm(size.width));
    if (['bangle', 'cuff'].includes(config.style)) add('Kích thước', 'Độ dày', mm(size.thickness));
    if (rules.charms) {
      add('Trang trí', 'Charm', `${deco.charmCount} charm · ${nameOf(CHARM_SHAPES, deco.charmShape).toLowerCase()}`);
    }
  } else if (type === 'necklace') {
    add('Kích thước', 'Chiều dài dây', cm(size.length));
    add('Kích thước', 'Độ dày dây', mm(size.chainThickness));
    const shape = getPendantShape(config);
    add('Mặt dây', 'Mặt dây', shape === 'none' ? 'Không' : nameOf(PENDANT_SHAPES, shape));
    if (shape !== 'none' && shape !== 'solitaire') {
      add('Mặt dây', 'Kích thước mặt', mm(size.pendantSize));
      if (deco.hollow) add('Mặt dây', 'Kiểu mặt', 'Rỗng (viền)');
    }
  } else if (type === 'earrings') {
    if (config.style === 'hoop') add('Kích thước', 'Đường kính vòng', mm(size.hoopDiameter));
    if (config.style === 'drop') add('Kích thước', 'Chiều dài buông', mm(size.dropLength));
    if (config.style !== 'stud') add('Kích thước', 'Độ dày', mm(size.thickness));
    add('Tổng quan', 'Số lượng', '1 đôi');
  } else if (type === 'pendant') {
    if (config.style !== 'solitaire') {
      add('Kích thước', 'Kích thước mặt', mm(size.pendantSize));
      add('Kích thước', 'Độ dày', mm(size.thickness));
      if (deco.hollow) add('Trang trí', 'Kiểu mặt', 'Rỗng (viền)');
    }
    add('Trang trí', 'Móc treo', nameOf(BAIL_STYLES, deco.bail));
  }

  if (deco.halo) add('Trang trí', rules.haloLabel, 'Có');
  if (deco.pave) add('Trang trí', type === 'ring' && config.style === 'eternity' ? 'Đá tấm toàn vòng' : 'Đá tấm (pavé)', 'Có');
  if (type === 'ring' && config.style === 'three-stone') {
    add('Đá chủ', 'Đá phụ hai bên', lookup.gem(deco.sideStone)?.name ?? deco.sideStone);
  }
  if (deco.halo || deco.pave) {
    add('Trang trí', 'Đá phụ', lookup.gem(deco.accentStone)?.name ?? deco.accentStone);
  }
  if (deco.engraving) {
    const pos = ENGRAVING_POSITIONS.find((p) => p.code === deco.engravingPos)?.name;
    add('Khắc chữ', 'Nội dung', `“${deco.engraving}”`);
    if (pos) add('Khắc chữ', 'Vị trí', pos);
    if (deco.engravingSize) add('Khắc chữ', 'Cỡ chữ', `cao ${mm(deco.engravingSize)} · khắc chìm`);
  }

  const free = config.freeStones ?? [];
  if (free.length) {
    const counts = new Map();
    for (const s of free) {
      const name = lookup.gem(s.stone)?.name?.replace(/\s*\(.*\)/, '') ?? s.stone;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    add('Đá gắn tự do', 'Số lượng', `${free.length} viên`);
    add('Đá gắn tự do', 'Chi tiết', [...counts].map(([n, c]) => `${n} ×${c}`).join(', '));
  }

  return rows;
}

/** Một dòng tóm tắt ngắn gọn cho thanh trạng thái. */
export function summarizeConfig(config, lookup = localLookup) {
  if (config.type === 'custom') {
    const n = config.parts?.length ?? 0;
    const gems = config.parts?.filter((p) => p.kind === 'gem').length ?? 0;
    return n ? `Thiết kế tự tạo · ${n} khối · ${gems} viên đá` : 'Thiết kế tự tạo · chưa có khối nào – thêm khối ở bảng bên phải';
  }
  const parts = [];
  parts.push(lookup.style(config.type, config.style)?.name ?? config.style);
  const metal = lookup.material(config.metal.code)?.name ?? config.metal.snapshot?.name ?? config.metal.code;
  parts.push(`${metal} ${nameOf(FINISHES, config.metal.finish).toLowerCase()}`);
  if (config.gem.enabled) parts.push(gemText(config.gem, lookup));
  if (config.type === 'ring') parts.push(`Size ${config.size.ringSize}`);
  if (config.type === 'bracelet') parts.push(cm(config.size.circumference));
  if (config.type === 'necklace') parts.push(cm(config.size.length));
  return `${nameOf(JEWELRY_TYPES, config.type)} · ${parts.join(' · ')}`;
}
