// BÓNG ĐỔ MỀM dưới vật thể (thay ContactShadows của drei, cùng cách làm: chụp độ sâu vật thể từ mặt sàn nhìn lên rồi làm mờ).
// Vì sao không dùng drei: mỗi lần đổi cỡ bóng (đổi loại trang sức, kéo thanh trượt kích thước) drei tạo MỚI 2 vùng đệm 512² +
// hình khối + 3 vật liệu và không bao giờ giải phóng bản cũ → bộ nhớ GPU tăng mãi (đo: đổi loại 30 lần → +24 texture,
// +13 hình khối). Lượt làm mờ của drei còn vẽ ở gốc toạ độ thay vì dưới chỗ đặt bóng → thiết kế Tự tạo không nằm giữa lưới
// thì mất hẳn bóng (đo: khối đặt ở x = 10 mm → vùng đệm bóng trống).
// Ở đây: vùng đệm + vật liệu tạo MỘT lần cho mỗi khung 3D (gỡ bóng rồi gắn lại – nhẫn → vòng cổ → nhẫn – dùng lại ngay, không
// biên dịch lại shader; mất cùng ngữ cảnh WebGL khi rời trang). Đổi cỡ chỉ đổi khung camera chụp bóng + tỉ lệ mặt bóng.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // lượt làm mờ: một tam giác phủ kín vùng đệm
const savedClear = new THREE.Color();

const blurMaterial = (shader) =>
  new THREE.ShaderMaterial({ ...shader, uniforms: THREE.UniformsUtils.clone(shader.uniforms), depthTest: false, depthWrite: false });

function createResources(resolution) {
  const target = new THREE.WebGLRenderTarget(resolution, resolution, { depthBuffer: false });
  const temp = new THREE.WebGLRenderTarget(resolution, resolution, { depthBuffer: false });
  // độ sâu → màu đen, càng sát sàn càng đậm; phần nằm dưới mặt sàn (floor = vị trí mặt sàn trong dải độ sâu) đậm nhất
  const floor = { value: 0 };
  const depth = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uFloor = floor;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFloor;\nvoid main() {')
      .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( vec3( 0.0 ), 1.0 - clamp( ( fragCoordZ - uFloor ) / ( 1.0 - uFloor ), 0.0, 1.0 ) );');
  };
  const blurH = blurMaterial(HorizontalBlurShader);
  const blurV = blurMaterial(VerticalBlurShader);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const quad = new THREE.Mesh(tri, blurH);
  quad.frustumCulled = false;
  return { resolution, target, temp, depth, floor, blurH, blurV, quad, dispose: () => [target, temp, depth, blurH, blurV, tri].forEach((r) => r.dispose()) };
}

const shared = new WeakMap(); // renderer → tài nguyên bóng (mỗi khung 3D chỉ có một bóng sàn)
function resourcesFor(gl, resolution) {
  let r = shared.get(gl);
  if (r?.resolution !== resolution) {
    r?.dispose();
    shared.set(gl, (r = createResources(resolution)));
  }
  return r;
}

/**
 * @param position tâm mặt bóng [x, y, z] (trên mặt sàn)
 * @param size     cạnh vùng bóng (đơn vị cảnh)
 * @param far      khoảng cao phía trên sàn còn tạo bóng (càng gần sàn bóng càng đậm)
 * @param below    khoảng DƯỚI mặt sàn vẫn chụp (Tự tạo: sàn cố định ở mặt lưới, khối có thể cắm một phần xuống dưới – camera
 *                 đặt đúng mặt sàn thì phần dưới bị cắt, mặt trên quay lưng lại camera → khối mất bóng)
 * @param version  đổi = vẽ lại bóng (hình khối đổi mà khung bao giữ nguyên)
 * @param live     vẽ lại MỌI khung hình (đang kéo khối)
 * Vật thể cấp cao nhất của cảnh có userData.noShadow (lưới, tay cầm của trình dựng…) không đổ bóng.
 */
export function SoftShadow({ position, size, far, below = 0, opacity = 0.55, blur = 2.6, resolution = 512, version = 0, live = false }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef();
  const dirty = useRef(true);
  const res = useMemo(() => resourcesFor(gl, resolution), [gl, resolution]);
  const camera = useMemo(() => {
    const c = new THREE.OrthographicCamera();
    c.rotation.x = Math.PI / 2; // nhìn thẳng lên
    return c;
  }, []);
  const [x, y, z] = position;
  const s = Math.max(size, 0.01);

  useLayoutEffect(() => {
    camera.left = camera.bottom = -s / 2;
    camera.right = camera.top = s / 2;
    camera.near = -below; // camera trực giao: mặt gần được phép nằm sau vị trí camera
    camera.far = far;
    camera.updateProjectionMatrix();
    dirty.current = true;
    invalidate();
  }, [camera, s, far, below, x, y, z, version, res, invalidate]);

  useFrame(() => {
    if (!dirty.current && !live) return;
    dirty.current = false;
    const { target, temp, depth, floor, blurH, blurV, quad } = res;
    floor.value = below / (far + below);
    group.current.getWorldPosition(camera.position);
    camera.updateMatrixWorld();
    const hidden = [group.current];
    for (const o of scene.children) if (o.visible && o.userData.noShadow) hidden.push(o);
    for (const o of hidden) o.visible = false;
    const prevTarget = gl.getRenderTarget();
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(savedClear);
    const blurPass = (amount) => {
      quad.material = blurH;
      blurH.uniforms.tDiffuse.value = target.texture;
      blurH.uniforms.h.value = amount / 256;
      gl.setRenderTarget(temp);
      gl.render(quad, quadCamera);
      quad.material = blurV;
      blurV.uniforms.tDiffuse.value = temp.texture;
      blurV.uniforms.v.value = amount / 256;
      gl.setRenderTarget(target);
      gl.render(quad, quadCamera);
    };
    try {
      scene.background = null;
      scene.overrideMaterial = depth;
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      blurPass(blur);
      blurPass(blur * 0.4);
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(savedClear, prevAlpha);
      scene.overrideMaterial = prevOverride;
      scene.background = prevBackground;
      for (const o of hidden) o.visible = true;
    }
  });

  return (
    <group ref={group} position={[x, y, z]}>
      {/* mặt bóng nằm ngang, nhìn từ trên xuống; lật trục để khớp ảnh chụp từ dưới lên */}
      <mesh rotation-x={-Math.PI / 2} scale={[s, -s, 1]}>
        <planeGeometry />
        <meshBasicMaterial transparent map={res.target.texture} opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}
