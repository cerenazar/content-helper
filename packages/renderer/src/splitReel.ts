import type { ReelProject } from '@cb/schema';
import { REEL } from '@cb/schema';
import { COL, SANS, MONO, clamp, eo, eio, back, lerp, shade, createKit, type Kit } from './kit';
import { timeline, sceneRange, type Timeline } from './timing';

const { W, H, TOP } = REEL;
const TR = 0.28;

export type SceneFn = (t: number, lt: number, a: number) => void;

/** scenes.js'e verilen yardımcılar. Sözleşme apps/server/templates/CLAUDE.md'de. */
export type SceneHelpers = Kit & {
  W: number;
  H: number;
  TOP: number;
  COL: typeof COL;
  SANS: string;
  MONO: string;
  clamp: typeof clamp;
  eo: typeof eo;
  eio: typeof eio;
  back: typeof back;
  lerp: typeof lerp;
  shade: typeof shade;
  cue: (s: string) => number;
};

/**
 * scenes.js gövdesini derler. Dosya `h` ile yardımcıları alır ve sahne fonksiyonlarını dizi olarak döndürür:
 *   const { g, agent, COL } = h;
 *   function scene1(t, lt, a) { ... }
 *   return [scene1];
 */
export function compileScenes(code: string, h: SceneHelpers): SceneFn[] {
  const fn = new Function('h', '"use strict";\n' + code);
  const out = fn(h);
  if (!Array.isArray(out) || out.some((f) => typeof f !== 'function'))
    throw new Error('scenes.js bir fonksiyon dizisi döndürmeli: return [scene1, scene2, ...]');
  return out as SceneFn[];
}

export interface ReelRenderer {
  kit: Kit;
  /** Proje veya sahne kodu değişince çağır. Sahne derleme hatasını döndürür (yoksa null). */
  load(p: ReelProject, scenesCode: string): string | null;
  /** under: alt yarıyı (video) sahnelerden önce çizmek için. Export'ta verilmez, alt yarı şeffaf kalır. */
  render(t: number, under?: (g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void): void;
  readonly timeline: Timeline;
  /** Son karede sahne çalışırken oluşan hata (önizlemede gösterilir). */
  readonly lastError: string | null;
}

export function createReelRenderer(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, opts: { throwOnError?: boolean } = {}): ReelRenderer {
  const kit = createKit(g, W);
  let project: ReelProject | null = null;
  let tl: Timeline = { captions: [], duration: 0 };
  let scenes: SceneFn[] = [];
  let lastError: string | null = null;

  const cue = (s: string) => tl.captions.find((c) => c.text === s)?.start ?? 0;
  const helpers: SceneHelpers = { ...kit, W, H, TOP, COL, SANS, MONO, clamp, eo, eio, back, lerp, shade, cue };

  function bg() {
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, TOP);
    g.fillStyle = COL.grid;
    for (let y = 36; y < TOP; y += 40) for (let x = 36; x < W; x += 40) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    const hd = project!.header;
    kit.chip(hd.world, 72, 84, { size: 24 });
    g.font = `600 26px ${MONO}`;
    const cw = g.measureText(hd.world).width + 26.4;
    kit.text(hd.topic, 72 + cw + 28, 85, 26, COL.mute, MONO, 600, 'left');
  }

