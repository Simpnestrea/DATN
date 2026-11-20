// TRẠNG THÁI ĐĂNG NHẬP của trang web + hộp đăng nhập dùng chung (mở từ bất kỳ đâu, ví dụ khi bấm Lưu lúc chưa đăng nhập).
import { create } from 'zustand';
import { ApiError, get, post, refreshSession, setSessionEndedHandler } from '../services/api.js';
import { clearAccountDrafts, runAfterLogout, runBeforeLogout } from '../services/logoutCleanup.js';

export const useAuthStore = create((set, getState) => ({
  status: 'loading', // loading | ready
  user: null,
  googleClientId: null,
  serverDown: false,
  // hộp đăng nhập: null | { view: 'login' | 'register' | 'forgot', reason?: string, then?: () => void }
  dialog: null,
  devMail: null, // hộp thư demo: { label, url } – link trong email không gửi thật

  async init() {
    if (getState().status === 'ready') return;
    const [cfg, me] = await Promise.allSettled([get('/api/config'), loadMe()]);
    set({
      status: 'ready',
      googleClientId: cfg.status === 'fulfilled' ? cfg.value.googleClientId : null,
      user: me.status === 'fulfilled' ? me.value : null,
      serverDown: me.status === 'rejected' && me.reason?.status === 0,
    });
  },
  setUser: (user) => set({ user }),

  /** Đăng nhập xong (mọi cách) → cập nhật + chạy việc đang chờ (ví dụ lưu thiết kế). */
  signedIn(user) {
    const then = getState().dialog?.then;
    set({ user, dialog: null });
    then?.();
  },
  async login(email, password) {
    const { user } = await post('/api/auth/login', { email, password });
    getState().signedIn(user);
    return user;
  },
  async register(email, password, displayName) {
    const res = await post('/api/auth/register', { email, password, displayName });
    getState().signedIn(res.user);
    return res;
  },
  async google(credential, { link = false, password } = {}) {
    const { user } = await post(link ? '/api/account/google' : '/api/auth/google', link ? { credential, password } : { credential });
    if (link) set({ user });
    else getState().signedIn(user);
    return user;
  },
  async logout() {
    // gửi nốt thay đổi chưa đồng bộ của thiết kế đang mở (Studio tự đăng ký); không gửi được → giữ bản nháp đó trên máy
    const keep = await runBeforeLogout();
    try {
      await post('/api/auth/logout');
    } catch {
      /* mất mạng – vẫn đăng xuất trên giao diện */
    }
    // máy dùng chung: người dùng sau không đọc được thiết kế của người vừa đăng xuất (localStorage + bộ nhớ trang)
    clearAccountDrafts(keep);
    runAfterLogout();
    set({ user: null });
  },

  /** Mở hộp đăng nhập. `then` chạy sau khi đăng nhập thành công. */
  openAuth: (view = 'login', { reason, then } = {}) => set({ dialog: { view, reason, then } }),
  setAuthView: (view) => set((s) => ({ dialog: s.dialog ? { ...s.dialog, view } : { view } })),
  closeAuth: () => set({ dialog: null }),
}));

async function loadMe() {
  try {
    return (await get('/api/auth/me')).user;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'TOKEN_EXPIRED') {
      try {
        return (await refreshSession()).user;
      } catch {
        return null;
      }
    }
    throw e;
  }
}

setSessionEndedHandler(() => useAuthStore.setState({ user: null }));

/** Yêu cầu đăng nhập trước khi làm `action` – đã đăng nhập thì làm luôn. */
export function requireLogin(action, reason) {
  const st = useAuthStore.getState();
  if (st.user) return action();
  st.openAuth('login', { reason, then: action });
  return undefined;
}
