// TẠO THÔNG BÁO (chuông trong web). Không thông báo khi người làm chính là người nhận.
// Lượt thích: gộp vào thông báo "thích" CHƯA ĐỌC của cùng thiết kế → "A và 3 người khác đã thích …".
import { Notification } from './models.js';

const MAX_ACTORS = 3;

/**
 * @param to      người nhận (ObjectId)
 * @param actor   người làm (ObjectId)
 * @param type    'like' | 'comment' | 'reply' | 'remix' | 'moderation' | 'featured' | 'access-request' | 'access-result'
 * @param kind    chi tiết của moderation / access-result (vd. design-hidden, approved)
 * @param reason  lý do quản trị viên ghi (hiện trong thông báo)
 */
export async function notify({ to, actor, type, design, comment = null, remix = null, preview = '', kind = null, reason = '', request = null }) {
  if (!to || !actor || String(to) === String(actor)) return;
  try {
    if (type === 'like') {
      const existing = await Notification.findOne({ user: to, type: 'like', design, read: false });
      if (existing) {
        if (existing.actors.some((a) => String(a) === String(actor))) return; // thích – bỏ thích – thích lại: không đếm 2 lần
        existing.actors = [actor, ...existing.actors].slice(0, MAX_ACTORS);
        existing.actorCount += 1;
        await existing.save();
        return;
      }
    }
    await Notification.create({
      user: to,
      type,
      kind,
      design,
      comment,
      remix,
      request,
      actors: [actor],
      actorCount: 1,
      preview: [...String(preview ?? '').replace(/\s+/g, ' ').trim()].slice(0, 140).join(''),
      reason: [...String(reason ?? '')].slice(0, 300).join(''),
    });
  } catch (e) {
    // thông báo là phụ – lỗi ở đây không được làm hỏng thao tác chính (thích / bình luận / remix)
    console.error('[NGK] Không tạo được thông báo:', e.message);
  }
}
