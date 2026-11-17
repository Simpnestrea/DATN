// SỢI KIM LOẠI: quét tiết diện (tròn / vuông) dọc theo đường cong mượt qua các điểm điều khiển.
// Khối KÍN hoàn toàn (đầu tròn cho sợi tròn, đầu phẳng cho sợi vuông; sợi khép vòng thì nối liền) → dùng được với
// cọ gọt / cắt phẳng (CSG). Thuần three.js → chạy được trong Web Worker.
import * as THREE from 'three';

/** Đường cong qua các điểm (Catmull-Rom kiểu centripetal: không vòng lố, không tạo nút thắt ở chỗ điểm dày). */
export function wireCurve(points, closed) {
  return new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed && points.length > 2,
    'centripetal',
  );
}

/** Đường tâm của sợi: đường bám bề mặt (nếu có) hoặc đường cong qua các điểm điều khiển. */
export function wireCenterline(p) {
  const pts = p.hug && p.track.length >= 2 ? p.track : p.points;
  return wireCurve(pts, p.closed);
}

/**
 * @param p tham số khối wire { points, d, profile, closed, hug, track }
 * @returns BufferGeometry (toạ độ cục bộ của khối)
 */
export function buildWireGeometry(p) {
  const r = p.d / 2;
  const curve = wireCenterline(p);
  const closed = curve.closed;
  const len = curve.getLength();
  // bước dọc sợi ~ nửa bán kính (cong mượt), giới hạn số đoạn để khối dài vẫn nhẹ
  const steps = Math.max(8, Math.min(900, Math.ceil(len / Math.max(0.12, r * 0.6))));
  const frames = curve.computeFrenetFrames(steps, closed);
  const centers = Array.from({ length: steps + 1 }, (_, i) => curve.getPointAt(i / steps));
  const square = p.profile === 'square';
  const radial = square ? 4 : Math.max(10, Math.min(24, Math.round(10 + r * 6)));

  const pos = [];
  const nor = [];
  const idx = [];
  const ringCount = closed ? steps : steps + 1;

  // tiết diện: tròn = các điểm trên vòng tròn; vuông = 4 cạnh, mỗi cạnh 2 điểm riêng (pháp tuyến sắc)
  const section = [];
  if (square) {
    const s = r; // nửa cạnh = bán kính → cạnh vuông = đường kính
    const corners = [[s, s], [-s, s], [-s, -s], [s, -s]];
    const normals = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    for (let k = 0; k < 4; k++) {
      section.push({ x: corners[k][0], y: corners[k][1], nx: normals[k][0], ny: normals[k][1] });
      const c2 = corners[(k + 1) % 4];
      section.push({ x: c2[0], y: c2[1], nx: normals[k][0], ny: normals[k][1] });
    }
  } else {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      section.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  const per = section.length;
  const P = new THREE.Vector3();
  const Nv = new THREE.Vector3();
  for (let i = 0; i < ringCount; i++) {
    const c = centers[i];
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (const q of section) {
      P.copy(c).addScaledVector(N, q.x).addScaledVector(B, q.y);
      Nv.copy(N).multiplyScalar(q.nx).addScaledVector(B, q.ny).normalize();
      pos.push(P.x, P.y, P.z);
      nor.push(Nv.x, Nv.y, Nv.z);
    }
  }
  const segs = closed ? ringCount : ringCount - 1;
  if (square) {
    for (let i = 0; i < segs; i++) {
      const a = i * per;
      const b = ((i + 1) % ringCount) * per;
      for (let k = 0; k < 4; k++) {
        const j0 = k * 2;
        const j1 = k * 2 + 1;
        idx.push(a + j0, b + j0, a + j1, a + j1, b + j0, b + j1);
      }
    }
  } else {
    for (let i = 0; i < segs; i++) {
      const a = i * per;
      const b = ((i + 1) % ringCount) * per;
      for (let j = 0; j < per; j++) {
        const j1 = (j + 1) % per;
        idx.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
      }
    }
  }

  if (!closed) {
    // bịt hai đầu: tròn → bán cầu; vuông → mặt phẳng
    const cap = (ringIndex, dirSign) => {
      const c = centers[ringIndex];
      const T = frames.tangents[ringIndex].clone().multiplyScalar(dirSign); // hướng RA NGOÀI đầu sợi
      const N = frames.normals[ringIndex];
      const B = frames.binormals[ringIndex];
      const base = ringIndex * per;
      if (square) {
        const start = pos.length / 3;
        for (let j = 0; j < per; j += 2) {
          const k = base + j;
          pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
          nor.push(T.x, T.y, T.z);
        }
        // 4 góc → 2 tam giác, quay mặt ra ngoài
        const q = [start, start + 1, start + 2, start + 3];
        // (toàn bộ chỉ số được đảo chiều ở cuối – xem bên dưới)
        if (dirSign > 0) idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
        else idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
        return;
      }
      const K = Math.max(3, Math.round(radial / 4));
      let prev = base;
      for (let t = 1; t <= K; t++) {
        const phi = (t / K) * (Math.PI / 2);
        const isTip = t === K;
        const ringStart = pos.length / 3;
        if (isTip) {
          P.copy(c).addScaledVector(T, r);
          pos.push(P.x, P.y, P.z);
          nor.push(T.x, T.y, T.z);
          for (let j = 0; j < per; j++) {
            const j1 = (j + 1) % per;
            if (dirSign > 0) idx.push(prev + j, ringStart, prev + j1);
            else idx.push(prev + j, prev + j1, ringStart);
          }
          break;
        }
        for (const q of section) {
          const cr = Math.cos(phi);
          P.copy(c).addScaledVector(T, Math.sin(phi) * r).addScaledVector(N, q.x * cr).addScaledVector(B, q.y * cr);
          Nv.copy(N).multiplyScalar(q.nx * cr).addScaledVector(B, q.ny * cr).addScaledVector(T, Math.sin(phi)).normalize();
          pos.push(P.x, P.y, P.z);
          nor.push(Nv.x, Nv.y, Nv.z);
        }
        for (let j = 0; j < per; j++) {
          const j1 = (j + 1) % per;
          if (dirSign > 0) idx.push(prev + j, ringStart + j, prev + j1, prev + j1, ringStart + j, ringStart + j1);
          else idx.push(prev + j, prev + j1, ringStart + j, prev + j1, ringStart + j1, ringStart + j);
        }
        prev = ringStart;
      }
    };
    cap(0, -1);
    cap(ringCount - 1, 1);
  }

  // các mặt ở trên được ghép theo chiều quay vào trong → đảo một lần cho mặt hướng ra ngoài (khối kín, đúng chiều)
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}
