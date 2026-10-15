import type { Cut, Clip, ReelProject } from '@cb/schema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Hedef oran 1080/960. */
export const BOTTOM_RATIO = 1.125;

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Alt yarı kırpması (dikey hâle getirilmiş kaynak boyutları üzerinden).
 * 3840×2160'ta skill'deki değerleri birebir verir:
 *   yüz: 2170:1929:835:0   el/masa: 2430:2160:705:0
 * Diğer yatay kaynaklarda aynı oranlar ölçeklenir. Dikey kaynakta tam genişlik alınır.
 */
export function cropRect(kind: Cut['kind'], W: number, H: number): Rect {
  if (W === 3840 && H === 2160) return kind === 'face' ? { x: 835, y: 0, w: 2170, h: 1929 } : { x: 705, y: 0, w: 2430, h: 2160 };
  if (W / H > BOTTOM_RATIO) {
    const h = kind === 'face' ? even(H * (1929 / 2160)) : even(H);
    const w = Math.min(even(h * BOTTOM_RATIO), even(W));
    const x = even(Math.min(W * ((kind === 'face' ? 835 : 705) / 3840), W - w));
    return { x, y: 0, w, h };
  }
  const w = even(W);
  const h = Math.min(even(w / BOTTOM_RATIO), even(H));
  const y = even((H - h) * (kind === 'face' ? 0.3 : 0.5));
  return { x: 0, y, w, h };
}

/** Kaynağın döndürme sonrası görünen boyutları. */
export function displaySize(clip: Clip): { W: number; H: number } {
  const r = Math.abs(clip.probe.rotation) % 180 === 90;
  return r ? { W: clip.probe.height, H: clip.probe.width } : { W: clip.probe.width, H: clip.probe.height };
}

export function ffmpegCrop(cut: Cut, clip: Clip): string {
  const { W, H } = displaySize(clip);
  const r = cropRect(cut.kind, W, H);
  return `crop=${r.w}:${r.h}:${r.x}:${r.y},scale=1080:960`;
}

export interface CutAt {
  cut: Cut;
  index: number;
  /** Kesitin timeline'daki başlangıcı */
  start: number;
  /** Kaynak içindeki zaman */
  srcT: number;
}

/** t anında alt yarıda hangi kesit oynuyor? */
export function cutAt(p: Pick<ReelProject, 'edl'>, t: number): CutAt | null {
  let s = 0;
  for (let i = 0; i < p.edl.length; i++) {
    const c = p.edl[i];
    if (t >= s && t < s + c.dur) return { cut: c, index: i, start: s, srcT: c.in + (t - s) };
    s += c.dur;
  }
  return null;
}

export function cutStarts(p: Pick<ReelProject, 'edl'>): number[] {
  let s = 0;
  return p.edl.map((c) => {
    const v = s;
    s += c.dur;
    return v;
  });
}
