// NÂNG CẤP DỮ LIỆU CŨ khi khởi động (chạy lại nhiều lần vẫn an toàn):
//  - tài khoản tạo trước GĐ3 chưa có tên riêng / tên bỏ dấu → tự gợi ý từ tên hiển thị
//  - thiết kế chưa có savedType (loại của phiên bản đã lưu) → lấy theo loại hiện tại
//  - bình luận chưa có nội dung bỏ dấu (tạo trước GĐ4) → điền để quản trị viên tìm không dấu
import { fold } from './lib.js';
import { Comment, Design, User } from './models.js';

export async function migrate() {
  const users = await User.find({ $or: [{ handle: { $exists: false } }, { handle: null }, { nameNorm: { $in: [null, ''] } }] });
  for (const u of users) await u.save(); // hook pre('save') điền tên riêng + tên bỏ dấu
  const d = await Design.updateMany({ $or: [{ savedType: null }, { savedType: { $exists: false } }] }, [{ $set: { savedType: '$type' } }], { updatePipeline: true });
  const comments = await Comment.find({ $or: [{ norm: { $exists: false } }, { norm: '', body: { $ne: '' } }] }, { body: 1 }).lean();
  if (comments.length) {
    await Comment.bulkWrite(comments.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { norm: fold(c.body) } }, timestamps: false } })));
  }
  return { users: users.length, designs: d.modifiedCount, comments: comments.length };
}
