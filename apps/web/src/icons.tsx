// Tek ikon ailesi: 20×20 ızgara, 1.6 çizgi, yuvarlak uçlar (SF Symbols'ın ince ağırlığına yakın).
type P = { size?: number; title?: string };

function Svg({ size = 16, title, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const Undo = (p: P) => (
  <Svg {...p}>
    <path d="M7 5 3.5 8.5 7 12" />
    <path d="M4 8.5h8a4.5 4.5 0 0 1 0 9H9" />
  </Svg>
);
export const Redo = (p: P) => (
  <Svg {...p}>
    <path d="m13 5 3.5 3.5L13 12" />
    <path d="M16 8.5H8a4.5 4.5 0 0 0 0 9h3" />
  </Svg>
);
export const Play = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" />
  </Svg>
);
export const Pause = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5v11M13 4.5v11" strokeWidth={2.4} />
  </Svg>
);
export const ChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="m12 4.5-5.5 5.5 5.5 5.5" />
  </Svg>
);
export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m8 4.5 5.5 5.5L8 15.5" />
  </Svg>
);
export const Close = (p: P) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Svg>
);
export const Alert = (p: P) => (
  <Svg {...p}>
    <path d="M10 6v5" />
    <circle cx="10" cy="14.2" r=".6" fill="currentColor" />
    <circle cx="10" cy="10" r="7.5" />
  </Svg>
);
export const Plus = (p: P) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);
export const Copy = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
    <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6A1.5 1.5 0 0 0 5.5 12.5H7" />
  </Svg>
);
export const Trash = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10" />
  </Svg>
);
export const ArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M16 10H4.5M9 5 4 10l5 5" />
  </Svg>
);

/** Claude'un avatarı: skill'deki 10×10 pixel agent, turuncu. */
const AGENT = ['....DD....', '....BB....', '.BBBBBBBB.', 'BBBBBBBBBB', 'BBEEBBEEBB', 'BBEEBBEEBB', 'BBBBBBBBBB', '.BBBMMBBB.', '..BBBBBB..', '.DD....DD.'];
export function AgentAvatar({ size = 18 }: { size?: number }) {
  const col: Record<string, string> = { B: '#D97757', D: '#98533D', E: '#1F1A17', M: '#82473A' };
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden>
      {AGENT.flatMap((row, y) => [...row].map((k, x) => (col[k] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={col[k]} /> : null)))}
    </svg>
  );
}
export const House = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9 10 3.5 16.5 9" />
    <path d="M5 8v8h10V8" />
  </Svg>
);
export const Folder = (p: P) => (
  <Svg {...p}>
    <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.2l1.6 1.8h6.2A1.5 1.5 0 0 1 17 7.3v7.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z" />
  </Svg>
);
export const Bulb = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 13.5c0-1.6-2.5-2.8-2.5-5.5a5 5 0 0 1 10 0c0 2.7-2.5 3.9-2.5 5.5Z" />
    <path d="M8 16.5h4" />
  </Svg>
);
export const LinkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1" />
    <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1" />
  </Svg>
);
