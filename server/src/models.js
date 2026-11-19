// CÁC BẢNG DỮ LIỆU (MongoDB / Mongoose).
import mongoose from 'mongoose';
import { fold, handleBase } from './lib.js';

const { Schema, model } = mongoose;
mongoose.set('strictQuery', true); // điều kiện truy vấn có trường lạ → bỏ qua (chống chèn toán tử)

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    emailVerified: { type: Boolean, default: false },
    passwordHash: { type: String, default: null }, // null = tài khoản chỉ đăng nhập bằng Google
    googleId: { type: String, default: undefined },
    displayName: { type: String, required: true, trim: true, maxlength: 50 },
    avatarImage: { type: Schema.Types.ObjectId, ref: 'Image', default: null }, // ảnh tự tải lên
    googlePicture: { type: String, default: null, maxlength: 500 }, // ảnh hồ sơ Google (dùng khi chưa tải ảnh riêng)
    nameNorm: { type: String, default: '' }, // tên bỏ dấu – tìm tác giả không dấu
    // TÊN RIÊNG (đường dẫn hồ sơ /@ten-rieng): chữ thường, số, dấu chấm, gạch dưới; không trùng
    handle: { type: String, lowercase: true, trim: true, maxlength: 30 },
    bio: { type: String, default: '', maxlength: 300 },
    // tài khoản MẪU (dữ liệu minh hoạ do lệnh seed:demo tạo) – có nhãn trên hồ sơ, không đăng nhập được, xoá được bằng 1 lệnh
    demo: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    // chống dò mật khẩu: khoá tạm sau nhiều lần sai
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    // BỊ QUẢN TRỊ VIÊN KHOÁ (khác khoá tạm do sai mật khẩu): không đăng nhập được, nội dung công khai tạm ẩn
    lockedAt: { type: Date, default: null },
    lockReason: { type: String, default: '', maxlength: 300 },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastLoginAt: { type: Date, default: null }, // lần đăng nhập gần nhất (mọi cách)
    lastSeenAt: { type: Date, default: null }, // lần hoạt động gần nhất (đăng nhập / gia hạn phiên)
  },
  { timestamps: true },
);
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
userSchema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });

/** Tên riêng chưa ai dùng, gợi ý từ tên hiển thị (kiet.nguyen, kiet.nguyen2, …). */
export async function uniqueHandle(displayName, excludeId = null) {
  const base = handleBase(displayName);
  for (let i = 0; i < 50; i++) {
    const suffix = i === 0 ? '' : String(i < 10 ? i + 1 : Math.floor(Math.random() * 9000) + 1000);
    const h = (base.slice(0, 30 - suffix.length) + suffix).replace(/[._]+$/, '') || `nguoidung${suffix}`;
    const taken = await User.exists({ handle: h, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!taken) return h;
  }
  return `u${Date.now().toString(36)}`;
}
userSchema.pre('save', async function () {
  if (this.isModified('displayName') || !this.nameNorm) this.nameNorm = fold(this.displayName);
  if (!this.handle) this.handle = await uniqueHandle(this.displayName, this._id);
});
export const User = model('User', userSchema);

// Phiên đăng nhập = 1 mã gia hạn (refresh token) – chỉ lưu bản BĂM. Mỗi lần gia hạn đổi mã mới (xoay vòng).
const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    prevHash: { type: String, default: null, index: true }, // mã ngay trước – phát hiện mã cũ bị dùng lại
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB tự xoá phiên hết hạn
export const Session = model('Session', sessionSchema);

// Mã dùng một lần gửi qua email: xác minh email, đặt lại mật khẩu, đổi email
const tokenSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['verify', 'reset', 'email-change'], required: true },
  hash: { type: String, required: true, unique: true },
  data: { type: String, default: null }, // email mới (đổi email)
  expiresAt: { type: Date, required: true },
});
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OneTimeToken = model('OneTimeToken', tokenSchema);

