import type { Clip, Cut, ReelProject, Sfx } from '@cb/schema';
import { timeline } from './timing';
import { cutStarts } from './crop';

/**
 * Timeline düzenleme hesapları (CapCut tarzı). Saf fonksiyonlar: store bunları çağırır,
 * birim testleri bunları sabitler. EDL ardışık olduğu için kesitler arasında boşluk olmaz;
 * silme ve kırpma her zaman "ripple" davranır (sonrakiler kayar).
 */

/** Bir kesitin en kısa süresi (sn). */
export const MIN_CUT = 0.2;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** EDL'deki t anında (timeline sn) kesiti ikiye böler. Kenara çok yakınsa ya da kesit yoksa null. */
export function splitCut(edl: Cut[], t: number, newId: () => string): { edl: Cut[]; left: string; right: string } | null {
  let s = 0;
  for (let i = 0; i < edl.length; i++) {
    const c = edl[i];
    if (t > s && t < s + c.dur) {
      const d = r3(t - s);
      if (d < MIN_CUT / 2 || c.dur - d < MIN_CUT / 2) return null;
      const a: Cut = { ...c, dur: d };
      const b: Cut = { ...c, id: newId(), in: r3(c.in + d), dur: r3(c.dur - d) };
      const out = edl.slice();
      out.splice(i, 1, a, b);
      return { edl: out, left: a.id, right: b.id };
    }
    s += c.dur;
  }
  return null;
}

/**
 * Kesit kenarını kırpar. edge 'l': giriş noktası (in) kayar, süre karşı yönde değişir.
 * edge 'r': süre değişir. dt pozitifse kenar sağa gider. Kaynak sınırları (0 ve klip süresi)
 * ve MIN_CUT korunur. Ripple: kesitin timeline'daki başlangıcı sabit, sonrakiler kayar.
 */
export function trimCut(edl: Cut[], clips: Pick<Clip, 'id' | 'probe'>[], id: string, edge: 'l' | 'r', dt: number): Cut[] {
  return edl.map((c) => {
    if (c.id !== id) return c;
    const srcDur = clips.find((k) => k.id === c.clip)?.probe.duration ?? Infinity;
    if (edge === 'l') {
      const d = Math.max(-c.in, Math.min(c.dur - MIN_CUT, dt));
      return { ...c, in: r3(c.in + d), dur: r3(c.dur - d) };
    }
    const max = Math.max(MIN_CUT, srcDur - c.in);
    return { ...c, dur: r3(Math.max(MIN_CUT, Math.min(max, c.dur + dt))) };
  });
}

/** Ripple silme: kesit çıkar, sonrakiler sola kayar (EDL ardışık olduğu için boşluk kalmaz). */
export function rippleDelete(edl: Cut[], id: string): Cut[] {
  return edl.filter((c) => c.id !== id);
}

/** Kesiti from sırasından to sırasına taşır (to, taşımadan sonraki hedef indeks). */
export function moveCut<T>(xs: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= xs.length) return xs;
  const out = xs.slice();
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/**
 * Sürüklenen kesitin bırakılacağı sıra. t: imlecin timeline zamanı.
 * Sürüklenen kesit çıkarılmış listede, orta noktası t'den küçük kesit sayısı.
 */
export function dropIndex(edl: Pick<Cut, 'dur'>[], from: number, t: number): number {
  const rest = edl.filter((_, i) => i !== from);
  let s = 0;
  let n = 0;
  for (const c of rest) {
    if (t > s + c.dur / 2) n++;
    s += c.dur;
  }
  return n;
}

/** Yapışma hedefleri: oynatma kafası, kesit kenarları, caption kenarları, SFX başlangıçları. exclude: atlanacak öğe id'leri. */
export function snapTargets(p: Pick<ReelProject, 'edl' | 'captions' | 'sfx'>, playhead: number, exclude: string[] = []): number[] {
  const out = new Set<number>([0, r3(playhead)]);
  const starts = cutStarts(p);
  p.edl.forEach((c, i) => {
    if (exclude.includes(c.id)) return;
    out.add(r3(starts[i]));
    out.add(r3(starts[i] + c.dur));
  });
  for (const c of timeline(p.captions).captions) {
    if (exclude.includes(c.id)) continue;
    out.add(c.start);
    out.add(c.end);
  }
  for (const s of p.sfx) if (!exclude.includes(s.id)) out.add(r3(s.at));
  return [...out].sort((a, b) => a - b);
}

/** t'yi tol (sn) içindeki en yakın hedefe yapıştırır. */
export function snap(t: number, targets: number[], tol: number): { t: number; to: number | null } {
  let best: number | null = null;
  for (const x of targets) if (Math.abs(x - t) <= tol && (best === null || Math.abs(x - t) < Math.abs(best - t))) best = x;
  return best === null ? { t, to: null } : { t: best, to: best };
}

/** Yakınlaştırma sınırları (px / sn). */
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 480;

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** İmlecin altındaki an sabit kalsın diye yeni scrollLeft. anchorX: içerik alanı içindeki imleç x'i (scroll'suz). */
export function zoomScroll(scrollLeft: number, anchorX: number, z0: number, z1: number): number {
  const t = (scrollLeft + anchorX) / z0;
  return Math.max(0, t * z1 - anchorX);
}

/** SFX'i taşır; zaman 0'ın altına inmez. */
export function moveSfx(sfx: Sfx[], id: string, at: number): Sfx[] {
  return sfx.map((s) => (s.id === id ? { ...s, at: r3(Math.max(0, at)) } : s));
}

/**
 * Export için ses karışımı filtresi (ffmpeg -filter_complex parçası).
 * base: ana ses etiketi, ör. "[0:a]" (konuşma) ya da "[2:a]" (sessizlik).
 * first: ilk SFX girdisinin ffmpeg girdi indeksi. Her SFX 48 kHz stereo yapılır, kazancı uygulanır,
 * adelay ile `at` anına ötelenir; amix normalize=0 ile ana sesin seviyesi düşmez.
 * Çıkış etiketi [a]; süre `duration`'a kırpılır.
 */
export function sfxFilter(base: string, sfx: Pick<Sfx, 'at' | 'gain'>[], first: number, duration: number): string {
  const d = duration.toFixed(3);
  const head = `${base}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${d}[base]`;
  const used = sfx.map((s, i) => ({ ...s, input: first + i })).filter((s) => s.at < duration && s.gain > 0);
  if (!used.length) return head.replace('[base]', '[a]');
  const parts = [head];
  used.forEach((s, k) => {
    const ms = Math.round(s.at * 1000);
    parts.push(`[${s.input}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${s.gain.toFixed(3)},adelay=${ms}|${ms}[s${k}]`);
  });
  parts.push(`[base]${used.map((_, k) => `[s${k}]`).join('')}amix=inputs=${used.length + 1}:duration=first:dropout_transition=0:normalize=0,atrim=0:${d}[a]`);
  return parts.join(';');
}
