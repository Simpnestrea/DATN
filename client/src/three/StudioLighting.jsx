// Môi trường phản chiếu "studio chụp trang sức" dựng bằng các tấm sáng (Lightformer).
// Không tải ảnh HDRI từ CDN → chạy offline, không phụ thuộc dịch vụ ngoài.
//
// Kim loại bóng không có màu "tự thân" – nó chỉ phản chiếu môi trường. Vì vậy môi trường phải có
// các mảng sáng LỚN (softbox) xen kẽ vùng tối để kim loại vừa sáng vừa có độ tương phản sang trọng.
import { Environment, Lightformer } from '@react-three/drei';

const TINTS = {
  studio: { key: '#ffffff', fill: '#f4f4f6', rim: '#ffffff', base: '#2a2a2f' },
  warm: { key: '#ffe6c4', fill: '#ffd6a6', rim: '#fff2df', base: '#33281f' },
  cool: { key: '#e4edff', fill: '#c6d8ff', rim: '#f3f7ff', base: '#1f2633' },
};

export function StudioLighting({ lighting = 'studio', matte = false }) {
  const t = TINTS[lighting] ?? TINTS.studio;
  return (
    <>
      {/* Chế độ dựng hình: giảm ánh sáng môi trường (chiếu đều mọi phía → khối trông phẳng) để đèn có hướng tạo khối */}
      <Environment key={lighting} resolution={256} frames={1} environmentIntensity={matte ? 0.22 : 1}>
        <color attach="background" args={[t.base]} />
        {/* softbox lớn phía trên */}
        <Lightformer form="rect" intensity={3} color={t.key} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        {/* softbox chếch trên–trước: cho kim loại có "thân" sáng nhưng mặt phẳng nhìn thẳng không bị trắng bệch */}
        <Lightformer form="rect" intensity={2} color={t.fill} position={[0, 4.5, 5.5]} rotation-x={-0.7} scale={[10, 3.5, 1]} />
        <Lightformer form="rect" intensity={0.35} color={t.fill} position={[0, 0, 7]} scale={[10, 3, 1]} />
        {/* hai dải sáng cao hai bên tạo đường viền sáng dọc thân */}
        <Lightformer form="rect" intensity={4} color={t.fill} position={[-6, 1, 0]} rotation-y={Math.PI / 2} scale={[3, 10, 1]} />
        <Lightformer form="rect" intensity={4} color={t.fill} position={[6, 1, 0]} rotation-y={-Math.PI / 2} scale={[3, 10, 1]} />
        {/* softbox phía sau – để mặt sau (chữ khắc mặt dây) khi xoay ra vẫn đủ sáng */}
        <Lightformer form="rect" intensity={1.6} color={t.key} position={[0, 3, -7]} rotation-y={Math.PI} scale={[10, 4, 1]} />
        {/* đèn điểm nhỏ – tạo các chấm lấp lánh trên mặt giác của đá */}
        <Lightformer form="circle" intensity={8} color={t.rim} position={[3, 4, 5]} scale={0.7} />
        <Lightformer form="circle" intensity={8} color={t.rim} position={[-3.5, 3, 5]} scale={0.5} />
        <Lightformer form="circle" intensity={6} color={t.rim} position={[0, 5, 3]} scale={0.5} />
        <Lightformer form="ring" intensity={3} color={t.rim} position={[0, 2, 6]} scale={2} />
        {/* phản quang từ mặt bàn */}
        <Lightformer form="rect" intensity={1} color={t.key} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      <ambientLight intensity={matte ? 0.12 : 0.2} />
      <directionalLight position={[4, 8, 6]} intensity={matte ? 1.5 : 0.8} color={t.key} />
      {/* chế độ dựng hình (tắt bóng): thêm đèn phụ phía đối diện để mặt khuất không tối đen */}
      {matte && <directionalLight position={[-6, 3, -4]} intensity={0.45} color={t.fill} />}
      {/* "MỒI" BẢN ĐỒ PHẢN CHIẾU: three.js chỉ lọc môi trường (PMREM – shader nặng, ~0,5 giây lần đầu) khi có vật liệu kim
          loại đầu tiên cần nó. Cảnh Tự tạo lúc mở còn trống → việc này từng xảy ra đúng lúc bấm thêm khối đầu tiên (khựng).
          Lưới ẩn này cho FrameScheduler làm việc đó ngay khi tải cảnh. Nằm ngoài mô hình: không ảnh hưởng căn khung / bóng / chọn khối. */}
      <mesh visible={false} frustumCulled={false} raycast={() => null}>
        <boxGeometry args={[0.001, 0.001, 0.001]} />
        <meshStandardMaterial metalness={1} roughness={0.2} />
      </mesh>
    </>
  );
}
