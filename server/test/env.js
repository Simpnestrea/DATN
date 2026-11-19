// Nạp ĐẦU TIÊN trong mỗi file kiểm thử: lệnh import được thực hiện trước mọi dòng code khác của file,
// nên phải đặt chế độ test ở module riêng để config.js đọc được (giới hạn số lần gọi, email giả...).
process.env.NODE_ENV = 'test';
