import type { CarouselProject, Slide, SlideElement } from '@cb/schema';
import { SLIDE, PICKS_GOLD, pageLabel, seriesLabel } from '@cb/schema';
import { COL, SANS, MONO, createKit, shade } from './kit';

const { W, H } = SLIDE;

/** Ceren's Picks ölçüleri (Canva postlarından, 1080×1350). */
export const PICKS = {
  INTER: '"Inter",sans-serif',
  bg: '#000000',
  white: '#FFFFFF',
  rule: 'rgba(255,255,255,0.28)',
  band: { size: 20, weight: 700, left: 107, headY: 38, headRight: 1037, headRule: 81, footRule: 1259, footY: 1297, footRight: 971 },
  window: { bar: 56, radius: 16, barColor: '#45403F', dots: ['#FF5F57', '#FEBC2E', '#28C840'], dotX: [45, 78, 112], dotR: 9.5 },
  /** Hap zemini = vurgu rengi × bu katsayı. */
  pillShade: 0.62,
} as const;

/** Pencerenin video/ekran görüntüsü alanı (başlık çubuğunun altı). Export'ta video buraya oturur. */
export function windowContentRect(el: Pick<SlideElement, 'x' | 'y' | 'w' | 'h'>) {
  return { x: el.x, y: el.y + PICKS.window.bar, w: el.w, h: Math.max(0, el.h - PICKS.window.bar) };
}

