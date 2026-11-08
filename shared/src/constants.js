// Hằng số dùng chung cho toàn hệ thống NGK.
// Kiểu dáng, giác cắt, kiểu ổ... là những thứ gắn liền với code dựng hình 3D,
// nên được định nghĩa ở đây (admin chỉ bật/tắt, đổi tên hiển thị – xem catalog/styles.json).

export const SCHEMA_VERSION = 1;

export const JEWELRY_TYPES = [
  { code: 'ring', name: 'Nhẫn' },
  { code: 'bracelet', name: 'Vòng tay' },
  { code: 'necklace', name: 'Vòng cổ' },
  { code: 'earrings', name: 'Khuyên tai' },
  { code: 'pendant', name: 'Mặt dây' },
  { code: 'custom', name: 'Tự tạo' },
];
export const TYPE_CODES = JEWELRY_TYPES.map((t) => t.code);

export const STYLE_CODES = {
  ring: ['plain', 'solitaire', 'halo', 'three-stone', 'eternity', 'twist'],
  bracelet: ['bangle', 'cuff', 'chain', 'charm', 'tennis'],
  necklace: ['cable', 'box', 'bead', 'snake'],
  earrings: ['stud', 'hoop', 'drop'],
  pendant: ['round', 'teardrop', 'heart', 'star', 'bar', 'solitaire'],
  custom: ['free'],
};

export const FINISHES = [
  { code: 'polished', name: 'Bóng gương', roughnessAdd: 0 },
  { code: 'brushed', name: 'Xước mờ', roughnessAdd: 0.2 },
  { code: 'matte', name: 'Mờ (matte)', roughnessAdd: 0.4 },
];
export const FINISH_CODES = FINISHES.map((f) => f.code);

// aspect = chiều dài / chiều rộng của viên đá
export const CUTS = [
  { code: 'round', name: 'Tròn', aspect: 1 },
  { code: 'oval', name: 'Oval', aspect: 1.35 },
  { code: 'princess', name: 'Công chúa', aspect: 1 },
  { code: 'emerald', name: 'Emerald', aspect: 1.4 },
  { code: 'pear', name: 'Giọt nước', aspect: 1.5 },
  { code: 'heart', name: 'Trái tim', aspect: 0.95 },
];
export const CUT_CODES = CUTS.map((c) => c.code);

export const SETTINGS = [
  { code: 'prong4', name: '4 chấu' },
  { code: 'prong6', name: '6 chấu' },
  { code: 'bezel', name: 'Ổ bao' },
];
// 'peg' (chốt) chỉ dành cho ngọc trai, người dùng không chọn trực tiếp.
export const SETTING_CODES = [...SETTINGS.map((s) => s.code), 'peg'];

export const RING_PROFILES = [
  { code: 'comfort', name: 'Bo tròn' },
  { code: 'flat', name: 'Phẳng' },
  { code: 'knife', name: 'Sống dao' },
];

export const RING_PATTERNS = [
  { code: 'none', name: 'Không' },
  { code: 'milgrain', name: 'Viền hạt' },
  { code: 'ridges', name: 'Gờ viền' },
];

export const CHARM_SHAPES = [
  { code: 'heart', name: 'Trái tim' },
  { code: 'star', name: 'Ngôi sao' },
  { code: 'round', name: 'Tròn' },
  { code: 'mixed', name: 'Kết hợp' },
];

// Hình dạng mặt dây – dùng chung cho Vòng cổ và Mặt dây riêng
export const PENDANT_SHAPES = [
  { code: 'round', name: 'Tròn' },
  { code: 'teardrop', name: 'Giọt nước' },
  { code: 'heart', name: 'Trái tim' },
  { code: 'star', name: 'Ngôi sao' },
  { code: 'bar', name: 'Thanh dọc' },
  { code: 'solitaire', name: 'Giọt đá' },
];
export const PENDANT_SHAPE_CODES = PENDANT_SHAPES.map((s) => s.code);
// Những dáng có thể làm rỗng (chỉ còn viền)
export const HOLLOW_SHAPES = ['round', 'teardrop', 'heart', 'star'];

export const BAIL_STYLES = [
  { code: 'simple', name: 'Móc trơn' },
  { code: 'gem', name: 'Móc đính đá' },
];

export const NECKLACE_LENGTHS = [
  { value: 400, name: 'Choker' },
  { value: 450, name: 'Princess' },
  { value: 500, name: 'Cổ điển' },
  { value: 550, name: 'Matinee' },
  { value: 700, name: 'Opera' },
];

// Giới hạn kích thước (đơn vị mm, riêng ringSize là số size VN)
export const LIMITS = {
  ring: { ringSize: [1, 30], bandWidth: [1.5, 8], bandThickness: [1.2, 3], gemSize: [3, 12] },
  bracelet: { circumference: [140, 230], width: [2, 14], thickness: [1.2, 4], gemSize: [2, 10], charmCount: [1, 10] },
  necklace: { length: [350, 800], chainThickness: [0.8, 4], pendantSize: [8, 35], gemSize: [2, 12] },
  earrings: { hoopDiameter: [8, 50], dropLength: [12, 60], thickness: [0.8, 4], gemSize: [2, 10] },
  pendant: { pendantSize: [8, 40], thickness: [1, 4], gemSize: [2, 14] },
  custom: { gemSize: [2, 14] }, // thiết kế tự tạo: kích thước nằm trong từng khối
};
export const ENGRAVING_MAX = 20;

// ---- Quy đổi size nhẫn ----
// Size nhẫn Việt Nam: chu vi trong (mm) ≈ 40 + size.
export function ringSizeToCircumference(vnSize) {
  return 40 + vnSize;
}
export function ringSizeToDiameter(vnSize) {
  return ringSizeToCircumference(vnSize) / Math.PI;
}
// Size Mỹ: đường kính (mm) ≈ 11.63 + 0.8128 × size, làm tròn 0.5
export function diameterToUsSize(diameterMm) {
  const us = (diameterMm - 11.63) / 0.8128;
  return Math.max(0, Math.round(us * 2) / 2);
}
