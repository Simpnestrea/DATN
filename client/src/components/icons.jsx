// Icon SVG riêng cho NGK: loại trang sức, giác cắt, kiểu dáng.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 24, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base} {...rest}>
      {children}
    </svg>
  );
}

const TYPE_PATHS = {
  ring: (
    <>
      <circle cx="12" cy="14.5" r="6.5" />
      <path d="M9.5 6.5 12 3l2.5 3.5L12 8.5Z" />
    </>
  ),
  bracelet: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5" />
      <ellipse cx="12" cy="12" rx="6.5" ry="3" />
    </>
  ),
  necklace: (
    <>
      <path d="M4 4c0 7 4 11 8 11s8-4 8-11" />
      <path d="M12 15v1.5" />
      <path d="M12 16.5c1.6 1.4 2 2.6 0 4.5-2-1.9-1.6-3.1 0-4.5Z" />
    </>
  ),
  earrings: (
    <>
      <circle cx="7" cy="6" r="2" />
      <circle cx="17" cy="6" r="2" />
      <path d="M7 8v3M17 8v3" />
      <path d="M7 11c1.4 1.4 2 2.8 0 5.5-2-2.7-1.4-4.1 0-5.5ZM17 11c1.4 1.4 2 2.8 0 5.5-2-2.7-1.4-4.1 0-5.5Z" />
    </>
  ),
  pendant: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 20s-6.5-4-6.5-8.3A3.4 3.4 0 0 1 12 9.6a3.4 3.4 0 0 1 6.5 2.1C18.5 16 12 20 12 20Z" />
    </>
  ),
};

TYPE_PATHS.custom = (
  <>
    <path d="M12 3 19.5 7.2v8.6L12 20l-7.5-4.2V7.2Z" />
    <path d="M4.5 7.2 12 11.5l7.5-4.3M12 11.5V20" />
    <path d="M18 2.5v3M16.5 4h3" strokeWidth="1.3" />
  </>
);

const PART_PATHS = {
  sphere: (
    <>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="8" ry="3" />
    </>
  ),
  box: (
    <>
      <path d="M12 3.5 19.5 7.5v9L12 20.5l-7.5-4v-9Z" />
      <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" />
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
    </>
  ),
  cone: (
    <>
      <path d="M12 3 5 18M12 3l7 15" />
      <ellipse cx="12" cy="18" rx="7" ry="2.6" />
    </>
  ),
  capsule: <rect x="8" y="3" width="8" height="18" rx="4" />,
  torus: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5" />
      <ellipse cx="12" cy="12" rx="4" ry="1.8" />
    </>
  ),
  band: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="8" strokeWidth="3" />
    </>
  ),
  disc: <circle cx="12" cy="12" r="8" strokeWidth="2.4" />,
  heart: <path d="M12 19.5s-7.5-4.6-7.5-9.4A3.9 3.9 0 0 1 12 7.7a3.9 3.9 0 0 1 7.5 2.4c0 4.8-7.5 9.4-7.5 9.4Z" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" />,
  teardrop: <path d="M12 4c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10Z" />,
  bar: <rect x="9.5" y="3" width="5" height="18" rx="1.5" />,
  wire: <path d="M4 17c3-9 6-9 8-4s5 5 8-4" strokeWidth="2.2" />,
  text: (
    <>
      <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />
    </>
  ),
  sketch: (
    <>
      <path d="M5 17c1.5-6 5-10 9-10 3 0 5 2 5 4.5S16.5 17 12 17H5Z" />
      <path d="m15 4 3-1-1 3" />
    </>
  ),
  gem: (
    <>
      <path d="M6 9 9 4.5h6L18 9l-6 10.5Z" />
      <path d="M6 9h12M9 4.5 12 9l3-4.5M12 9v10.5" />
    </>
  ),
};

