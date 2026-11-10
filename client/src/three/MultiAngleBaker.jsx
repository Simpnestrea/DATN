// CHỤP NHIỀU GÓC một thiết kế bằng 1 khung 3D ẩn (lần lượt từng góc) – dùng cho bảng thông số in / PDF.
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { JewelryScene } from './JewelryScene.jsx';
import { SHEET_VIEWS } from './sheetViews.js';

/**
 * @param views   [{ key, dir }]
 * @param onDone  (images: { [key]: dataURL }) => void
 */
export default function MultiAngleBaker({ config, views = SHEET_VIEWS, size = 720, onDone }) {
  const [index, setIndex] = useState(0);
  const results = useRef({});
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    results.current = {};
    setIndex(0);
  }, [config]);
  const view = views[index];
  if (!view) return null;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: size, height: size, pointerEvents: 'none' }}>
      <Canvas dpr={1} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} camera={{ fov: 28, position: [30, 24, 70] }}>
        <Suspense fallback={null}>
          <JewelryScene
            config={config}
            mode="bake"
            quality="high"
            viewDir={view.dir}
            bakeKey={`${view.key}|${index}`}
            onBaked={(url) => {
              results.current[view.key] = url;
              if (index + 1 >= views.length) doneRef.current?.({ ...results.current });
              setIndex((i) => i + 1);
            }}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
