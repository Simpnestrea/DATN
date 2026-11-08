// Tiện ích màu cho swatch (ô màu) kim loại và đá.

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => {
    const v = (n >> shift) & 255;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, out)));
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Gradient giả ánh kim loại. */
export function metalFill(hex) {
  return `linear-gradient(135deg, ${shade(hex, 0.55)} 0%, ${hex} 38%, ${shade(hex, -0.35)} 62%, ${shade(hex, 0.25)} 100%)`;
}

/** Gradient giả viên đá có điểm sáng. */
export function gemFill(hex, kind = 'faceted') {
  if (kind === 'pearl') {
    return `radial-gradient(circle at 35% 30%, #ffffff 0%, ${hex} 35%, ${shade(hex, -0.25)} 100%)`;
  }
  if (hex.toUpperCase() === '#FFFFFF') {
    return 'conic-gradient(from 20deg, #ffffff, #dfe8f5, #ffffff, #f4e9ff, #ffffff, #e2f6ff, #ffffff)';
  }
  return `radial-gradient(circle at 32% 28%, ${shade(hex, 0.7)} 0%, ${hex} 30%, ${shade(hex, -0.45)} 100%)`;
}
