// Dây xích dọc theo một đường cong bất kỳ. Mắt xích được đặt bằng InstancedMesh theo khung Frenet
// của đường cong; mắt chẵn/lẻ xoay 90° để lồng vào nhau như dây thật.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useDisposable } from './useGeometry.js';

const m4 = new THREE.Matrix4();
const s4 = new THREE.Matrix4();
const p3 = new THREE.Vector3();

/** Hình học 1 mắt xích (đơn vị: độ dày dây = 1). */
function linkGeometry(style) {
  if (style === 'box') {
    const g = new THREE.TorusGeometry(0.34, 0.15, 6, 4);
    g.rotateZ(Math.PI / 4);
    return { geo: g, elong: 1, pitch: 0.68 };
  }
  if (style === 'bead') {
    return { geo: new THREE.SphereGeometry(0.5, 16, 12), elong: 1, pitch: 1.32 };
  }
  // cable: mắt tròn kéo dài
  return { geo: new THREE.TorusGeometry(0.33, 0.17, 8, 20), elong: 1.45, pitch: 0.9 };
}

export function ChainLinks({ curve, closed = true, style = 'cable', thickness, material }) {
  const length = useMemo(() => curve.getLength(), [curve]);

  if (style === 'snake') return <SnakeChain curve={curve} closed={closed} thickness={thickness} material={material} length={length} />;
  return (
    <LinkChain curve={curve} closed={closed} style={style} thickness={thickness} material={material} length={length} />
  );
}

function LinkChain({ curve, closed, style, thickness, material, length }) {
  const ref = useRef();
  const link = useDisposable(() => linkGeometry(style).geo, [style]);
  const { elong, pitch } = useMemo(() => linkGeometry(style), [style]);
  let count = Math.max(2, Math.round(length / (pitch * thickness)));
  if (closed && style !== 'bead' && count % 2) count += 1; // số chẵn để mắt cuối khớp mắt đầu

  const wire = useDisposable(
    () =>
      style === 'bead'
        ? new THREE.TubeGeometry(curve, Math.max(64, Math.round(length / 0.8)), thickness * 0.09, 6, closed)
        : null,
    [style, curve, thickness, closed, length],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const frames = curve.computeFrenetFrames(count, closed);
    for (let i = 0; i < count; i++) {
      const u = closed ? i / count : i / (count - 1);
      curve.getPointAt(u, p3);
      const t = frames.tangents[i];
      const odd = i % 2 === 1;
      const n = odd ? frames.binormals[i] : frames.normals[i];
      const b = odd ? frames.normals[i].clone().negate() : frames.binormals[i];
      m4.makeBasis(t, n, b);
      s4.makeScale(thickness * elong, thickness, thickness);
      m4.multiply(s4);
      m4.setPosition(p3);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [curve, count, closed, thickness, elong, link, material]);

  return (
    <group>
      <instancedMesh key={`${style}-${count}`} ref={ref} args={[link, material, count]} dispose={null} />
      {wire && <mesh geometry={wire} material={material} dispose={null} />}
    </group>
  );
}

function SnakeChain({ curve, closed, thickness, material, length }) {
  const geo = useDisposable(() => {
    const g = new THREE.TubeGeometry(curve, Math.max(80, Math.round(length / 0.5)), thickness / 2, 8, closed);
    const flat = g.toNonIndexed(); // bề mặt giác như vảy rắn
    g.dispose();
    flat.computeVertexNormals();
    return flat;
  }, [curve, thickness, closed, length]);
  return <mesh geometry={geo} material={material} dispose={null} />;
}

/** Khóa dây (đơn giản): một mắt xích lớn kéo dài tại điểm u của đường cong. */
export function Clasp({ curve, u = 0, thickness, material }) {
  const { position, quaternion } = useMemo(() => {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), t);
    return { position: p, quaternion: q };
  }, [curve, u]);
  return (
    <group position={position} quaternion={quaternion}>
      <mesh scale={[thickness * 2.6, thickness * 1.5, thickness * 1.5]} material={material}>
        <torusGeometry args={[0.42, 0.14, 10, 24]} />
      </mesh>
    </group>
  );
}