export function PartIcon({ kind, size = 22 }) {
  return <Svg size={size}>{PART_PATHS[kind] ?? PART_PATHS.box}</Svg>;
}

export function TypeIcon({ type, size }) {
  return <Svg size={size}>{TYPE_PATHS[type] ?? TYPE_PATHS.ring}</Svg>;
}

const CUT_PATHS = {
  round: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M8.5 8.5 12 8l3.5.5.5 3.5-.5 3.5-3.5.5-3.5-.5L8 12Z" />
    </>
  ),
  oval: (
    <>
      <ellipse cx="12" cy="12" rx="6" ry="8.5" />
      <ellipse cx="12" cy="12" rx="3" ry="4.6" />
    </>
  ),
  princess: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" />
      <path d="M4.5 4.5 12 12l7.5-7.5M4.5 19.5 12 12l7.5 7.5" />
    </>
  ),
  emerald: (
    <>
      <path d="M8.5 3h7L18 5.5v13L15.5 21h-7L6 18.5v-13Z" />
      <path d="M10 6.5h4l1 1v9l-1 1h-4l-1-1v-9Z" />
    </>
  ),
  pear: (
    <>
      <path d="M12 3c3 4 6.5 7.5 6.5 11a6.5 6.5 0 0 1-13 0C5.5 10.5 9 7 12 3Z" />
      <path d="M12 8c1.5 2 3 3.6 3 5.6a3 3 0 0 1-6 0C9 11.6 10.5 10 12 8Z" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-8-5-8-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 8 2.6C20 15 12 20 12 20Z" />
      <path d="M12 15.5s-3.6-2.3-3.6-4.6A1.9 1.9 0 0 1 12 9.8a1.9 1.9 0 0 1 3.6 1.1c0 2.3-3.6 4.6-3.6 4.6Z" />
    </>
  ),
};

export function CutIcon({ cut, size = 22 }) {
  return <Svg size={size}>{CUT_PATHS[cut] ?? CUT_PATHS.round}</Svg>;
}

const STYLE_PATHS = {
  'ring:plain': <circle cx="12" cy="12" r="7" strokeWidth="3" />,
  'ring:solitaire': (
    <>
      <circle cx="12" cy="14.5" r="6.5" />
      <path d="M9.5 6.5 12 3l2.5 3.5L12 8.5Z" />
    </>
  ),
  'ring:halo': (
    <>
      <circle cx="12" cy="14.5" r="6.5" />
      <circle cx="12" cy="6" r="3.3" strokeDasharray="1.4 1.4" />
      <circle cx="12" cy="6" r="1.5" />
    </>
  ),
  'ring:three-stone': (
    <>
      <circle cx="12" cy="14.5" r="6.5" />
      <path d="M12 3.5 14 6l-2 2-2-2Z" />
      <circle cx="7.6" cy="7.6" r="1.2" />
      <circle cx="16.4" cy="7.6" r="1.2" />
    </>
  ),
  'ring:eternity': (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="7" strokeWidth="3.2" strokeDasharray="0.1 3" />
    </>
  ),
  'ring:twist': (
    <>
      <path d="M5 12c2-5 5 5 7 0s5 5 7 0" />
      <path d="M5 12c2 5 5-5 7 0s5-5 7 0" />
    </>
  ),
  'bracelet:bangle': <ellipse cx="12" cy="12" rx="8.5" ry="5" strokeWidth="2.6" />,
  'bracelet:cuff': (
    <>
      <path d="M5.5 15.5A8.5 5 0 1 1 18.5 15.5" strokeWidth="2.6" />
      <circle cx="5.5" cy="15.5" r="1.4" />
      <circle cx="18.5" cy="15.5" r="1.4" />
    </>
  ),
  'bracelet:chain': <ellipse cx="12" cy="12" rx="8.5" ry="5" strokeDasharray="2.2 1.2" strokeWidth="2.2" />,
  'bracelet:charm': (
    <>
      <ellipse cx="12" cy="10" rx="8.5" ry="4.5" strokeDasharray="2.2 1.2" />
      <path d="M8 14.5v2M16 14.5v2M12 14.5v3" />
      <circle cx="8" cy="18" r="1.3" />
      <circle cx="16" cy="18" r="1.3" />
      <path d="M12 18.5l1.2 1.3-1.2 1.3-1.2-1.3Z" />
    </>
  ),
  'bracelet:tennis': <ellipse cx="12" cy="12" rx="8.5" ry="5" strokeWidth="3" strokeDasharray="0.1 2.6" />,
};