  function captions(t: number) {
    const cs = tl.captions;
    if (!cs.length) return;
    const c = cs.find((c) => t >= c.start && t < c.end) || (t >= cs[cs.length - 1].start ? cs[cs.length - 1] : null);
    if (!c) return;
    // Hook kuralı: ilk karede ekran dolu olsun. İlk caption animasyonsuz görünür.
    const first = c === cs[0];
    const lt = t - c.start,
      pin = first ? 1 : back(lt / 0.18);
    const base = 74,
      big = Math.round(base * 1.42);
    let parts: { s: string; e: boolean; w?: number }[] = [];
    const i = c.emph ? c.text.indexOf(c.emph) : -1;
    if (c.emph && i >= 0) {
      if (i > 0) parts.push({ s: c.text.slice(0, i).trimEnd(), e: false });
      parts.push({ s: c.emph, e: true });
      const rest = c.text.slice(i + c.emph.length).trim();
      if (rest) parts.push({ s: rest, e: false });
    } else parts = [{ s: c.text, e: false }];
    const gap = 22;
    parts.forEach((p) => {
      g.font = `900 ${p.e ? big : base}px ${SANS}`;
      p.w = g.measureText(p.s).width;
    });
    const total = parts.reduce((s, p) => s + p.w! + (p.e ? 44 : 0), 0) + gap * (parts.length - 1);
    const hasEmph = parts.some((p) => p.e);
    g.save();
    g.translate(W / 2, TOP);
    g.scale(lerp(0.88, 1, pin), lerp(0.88, 1, pin));
    g.globalAlpha = first ? 1 : clamp(lt / 0.08);
    const ph = hasEmph ? big * 1.42 : base * 1.55;
    g.shadowColor = 'rgba(31,26,23,0.22)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 8;
    kit.rr(-total / 2 - 40, -ph / 2, total + 80, ph, ph / 2);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.shadowColor = 'transparent';
    let x = -total / 2;
    parts.forEach((p) => {
      if (p.e) {
        const hh = big * 1.12;
        kit.rr(x, -hh / 2, p.w! + 44, hh, hh * 0.32);
        g.fillStyle = COL.orange;
        g.fill();
        kit.text(p.s, x + 22 + p.w! / 2, 4, big, '#fff', SANS, 900);
        x += p.w! + 44 + gap;
      } else {
        kit.text(p.s, x + p.w! / 2, 3, base, COL.ink, SANS, 900);
        x += p.w! + gap;
      }
    });
    g.restore();
  }

  function sceneChip(i: number, a: number) {
    const sc = project!.scenes[i];
    if (sc?.chip) kit.chipRight(sc.chip.label, 84, COL[sc.chip.color], a);
  }

  function runScene(i: number, t: number, lt: number, a: number) {
    g.save();
    try {
      scenes[i](t, lt, a);
    } catch (e) {
      const msg = `sahne ${i + 1}: ${(e as Error).message}`;
      if (opts.throwOnError) throw new Error(msg);
      lastError = msg;
    }
    g.restore();
  }

  return {
    kit,
    get timeline() {
      return tl;
    },
    get lastError() {
      return lastError;
    },
    load(p, code) {
      project = p;
      tl = timeline(p.captions);
      try {
        scenes = compileScenes(code, helpers);
        return null;
      } catch (e) {
        scenes = [];
        if (opts.throwOnError) throw e;
        return (e as Error).message;
      }
    },
    render(t, under) {
      if (!project) return;
      lastError = null;
      g.save();
      g.clearRect(0, 0, W, H);
      bg();
      if (under) {
        g.save();
        under(g);
        g.restore();
      }
      const n = scenes.length;
      for (let i = 0; i < n; i++) {
        const r = sceneRange(tl, i, n);
        if (!r) continue;
        const [s, e] = r;
        if (t < s - 0.01 || t > e + TR) continue;
        const aIn = i === 0 ? 1 : clamp((t - s) / TR),
          aOut = i === n - 1 ? 1 : 1 - clamp((t - e) / TR);
        const a = Math.min(aIn, aOut);
        if (a > 0) {
          sceneChip(i, a);
          runScene(i, t, t - s, a);
        }
      }
      const gr = g.createLinearGradient(0, TOP - 18, 0, TOP);
      gr.addColorStop(0, 'rgba(31,26,23,0)');
      gr.addColorStop(1, 'rgba(31,26,23,0.10)');
      g.fillStyle = gr;
      g.fillRect(0, TOP - 18, W, 18);
      captions(t);
      g.restore();
    },
  };
}
