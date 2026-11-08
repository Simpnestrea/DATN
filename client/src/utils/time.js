// Thời gian kiểu "3 phút trước" / ngày tháng tiếng Việt.

export function timeAgo(t, now = Date.now()) {
  const d = new Date(t).getTime();
  if (!Number.isFinite(d)) return '';
  const s = Math.max(0, Math.round((now - d) / 1000));
  if (s < 45) return 'vừa xong';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.round(days / 7)} tuần trước`;
  return formatDate(t);
}

export const formatDate = (t) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatDateTime = (t) =>
  new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 1 234 → "1,2 N" (gọn cho số lượt thích lớn). */
export function compactNumber(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',').replace(/,0$/, '')} N`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} Tr`;
}
