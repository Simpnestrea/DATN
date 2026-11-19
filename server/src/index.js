// Khởi động máy chủ NGK: kiểm tra cấu hình, kết nối MongoDB rồi mở cổng.
import mongoose from 'mongoose';
import { config, mailConfigured, maskUri } from './config.js';
import { createApp, listenLocal } from './app.js';
import { migrate } from './migrate.js';
import { seedCatalog } from './catalog.js';

// cấu hình sai (vd. APP_URL không phải localhost, JWT_SECRET quá ngắn) → không mở cổng
if (config.problems.length) {
  for (const p of config.problems) console.error(`[NGK] ${p}`);
  console.error('[NGK] Máy chủ không khởi động – sửa server/.env rồi chạy lại (xem server/.env.example).');
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
} catch (e) {
  console.error(`[NGK] Không kết nối được MongoDB (${maskUri(config.mongoUri)}).\n  → Kiểm tra dịch vụ MongoDB đã chạy chưa (Windows: services.msc → MongoDB Server).\n  ${e.message}`);
  process.exit(1);
}

try {
  const m = await migrate();
  if (m.users || m.designs) console.log(`[NGK] Nâng cấp dữ liệu cũ: ${m.users} tài khoản, ${m.designs} thiết kế`);
} catch (e) {
  console.error('[NGK] Không nâng cấp được dữ liệu cũ:', e.message);
}
try {
  // danh mục kim loại / đá quý: lần đầu nạp từ file mặc định, sau đó quản trị viên chỉnh trong trang Quản trị
  const c = await seedCatalog();
  if (c.materials || c.gemstones) console.log(`[NGK] Nạp danh mục mặc định: ${c.materials} kim loại, ${c.gemstones} đá quý`);
} catch (e) {
  console.error('[NGK] Không nạp được danh mục:', e.message);
}

let servers;
try {
  servers = await listenLocal(createApp(), config.port);
} catch (e) {
  if (e.code === 'EADDRINUSE') {
    console.error(`[NGK] Cổng ${config.port} đang bị chương trình khác dùng (có thể NGK đang chạy ở một cửa sổ khác: npm run dev / npm run demo) – tắt chương trình đó rồi chạy lại.`);
  } else console.error(`[NGK] Không mở được cổng ${config.port}: ${e.message}`);
  await mongoose.disconnect();
  process.exit(1);
}
console.log(`[NGK] Máy chủ chạy tại http://localhost:${config.port} – ${config.isProd ? 'bản demo' : config.devMode ? 'chế độ dev' : `chế độ ${config.env}`}, chỉ máy này truy cập được`);
console.log(`  Trang web: ${config.appUrl}`);
console.log(`  MongoDB: ${maskUri(config.mongoUri)}`);
if (mailConfigured()) console.log(`  Email: Gmail (${config.gmail.user})`);
else console.log('  Email: hộp thư demo (chưa cấu hình Gmail) – link xác minh / đặt lại mật khẩu hiện ngay trên trang + in ra cửa sổ này');
console.log(`  Đăng nhập Google: ${config.googleClientId ? 'đã bật' : 'chưa có GOOGLE_CLIENT_ID → ẩn nút Google'}`);
if (config.jwtRandom) console.log('  Khoá phiên: ngẫu nhiên mỗi lần chạy (chưa đặt JWT_SECRET) – khởi động lại máy chủ = phải đăng nhập lại');

// TẮT ÊM (Ctrl+C, hoặc node --watch khởi động lại khi sửa code): ngừng nhận kết nối mới, đợi các yêu cầu đang chạy xong rồi đóng CSDL
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[NGK] Nhận ${signal} – đang tắt máy chủ…`);
  setTimeout(() => process.exit(1), 10_000).unref(); // yêu cầu treo quá 10 giây → tắt hẳn
  let open = servers.length;
  for (const server of servers) {
    server.close(() => {
      if (--open === 0) mongoose.disconnect().finally(() => process.exit(0));
    });
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
