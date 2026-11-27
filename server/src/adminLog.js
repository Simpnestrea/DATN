// GHI NHẬT KÝ QUẢN TRỊ + cấp / thu quyền admin (chỉ gọi từ lệnh trên máy chủ – web không có chức năng này).
import { AdminLog, User } from './models.js';

/** Nhãn dễ đọc của một tài khoản trong nhật ký: "Tên (email)". */
export const userLabel = (u) => `${u.displayName} (${u.email})`;

/**
 * Ghi một dòng nhật ký. Lỗi ghi nhật ký KHÔNG được nuốt: thao tác quản trị mà không ghi được nhật ký phải báo lỗi.
 * @param actor tài khoản admin đang thao tác, hoặc null (lệnh trên máy chủ – kèm `actorName`)
 */
export function logAdmin(actor, { action, targetType = null, target = null, targetLabel = '', reason = '', meta = null, actorName }) {
  return AdminLog.create({
    actor: actor?._id ?? null,
    actorName: actorName ?? (actor ? userLabel(actor) : 'Lệnh trên máy chủ'),
    action,
    targetType,
    target,
    targetLabel,
    reason,
    meta,
  });
}

/** Tìm tài khoản theo email cho lệnh cấp / thu quyền. */
async function byEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) throw new Error('Thiếu email. Ví dụ: npm run admin -- ban@gmail.com');
  const u = await User.findOne({ email: e });
  if (!u) throw new Error(`Không có tài khoản nào dùng email ${e} – người đó cần đăng ký trên web trước.`);
  return u;
}

/** Cấp quyền admin. @returns { user, changed } */
export async function grantAdmin(email, actorName = 'Lệnh trên máy chủ') {
  const u = await byEmail(email);
  if (u.demo) throw new Error('Đây là tài khoản mẫu (dữ liệu minh hoạ) – không cấp quyền được.');
  if (u.lockedAt) throw new Error('Tài khoản đang bị khoá – hãy mở khoá trong trang quản trị trước.');
  if (u.role === 'admin') return { user: u, changed: false };
  await User.updateOne({ _id: u._id }, { role: 'admin' });
  await logAdmin(null, { actorName, action: 'admin.grant', targetType: 'user', target: u._id, targetLabel: userLabel(u) });
  return { user: u, changed: true };
}

/** Thu quyền admin (có hiệu lực ngay ở yêu cầu kế tiếp – vai trò được đọc lại mỗi lần gọi API). */
export async function revokeAdmin(email, actorName = 'Lệnh trên máy chủ') {
  const u = await byEmail(email);
  if (u.role !== 'admin') return { user: u, changed: false };
  await User.updateOne({ _id: u._id }, { role: 'user' });
  await logAdmin(null, { actorName, action: 'admin.revoke', targetType: 'user', target: u._id, targetLabel: userLabel(u) });
  return { user: u, changed: true };
}

export const listAdmins = () => User.find({ role: 'admin' }, { displayName: 1, email: 1, createdAt: 1, lastSeenAt: 1 }).sort({ createdAt: 1 });
