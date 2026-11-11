// Lưu tùy chọn nhỏ của người xem (nền, ánh sáng, chất lượng...) – an toàn khi localStorage bị chặn.
export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(`ngk:pref:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(`ngk:pref:${key}`, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }
}
