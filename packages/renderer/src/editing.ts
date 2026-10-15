// Carousel editörünün saf geometri mantığı: hizalama kılavuzları ve yapışma, hizala/dağıt,
// katman sırası, boyutlandırma tutamakları. DOM'a dokunmaz; birim testleri burayı sabitler.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Kılavuz çizgisi: axis 'x' dikey çizgi (x = pos), 'y' yatay çizgi (y = pos). from/to çizginin uzandığı aralık. */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

export interface SnapFrame {
  W: number;
  H: number;
  /** Kenar boşluğu (picks 76, pixel 72). */
  margin: number;
}

/** Yapışma eşiği (slayt pikseli). Ekranda ~6 px'e denk gelsin diye ölçekle çarpılarak verilebilir. */
export const SNAP_PX = 8;

export function bounds(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Target {
  pos: number;
  /** Kılavuzun uzanacağı aralık (diğer eksende). null: slayt boyunca. */
  span: [number, number] | null;
}

/** Bir eksendeki hedefler: slayt kenarları, kenar boşlukları, orta çizgi, diğer öğelerin kenar ve merkezleri. */
function targets(axis: 'x' | 'y', frame: SnapFrame, others: Box[]): Target[] {
  const size = axis === 'x' ? frame.W : frame.H;
  const out: Target[] = [0, frame.margin, size / 2, size - frame.margin, size].map((pos) => ({ pos, span: null }));
  for (const o of others) {
    const [a, len, b, blen] = axis === 'x' ? [o.x, o.w, o.y, o.h] : [o.y, o.h, o.x, o.w];
    for (const pos of [a, a + len / 2, a + len]) out.push({ pos, span: [b, b + blen] });
  }
  return out;
}

/**
 * Adayların (ör. sol, orta, sağ kenar) en yakın hedefe uzaklığı. Eşik içinde en yakın eşleşme kazanır;
 * eşit uzaklıktaki tüm hedefler kılavuz olarak döner.
 */
export function snapAxis(cands: number[], tg: Target[], threshold: number): { delta: number; hits: { cand: number; t: Target }[] } | null {
  let best = Infinity;
  for (const c of cands) for (const t of tg) best = Math.min(best, Math.abs(t.pos - c));
  if (best > threshold) return null;
  let delta: number | null = null;
  const hits: { cand: number; t: Target }[] = [];
  for (const c of cands)
    for (const t of tg) {
      const d = t.pos - c;
      if (Math.abs(Math.abs(d) - best) > 1e-6) continue;
      if (delta === null) delta = d;
      if (Math.abs(d - delta) < 1e-6) hits.push({ cand: c, t });
    }
  return { delta: delta ?? 0, hits };
}

function guidesFor(axis: 'x' | 'y', hits: { t: Target }[], box: Box, frame: SnapFrame): Guide[] {
  const seen = new Set<number>();
  const out: Guide[] = [];
  for (const { t } of hits) {
    if (seen.has(t.pos)) continue;
    seen.add(t.pos);
    const [b0, b1] = axis === 'x' ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
    const full = axis === 'x' ? frame.H : frame.W;
    const [from, to] = t.span ? [Math.min(b0, t.span[0]), Math.max(b1, t.span[1])] : [0, full];
    out.push({ axis, pos: t.pos, from, to });
  }
  return out;
}

/**
 * Taşıma: önerilen kutu (grup sınırı) için yapışma düzeltmesi ve çizilecek kılavuzlar.
 * Sol/orta/sağ ve üst/orta/alt kenarlar slayt çizgilerine ve diğer öğelere yapışır.
 */
export function snapMove(box: Box, others: Box[], frame: SnapFrame, threshold = SNAP_PX): { dx: number; dy: number; guides: Guide[] } {
  const sx = snapAxis([box.x, box.x + box.w / 2, box.x + box.w], targets('x', frame, others), threshold);
  const sy = snapAxis([box.y, box.y + box.h / 2, box.y + box.h], targets('y', frame, others), threshold);
  const dx = sx?.delta ?? 0,
    dy = sy?.delta ?? 0;
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  return {
    dx,
    dy,
    guides: [...(sx ? guidesFor('x', sx.hits, moved, frame) : []), ...(sy ? guidesFor('y', sy.hits, moved, frame) : [])],
  };
}

/** Boyutlandırma tutamağı: n, s, e, w ve köşeler. */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface ResizeOpts {
  /** En-boy oranını koru (⇧ ile görsel/pencere). */
  keepAspect?: boolean;
  minW?: number;
  minH?: number;
}

/** Tutamağı (dx, dy) kadar çekince oluşan kutu. Karşı kenar sabit kalır. */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, o: ResizeOpts = {}): Box {
  const minW = o.minW ?? 20,
    minH = o.minH ?? 20;
  const west = handle.includes('w'),
    east = handle.includes('e'),
    north = handle.includes('n'),
    south = handle.includes('s');
  let w = start.w + (east ? dx : west ? -dx : 0);
  let h = start.h + (south ? dy : north ? -dy : 0);
  if (o.keepAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if ((east || west) && (north || south)) {
      // Köşe: fare hangi eksende daha çok gittiyse o belirler.
      if (Math.abs(w / start.w) >= Math.abs(h / start.h)) h = w / ratio;
      else w = h * ratio;
    } else if (east || west) h = w / ratio;
    else w = h * ratio;
    if (w < minW) (w = minW), (h = w / ratio);
    if (h < minH) (h = minH), (w = h * ratio);
  }
  w = Math.max(minW, w);
  h = Math.max(minH, h);
  let x = west ? start.x + start.w - w : start.x;
  let y = north ? start.y + start.h - h : start.y;
  // Yalnız yatay/dikey tutamakta oran korunursa diğer eksen ortadan büyür.
  if (o.keepAspect && !(north || south)) y = start.y + (start.h - h) / 2;
  if (o.keepAspect && !(east || west)) x = start.x + (start.w - w) / 2;
  return { x, y, w, h };
}

