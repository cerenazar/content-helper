/**
 * cerenbuilds çizim kiti. Kaynak: cerenbuilds-split-reel SKILL.md içindeki scene.html.
 * Renkler, fontlar ve ölçüler SABİT; değiştirme.
 */
export const COL = {
  bg: '#F5F0E9',
  grid: '#E4DCD1',
  ink: '#1F1A17',
  mute: '#8A7F75',
  orange: '#D97757',
  sage: '#7FA37A',
  lav: '#9C8FD0',
  sky: '#6F9FC8',
  gold: '#E2B34A',
  line: '#CFC5B8',
  card: '#FFFFFF',
} as const;

export const SANS = '"Inter Display","Inter",sans-serif';
export const MONO = '"DejaVu Sans Mono",monospace';

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const eio = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const back = (x: number) => {
  x = clamp(x);
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

export function shade(h: string, f: number): string {
  const n = parseInt(h.slice(1), 16);
  const r = Math.round((n >> 16) * f),
    gg = Math.round(((n >> 8) & 255) * f),
    b = Math.round((n & 255) * f);
  return `rgb(${clamp(r, 0, 255)},${clamp(gg, 0, 255)},${clamp(b, 0, 255)})`;
}

export const AGENT = [
  '....DD....',
  '....BB....',
  '.BBBBBBBB.',
  'BBBBBBBBBB',
  'BBEEBBEEBB',
  'BBEEBBEEBB',
  'BBBBBBBBBB',
  '.BBBMMBBB.',
  '..BBBBBB..',
  '.DD....DD.',
];
export const CROWN = ['Y..Y..Y', 'YYYYYYY', 'YYYYYYY'];

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface AgentOpts {
  blinkSeed?: number;
  bob?: boolean;
  crown?: boolean;
  alpha?: number;
}

/** Bir 2D context'e bağlı yardımcılar. Sahne kodu (scenes.js) bunları `h` olarak alır. */
export function createKit(g: Ctx, W: number) {
  function rr(x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function text(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    font = SANS,
    weight = 800,
    align: CanvasTextAlign = 'center',
    base: CanvasTextBaseline = 'middle',
  ) {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = base;
    g.fillText(s, x, y);
  }
  function sprite(m: string[], x: number, y: number, px: number, pal: Record<string, string>) {
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++) {
        const k = m[r][c];
        if (k === '.' || !pal[k]) continue;
        g.fillStyle = pal[k];
        g.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
      }
  }
  function agent(cx: number, by: number, px: number, color: string, t: number, { blinkSeed = 0, bob = true, crown = false, alpha = 1 }: AgentOpts = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const step = bob ? Math.floor(t * 2.4 + blinkSeed) % 2 : 0;
    const y = by - 10 * px - step * px * 0.6;
    const blink = (t + blinkSeed * 0.77) % 3.1 < 0.12;
    const m = AGENT.map((row, i) => (blink && (i === 4 || i === 5) ? row.replace(/E/g, 'B') : row));
    g.fillStyle = 'rgba(31,26,23,0.10)';
    g.beginPath();
    g.ellipse(cx, by + px * 0.6, px * 4.2, px * 0.9, 0, 0, Math.PI * 2);
    g.fill();
    sprite(m, cx - 5 * px, y, px, { B: color, D: shade(color, 0.7), E: COL.ink, M: shade(color, 0.6) });
    if (crown) sprite(CROWN, cx - 3.5 * px, y - 4 * px, px, { Y: COL.gold });
    g.restore();
  }
  function label(s: string, cx: number, y: number, color?: string) {
    text(s, cx, y, 26, color || COL.mute, MONO, 700);
  }
  function chip(s: string, x: number, y: number, { bg = COL.ink as string, fg = '#fff', size = 26, align = 'left' as 'left' | 'center' } = {}) {
    g.font = `800 ${size}px ${MONO}`;
    const w = g.measureText(s).width + size * 1.1,
      h = size * 1.75;
    const X = align === 'center' ? x - w / 2 : x;
    rr(X, y - h / 2, w, h, h / 2);
    g.fillStyle = bg;
    g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, X + w / 2, y + 1);
    return w;
  }
  function chipRight(s: string, y: number, bgc: string, a: number) {
    g.save();
    g.globalAlpha = a;
    g.font = `800 24px ${MONO}`;
    const w = g.measureText(s).width + 26.4;
    chip(s, W - 72 - w, y, { bg: bgc, size: 24 });
    g.restore();
  }
  function dashed(x1: number, y1: number, x2: number, y2: number, color: string, p = 1) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.setLineDash([10, 10]);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(lerp(x1, x2, p), lerp(y1, y2, p));
    g.stroke();
    g.restore();
  }
  function packet(x: number, y: number, s: number, c: string) {
    g.fillStyle = c;
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s / 3, s / 3);
  }

  // ---- Yardımcı sprite'lar (skill'deki tarife göre: aynı stil) ----

  /** Koyu ekranlı laptop + renkli kod satırları. (cx, by) = alt orta. */
  function laptop(cx: number, by: number, s: number, t: number, { lines = 5, alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const w = 220 * s,
      h = 140 * s;
    g.fillStyle = 'rgba(31,26,23,0.10)';
    g.beginPath();
    g.ellipse(cx, by + 6 * s, w * 0.62, 10 * s, 0, 0, Math.PI * 2);
    g.fill();
    rr(cx - w / 2, by - h - 14 * s, w, h, 12 * s);
    g.fillStyle = '#2A2420';
    g.fill();
    const cols = [COL.orange, COL.sage, COL.lav, COL.sky, COL.gold];
    const shown = Math.min(lines, Math.floor(t * 3) % (lines + 3));
    for (let i = 0; i < lines; i++) {
      if (i > shown) break;
      const lw = (0.35 + ((i * 37) % 50) / 100) * (w - 50 * s);
      g.fillStyle = cols[i % cols.length];
      g.fillRect(Math.round(cx - w / 2 + 22 * s + (i % 2) * 18 * s), Math.round(by - h - 14 * s + 20 * s + i * 20 * s), Math.round(lw), Math.round(9 * s));
    }
    rr(cx - w * 0.6, by - 14 * s, w * 1.2, 14 * s, 6 * s);
    g.fillStyle = COL.line;
    g.fill();
    g.restore();
  }

  /** Beyaz kenarlı çay bardağı + piksel buhar. (cx, by) = alt orta. */
  function teaGlass(cx: number, by: number, s: number, t: number, { alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const top = 70 * s,
      bot = 46 * s,
      h = 110 * s,
      waist = 52 * s;
    g.fillStyle = 'rgba(31,26,23,0.10)';
    g.beginPath();
    g.ellipse(cx, by + 4 * s, 40 * s, 7 * s, 0, 0, Math.PI * 2);
    g.fill();
    const path = () => {
      g.beginPath();
      g.moveTo(cx - top / 2, by - h);
      g.quadraticCurveTo(cx - waist / 2, by - h * 0.45, cx - bot / 2, by);
      g.lineTo(cx + bot / 2, by);
      g.quadraticCurveTo(cx + waist / 2, by - h * 0.45, cx + top / 2, by - h);
      g.closePath();
    };
    path();
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.save();
    path();
    g.clip();
    g.fillStyle = '#B4472A';
    g.fillRect(cx - top, by - h * 0.82, top * 2, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(cx - top / 2 + 8 * s, by - h * 0.78, 6 * s, h * 0.6);
    g.restore();
    path();
    g.lineWidth = 5 * s;
    g.strokeStyle = '#FFFFFF';
    g.stroke();
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i / 3) % 1;
      const px = 8 * s;
      g.globalAlpha = (1 - ph) * 0.7 * alpha;
      g.fillStyle = COL.line;
      g.fillRect(Math.round(cx + (i - 1) * 16 * s + Math.sin((ph + i) * 6) * 5 * s), Math.round(by - h - 14 * s - ph * 60 * s), px, px);
    }
    g.restore();
  }

  /** Beyaz kağıt + satırlar + sage tik. (cx, cy) = merkez. */
  function paper(cx: number, cy: number, s: number, { check = true, alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const w = 120 * s,
      h = 156 * s;
    g.shadowColor = 'rgba(31,26,23,0.14)';
    g.shadowBlur = 16 * s;
    g.shadowOffsetY = 5 * s;
    rr(cx - w / 2, cy - h / 2, w, h, 10 * s);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#D8CFC4';
    for (let i = 0; i < 5; i++) g.fillRect(Math.round(cx - w / 2 + 18 * s), Math.round(cy - h / 2 + 24 * s + i * 22 * s), Math.round((i === 4 ? 0.45 : 0.75) * w), Math.round(8 * s));
    if (check) {
      g.strokeStyle = COL.sage;
      g.lineWidth = 9 * s;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cx + 8 * s, cy + 46 * s);
      g.lineTo(cx + 24 * s, cy + 60 * s);
      g.lineTo(cx + 50 * s, cy + 30 * s);
      g.stroke();
    }
    g.restore();
  }

  /** Beyaz konuşma balonu + renkli kenar + yanıp sönen 3 kare nokta (ya da metin). */
  function bubble(cx: number, cy: number, s: number, color: string, t: number, { text: msg = '', alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    g.font = `700 ${26 * s}px ${MONO}`;
    const w = msg ? g.measureText(msg).width + 48 * s : 130 * s,
      h = 70 * s;
    rr(cx - w / 2, cy - h / 2, w, h, 20 * s);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.lineWidth = 5 * s;
    g.strokeStyle = color;
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 14 * s, cy + h / 2 - 2 * s);
    g.lineTo(cx - 2 * s, cy + h / 2 + 18 * s);
    g.lineTo(cx + 10 * s, cy + h / 2 - 2 * s);
    g.closePath();
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.stroke();
    g.fillRect(cx - 12 * s, cy + h / 2 - 8 * s, 20 * s, 6 * s);
    if (msg) text(msg, cx, cy + 2 * s, 26 * s, COL.ink, MONO, 700);
    else
      for (let i = 0; i < 3; i++) {
        const on = Math.floor(t * 3) % 3 === i;
        g.fillStyle = on ? color : COL.line;
        const d = 14 * s;
        g.fillRect(Math.round(cx + (i - 1) * 28 * s - d / 2), Math.round(cy - d / 2), d, d);
      }
    g.restore();
  }

  /** Gold klasör + mono yol yazısı. (cx, cy) = merkez. */
  function folder(cx: number, cy: number, s: number, path = '', { alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const w = 150 * s,
      h = 110 * s;
    rr(cx - w / 2, cy - h / 2 - 16 * s, w * 0.45, 30 * s, 8 * s);
    g.fillStyle = shade(COL.gold, 0.85);
    g.fill();
    rr(cx - w / 2, cy - h / 2, w, h, 12 * s);
    g.fillStyle = COL.gold;
    g.fill();
    if (path) text(path, cx, cy + h / 2 + 30 * s, 24 * s, COL.mute, MONO, 700);
    g.restore();
  }

  /** Görev paketi: renkli kare kutu + bant. */
  function task(cx: number, cy: number, s: number, color: string, { alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    const d = 70 * s;
    rr(cx - d / 2, cy - d / 2, d, d, 10 * s);
    g.fillStyle = color;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(cx - 5 * s, cy - d / 2, 10 * s, d);
    g.restore();
  }

  /** Aşağı ok (ok gibi görünsün: gövde + dolu üçgen uç). */
  function arrowDown(cx: number, y1: number, y2: number, color: string, { alpha = 1 } = {}) {
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, y1);
    g.lineTo(cx, y2 - 22);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 24, y2 - 28);
    g.lineTo(cx + 24, y2 - 28);
    g.lineTo(cx, y2);
    g.closePath();
    g.fill();
    g.restore();
  }

  return { g, rr, text, sprite, agent, label, chip, chipRight, dashed, packet, laptop, teaGlass, paper, bubble, folder, task, arrowDown };
}

export type Kit = ReturnType<typeof createKit>;
