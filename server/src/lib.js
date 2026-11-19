// Tiện ích dùng chung: lỗi HTTP, kiểm tra dữ liệu đầu vào, mã ngẫu nhiên, ảnh.
import crypto from 'node:crypto';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (msg, code) => new HttpError(400, msg, code);

/** Tài khoản bị quản trị viên khoá → lỗi kèm lý do (hiện ngay ở ô đăng nhập). */
export const lockedError = (u) =>
  new HttpError(
    403,
    `Tài khoản đã bị quản trị viên tạm khoá${u.lockReason ? ` – lý do: ${u.lockReason}` : ''}. Nếu cho rằng có nhầm lẫn, hãy liên hệ quản trị viên NGK.`,
    'ACCOUNT_LOCKED',
  );

/** Mã ngẫu nhiên an toàn (base64url) + bản băm SHA-256 để lưu (không lưu mã gốc). */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Bỏ dấu tiếng Việt + chữ thường (tìm kiếm không dấu). */
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Email trong log: a***@gmail.com (log máy chủ không nên chứa nguyên địa chỉ người dùng). */
export const maskEmail = (e) => String(e).replace(/^(.)[^@]*/, '$1***');

/** Escape chuỗi trước khi chèn vào HTML do máy chủ tạo (email, thẻ xem trước og:). */
export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Trích đoạn một dòng, cắt theo ký tự Unicode (không cắt đôi chữ có dấu); `ellipsis` → thêm "…" khi bị cắt. */
export function excerpt(s, n, { ellipsis = false } = {}) {
  const chars = [...String(s ?? '').replace(/\s+/g, ' ').trim()];
  return chars.length > n ? `${chars.slice(0, n).join('')}${ellipsis ? '…' : ''}` : chars.join('');
}

/** Số trang từ query (?page=): số nguyên 1…max, sai → 1. */
export const readPage = (q, max) => Math.max(1, Math.min(max, Number.parseInt(q, 10) || 1));

// ── kiểm tra dữ liệu đầu vào ──────────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function readEmail(v) {
  if (typeof v !== 'string') throw bad('Email không hợp lệ');
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw bad('Email không hợp lệ');
  return e;
}
export function readPassword(v) {
  if (typeof v !== 'string' || v.length < 8) throw bad('Mật khẩu cần ít nhất 8 ký tự');
  // bcrypt chỉ dùng 72 BYTE đầu (không phải 72 ký tự): chữ có dấu chiếm 2–3 byte → quá dài thì phần đuôi bị bỏ qua âm thầm
  if (Buffer.byteLength(v, 'utf8') > 72) throw bad('Mật khẩu quá dài (tối đa 72 byte – chữ có dấu tính 2–3 byte)');
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) throw bad('Mật khẩu cần có cả chữ và số');
  return v;
}
/**
 * Chặn sớm chuỗi dài bất thường (trước khi chuẩn hoá / chạy biểu thức chính quy): trang web không bao giờ gửi tới mức này
 * (ô nhập có giới hạn); để rộng ×8 vì chữ có dấu gõ kiểu tổ hợp chiếm nhiều mã ký tự hơn sau khi chuẩn hoá.
 */
const tooLong = (v, max) => v.length > max * 8 + 64;

/** Chuỗi một dòng: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. */
export function readText(v, { max, min = 0, label = 'Giá trị' }) {
  if (typeof v !== 'string') throw bad(`${label} không hợp lệ`);
  if (tooLong(v, max)) throw bad(`${label} quá dài (tối đa ${max} ký tự)`);
  const t = v.normalize('NFC').replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < min) throw bad(min > 1 ? `${label} cần ít nhất ${min} ký tự` : `${label} không được để trống`);
  return [...t].slice(0, max).join('');
}
/** Văn bản NHIỀU DÒNG (bình luận, mô tả): giữ xuống dòng (tối đa 2 dòng trống liền nhau), bỏ ký tự điều khiển. */
export function readMultiline(v, { max, min = 0, label = 'Nội dung' }) {
  if (typeof v !== 'string') throw bad(`${label} không hợp lệ`);
  if (tooLong(v, max)) throw bad(`${label} tối đa ${max} ký tự`);
  const t = v
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{C}\n]/gu, '') // bỏ ký tự điều khiển, trừ xuống dòng
    // bỏ khoảng trắng cuối mỗi dòng bằng trimEnd – KHÔNG dùng /[ \t]+\n/: gặp chuỗi dài toàn khoảng trắng, biểu thức đó chạy
    // theo bình phương độ dài (đo: 40 nghìn ký tự mất 0,75 giây → 2 MB treo máy chủ ~30 phút)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length < min) throw bad(min > 1 ? `${label} cần ít nhất ${min} ký tự` : `${label} không được để trống`);
  if ([...t].length > max) throw bad(`${label} tối đa ${max} ký tự`);
  return t;
}

