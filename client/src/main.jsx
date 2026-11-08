import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// Sau mỗi lần build lại bản demo, tab đang mở từ bản cũ có thể xin file JavaScript đã bị thay (máy chủ trả 404) → tải lại trang MỘT lần
// để lấy bản mới. Nhớ thời điểm tải lại trong sessionStorage → vẫn lỗi (vì lý do khác) thì không lặp vô hạn.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('ngk:reloadedAt') ?? 0) < 60_000) return;
    sessionStorage.setItem('ngk:reloadedAt', String(Date.now()));
  } catch {
    return; // không dùng được sessionStorage → không tự tải lại (tránh lặp)
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
