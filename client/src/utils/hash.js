/** Hash chuỗi nhanh (djb2) – dùng làm khóa cache, không dùng cho mục đích bảo mật. */
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
