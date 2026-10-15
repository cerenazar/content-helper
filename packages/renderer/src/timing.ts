import type { Caption, ReelProject } from '@cb/schema';

/** Sondaki bekleme (sn), skill'deki captions.py ile aynı. */
export const TAIL = 1.2;

export interface TimedCaption {
  id: string;
  text: string;
  emph: string | null;
  scene: number;
  start: number;
  end: number;
}

export interface Timeline {
  captions: TimedCaption[];
  duration: number;
}

/** Python round(x, 2) ile aynı: double değerin tam ondalık açılımına göre yuvarlar. */
const r2 = (x: number) => Number(x.toFixed(2));

/** Skill formülü: d = 0.34 + 0.039 × karakter (+0.3 vurgu, +0.15 nokta/soru), 0.62–1.7 arası. */
export function formulaDur(text: string, emph: string | null): number {
  let d = 0.34 + 0.039 * [...text].length;
  if (emph) d += 0.3;
  if (text.endsWith('.') || text.endsWith('?')) d += 0.15;
  return r2(Math.min(Math.max(d, 0.62), 1.7));
}

export function captionDur(c: Pick<Caption, 'text' | 'emph' | 'dur'>): number {
  return c.dur ?? formulaDur(c.text, c.emph);
}

export function timeline(captions: Caption[]): Timeline {
  let t = 0;
  const out: TimedCaption[] = captions.map((c) => {
    const d = captionDur(c);
    const tc = { id: c.id, text: c.text, emph: c.emph, scene: c.scene, start: r2(t), end: r2(t + d) };
    t += d;
    return tc;
  });
  return { captions: out, duration: r2(t + TAIL) };
}

/** i. sahnenin (0 tabanlı) [başlangıç, bitiş] aralığı; skill'deki sceneRange. */
export function sceneRange(tl: Timeline, i: number, sceneCount: number): [number, number] | null {
  const cs = tl.captions.filter((c) => c.scene === i + 1);
  if (!cs.length) return null;
  return [cs[0].start, i === sceneCount - 1 ? tl.duration + 5 : cs[cs.length - 1].end];
}

export function edlDuration(p: Pick<ReelProject, 'edl'>): number {
  return r2(p.edl.reduce((s, c) => s + c.dur, 0));
}

export function frameCount(duration: number, fps = 30): number {
  return Math.floor(duration * fps);
}
