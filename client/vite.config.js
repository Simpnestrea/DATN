import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // cổng 5173 đang bận thì báo lỗi, KHÔNG tự chuyển sang 5174: máy chủ chỉ nhận yêu cầu từ trang ở APP_URL (chống CSRF)
    strictPort: true,
    // chuyển tiếp /api sang máy chủ Express khi chạy dev (máy chủ chỉ mở cổng trên 127.0.0.1 + ::1 – xem listenLocal)
    proxy: {
      '/api': 'http://127.0.0.1:4000',
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
