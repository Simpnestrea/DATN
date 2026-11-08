// Phím tắt toàn trang có nên bỏ qua sự kiện phím này không: đang gõ trong ô nhập, hoặc đang mở một bảng
// "bẫy phím" (data-keytrap, ví dụ bảng vẽ 2D – nó tự xử lý Delete / Ctrl+Z... của riêng nó).
export function shortcutsBlocked(e) {
  const t = e?.target;
  const tag = t?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return true;
  return typeof document !== 'undefined' && !!document.querySelector('[data-keytrap]');
}
