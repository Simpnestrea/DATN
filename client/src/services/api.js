// GỌI API máy chủ NGK. Cookie đăng nhập (httpOnly) trình duyệt tự gửi kèm; mọi yêu cầu có header X-NGK (chống CSRF).
// Mã truy cập hết hạn (401 TOKEN_EXPIRED) → tự gia hạn MỘT lần (dùng chung cho các yêu cầu song song) rồi gửi lại.

export class ApiError extends Error {
  constructor(message, status, body = {}) {
    super(message);
    this.status = status;
    this.code = body.code;
    this.body = body;
  }
}

let refreshing = null;
let onSessionEnded = () => {};
/** Đăng ký hàm gọi khi phiên đăng nhập kết thúc hẳn (gia hạn thất bại) – authStore dùng để đăng xuất giao diện. */
export const setSessionEndedHandler = (fn) => {
  onSessionEnded = fn;
};

async function raw(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: { 'X-NGK': '1' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Không kết nối được máy chủ – kiểm tra mạng rồi thử lại.', 0, { code: 'NETWORK' });
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    // 502/503/504 không kèm thông báo của máy chủ NGK = máy chủ API chưa chạy (trang web chuyển tiếp /api không tới được)
    if ([502, 503, 504].includes(res.status) && !data.error) {
      throw new ApiError('Không kết nối được máy chủ NGK – máy chủ chưa chạy hoặc đang khởi động lại. Thử lại sau giây lát.', 0, { code: 'NETWORK' });
    }
    throw new ApiError(data.error || `Lỗi máy chủ (${res.status})`, res.status, data);
  }
  return data;
}

export function refreshSession() {
  refreshing ??= raw('POST', '/api/auth/refresh').finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api(method, url, body) {
  try {
    return await raw(method, url, body);
  } catch (e) {
    if (e.status !== 401 || e.code !== 'TOKEN_EXPIRED') throw e;
    try {
      await refreshSession();
    } catch (re) {
      onSessionEnded();
      throw re;
    }
    return raw(method, url, body);
  }
}

export const get = (url) => api('GET', url);
export const post = (url, body = {}) => api('POST', url, body);
export const put = (url, body = {}) => api('PUT', url, body);
export const patch = (url, body = {}) => api('PATCH', url, body);
export const del = (url, body) => api('DELETE', url, body);