/** Slayttaki görünür video öğeleri (yalnız picks stilinde pencere videoları çizilir). */
export function slideVideos(p: CarouselProject, index: number): SlideElement[] {
  if (p.style !== 'picks') return [];
  return (p.slides[index]?.elements ?? []).filter((e) => e.type === 'window' && !!e.video && !e.hidden);
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type ImageSource = CanvasImageSource & { width: number; height: number };

/** Metni kutu genişliğine göre satırlara böler. Vurgu kelimesi bölünmez. */
export function wrapWords(g: Ctx, words: string[], maxW: number, font: (w: string) => string, spaceW: number): string[][] {
  const lines: string[][] = [[]];
  let lw = 0;
  for (const w of words) {
    g.font = font(w);
    const ww = g.measureText(w).width;
    const cur = lines[lines.length - 1];
    if (cur.length && lw + spaceW + ww > maxW) {
      lines.push([w]);
      lw = ww;
    } else {
      lw += (cur.length ? spaceW : 0) + ww;
      cur.push(w);
    }
  }
  return lines;
}

export function createCarouselRenderer(g: Ctx) {
  const kit = createKit(g, W);

  function background(p: CarouselProject, index: number) {
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = COL.grid;
    for (let y = 36; y < H; y += 40) for (let x = 36; x < W; x += 40) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    kit.chip(p.header.world, 72, 84, { size: 24 });
    g.font = `600 26px ${MONO}`;
    const cw = g.measureText(p.header.world).width + 26.4;
    kit.text(p.header.topic, 72 + cw + 28, 85, 26, COL.mute, MONO, 600, 'left');
    kit.text(`${index + 1}/${p.slides.length}`, W - 72, 85, 26, COL.mute, MONO, 700, 'right');
  }

  /** title/text: Inter 900 (title) veya 700 (text), vurgu kelimesi turuncu kutuda. */
  /** Çizer ve metnin kullandığı yüksekliği döndürür (kutudan taşma kontrolü için). */
  function richText(el: SlideElement): number {
    const size = el.size,
      weight = el.type === 'title' ? 900 : 700;
    const color = el.color === 'ink' ? COL.ink : COL[el.color];
    const emph = el.emph?.trim() || null;
    const lineH = size * 1.22;
    const spaceW = size * 0.28;
    let y = el.y + lineH / 2;
    for (const para of el.text.split('\n')) {
      // Vurgu birden fazla kelime olabilir: tek "kelime" gibi tutulur.
      let tokens: string[];
      if (emph && para.includes(emph)) {
        const [a, ...rest] = para.split(emph);
        tokens = [...a.split(/\s+/).filter(Boolean), '\u0000' + emph, ...rest.join(emph).split(/\s+/).filter(Boolean)];
      } else tokens = para.split(/\s+/).filter(Boolean);
      const font = () => `${weight} ${size}px ${SANS}`;
      const lines = wrapWords(g, tokens.map((t) => t.replace('\u0000', '')), el.w, font, spaceW);
      let ti = 0;
      for (const line of lines) {
        const isEmph = line.map(() => tokens[ti++].startsWith('\u0000'));
        g.font = font();
        const widths = line.map((w, i) => g.measureText(w).width + (isEmph[i] ? size * 0.5 : 0));
        const lw = widths.reduce((s, w) => s + w, 0) + spaceW * (line.length - 1);
        let x = el.align === 'center' ? el.x + (el.w - lw) / 2 : el.align === 'right' ? el.x + el.w - lw : el.x;
        line.forEach((w, i) => {
          if (isEmph[i]) {
            const hh = size * 1.12;
            kit.rr(x, y - hh / 2, widths[i], hh, hh * 0.32);
            g.fillStyle = COL.orange;
            g.fill();
            kit.text(w, x + widths[i] / 2, y + size * 0.04, size, '#fff', SANS, weight);
          } else kit.text(w, x, y + size * 0.03, size, color, SANS, weight, 'left');
          x += widths[i] + spaceW;
        });
        y += lineH;
      }
    }
    return y - lineH / 2 - el.y;
  }

  function element(el: SlideElement, images: Map<string, ImageSource>, t: number): number {
    switch (el.type) {
      case 'title':
      case 'text':
        return richText(el);
      case 'chip':
        kit.chip(el.text || 'CHIP', el.x, el.y + el.h / 2, { bg: el.color === 'ink' ? COL.ink : COL[el.color], size: el.size });
        break;
      case 'agent': {
        const px = el.w / 10;
        kit.agent(el.x + el.w / 2, el.y + el.h, px, el.color === 'ink' ? COL.orange : COL[el.color], t, { bob: false });
        break;
      }
      case 'image': {
        const img = el.src ? images.get(el.src) : undefined;
        g.save();
        kit.rr(el.x, el.y, el.w, el.h, 24);
        g.clip();
        if (img) {
          // cover sığdırma
          const s = Math.max(el.w / img.width, el.h / img.height);
          const iw = img.width * s,
            ih = img.height * s;
          g.drawImage(img, el.x + (el.w - iw) / 2, el.y + (el.h - ih) / 2, iw, ih);
        } else {
          g.fillStyle = COL.card;
          g.fillRect(el.x, el.y, el.w, el.h);
          kit.text('görsel', el.x + el.w / 2, el.y + el.h / 2, 28, COL.mute, MONO, 700);
        }
        g.restore();
        break;
      }
    }
    return el.h;
  }


  // ---- Ceren's Picks ----
  const P = PICKS;
  const setTracking = (px: number) => {
    // Chrome destekler; desteklemeyen ortamda sessizce yok sayılır.
    (g as { letterSpacing?: string }).letterSpacing = `${px}px`;
  };

  function cover(img: ImageSource, x: number, y: number, w: number, h: number) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s,
      ih = img.height * s;
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }

  function picksBackground(slide: Slide | undefined, images: Map<string, ImageSource>) {
    g.fillStyle = P.bg;
    g.fillRect(0, 0, W, H);
    const img = slide?.bg ? images.get(slide.bg) : undefined;
    if (!img) return;
    cover(img, 0, 0, W, H);
    // Metin okunsun diye hafif karartma, alta doğru koyulaşır.
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0.30)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  /** Üst bant (hesap + kategori) ve alt bant (seri + sayfa no). Elle eklenmez, her slaytta otomatik. */
  function picksBands(p: CarouselProject, index: number) {
    const b = P.band;
    g.save();
    g.fillStyle = P.bg;
    g.fillRect(0, 0, W, b.headRule);
    g.fillStyle = P.rule;
    g.fillRect(0, b.headRule - 1, W, 2);
    g.fillRect(0, b.footRule - 1, W, 2);
    setTracking(0.4);
    kit.text(p.picks.handle, b.left, b.headY, b.size, P.white, P.INTER, b.weight, 'left');
    kit.text(p.picks.category, b.headRight, b.headY, b.size, P.white, P.INTER, b.weight, 'right');
    kit.text(seriesLabel(p.picks.series, p.picks.number), b.left, b.footY, b.size, P.white, P.INTER, b.weight, 'left');
    const page = pageLabel(index, p.slides.length);
    if (page) kit.text(page, b.footRight, b.footY, b.size, P.white, P.INTER, b.weight, 'right');
    g.restore();
  }

  const picksColor = (el: SlideElement) => el.fill ?? (el.color === 'ink' ? P.white : COL[el.color]);

  /** Inter, sıkı satır aralığı; vurgu kutu değil renk (kelime kelime, satıra bölünebilir). Kullanılan yüksekliği döndürür. */
  function picksText(el: SlideElement, accent: string, opts: { center?: boolean; color?: string } = {}): number {
    const size = el.size;
    const weight = el.weight ?? (el.type === 'title' ? 800 : el.type === 'pill' ? 700 : 400);
    const lineH = size * (el.type === 'title' ? 0.95 : 1.08);
    const track = el.type === 'title' ? -size * 0.03 : -size * 0.01;
    const color = opts.color ?? picksColor(el);
    const emph = el.emph?.trim() || null;
    const font = () => `${weight} ${size}px ${P.INTER}`;
    g.save();
    setTracking(track);
    g.font = font();
    const spaceW = g.measureText(' ').width;
    const lines: { words: string[]; hot: boolean[] }[] = [];
    for (const para of el.text.split('\n')) {
      const words: string[] = [];
      const hot: boolean[] = [];
      const push = (part: string, h: boolean) => part.split(/\s+/).filter(Boolean).forEach((w) => (words.push(w), hot.push(h)));
      if (emph && para.includes(emph)) {
        const at = para.indexOf(emph);
        push(para.slice(0, at), false);
        push(emph, true);
        push(para.slice(at + emph.length), false);
      } else push(para, false);
      // Boş paragraf tek boş satırdır (wrapWords boş girdide zaten bir boş satır döndürür).
      let hi = 0;
      for (const line of wrapWords(g, words, el.w, font, spaceW)) {
        lines.push({ words: line, hot: line.map(() => hot[hi++]) });
      }
    }
    const total = lines.length * lineH;
    let y = (opts.center ? el.y + (el.h - total) / 2 : el.y) + lineH / 2;
    const align = opts.center ? 'center' : el.align;
    for (const line of lines) {
      const widths = line.words.map((w) => g.measureText(w).width);
      const lw = widths.reduce((s, w) => s + w, 0) + spaceW * Math.max(0, line.words.length - 1);
      let x = align === 'center' ? el.x + (el.w - lw) / 2 : align === 'right' ? el.x + el.w - lw : el.x;
      line.words.forEach((w, i) => {
        kit.text(w, x, y + size * 0.04, size, line.hot[i] ? accent : color, P.INTER, weight, 'left');
        x += widths[i] + spaceW;
      });
      y += lineH;
    }
    g.restore();
    return total;
  }

  let holes = false;

  function picksElement(el: SlideElement, images: Map<string, ImageSource>, t: number, accent: string): number {
    switch (el.type) {
      case 'title':
      case 'text':
        return picksText(el, accent);
      case 'pill': {
        kit.rr(el.x, el.y, el.w, el.h, el.h / 2);
        g.fillStyle = el.fill ?? shade(accent, P.pillShade);
        g.fill();
        const pad = el.h * 0.32;
        const used = picksText({ ...el, x: el.x + pad, w: el.w - pad * 2, align: 'center' }, accent, { center: true, color: P.white });
        return used + el.h * 0.2 > el.h ? used + el.h * 0.2 : el.h;
      }
      case 'window': {
        const wn = P.window;
        // Video karesi (önizlemede <video>) yoksa ekran görüntüsü poster olarak kullanılır.
        const img = (el.video ? images.get(el.video) : undefined) ?? (el.src ? images.get(el.src) : undefined);
        const r = windowContentRect(el);
        g.save();
        kit.rr(el.x, el.y, el.w, el.h, wn.radius);
        g.clip();
        g.fillStyle = '#161616';
        g.fillRect(el.x, el.y, el.w, el.h);
        if (el.video && holes) g.clearRect(r.x, r.y, r.w, r.h); // export: video ffmpeg ile alta konur
        else if (img) cover(img, r.x, r.y, r.w, r.h);
        else kit.text(el.video ? 'video yükleniyor' : 'ekran görüntüsü', r.x + r.w / 2, r.y + r.h / 2, 30, '#8a8a8a', P.INTER, 500);
        g.fillStyle = wn.barColor;
        g.fillRect(el.x, el.y, el.w, wn.bar);
        wn.dots.forEach((c, i) => {
          g.beginPath();
          g.arc(el.x + wn.dotX[i], el.y + wn.bar / 2, wn.dotR, 0, Math.PI * 2);
          g.fillStyle = c;
          g.fill();
        });
        g.restore();
        return el.h;
      }
      case 'image': {
        // Logo ve çıkartmalar: kırpmadan sığdır.
        const img = el.src ? images.get(el.src) : undefined;
        if (img) {
          const s = Math.min(el.w / img.width, el.h / img.height);
          const iw = img.width * s,
            ih = img.height * s;
          g.drawImage(img, el.x + (el.w - iw) / 2, el.y + (el.h - ih) / 2, iw, ih);
        } else {
          g.save();
          g.setLineDash([10, 8]);
          g.strokeStyle = '#555';
          g.lineWidth = 2;
          kit.rr(el.x + 1, el.y + 1, el.w - 2, el.h - 2, 16);
          g.stroke();
          g.restore();
          kit.text('görsel', el.x + el.w / 2, el.y + el.h / 2, 26, '#8a8a8a', P.INTER, 500);
        }
        return el.h;
      }
      default:
        return element(el, images, t);
    }
  }

  return {
    kit,
    /** Slaytı çizer. Dönen değer: metni kutusundan taşan öğelerin id → gereken yükseklik. */
    render(
      p: CarouselProject,
      index: number,
      images: Map<string, ImageSource> = new Map(),
      t = 0.2,
      opts: { videoHoles?: boolean } = {},
    ): Map<string, number> {
      const slide: Slide | undefined = p.slides[index];
      holes = !!opts.videoHoles;
      const overflow = new Map<string, number>();
      g.save();
      g.clearRect(0, 0, W, H);
      const picks = p.style === 'picks';
      if (picks) picksBackground(slide, images);
      else background(p, index);
      const accent = slide?.accent ?? PICKS_GOLD;
      slide?.elements.forEach((el) => {
        if (el.hidden) return;
        const used = picks ? picksElement(el, images, t, accent) : element(el, images, t);
        if (used > el.h + 2) overflow.set(el.id, Math.ceil(used));
      });
      if (picks) picksBands(p, index);
      g.restore();
      return overflow;
    },
  };
}
