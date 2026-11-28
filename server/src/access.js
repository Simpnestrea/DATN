// QUYỀN XEM THIẾT KẾ RIÊNG TƯ của quản trị viên (chủ thiết kế đồng ý mới có, tối đa 7 ngày, thu hồi được bất cứ lúc nào).
import { AccessRequest } from './models.js';

export const GRANT_DAYS = 7;
export const GRANT_MS = GRANT_DAYS * 24 * 3600 * 1000;

/** Trạng thái thực tế: đã đồng ý nhưng quá hạn → "expired". */
export const accessStatus = (r, now = Date.now()) => (r.status === 'approved' && (!r.expiresAt || r.expiresAt.getTime() <= now) ? 'expired' : r.status);

/** Quyền xem đang còn hiệu lực của một quản trị viên với một thiết kế (hoặc null). */
export const activeGrant = (adminId, designId) =>
  AccessRequest.findOne({ admin: adminId, design: designId, status: 'approved', expiresAt: { $gt: new Date() } });

/** Yêu cầu gần nhất của quản trị viên cho từng thiết kế. @returns Map designId → request */
export async function latestRequests(adminId, designIds) {
  if (!designIds.length) return new Map();
  const list = await AccessRequest.find({ admin: adminId, design: { $in: designIds } }).sort({ createdAt: -1 });
  const map = new Map();
  for (const r of list) if (!map.has(String(r.design))) map.set(String(r.design), r);
  return map;
}