/** Boyutlandırırken hareket eden kenar(lar)ı hedeflere yapıştırır. */
export function snapResize(box: Box, handle: Handle, others: Box[], frame: SnapFrame, threshold = SNAP_PX): { box: Box; guides: Guide[] } {
  const out = { ...box };
  const guides: Guide[] = [];
  if (handle.includes('e') || handle.includes('w')) {
    const edge = handle.includes('e') ? box.x + box.w : box.x;
    const s = snapAxis([edge], targets('x', frame, others), threshold);
    if (s) {
      if (handle.includes('e')) out.w += s.delta;
      else (out.x += s.delta), (out.w -= s.delta);
      guides.push(...guidesFor('x', s.hits, out, frame));
    }
  }
  if (handle.includes('n') || handle.includes('s')) {
    const edge = handle.includes('s') ? box.y + box.h : box.y;
    const s = snapAxis([edge], targets('y', frame, others), threshold);
    if (s) {
      if (handle.includes('s')) out.h += s.delta;
      else (out.y += s.delta), (out.h -= s.delta);
      guides.push(...guidesFor('y', s.hits, out, frame));
    }
  }
  return { box: out, guides };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';

/**
 * Hizala. Birden fazla kutu seçiliyse grubun sınırına, tek kutuysa slayta göre.
 * Dönen dizi girişle aynı sırada yeni x/y değerleridir.
 */
export function alignBoxes(boxes: Box[], mode: AlignMode, frame?: { W: number; H: number }): { x: number; y: number }[] {
  const ref = boxes.length === 1 && frame ? { x: 0, y: 0, w: frame.W, h: frame.H } : bounds(boxes);
  return boxes.map((b) => {
    switch (mode) {
      case 'left':
        return { x: ref.x, y: b.y };
      case 'hcenter':
        return { x: ref.x + (ref.w - b.w) / 2, y: b.y };
      case 'right':
        return { x: ref.x + ref.w - b.w, y: b.y };
      case 'top':
        return { x: b.x, y: ref.y };
      case 'vmiddle':
        return { x: b.x, y: ref.y + (ref.h - b.h) / 2 };
      case 'bottom':
        return { x: b.x, y: ref.y + ref.h - b.h };
    }
  });
}

/**
 * Dağıt: uçtaki iki kutu yerinde kalır, aradakiler eşit boşlukla dizilir (Canva/Figma gibi).
 * 3'ten az kutuda değişiklik yok. Dönen dizi girişle aynı sırada.
 */
export function distributeBoxes(boxes: Box[], axis: 'h' | 'v'): { x: number; y: number }[] {
  const out = boxes.map((b) => ({ x: b.x, y: b.y }));
  if (boxes.length < 3) return out;
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y);
  const len = (b: Box) => (axis === 'h' ? b.w : b.h);
  const order = boxes.map((b, i) => ({ b, i })).sort((a, c) => pos(a.b) - pos(c.b) || a.i - c.i);
  const first = order[0].b,
    last = order[order.length - 1].b;
  const span = pos(last) + len(last) - pos(first);
  const total = order.reduce((s, o) => s + len(o.b), 0);
  const gap = (span - total) / (order.length - 1);
  let cur = pos(first);
  for (const o of order) {
    if (axis === 'h') out[o.i].x = cur;
    else out[o.i].y = cur;
    cur += len(o.b) + gap;
  }
  return out;
}

export type ZOp = 'forward' | 'backward' | 'front' | 'back';

/**
 * Katman sırası. Dizide sonraki öğe üstte çizilir. Seçili öğelerin kendi aralarındaki sırası korunur.
 */
export function reorderZ<T extends { id: string }>(items: T[], ids: Iterable<string>, op: ZOp): T[] {
  const sel = new Set(ids);
  if (!items.some((i) => sel.has(i.id))) return items;
  if (op === 'front') return [...items.filter((i) => !sel.has(i.id)), ...items.filter((i) => sel.has(i.id))];
  if (op === 'back') return [...items.filter((i) => sel.has(i.id)), ...items.filter((i) => !sel.has(i.id))];
  const out = items.slice();
  if (op === 'forward') {
    for (let k = out.length - 2; k >= 0; k--)
      if (sel.has(out[k].id) && !sel.has(out[k + 1].id)) [out[k], out[k + 1]] = [out[k + 1], out[k]];
  } else {
    for (let k = 1; k < out.length; k++)
      if (sel.has(out[k].id) && !sel.has(out[k - 1].id)) [out[k], out[k - 1]] = [out[k - 1], out[k]];
  }
  return out;
}

/** Diziden bir öğeyi alıp başka bir sıraya koyar (sürükle-bırak). `to`, çıkarmadan önceki dizideki hedef indeks. */
export function moveItem<T>(xs: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= xs.length) return xs;
  const out = xs.slice();
  const [it] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to > from ? to - 1 : to)), 0, it);
  return out;
}

/** Seçim dikdörtgeni ile kesişen kutular (kısmi kesişme yeter, Canva gibi). */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** İki noktadan normalize dikdörtgen. */
export function rectFrom(x0: number, y0: number, x1: number, y1: number): Box {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** Yapıştırma kaydırması: aynı slayta art arda yapıştırmada her seferinde 20 px kayar. Başka slayta aynı yere. */
export function pasteOffset(sameSlide: boolean, count: number, step = 20): number {
  return sameSlide ? step * Math.max(1, count) : 0;
}
