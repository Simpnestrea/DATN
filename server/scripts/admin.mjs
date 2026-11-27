// CẤP / THU QUYỀN QUẢN TRỊ VIÊN – chỉ làm được bằng lệnh trên máy chủ (trang web cố ý không có chức năng này:
// không ai tự nâng quyền qua web được, kể cả khi chiếm được một tài khoản admin).
//
//   npm run admin -- ban@gmail.com          cấp quyền admin cho tài khoản (đã đăng ký) dùng email này
//   npm run admin -- --thu ban@gmail.com    thu quyền admin
//   npm run admin -- --ds                   danh sách quản trị viên
//
// Mỗi lần cấp / thu đều được ghi vào Nhật ký quản trị.
import os from 'node:os';
import mongoose from 'mongoose';
import { config, maskUri } from '../src/config.js';
import { grantAdmin, listAdmins, revokeAdmin } from '../src/adminLog.js';

const argv = process.argv.slice(2);
const print = (...a) => console.log('[NGK admin]', ...a);
const when = (t) => (t ? new Date(t).toLocaleString('vi-VN') : 'chưa từng');
let who = 'máy chủ';
try {
  who = `${os.userInfo().username}@${os.hostname()}`;
} catch {
  /* môi trường không cho đọc tên người dùng */
}
const actorName = `Lệnh trên máy chủ (${who})`;

function usage() {
  print('Cách dùng:');
  print('  npm run admin -- email@...          cấp quyền quản trị viên');
  print('  npm run admin -- --thu email@...    thu quyền quản trị viên');
  print('  npm run admin -- --ds               danh sách quản trị viên');
}

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
} catch (e) {
  console.error(`[NGK admin] Không kết nối được MongoDB (${maskUri(config.mongoUri)}): ${e.message}`);
  process.exit(1);
}
try {
  if (argv.includes('--ds')) {
    const list = await listAdmins();
    if (!list.length) print('Chưa có quản trị viên nào. Cấp quyền: npm run admin -- email@...');
    else {
      print(`${list.length} quản trị viên:`);
      for (const u of list) print(`  • ${u.displayName} <${u.email}> – hoạt động gần nhất: ${when(u.lastSeenAt)}`);
    }
  } else if (argv.includes('--thu')) {
    const email = argv[argv.indexOf('--thu') + 1];
    const { user, changed } = await revokeAdmin(email, actorName);
    print(changed ? `Đã thu quyền quản trị của ${user.displayName} <${user.email}>.` : `${user.displayName} <${user.email}> vốn không phải quản trị viên.`);
    const left = (await listAdmins()).length;
    if (!left) print('Lưu ý: hiện không còn quản trị viên nào.');
  } else if (argv[0] && !argv[0].startsWith('-')) {
    const { user, changed } = await grantAdmin(argv[0], actorName);
    print(
      changed
        ? `Đã cấp quyền quản trị cho ${user.displayName} <${user.email}>. Người này tải lại trang web sẽ thấy mục "Quản trị" trong menu tài khoản.`
        : `${user.displayName} <${user.email}> đã là quản trị viên rồi.`,
    );
    if (!user.emailVerified) print('Lưu ý: tài khoản này chưa xác minh email.');
  } else usage();
} catch (e) {
  console.error(`[NGK admin] ${e.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
