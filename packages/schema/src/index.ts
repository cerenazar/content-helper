import { z } from 'zod';

export const WORLDS = ['BUILD', 'LEARN', 'PICKS', 'JOURNAL'] as const;
export const ACCENTS = ['orange', 'sage', 'lav', 'sky', 'gold', 'ink'] as const;

export const Header = z.object({
  world: z.enum(WORLDS),
  topic: z.string(),
});

/** Caption parçası. start/end saklanmaz, timing.ts formülüyle hesaplanır. */
export const Caption = z.object({
  id: z.string(),
  text: z.string().min(1),
  emph: z.string().nullable(),
  scene: z.number().int().min(1),
  /** Elle verilmiş süre (sn). null ise skill formülü kullanılır. */
  dur: z.number().positive().nullable().default(null),
});

export const Scene = z.object({
  id: z.string(),
  name: z.string(),
  /** Sağ üstteki sahne chip'i, ör. SUBAGENTS */
  chip: z.object({ label: z.string(), color: z.enum(ACCENTS) }).nullable().default(null),
});

export const Probe = z.object({
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  rotation: z.number(),
  codec: z.string(),
  hasAudio: z.boolean(),
});

export const Clip = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  probe: Probe,
});

export const CROP_KINDS = ['face', 'hands'] as const;

/** EDL satırı: (klip, giriş_sn, süre, tür) */
export const Cut = z.object({
  id: z.string(),
  clip: z.string(),
  in: z.number().min(0),
  dur: z.number().positive(),
  kind: z.enum(CROP_KINDS),
});

export const ReelProject = z.object({
  version: z.literal(1),
  kind: z.literal('reel'),
  title: z.string(),
  header: Header,
  audio: z.enum(['silent', 'speech']).default('silent'),
  scenes: z.array(Scene),
  captions: z.array(Caption),
  clips: z.array(Clip).default([]),
  edl: z.array(Cut).default([]),
});

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'renk #RRGGBB biçiminde olmalı');

/** Carousel stilleri: picks = Ceren's Picks (siyah, Inter, üst/alt bant); pixel = krem zemin, pixel-art. */
export const CAROUSEL_STYLES = ['picks', 'pixel'] as const;

export const SlideElement = z.object({
  id: z.string(),
  /** window: Mac pencere çerçevesi içinde görsel. pill: CTA hapı (picks). */
  type: z.enum(['title', 'text', 'chip', 'image', 'agent', 'window', 'pill']),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  text: z.string().default(''),
  /** title/text içinde turuncu kutuya alınacak kelime */
  emph: z.string().nullable().default(null),
  size: z.number().positive().default(64),
  color: z.enum(ACCENTS).default('ink'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  /** image/window: proje klasörüne göre yol */
  src: z.string().nullable().default(null),
  /** Hex renk; verilirse color'ı ezer (picks: beyaz metin, marka rengi). */
  fill: HEX.nullable().default(null),
  /** Metin kalınlığı (picks). null: başlık 800, metin 500, hap 700. */
  weight: z.number().int().min(100).max(900).nullable().default(null),
  /** Gizli öğe çizilmez (export'ta da yok). */
  hidden: z.boolean().default(false),
  /** Kilitli öğe sürüklenemez, boyutlandırılamaz, silinemez. */
  locked: z.boolean().default(false),
  /**
   * window: pencere içinde oynayan video, kaynak dosyanın mutlak yolu (kopyalanmaz, reel klipleri gibi).
   * Verilirse src yerine bu gösterilir; export'ta slayt 4:5 MP4 olur.
   */
  video: z.string().nullable().default(null),
});

export const Slide = z.object({
  id: z.string(),
  elements: z.array(SlideElement),
  /** Tam ekran arka plan fotoğrafı (picks kapak), proje klasörüne göre yol. */
  bg: z.string().nullable().default(null),
  /** Slaydın vurgu rengi (picks): emph, başlık, hap. null ise PICKS_GOLD. */
  accent: HEX.nullable().default(null),
});

/** Picks stilinin otomatik çizilen üst/alt bandı. */
export const Picks = z.object({
  handle: z.string().default('@CERENBUILDS'),
  category: z.string().default('SOFTWARE ENGINEERING'),
  series: z.string().default("CEREN'S PICKS"),
  number: z.number().int().min(0).default(1),
});

export const CarouselProject = z.object({
  version: z.literal(1),
  kind: z.literal('carousel'),
  title: z.string(),
  /** Eski dosyalarda yok: pixel olarak okunur. */
  style: z.enum(CAROUSEL_STYLES).default('pixel'),
  header: Header,
  picks: Picks.default({ handle: '@CERENBUILDS', category: 'SOFTWARE ENGINEERING', series: "CEREN'S PICKS", number: 1 }),
  slides: z.array(Slide).min(1),
});

export const Project = z.discriminatedUnion('kind', [ReelProject, CarouselProject]);

export type Header = z.infer<typeof Header>;
export type Caption = z.infer<typeof Caption>;
export type Scene = z.infer<typeof Scene>;
export type Probe = z.infer<typeof Probe>;
export type Clip = z.infer<typeof Clip>;
export type Cut = z.infer<typeof Cut>;
export type ReelProject = z.infer<typeof ReelProject>;
export type SlideElement = z.infer<typeof SlideElement>;
export type Slide = z.infer<typeof Slide>;
export type CarouselProject = z.infer<typeof CarouselProject>;
export type Picks = z.infer<typeof Picks>;
export type CarouselStyle = (typeof CAROUSEL_STYLES)[number];
export type Project = z.infer<typeof Project>;
export type Accent = (typeof ACCENTS)[number];

export const REEL = { W: 1080, H: 1920, TOP: 960, FPS: 30 } as const;
export const SLIDE = { W: 1080, H: 1350 } as const;
export const IG_LIMIT_BYTES = 30 * 1024 * 1024;
/** Instagram carousel videosu en fazla 60 sn. */
export const CAROUSEL_VIDEO_MAX_SEC = 60;

/** Picks stilinin varsayılan vurgu rengi (kapaktaki altın). */
export const PICKS_GOLD = '#C9A35B';

/** Sağ alttaki sayfa numarası: ilk sayfada yok, sonra "02/07". */
export function pageLabel(index: number, total: number): string | null {
  if (index <= 0) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(index + 1)}/${pad(total)}`;
}

/** Sol alttaki seri etiketi: "CEREN'S PICKS / 004". */
export function seriesLabel(series: string, number: number): string {
  return `${series.trim()} / ${String(number).padStart(3, '0')}`;
}

/** Bir serideki sıradaki numara: o serideki en büyük numara + 1 (büyük/küçük harf ve boşluk duyarsız). */
export function nextSeriesNumber(series: string, existing: { series: string; number: number }[]): number {
  const key = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const nums = existing.filter((e) => key(e.series) === key(series)).map((e) => e.number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export function newId(prefix = 'x'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

export function parseProject(data: unknown) {
  return Project.safeParse(data);
}

/** Zod hatasını Türkçe, tek satırlık okunur metne çevirir. */
export function describeError(err: z.ZodError): string {
  return err.issues
    .slice(0, 4)
    .map((i) => `${i.path.join('.') || '(kök)'}: ${i.message}`)
    .join(' · ');
}
