// GỬI EMAIL qua Gmail (nodemailer + mật khẩu ứng dụng Gmail).
// Chưa cấu hình Gmail → HỘP THƯ DEMO: không gửi thật, in link ra cửa sổ máy chủ và trả về cho trang web hiển thị ngay (bấm là
// mở được thư). An toàn vì máy chủ chỉ mở cổng cho chính máy này (listenLocal trong app.js) – nếu máy khác gọi được API thì
// họ cũng lấy được link đặt lại mật khẩu của người khác.
import nodemailer from 'nodemailer';
import { config, mailConfigured } from './config.js';
import { escapeHtml as esc, maskEmail } from './lib.js';

let transport = null;
const sent = []; // kiểm thử: lưu thư "đã gửi"

function getTransport() {
  if (!transport && mailConfigured()) {
    transport = nodemailer.createTransport({ service: 'gmail', auth: { user: config.gmail.user, pass: config.gmail.appPassword } });
  }
  return transport;
}

function layout(title, body, link, button, footer = 'Nếu bạn không yêu cầu, hãy bỏ qua email này.') {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#0f0f12;font-family:Arial,sans-serif;color:#f5efe1">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:22px;letter-spacing:6px;color:#d9b766;margin-bottom:24px">NGK</div>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    <p style="line-height:1.6;color:#cfc7b4">${body}</p>
    <p style="margin:28px 0"><a href="${esc(link)}" style="background:#d9b766;color:#1a1a1f;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(button)}</a></p>
    <p style="font-size:12px;color:#8b8b96;line-height:1.6">Nếu nút không bấm được, mở liên kết này: <br>${esc(link)}</p>
    <p style="font-size:12px;color:#8b8b96">${esc(footer)}</p>
  </div></body></html>`;
}

/**
 * @returns {{ devLink?: string }} – devLink chỉ có khi CHƯA cấu hình Gmail (hộp thư demo)
 */
async function send(to, subject, html, text, link) {
  const t = getTransport();
  if (config.isTest) {
    sent.push({ to, subject, link });
    return { devLink: link };
  }
  if (!t) {
    console.log(`\n[NGK – hộp thư demo] Tới: ${to}\n  ${subject}\n  ${link}\n`);
    return { devLink: link };
  }
  await t.sendMail({ from: config.mailFrom || `NGK <${config.gmail.user}>`, to, subject, html, text });
  return {};
}

export function sendVerifyEmail(to, name, token) {
  const link = `${config.appUrl}/xac-minh-email?token=${encodeURIComponent(token)}`;
  return send(
    to,
    'Xác minh email tài khoản NGK',
    layout('Xác minh email của bạn', `Chào ${esc(name)}, bấm nút dưới đây để xác minh email cho tài khoản NGK. Liên kết có hiệu lực 24 giờ.`, link, 'Xác minh email'),
    `Xác minh email NGK: ${link}`,
    link,
  );
}

export function sendResetEmail(to, name, token) {
  const link = `${config.appUrl}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
  return send(
    to,
    'Đặt lại mật khẩu NGK',
    layout('Đặt lại mật khẩu', `Chào ${esc(name)}, có yêu cầu đặt lại mật khẩu cho tài khoản NGK của bạn. Liên kết có hiệu lực 30 phút và chỉ dùng được một lần.`, link, 'Đặt mật khẩu mới'),
    `Đặt lại mật khẩu NGK: ${link}`,
    link,
  );
}

export function sendEmailChange(to, name, token) {
  const link = `${config.appUrl}/xac-minh-email?token=${encodeURIComponent(token)}`;
  return send(
    to,
    'Xác nhận email mới cho tài khoản NGK',
    layout('Xác nhận email mới', `Chào ${esc(name)}, bấm nút dưới đây để dùng địa chỉ này làm email đăng nhập NGK. Liên kết có hiệu lực 24 giờ.`, link, 'Xác nhận email mới'),
    `Xác nhận email mới NGK: ${link}`,
    link,
  );
}

/**
 * THƯ BÁO BẢO MẬT (không cần bấm gì): tài khoản vừa đổi mật khẩu / email đăng nhập / gắn Google → chủ thật biết ngay nếu
 * không phải mình làm. Gửi ngầm: lỗi gửi thư chỉ ghi log, không làm hỏng thao tác chính.
 */
export function sendSecurityNotice(to, name, title, message) {
  const link = `${config.appUrl}/tai-khoan`;
  send(
    to,
    `${title} – tài khoản NGK`,
    layout(title, `Chào ${esc(name)}, ${esc(message)}`, link, 'Kiểm tra tài khoản', 'Nếu không phải bạn, hãy dùng “Quên mật khẩu” để đặt lại mật khẩu ngay và kiểm tra lại tài khoản.'),
    `${title}: ${message} Kiểm tra tài khoản: ${link}`,
    link,
  ).catch((e) => console.error(`[NGK] Không gửi được thư báo “${title}” tới ${maskEmail(to)}: ${e.message}`));
}

export const _sentMail = sent;