// ── TÊN RIÊNG (đường dẫn hồ sơ /@ten-rieng) ─────────────────────────────────────────────────────────
export const HANDLE_RE = /^(?![._])(?!.*[._]{2})[a-z0-9._]{3,30}(?<![._])$/;
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'ngk', 'root', 'system', 'support', 'help', 'studio', 'kham-pha', 'khampha', 'explore',
  'thiet-ke', 'thietke', 'tai-khoan', 'taikhoan', 'dang-nhap', 'dang-ky', 'moderator', 'mod', 'null', 'undefined', 'me',
]);
/** Gợi ý tên riêng từ tên hiển thị: "Nguyễn Gia Kiệt" → "nguyen.gia.kiet". */
export function handleBase(displayName) {
  const b = fold(displayName)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24)
    .replace(/\.+$/, '');
  return b.length >= 3 && !RESERVED.has(b) ? b : `nguoidung${b ? `.${b}` : ''}`.slice(0, 24);
}
export function readHandle(v) {
  if (typeof v !== 'string') throw bad('Tên riêng không hợp lệ');
  const h = v.trim().toLowerCase().replace(/^@/, '');
  if (!HANDLE_RE.test(h)) {
    throw bad('Tên riêng 3–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới (không đứng đầu/cuối, không liền nhau).');
  }
  if (RESERVED.has(h)) throw bad('Tên riêng này đã được hệ thống giữ lại – hãy chọn tên khác');
  return h;
}

export function readObjectId(v) {
  if (typeof v !== 'string' || !/^[a-f0-9]{24}$/i.test(v)) throw new HttpError(404, 'Không tìm thấy');
  return v;
}

/**
 * Ảnh gửi lên dạng data URL (trình duyệt đã nén). Kiểm tra ĐÚNG LOẠI theo chữ ký nhị phân (không tin phần
 * khai báo), giới hạn dung lượng. @returns { mime, data: Buffer }
 */
export function readImage(dataUrl, maxBytes = config.maxImageBytes) {
  if (typeof dataUrl !== 'string') throw bad('Ảnh không hợp lệ');
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw bad('Ảnh phải là WebP, PNG hoặc JPEG');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > maxBytes) throw bad(`Ảnh quá lớn (tối đa ${Math.round(maxBytes / 1024)} KB)`);
  const sig = data.subarray(0, 12);
  const isPng = sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  const isWebp = sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP';
  const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : null;
  if (!mime) throw bad('Tệp không phải ảnh hợp lệ');
  return { mime, data };
}

/** Người dùng → dữ liệu gửi cho trình duyệt (không bao giờ gửi mật khẩu băm). */
export function publicUser(u) {
  return {
    id: String(u._id),
    email: u.email,
    emailVerified: u.emailVerified,
    displayName: u.displayName,
    handle: u.handle ?? null,
    bio: u.bio ?? '',
    demo: u.demo === true,
    avatarUrl: u.avatarImage ? `/api/images/${u.avatarImage}` : u.googlePicture || null,
    hasPassword: !!u.passwordHash,
    googleLinked: !!u.googleId,
    role: u.role,
    createdAt: u.createdAt,
  };
}

/** Thông tin CÔNG KHAI của một người (tác giả thiết kế / bình luận) – không có email. */
export function authorInfo(u) {
  if (!u) return { id: null, displayName: 'Tài khoản đã xoá', handle: null, avatarUrl: null };
  return {
    id: String(u._id),
    displayName: u.displayName,
    handle: u.handle ?? null,
    avatarUrl: u.avatarImage ? `/api/images/${u.avatarImage}` : u.googlePicture || null,
    demo: u.demo === true,
  };
}
export const AUTHOR_FIELDS = { displayName: 1, handle: 1, avatarImage: 1, googlePicture: 1, demo: 1 };
