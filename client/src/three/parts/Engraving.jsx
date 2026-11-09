// Chữ khắc CHÌM. Vẽ chữ lên canvas 2D làm texture → hiển thị đúng tiếng Việt có dấu
// (font 3D dạng typeface thường thiếu ký tự tiếng Việt).
//
// Hiệu ứng khắc chìm: lòng chữ tối (rãnh khắc ít nhận sáng), cộng thêm một dải sáng mảnh ở mép
// dưới–phải của nét chữ (thành rãnh đối diện nguồn sáng) → mắt cảm nhận chữ lõm xuống bề mặt.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { bandOuterRadiusAt } from '../geometry/bandGeometry.js';
import { useMaterials } from '../materials/MaterialsContext.jsx';
import { useDisposable } from './useGeometry.js';

const FONT_RATIO = 0.62; // chiều cao chữ / chiều cao vùng vẽ

function useFontsReady() {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded');
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Chiều cao vùng vẽ (mm) để chữ cao đúng `letterMm`. */
export const engraveBandHeight = (letterMm) => letterMm / FONT_RATIO;

/**
 * Tạo 2 texture: alphaMap (hình chữ) và map (màu lòng rãnh + mép sáng).
 * @param aspect rộng / cao của vùng vẽ
 */
function makeEngraveTextures(text, aspect, metalHex) {
  const h = Math.max(32, Math.min(128, Math.floor(4096 / Math.max(1, aspect))));
  const w = Math.min(4096, Math.max(64, Math.round(h * aspect)));
  const font = `italic 600 ${Math.round(h * FONT_RATIO)}px "Cormorant Garamond", "Be Vietnam Pro", serif`;
  const off = Math.max(1, h * 0.035);

  const draw = (ctx, color, dx = 0, dy = 0) => {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.fillText(text, w / 2 + dx, h / 2 + h * 0.03 + dy, w * 0.96);
  };

  const alphaCanvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const a = alphaCanvas.getContext('2d');
  a.fillStyle = '#000';
  a.fillRect(0, 0, w, h);
  draw(a, '#fff');

  const metal = new THREE.Color(metalHex);
  const dark = `#${metal.clone().multiplyScalar(0.12).getHexString()}`;
  const lit = `#${metal.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString()}`;
  const colorCanvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c = colorCanvas.getContext('2d');
  c.fillStyle = lit; // phần nào của nét chữ KHÔNG bị lớp tối phủ → mép sáng
  c.fillRect(0, 0, w, h);
  draw(c, dark, -off, -off);

  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [alphaMap, map]) t.anisotropy = 8;
  return { map, alphaMap };
}

function useEngraveMaterial(text, aspect, side, wrap) {
  const fonts = useFontsReady();
  const { metalColor } = useMaterials();
  return useDisposable(() => {
    const { map, alphaMap } = makeEngraveTextures(text, aspect, metalColor);
    for (const t of [map, alphaMap]) {
      if (wrap) {
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = wrap.repeatX;
        t.offset.x = wrap.offsetX;
      }
    }
    const m = new THREE.MeshStandardMaterial({
      map,
      alphaMap,
      transparent: true,
      metalness: 0.75,
      roughness: 0.42,
      side,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const dispose = m.dispose.bind(m);
    m.dispose = () => {
      map.dispose();
      alphaMap.dispose();
      dispose();
    };
    return m;
  }, [text, aspect, side, wrap?.repeatX, wrap?.offsetX, metalColor, fonts]);
}

/**
 * Chữ khắc trên đai nhẫn / vòng kiềng.
 * @param position    'inside' (mặt trong) | 'outside' (mặt ngoài)
 * @param centerAngle vị trí tâm dòng chữ quanh vòng (rad, 0 = đỉnh, π = đáy, chiều kim đồng hồ)
 */
export function BandEngraving({ text, inner, width, thick, profile = 'comfort', position = 'inside', letterMm = 1.2, centerAngle = Math.PI }) {
  const height = Math.min(engraveBandHeight(letterMm), width * 0.95);
  const outside = position === 'outside';
  const radius = outside ? inner + thick : inner;
  const aspect = (Math.PI * 2 * radius) / height;
  // Lathe/Cylinder: điểm ở góc φ nằm tại θ = π − φ. Mặt ngoài (lặp +1): offset = θ/2π;
  // mặt trong (lặp −1, lật ngang vì nhìn từ phía trong): offset = −θ/2π.
  const turn = centerAngle / (Math.PI * 2);
  const wrap = { repeatX: outside ? 1 : -1, offsetX: outside ? turn : -turn };
  const material = useEngraveMaterial(text, aspect, outside ? THREE.FrontSide : THREE.BackSide, wrap);

  const geometry = useDisposable(() => {
    if (!outside) {
      const g = new THREE.CylinderGeometry(inner - 0.015, inner - 0.015, height, 180, 1, true);
      g.rotateX(Math.PI / 2);
      return g;
    }
    // mặt ngoài: dải bám sát tiết diện đai (đai bo tròn/sống dao không phải hình trụ)
    const steps = 10;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = -height / 2 + (i / steps) * height;
      pts.push(new THREE.Vector2(bandOuterRadiusAt(profile, inner, width, thick, a) + 0.02, a));
    }
    const g = new THREE.LatheGeometry(pts, 180);
    g.rotateX(Math.PI / 2);
    return g;
  }, [outside, inner, width, thick, profile, height]);

  if (!text) return null;
  return <mesh geometry={geometry} material={material} renderOrder={2} dispose={null} />;
}

/**
 * Chữ khắc trên mặt phẳng (mặt dây).
 * @param side 'front' (hướng +Z) | 'back' (hướng -Z)
 * @param vertical chữ chạy dọc (mặt dây thanh dọc)
 */
export function FlatEngraving({ text, length, letterMm, z, y = 0, side = 'back', vertical = false }) {
  const height = engraveBandHeight(letterMm);
  const material = useEngraveMaterial(text, length / height, THREE.FrontSide, null);
  if (!text) return null;
  const rotY = side === 'back' ? Math.PI : 0;
  const rotZ = vertical ? (side === 'back' ? Math.PI / 2 : -Math.PI / 2) : 0;
  return (
    <mesh position={[0, y, z]} rotation={[0, rotY, rotZ]} material={material} renderOrder={2}>
      <planeGeometry args={[length, height]} />
    </mesh>
  );
}
