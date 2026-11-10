// Các góc chụp của bảng thông số in (dir = null → hướng đẹp nhất của loại trang sức, như ảnh đại diện).
// Tách riêng khỏi MultiAngleBaker để trang in không phải tải three.js chỉ vì danh sách này.
export const SHEET_VIEWS = [
  { key: 'perspective', label: 'Phối cảnh', dir: null },
  { key: 'front', label: 'Chính diện', dir: [0, 0.04, 1] },
  { key: 'top', label: 'Từ trên', dir: [0, 1, 0.04] },
  { key: 'side', label: 'Cạnh bên', dir: [1, 0.06, 0] },
];
