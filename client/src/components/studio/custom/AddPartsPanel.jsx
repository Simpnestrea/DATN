// Bảng "Thêm khối": bấm một khối để thả vào khung dựng.
import { PART_KINDS } from '@ngk/shared';
import { PartIcon } from '../../icons.jsx';
import { Notice, SectionTitle } from '../../ui/controls.jsx';
import { addPart, addText } from '../../../three/custom/customOps.js';
import { useCustomStore } from '../../../store/customStore.js';

const CATEGORIES = [
  { code: 'basic', name: 'Khối cơ bản' },
  { code: 'jewelry', name: 'Khối trang sức' },
  { code: 'gem', name: 'Đá quý' },
  { code: 'draw', name: 'Tự vẽ' },
];

export function AddPartsPanel() {
  return (
    <div className="space-y-6">
      <Notice tone="gold">
        Ghép các khối để tạo món trang sức của riêng bạn. Bấm khối để thêm – khối mới xuất hiện <b>ngay chỗ bạn đang nhìn</b> (giữa màn hình) – trên bề mặt vật hoặc trên lưới. Sau đó dùng <b>tay cầm</b> trên mô hình để kéo / xoay / co
        giãn, hoặc nhập số chính xác ở tab “Thuộc tính”. Đơn vị: mm.
      </Notice>
      {CATEGORIES.map((cat) => (
        <div key={cat.code} className="space-y-3">
          <SectionTitle>{cat.name}</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {PART_KINDS.filter((k) => k.category === cat.code).map((k) => (
              <button
                key={k.code}
                type="button"
                onClick={() =>
                  k.code === 'sketch'
                    ? useCustomStore.getState().openSketch()
                    : k.code === 'text'
                      ? addText()
                      : k.code === 'wire'
                        ? useCustomStore.getState().startWireDraw()
                        : addPart(k.code)
                }
                className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 px-1 py-3 text-[11px] text-cream-300 transition-all hover:-translate-y-0.5 hover:border-gold-500/60 hover:text-gold-200"
              >
                <PartIcon kind={k.code} />
                {k.code === 'sketch' ? 'Vẽ hình 2D' : k.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-1.5 text-xs leading-relaxed text-cream-600">
        <p>
          <b className="text-cream-300">Gợi ý tạo nhẫn:</b> thêm “Đai tròn” (đường kính trong 16.6 mm ≈ size 12), thêm “Viên đá”, rồi bật chế độ
          <b className="text-cream-300"> Đặt lên bề mặt</b> và bấm lên đỉnh đai.
        </p>
        <p>
          <b className="text-cream-300">Chuột:</b> Shift + kéo khối = di chuyển tự do · Ctrl + kéo nền = kéo màn hình · Ctrl + kéo khối = xoay tự do · Alt + kéo khối = kéo giãn · Alt + kéo nền = chọn vùng.
        </p>
        <p>
          <b className="text-cream-300">Tạo hình:</b> chọn một khối → tab Thuộc tính → <b className="text-cream-300">Bật cọ gọt</b> rồi bấm / kéo lên khối để xoá bớt vật liệu từ phía bạn đang nhìn; có thêm <b className="text-cream-300">Làm rỗng</b> và <b className="text-cream-300">Cắt phẳng</b>.
        </p>
        <p>
          <b className="text-cream-300">Tự vẽ:</b> “Vẽ hình 2D” mở bảng vẽ – vẽ tay hoặc dùng hình mẫu, vẽ hình nằm trong hình khác để đục lỗ, rồi bấm Tạo khối. Sửa lại lúc nào cũng được ở tab Thuộc tính → <b className="text-cream-300">Sửa hình vẽ 2D</b>. “Chữ” tạo khối chữ (tiếng Việt có dấu, 3 kiểu chữ) – gõ nội dung ở tab Thuộc tính. “Sợi kim loại”: bấm lần lượt lên bề mặt khối / mặt lưới để đặt các điểm, sợi cong mượt chạy qua – bấm đúp hoặc Enter để xong.
        </p>
        <p>
          <b className="text-cream-300">Phím tắt:</b> W/E/R tay cầm di chuyển/xoay/co giãn · Ctrl+D nhân bản · Delete xóa · Ctrl+G nhóm · Esc bỏ chọn.
        </p>
      </div>
    </div>
  );
}
