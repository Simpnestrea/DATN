// Tên tiếng Việt + biểu tượng của các hành động trong Nhật ký quản trị; lý do gợi ý cho các hộp thoại.
import {
  ArrowUpDown,
  Award,
  Eye,
  EyeOff,
  FlagOff,
  KeyRound,
  Lock,
  LockOpen,
  MessageCircleOff,
  MessageCircleWarning,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldMinus,
  ShieldPlus,
  Trash2,
} from 'lucide-react';

export const ACTIONS = {
  'user.lock': { label: 'Khoá tài khoản', tone: 'danger', Icon: Lock },
  'user.unlock': { label: 'Mở khoá tài khoản', tone: 'success', Icon: LockOpen },
  'user.delete': { label: 'Xoá tài khoản', tone: 'danger', Icon: Trash2 },
  'admin.grant': { label: 'Cấp quyền quản trị', tone: 'gold', Icon: ShieldPlus },
  'admin.revoke': { label: 'Thu quyền quản trị', tone: 'muted', Icon: ShieldMinus },
  'design.hide': { label: 'Ẩn thiết kế', tone: 'danger', Icon: EyeOff },
  'design.restore': { label: 'Hiện lại thiết kế', tone: 'success', Icon: Eye },
  'design.feature': { label: 'NGK chọn', tone: 'gold', Icon: Award },
  'design.unfeature': { label: 'Bỏ NGK chọn', tone: 'muted', Icon: Award },
  'comment.remove': { label: 'Gỡ bình luận', tone: 'danger', Icon: MessageCircleOff },
  'comment.restore': { label: 'Khôi phục bình luận', tone: 'success', Icon: RotateCcw },
  'report.dismiss': { label: 'Bỏ qua báo cáo', tone: 'muted', Icon: FlagOff },
  'report.close': { label: 'Đóng báo cáo', tone: 'muted', Icon: MessageCircleWarning },
  'access.request': { label: 'Xin xem thiết kế riêng tư', tone: 'gold', Icon: KeyRound },
  'access.view': { label: 'Xem thiết kế riêng tư', tone: 'gold', Icon: Eye },
  'catalog.create': { label: 'Thêm vào danh mục', tone: 'gold', Icon: Plus },
  'catalog.update': { label: 'Sửa danh mục', tone: 'muted', Icon: Pencil },
  'catalog.hide': { label: 'Ẩn khỏi danh mục', tone: 'danger', Icon: EyeOff },
  'catalog.show': { label: 'Hiện lại trong danh mục', tone: 'success', Icon: Eye },
  'catalog.reorder': { label: 'Sắp xếp danh mục', tone: 'muted', Icon: ArrowUpDown },
};

/** Nhóm hành động cho bộ lọc nhật ký (theo thứ tự hiển thị). */
export const ACTION_GROUPS = [
  { code: 'report', label: 'Báo cáo', actions: ['report.dismiss', 'report.close'] },
  { code: 'design', label: 'Thiết kế', actions: ['design.hide', 'design.restore', 'design.feature', 'design.unfeature'] },
  { code: 'comment', label: 'Bình luận', actions: ['comment.remove', 'comment.restore'] },
  { code: 'user', label: 'Người dùng', actions: ['user.lock', 'user.unlock', 'user.delete'] },
  { code: 'access', label: 'Thiết kế riêng tư', actions: ['access.request', 'access.view'] },
  { code: 'catalog', label: 'Danh mục', actions: ['catalog.create', 'catalog.update', 'catalog.hide', 'catalog.show', 'catalog.reorder'] },
  { code: 'admin', label: 'Quyền quản trị', actions: ['admin.grant', 'admin.revoke'] },
];

export const actionInfo = (code) => ACTIONS[code] ?? { label: code, tone: 'muted', Icon: ScrollText };

/** Lý do người dùng báo cáo (giống trang thiết kế). */
export const REPORT_REASONS = { spam: 'Spam / quảng cáo', offensive: 'Nội dung phản cảm', copyright: 'Vi phạm bản quyền', other: 'Lý do khác' };
/** Kết quả xử lý một báo cáo. */
export const RESOLUTIONS = {
  hide: 'Đã ẩn thiết kế',
  remove: 'Đã gỡ bình luận',
  dismiss: 'Bỏ qua (không vi phạm)',
  lock: 'Đã khoá người đăng',
  gone: 'Nội dung không còn',
};

// Lý do gợi ý (bấm để điền nhanh – vẫn sửa được)
export const LOCK_REASONS = [
  'Đăng nội dung rác (spam)',
  'Nội dung phản cảm, không phù hợp',
  'Mạo danh người khác',
  'Vi phạm bản quyền thiết kế',
  'Quấy rối, xúc phạm người dùng khác',
];
export const DELETE_REASONS = ['Người dùng yêu cầu xoá tài khoản', 'Tài khoản rác / giả mạo', 'Vi phạm nghiêm trọng nhiều lần'];
export const HIDE_REASONS = ['Sao chép thiết kế của người khác', 'Nội dung phản cảm, không phù hợp', 'Spam / quảng cáo', 'Tên hoặc mô tả không phù hợp'];
export const REMOVE_REASONS = ['Ngôn từ xúc phạm', 'Spam / quảng cáo', 'Quấy rối người khác', 'Lừa đảo / lộ thông tin cá nhân', 'Lạc đề, gây rối'];
export const ACCESS_REASONS = ['Kiểm tra báo cáo vi phạm liên quan', 'Hỗ trợ người dùng xử lý lỗi thiết kế', 'Kiểm tra lỗi hiển thị 3D người dùng báo'];
