// CHỮ → ĐƯỜNG VIỀN 2D (mm) từ font đóng gói sẵn trong web (chạy offline, đủ dấu tiếng Việt).
// Mỗi font gồm 3 tệp con (latin, latin-ext, vietnamese – cách @fontsource chia nhỏ font): mỗi ký tự lấy từ tệp có nó.
// Kết quả lưu vào tham số khối "Chữ" (params.paths) → các nơi khác dựng khối như hình vẽ, không cần font.
import opentypeModule from 'opentype.js';
import { TEXT_LIMITS } from '@ngk/shared';
import { simplifyClosed, splitSelfIntersections } from '../../components/studio/custom/sketch/sketchMath.js';
import { polygonArea } from './sketchGeometry.js';
import sansLatin from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-700-normal.woff?url';
import sansExt from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-ext-700-normal.woff?url';
import sansVi from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-700-normal.woff?url';
import serifLatin from '@fontsource/lora/files/lora-latin-700-normal.woff?url';
import serifExt from '@fontsource/lora/files/lora-latin-ext-700-normal.woff?url';
import serifVi from '@fontsource/lora/files/lora-vietnamese-700-normal.woff?url';
import scriptLatin from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url';
import scriptExt from '@fontsource/dancing-script/files/dancing-script-latin-ext-700-normal.woff?url';
import scriptVi from '@fontsource/dancing-script/files/dancing-script-vietnamese-700-normal.woff?url';

const opentype = opentypeModule.parse ? opentypeModule : opentypeModule.default;

const FILES = {
  sans: [sansLatin, sansExt, sansVi],
  serif: [serifLatin, serifExt, serifVi],
  script: [scriptLatin, scriptExt, scriptVi],
};
export { FONT_FAMILY } from './fontFamily.js';

const cache = new Map(); // code → Promise<Font[]>

/** Nạp (1 lần) các tệp con của font. */
export function loadFont(code) {
  const key = FILES[code] ? code : 'sans';
  if (!cache.has(key)) {
    const p = Promise.all(
      FILES[key].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Không tải được font (${res.status})`);
        return opentype.parse(await res.arrayBuffer());
      }),
    );
    p.catch(() => cache.delete(key)); // lỗi mạng → lần sau thử lại
    cache.set(key, p);
  }
  return cache.get(key);
}

function capHeight(fonts) {
  const f = fonts[0];
  const cap = f.tables.os2?.sCapHeight;
  if (cap > 0) return cap;
  const H = f.charToGlyph('H').getBoundingBox();
  return H.y2 - H.y1 || f.unitsPerEm * 0.7;
}

/** Đường cong bậc 2/3 → các điểm; số đoạn theo độ dài đường điều khiển. */
function flatten(cmds, tol) {
  const contours = [];
  let cur = null;
  let x = 0;
  let y = 0;
  const seg = (len) => Math.max(2, Math.min(16, Math.ceil(len / tol)));
  for (const c of cmds) {
    if (c.type === 'M') {
      if (cur?.length > 2) contours.push(cur);
      cur = [[c.x, c.y]];
    } else if (c.type === 'L') {
      cur?.push([c.x, c.y]);
    } else if (c.type === 'Q') {
      const n = seg(Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x - c.x1, c.y - c.y1));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        cur?.push([u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y]);
      }
    } else if (c.type === 'C') {
      const n = seg(Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        cur?.push([
          u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ]);
      }
    } else if (c.type === 'Z') {
      if (cur?.length > 2) contours.push(cur);
      cur = null;
      continue;
    }
    if (c.x !== undefined) {
      x = c.x;
      y = c.y;
    }
  }
  if (cur?.length > 2) contours.push(cur);
  return contours;
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Dựng đường viền cho một dòng chữ.
 * @returns {{ paths: number[][][], missing: string[], width: number, height: number }} – đường viền (mm, y hướng lên),
 *   căn giữa theo chiều ngang, chân chữ cố định (đổi chữ không làm khối nhảy lên xuống); `missing` = ký tự font không có.
 */
export async function textToPaths({ text, font, size, spacing }) {
  const fonts = await loadFont(font);
  const scale = size / capHeight(fonts); // đơn vị font → mm, sao cho chữ HOA cao đúng `size`
  const tol = Math.max(0.05, size * 0.025);
  const fine = Math.max(0.004, size * 0.0015); // sai số giảm điểm (mm)
  const minArea = (size * 0.01) ** 2; // vòng vụn sinh ra ở chỗ nét chạm nhau → bỏ
  const paths = [];
  const missing = [];
  let pen = 0;
  let prev = null; // { font, glyph }
  for (const ch of [...text]) {
    const f = fonts.find((x) => x.charToGlyphIndex(ch) > 0);
    if (!f) {
      if (ch.trim()) missing.push(ch);
      else pen += fonts[0].charToGlyph(' ').advanceWidth * scale + spacing;
      prev = null;
      continue;
    }
    const g = f.charToGlyph(ch);
    if (prev && prev.font === f) pen += (f.getKerningValue(prev.glyph, g) || 0) * scale;
    // getPath trả về toạ độ màn hình (y hướng xuống) với cỡ = unitsPerEm × scale
    const cmds = g.getPath(0, 0, f.unitsPerEm * scale).commands;
    for (const c of flatten(cmds, tol)) {
      let pts = c.map(([px, py]) => [px + pen, -py]);
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) pts.pop();
      if (pts.length < 3) continue;
      pts = simplifyClosed(pts, fine); // bỏ điểm thừa trên đoạn gần thẳng (giữ đường cong mịn)
      // font viết tay hay vẽ cả chữ bằng MỘT nét cuộn chồng lên chính nó (chữ O: lỗ giữa sinh ra từ chỗ nét tự cắt)
      // → tách thành các vòng đơn; vòng ngược chiều sẽ thành lỗ, vòng cùng chiều là phần nét chồng (đặc)
      for (const loop of splitSelfIntersections(pts)) if (Math.abs(polygonArea(loop)) > minArea && loop.length > 2) paths.push(loop);
    }
    pen += g.advanceWidth * scale + spacing;
    prev = { font: f, glyph: g };
  }
  if (!paths.length) return { paths: [], missing, width: 0, height: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of paths)
    for (const [x, y] of p) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  // ngang: giữa hộp bao; dọc: giữa chiều cao chữ hoa (chân chữ cố định ở y = −size/2)
  const cx = (minX + maxX) / 2;
  const cy = size / 2;
  let out = paths.map((p) => p.map(([x, y]) => [r3(x - cx), r3(y - cy)]));
  // giới hạn dữ liệu (rất hiếm khi chạm: ~40 chữ phức tạp)
  out = out.slice(0, TEXT_LIMITS.paths);
  return { paths: out, missing, width: maxX - minX, height: maxY - minY };
}