const SHAPE_PATHS = {
  round: <circle cx="12" cy="12" r="7" />,
  teardrop: <path d="M12 4c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10Z" />,
  heart: <path d="M12 19.5s-7.5-4.6-7.5-9.4A3.9 3.9 0 0 1 12 7.7a3.9 3.9 0 0 1 7.5 2.4c0 4.8-7.5 9.4-7.5 9.4Z" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" />,
  bar: <rect x="9.5" y="3.5" width="5" height="17" rx="1.5" />,
  solitaire: (
    <>
      <circle cx="12" cy="5" r="1.6" />
      <path d="M12 8c2.6 3 4.6 5 4.6 7.4a4.6 4.6 0 0 1-9.2 0C7.4 13 9.4 11 12 8Z" />
    </>
  ),
  none: <path d="M6 6l12 12M18 6 6 18" />,
};

export function ShapeIcon({ shape, size = 22 }) {
  return <Svg size={size}>{SHAPE_PATHS[shape] ?? SHAPE_PATHS.round}</Svg>;
}

const CHAIN_PATHS = {
  cable: (
    <>
      <ellipse cx="6" cy="12" rx="3.4" ry="2.2" />
      <path d="M9 12h6" strokeWidth="2.6" />
      <ellipse cx="18" cy="12" rx="3.4" ry="2.2" />
    </>
  ),
  box: (
    <>
      <rect x="2.5" y="9" width="6" height="6" />
      <rect x="9" y="10.5" width="6" height="3" />
      <rect x="15.5" y="9" width="6" height="6" />
    </>
  ),
  bead: (
    <>
      <path d="M2 12h20" strokeWidth="0.8" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </>
  ),
  snake: <path d="M2 12c3-4 5 4 8 0s5 4 8 0 3-2 4-1" strokeWidth="3" />,
};

export function StyleIcon({ type, code, size = 22 }) {
  if (type === 'pendant') return <ShapeIcon shape={code} size={size} />;
  if (type === 'necklace') return <Svg size={size}>{CHAIN_PATHS[code] ?? CHAIN_PATHS.cable}</Svg>;
  if (type === 'earrings') {
    const p = {
      stud: (
        <>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 7.5 13.5 12 12 16.5 10.5 12Z" />
        </>
      ),
      hoop: <circle cx="12" cy="13" r="7" strokeWidth="2.4" />,
      drop: (
        <>
          <circle cx="12" cy="4.5" r="1.8" />
          <path d="M12 6.3v5" strokeDasharray="1 1" />
          <path d="M12 11.3c2.4 2.6 4 4.4 4 6.3a4 4 0 0 1-8 0c0-1.9 1.6-3.7 4-6.3Z" />
        </>
      ),
    }[code];
    return <Svg size={size}>{p}</Svg>;
  }
  return <Svg size={size}>{STYLE_PATHS[`${type}:${code}`] ?? TYPE_PATHS[type]}</Svg>;
}

export function NgkMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ngk-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DFA8" />
          <stop offset="1" stopColor="#B98F43" />
        </linearGradient>
      </defs>
      <path d="M32 6 50 24 32 58 14 24Z" fill="none" stroke="url(#ngk-g)" strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M14 24h36M24 24l8-18 8 18M24 24l8 34 8-34" fill="none" stroke="url(#ngk-g)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}
