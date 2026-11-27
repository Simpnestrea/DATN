// XOÁ TÀI KHOẢN VĨNH VIỄN cùng mọi dữ liệu liên quan – dùng cho quản trị viên xoá tài khoản và lệnh xoá dữ liệu mẫu.
// Giữ đúng số liệu của người KHÁC: lượt thích / bình luận trên thiết kế của họ được đếm lại; bình luận gốc mà người khác
// đã trả lời thì giữ chỗ "đã bị xoá" (không làm mất ngữ cảnh chuỗi trả lời).
import { AccessRequest, Comment, Design, Image, Like, Notification, OneTimeToken, Report, Session, User, VISIBLE_COMMENT } from './models.js';
import { deleteDesignCascade } from './routes/designs.js';

/** @returns { user, designs } (null nếu không có tài khoản) */
export async function deleteUserCascade(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  const id = user._id;

  // 1) thiết kế của người này – kèm phiên bản, ảnh, lượt thích, bình luận, thông báo, báo cáo trên các thiết kế đó
  const designs = await Design.find({ owner: id }, { _id: 1, remixOf: 1 });
  for (const d of designs) await deleteDesignCascade(d);

  // 2) lượt thích + bình luận của người này trên thiết kế của người khác
  const likedDesigns = await Like.distinct('design', { user: id });
  await Like.deleteMany({ user: id });
  const comments = await Comment.find({ author: id }, { _id: 1, design: 1, parent: 1 });
  const commentIds = comments.map((c) => c._id);
  await Comment.deleteMany({ author: id, parent: { $ne: null } }); // câu trả lời của người này
  // (đếm trả lời luôn kèm `design` → dùng được index { design, parent, createdAt }, không quét cả bảng bình luận)
  for (const c of comments.filter((x) => !x.parent)) {
    const others = await Comment.countDocuments({ design: c.design, parent: c._id });
    if (others > 0) await Comment.updateOne({ _id: c._id }, { deleted: true, body: '', replyCount: others });
    else await Comment.deleteOne({ _id: c._id });
  }
  // bình luận gốc (của người khác) mà người này từng trả lời: đếm lại số trả lời; chỗ giữ "đã bị xoá" hết trả lời → dọn
  const parents = new Map(comments.filter((c) => c.parent).map((c) => [String(c.parent), c.design])); // trả lời cùng thiết kế với bình luận gốc
  for (const [p, design] of parents) {
    const n = await Comment.countDocuments({ design, parent: p });
    const doc = await Comment.findByIdAndUpdate(p, { replyCount: n }, { returnDocument: 'after', timestamps: false });
    if (doc?.deleted && n === 0) await Comment.deleteOne({ _id: p });
  }
  const touched = new Set([...likedDesigns.map(String), ...comments.map((c) => String(c.design))]);
  for (const d of touched) {
    await Design.updateOne(
      { _id: d },
      { likeCount: await Like.countDocuments({ design: d }), commentCount: await Comment.countDocuments({ design: d, ...VISIBLE_COMMENT }) },
      { timestamps: false },
    );
  }

  // 3) thông báo: gửi cho người này / về bình luận của người này → xoá; có tên trong nhóm "A và 3 người khác…" → rút tên
  await Notification.deleteMany({ $or: [{ user: id }, { comment: { $in: commentIds } }] });
  await Notification.updateMany({ actors: id }, { $pull: { actors: id }, $inc: { actorCount: -1 } }, { timestamps: false });
  await Notification.deleteMany({ actors: { $size: 0 } });

  // 4) báo cáo do người này gửi / về bình luận của người này; ảnh, phiên đăng nhập, mã một lần
  await Promise.all([
    Report.deleteMany({ $or: [{ reporter: id }, { targetType: 'comment', target: { $in: commentIds } }] }),
    Image.deleteMany({ owner: id }),
    Session.deleteMany({ user: id }),
    OneTimeToken.deleteMany({ user: id }),
    AccessRequest.deleteMany({ $or: [{ owner: id }, { admin: id }] }),
  ]);
  await User.deleteOne({ _id: id });
  return { user, designs: designs.length };
}
