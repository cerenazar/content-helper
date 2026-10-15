// Carousel editörüne özel ikonlar. Ortak ikon ailesiyle aynı ızgara: 20×20, 1.6 çizgi, yuvarlak uçlar.
type P = { size?: number };

function Svg({ size = 16, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const IconTitle = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h12M10 5v11" />
  </Svg>
);
export const IconText = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5h12M4 9h12M4 12.5h12M4 16h7" />
  </Svg>
);
export const IconImage = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="14" height="12" rx="2" />
    <circle cx="7.5" cy="8.5" r="1.3" />
    <path d="m4 15 4.5-4.5 3 3 2-2 3.5 3.5" />
  </Svg>
);
export const IconWindow = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="15" height="12" rx="2" />
    <path d="M2.5 7.5h15" />
    <circle cx="5" cy="5.8" r=".4" fill="currentColor" />
    <circle cx="6.8" cy="5.8" r=".4" fill="currentColor" />
  </Svg>
);
export const IconVideo = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="11" height="10" rx="2" />
    <path d="m13.5 8.5 4-2.5v8l-4-2.5" />
  </Svg>
);
export const IconPill = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6.5" width="15" height="7" rx="3.5" />
  </Svg>
);
export const IconChip = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="6" width="13" height="8" rx="1.5" />
    <path d="M7 10h6" />
  </Svg>
);
export const IconAgent = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="5" width="11" height="9" rx="1" />
    <path d="M8 9v.5M12 9v.5M7 14v2.5M13 14v2.5" />
  </Svg>
);
export const Eye = (p: P) => (
  <Svg {...p}>
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
    <circle cx="10" cy="10" r="2.3" />
  </Svg>
);
export const EyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M8 4.8A8 8 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.2 2.9M12.7 14.9A7.5 7.5 0 0 1 10 15.5c-5 0-8-5.5-8-5.5a14 14 0 0 1 3.2-3.7" />
    <path d="m3 3 14 14" />
  </Svg>
);
export const Lock = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Svg>
);
export const Unlock = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 5.8-1" />
  </Svg>
);
export const Grip = (p: P) => (
  <Svg {...p}>
    {[6, 10, 14].flatMap((y) => [8, 12].map((x) => <circle key={x + '-' + y} cx={x} cy={y} r=".9" fill="currentColor" stroke="none" />))}
  </Svg>
);
export const More = (p: P) => (
  <Svg {...p}>
    {[5, 10, 15].map((x) => (
      <circle key={x} cx={x} cy="10" r="1.1" fill="currentColor" stroke="none" />
    ))}
  </Svg>
);

// Hizalama: dikey çizgi referans, kutular ona göre.
export const AlignLeft = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 3v14" />
    <rect x="6" y="5" width="10" height="3.5" rx="1" />
    <rect x="6" y="11.5" width="6" height="3.5" rx="1" />
  </Svg>
);
export const AlignHCenter = (p: P) => (
  <Svg {...p}>
    <path d="M10 3v14" />
    <rect x="4" y="5" width="12" height="3.5" rx="1" />
    <rect x="6.5" y="11.5" width="7" height="3.5" rx="1" />
  </Svg>
);
export const AlignRight = (p: P) => (
  <Svg {...p}>
    <path d="M16.5 3v14" />
    <rect x="4" y="5" width="10" height="3.5" rx="1" />
    <rect x="8" y="11.5" width="6" height="3.5" rx="1" />
  </Svg>
);
export const AlignTop = (p: P) => (
  <Svg {...p}>
    <path d="M3 3.5h14" />
    <rect x="5" y="6" width="3.5" height="10" rx="1" />
    <rect x="11.5" y="6" width="3.5" height="6" rx="1" />
  </Svg>
);
export const AlignVMiddle = (p: P) => (
  <Svg {...p}>
    <path d="M3 10h14" />
    <rect x="5" y="4" width="3.5" height="12" rx="1" />
    <rect x="11.5" y="6.5" width="3.5" height="7" rx="1" />
  </Svg>
);
export const AlignBottom = (p: P) => (
  <Svg {...p}>
    <path d="M3 16.5h14" />
    <rect x="5" y="4" width="3.5" height="10" rx="1" />
    <rect x="11.5" y="8" width="3.5" height="6" rx="1" />
  </Svg>
);
export const DistH = (p: P) => (
  <Svg {...p}>
    <path d="M3 3v14M17 3v14" />
    <rect x="8" y="6" width="4" height="8" rx="1" />
  </Svg>
);
export const DistV = (p: P) => (
  <Svg {...p}>
    <path d="M3 3h14M3 17h14" />
    <rect x="6" y="8" width="8" height="4" rx="1" />
  </Svg>
);
export const ToFront = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="9" width="8" height="8" rx="1.5" strokeDasharray="2 2" />
    <rect x="8" y="3" width="9" height="9" rx="1.5" fill="currentColor" fillOpacity=".25" />
  </Svg>
);
export const ToBack = (p: P) => (
  <Svg {...p}>
    <rect x="8" y="3" width="9" height="9" rx="1.5" strokeDasharray="2 2" />
    <rect x="3" y="8" width="9" height="9" rx="1.5" fill="currentColor" fillOpacity=".25" />
  </Svg>
);
export const Forward = (p: P) => (
  <Svg {...p}>
    <path d="M10 15V5M6 9l4-4 4 4" />
  </Svg>
);
export const Backward = (p: P) => (
  <Svg {...p}>
    <path d="M10 5v10M6 11l4 4 4-4" />
  </Svg>
);
export const ZoomIn = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4M9 6.5v5M6.5 9h5" />
  </Svg>
);
export const ZoomOut = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4M6.5 9h5" />
  </Svg>
);