// Ảnh (ảnh đại diện thiết kế / phiên bản, ảnh hồ sơ) lưu thẳng trong MongoDB – đã nén ở trình duyệt
const imageSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['avatar', 'thumb'], required: true },
    design: { type: Schema.Types.ObjectId, ref: 'Design', default: null, index: true },
    mime: { type: String, enum: ['image/webp', 'image/png', 'image/jpeg'], required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);
export const Image = model('Image', imageSchema);

// một lần xử lý của quản trị viên (ẩn thiết kế / gỡ bình luận): lúc nào, vì sao, ai làm
const moderationSchema = new Schema(
  {
    at: { type: Date, required: true },
    reason: { type: String, default: '', maxlength: 300 },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const designSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 80 },
    nameNorm: { type: String, required: true }, // tên bỏ dấu, chữ thường – để tìm kiếm không dấu
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true }, // bản hiện tại (nháp tự đồng bộ)
    revision: { type: Number, default: 1 }, // tăng mỗi lần ghi – phát hiện 2 tab cùng sửa
    thumbnail: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
    versionCount: { type: Number, default: 0 },
    lastVersion: { type: Number, default: 0 }, // số thứ tự phiên bản gần nhất (tăng dần, không dùng lại)
    lastSavedAt: { type: Date, default: null },
    // ── CHIA SẺ (GĐ3) ── người xem luôn thấy PHIÊN BẢN ĐÃ LƯU GẦN NHẤT (lastVersion), không thấy bản nháp
    visibility: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private' },
    savedType: { type: String, default: null }, // loại trang sức của phiên bản đã lưu gần nhất (lọc ở Khám phá)
    description: { type: String, default: '', maxlength: 500 },
    allowRemix: { type: Boolean, default: true },
    allowComments: { type: Boolean, default: true },
    publishedAt: { type: Date, default: null }, // lúc chuyển sang Công khai (sắp xếp "Mới nhất")
    // ghi công khi là bản remix – lưu sẵn tên + tác giả gốc (vẫn hiện đúng dù bản gốc bị đổi tên / ẩn / xoá); không sửa được
    remixOf: {
      type: new Schema(
        {
          design: { type: Schema.Types.ObjectId, ref: 'Design' },
          owner: { type: Schema.Types.ObjectId, ref: 'User' },
          name: String,
          ownerName: String,
          ownerHandle: String,
        },
        { _id: false },
      ),
      default: null,
    },
    likeCount: { type: Number, default: 0 },
    remixCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    // chủ thiết kế đang bị quản trị viên khoá → ẩn khỏi cộng đồng (ghi sẵn ở đây để truy vấn Khám phá không phải nối bảng)
    ownerLocked: { type: Boolean, default: false },
    // BỊ QUẢN TRỊ VIÊN ẨN (vi phạm): chỉ chủ + quản trị viên xem được; chủ không tự công khai lại được
    modHidden: { type: moderationSchema, default: null },
    // "NGK CHỌN": quản trị viên chọn là thiết kế xuất sắc (huy hiệu + mục riêng ở trang chủ / Khám phá)
    featuredAt: { type: Date, default: null },
    featuredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);
designSchema.index({ owner: 1, updatedAt: -1 });
designSchema.index({ visibility: 1, featuredAt: -1 });
designSchema.index({ visibility: 1, publishedAt: -1 });
designSchema.index({ visibility: 1, likeCount: -1 });
designSchema.index({ 'remixOf.design': 1 });
export const Design = model('Design', designSchema);

