// XEM TRƯỚC KHI DÁN LINK (Facebook, Zalo, Messenger…): các trang này không chạy JavaScript, chỉ đọc thẻ <meta> trong HTML.
// Máy chủ chèn sẵn tiêu đề / mô tả / ảnh của thiết kế vào trang /thiet-ke/:id (chỉ thiết kế Có liên kết / Công khai).
import { JEWELRY_TYPES } from '@ngk/shared';
import { config } from './config.js';
import { escapeHtml as esc, excerpt } from './lib.js';
import { Design, User } from './models.js';

/** Chèn thẻ meta vào HTML trang web (thay <title>, thêm trước </head>). */
export function injectMeta(html, { title, description, image, url }) {
  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'NGK – Thiết kế trang sức 3D'],
    ['og:title', title],
    ['og:description', description],
    ['og:url', url],
    ...(image ? [['og:image', image], ['og:image:alt', title]] : []),
  ]
    .map(([p, c]) => `<meta property="${p}" content="${esc(c)}" />`)
    .concat([
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="description" content="${esc(description)}" />`,
      `<link rel="canonical" href="${esc(url)}" />`,
    ])
    .join('\n    ');
  // thay bằng HÀM, không bằng chuỗi: trong chuỗi thay thế, "$'" / "$`" / "$&" là mẫu đặc biệt của JavaScript → tên thiết kế
  // chứa các ký tự đó sẽ chép cả đoạn HTML khác của trang vào thẻ meta (phá vỡ trang khi dán link)
  const withTitle = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(title)}</title>`);
  return withTitle.replace(/<\/head>/i, () => `    ${tags}\n  </head>`);
}

/** Thông tin xem trước của một thiết kế (null nếu không công khai / không tồn tại). */
export async function shareMeta(id) {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const d = await Design.findById(id, { name: 1, description: 1, owner: 1, visibility: 1, lastVersion: 1, thumbnail: 1, savedType: 1, type: 1, likeCount: 1, ownerLocked: 1, modHidden: 1 });
  if (!d || d.visibility === 'private' || !d.lastVersion || d.ownerLocked || d.modHidden) return null;
  const owner = await User.findById(d.owner, { displayName: 1 });
  const typeName = JEWELRY_TYPES.find((t) => t.code === (d.savedType ?? d.type))?.name ?? 'Trang sức';
  const desc = d.description?.trim() || `${typeName} thiết kế 3D bởi ${owner?.displayName ?? 'một thành viên NGK'} · ${d.likeCount ?? 0} lượt thích`;
  return {
    title: `${d.name} – ${owner?.displayName ?? 'NGK'} | NGK`,
    description: excerpt(desc, 200),
    image: d.thumbnail ? `${config.appUrl}/api/images/${d.thumbnail}` : null,
    url: `${config.appUrl}/thiet-ke/${d._id}`,
  };
}