const versionSchema = new Schema(
  {
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    n: { type: Number, required: true },
    name: { type: String, maxlength: 80 },
    note: { type: String, default: '', maxlength: 200 },
    config: { type: Schema.Types.Mixed, required: true },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);
versionSchema.index({ design: 1, n: -1 }, { unique: true });
export const Version = model('Version', versionSchema);

// ── CỘNG ĐỒNG (GĐ3) ─────────────────────────────────────────────────────────────────────────────

const likeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
likeSchema.index({ user: 1, design: 1 }, { unique: true }); // mỗi người thích 1 lần
likeSchema.index({ design: 1, createdAt: -1 }); // đếm lượt thích trong 7 ngày (Nổi bật tuần)
likeSchema.index({ user: 1, createdAt: -1 }); // tab "Đã thích" của hồ sơ
export const Like = model('Like', likeSchema);

// Bình luận: trả lời 1 cấp (parent = bình luận gốc). Bình luận gốc còn câu trả lời mà bị xoá → giữ chỗ "đã bị xoá".
const commentSchema = new Schema(
  {
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    body: { type: String, default: '', maxlength: 1000 },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    replyCount: { type: Number, default: 0 },
    // BỊ QUẢN TRỊ VIÊN GỠ: mọi người thấy "Bình luận đã bị quản trị viên gỡ" (khôi phục được); không tính vào số bình luận
    modRemoved: { type: moderationSchema, default: null },
    norm: { type: String, default: '' }, // nội dung bỏ dấu – quản trị viên tìm không dấu
  },
  { timestamps: true },
);
commentSchema.index({ design: 1, parent: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 }); // bình luận của một người (trang quản trị, xoá tài khoản)
commentSchema.pre('save', function () {
  if (this.isModified('body') || this.isNew) this.norm = fold(this.body);
});
export const Comment = model('Comment', commentSchema);
/** Điều kiện "bình luận đang hiển thị" – dùng khi đếm lại số bình luận của một thiết kế. */
export const VISIBLE_COMMENT = { deleted: false, modRemoved: null };

// Báo cáo vi phạm – quản trị viên xử lý ở GĐ4
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['design', 'comment'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
    reason: { type: String, enum: ['spam', 'offensive', 'copyright', 'other'], required: true },
    note: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    // quản trị viên xử lý: ẩn thiết kế / gỡ bình luận / bỏ qua / khoá người đăng / nội dung đã tự mất
    resolution: { type: String, enum: ['hide', 'remove', 'dismiss', 'lock', 'gone', null], default: null },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
reportSchema.index({ status: 1, handledAt: -1 });
reportSchema.index({ target: 1, status: 1 });
reportSchema.index({ reporter: 1, targetType: 1, target: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
export const Report = model('Report', reportSchema);

// Thông báo trong web (chuông). Lượt thích chưa đọc trên cùng 1 thiết kế được GỘP: "A và 3 người khác đã thích…"
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // người nhận
    // moderation: quản trị viên ẩn / hiện lại thiết kế, gỡ / khôi phục bình luận · featured: được "NGK chọn"
    // access-request: quản trị viên xin xem thiết kế riêng tư (chủ trả lời ngay trong chuông) · access-result: kết quả gửi admin
    type: { type: String, enum: ['like', 'comment', 'reply', 'remix', 'moderation', 'featured', 'access-request', 'access-result'], required: true },
    kind: { type: String, default: null }, // chi tiết: design-hidden, design-restored, comment-removed, comment-restored, approved, declined, revoked
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
    comment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    remix: { type: Schema.Types.ObjectId, ref: 'Design', default: null }, // bản remix mới tạo
    request: { type: Schema.Types.ObjectId, ref: 'AccessRequest', default: null },
    actors: [{ type: Schema.Types.ObjectId, ref: 'User' }], // tối đa 3 người gần nhất
    actorCount: { type: Number, default: 1 },
    preview: { type: String, default: '', maxlength: 140 }, // trích đoạn bình luận
    reason: { type: String, default: '', maxlength: 300 }, // lý do của quản trị viên
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, updatedAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
// xoá thông báo theo bình luận (khi bình luận bị xoá). Index thường: index "một phần" ($type) không được MongoDB dùng
// cho truy vấn bằng (đã kiểm chứng bằng explain trong test/hardening.test.js)
notificationSchema.index({ comment: 1 });
notificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // tự xoá sau 90 ngày
export const Notification = model('Notification', notificationSchema);

// ── QUẢN TRỊ (GĐ4) ──────────────────────────────────────────────────────────────────────────────

// NHẬT KÝ QUẢN TRỊ: mọi thao tác của quản trị viên (kể cả lệnh cấp / thu quyền trên máy chủ).
// CHỈ GHI THÊM: ứng dụng không có cách sửa hay xoá một dòng nhật ký (các lệnh sửa / xoá bị chặn ngay trong mô hình).
const adminLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = lệnh chạy trên máy chủ
    actorName: { type: String, default: '' }, // lưu sẵn – vẫn đúng khi tài khoản đổi tên / bị xoá
    action: { type: String, required: true }, // vd. user.lock, user.unlock, user.delete, admin.grant, admin.revoke
    targetType: { type: String, default: null }, // user | design | comment | …
    target: { type: Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: '' }, // lưu sẵn tên đối tượng (đối tượng bị xoá vẫn đọc được)
    reason: { type: String, default: '', maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: null },
    norm: { type: String, default: '' }, // chữ bỏ dấu để tìm kiếm
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ target: 1, createdAt: -1 });
adminLogSchema.index({ actor: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
const immutable = () => {
  throw new Error('Nhật ký quản trị chỉ được ghi thêm – không sửa, không xoá');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  adminLogSchema.pre(op, immutable);
}
adminLogSchema.pre('deleteOne', { document: true, query: false }, immutable);
adminLogSchema.pre('save', function () {
  if (!this.isNew) immutable();
  this.norm = fold(`${this.actorName} ${this.targetLabel} ${this.reason}`);
});
export const AdminLog = model('AdminLog', adminLogSchema);

// XIN QUYỀN XEM THIẾT KẾ RIÊNG TƯ: quản trị viên xin (kèm lý do) → chủ thiết kế đồng ý / từ chối ngay trong chuông thông báo.
// Đồng ý → quản trị viên xem (chỉ đọc) trong 7 ngày; chủ thu hồi được bất cứ lúc nào. Hết hạn = approved + expiresAt đã qua.
const accessRequestSchema = new Schema(
  {
    design: { type: Schema.Types.ObjectId, ref: 'Design', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: ['pending', 'approved', 'declined', 'revoked'], default: 'pending' },
    respondedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);
accessRequestSchema.index({ owner: 1, createdAt: -1 });
accessRequestSchema.index({ admin: 1, design: 1, createdAt: -1 });
export const AccessRequest = model('AccessRequest', accessRequestSchema);

// ── DANH MỤC (GĐ4c): kim loại + đá quý do quản trị viên quản lý. Mã (code) cố định sau khi tạo (thiết kế lưu theo mã);
// không xoá – chỉ ẨN (không chọn được nữa, thiết kế cũ vẫn hiển thị đúng). Kiểu dáng + mẫu gợi ý vẫn nằm trong code.
const materialSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, maxlength: 40 },
    name: { type: String, required: true, maxlength: 40 },
    group: { type: String, default: 'other' }, // gold | silver | platinum | titanium | other
    description: { type: String, default: '', maxlength: 200 },
    color: { type: String, required: true },
    metalness: { type: Number, default: 1 },
    roughness: { type: Number, default: 0.12 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Material = model('Material', materialSchema);

const gemstoneSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, maxlength: 40 },
    name: { type: String, required: true, maxlength: 40 },
    kind: { type: String, enum: ['faceted', 'pearl'], default: 'faceted' }, // cố định sau khi tạo (ngọc trai có quy tắc riêng)
    description: { type: String, default: '', maxlength: 200 },
    color: { type: String, required: true },
    ior: { type: Number, default: 1.6 }, // chiết suất – độ lấp lánh
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Gemstone = model('Gemstone', gemstoneSchema);
