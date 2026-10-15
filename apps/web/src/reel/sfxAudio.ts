import { create } from 'zustand';
import type { Sfx } from '@cb/schema';

/**
 * Ses efektleri önizlemesi (WebAudio). Dosyalar bir kez çözülür; süre ve dalga tepe değerleri
 * timeline'da blok çizmek için paylaşılır. Oynatma saati Preview döngüsüdür: her karede tick()
 * çağrılır, efektler kısa bir ileri bakışla AudioContext saatine planlanır.
 */

export interface SfxMeta {
  dur: number;
  /** Saniyede PEAK_RATE tepe değeri (0–1). */
  peaks: number[];
}
export const PEAK_RATE = 100;

/** Görünen ad: "media/sfx-pop.wav" → "pop", "media/lx3k9a-kapı.mp3" → "kapı". */
export function sfxName(src: string): string {
  return src
    .replace(/^.*\//, '')
    .replace(/^sfx-/, '')
    .replace(/^[0-9a-z]{6,10}-(?=.)/, '')
    .replace(/\.[^.]+$/, '');
}

export const useSfxMeta = create<{ meta: Record<string, SfxMeta> }>(() => ({ meta: {} }));

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let decoder: OfflineAudioContext | null = null;
let ctx: AudioContext | null = null;

function peaksOf(b: AudioBuffer): number[] {
  const ch = b.getChannelData(0);
  const per = Math.max(1, Math.floor(b.sampleRate / PEAK_RATE));
  const out: number[] = [];
  for (let i = 0; i < ch.length; i += per) {
    let m = 0;
    for (let j = i; j < Math.min(ch.length, i + per); j++) m = Math.max(m, Math.abs(ch[j]));
    out.push(Math.min(1, m));
  }
  return out;
}

/** Dosyayı indirip çözer (kullanıcı hareketi gerekmez: OfflineAudioContext). key: genelde sfx.src. */
export function loadSfx(key: string, url: string): Promise<AudioBuffer | null> {
  const had = loading.get(key);
  if (had) return had;
  decoder ??= new OfflineAudioContext(1, 1, 48000);
  const p = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((a) => decoder!.decodeAudioData(a))
    .then((b) => {
      buffers.set(key, b);
      useSfxMeta.setState((s) => ({ meta: { ...s.meta, [key]: { dur: b.duration, peaks: peaksOf(b) } } }));
      return b;
    })
    .catch(() => {
      loading.delete(key); // sonra yeniden denensin
      return null;
    });
  loading.set(key, p);
  return p;
}

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function play(b: AudioBuffer, gain: number, when: number, offset = 0): AudioBufferSourceNode {
  const a = audio();
  const src = a.createBufferSource();
  src.buffer = b;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start(when, offset);
  return src;
}

/** Medya panelindeki "dinle" düğmesi: hemen bir kez çalar. */
export async function previewSfx(key: string, url: string, gain = 1) {
  const b = buffers.get(key) ?? (await loadSfx(key, url));
  if (b) play(b, gain, 0);
}

// ---- Oynatmaya eşlik ----
const LOOKAHEAD = 0.2;
const active = new Map<string, AudioBufferSourceNode>();
let running = false;
let lastT = 0;
let lastWall = 0;
let lastSig = '';

function stopAll() {
  for (const s of active.values()) {
    try {
      s.stop();
    } catch {
      /* zaten durmuş */
    }
  }
  active.clear();
}

/**
 * Her karede çağrılır. Normal hızda oynarken efektleri planlar; durunca, hız değişince,
 * oynatma kafası atlayınca ya da efekt listesi değişince çalanları keser ve yeniden planlar.
 */
export function tickSfx(sfx: Sfx[], time: number, playing: boolean, rate: number) {
  const now = performance.now();
  if (!playing || rate !== 1 || !sfx.length) {
    if (running) stopAll();
    running = false;
    return;
  }
  const sig = sfx.map((s) => `${s.id}:${s.src}:${s.at}:${s.gain}`).join('|');
  const expected = lastT + (now - lastWall) / 1000;
  const jumped = running && Math.abs(time - expected) > 0.25;
  if (!running || jumped || sig !== lastSig) {
    stopAll();
    running = true;
    lastSig = sig;
    // Başlangıçta ya da atlamada: o an çalıyor olması gerekenler ofsetle başlar.
    for (const s of sfx) {
      const b = buffers.get(s.src);
      if (b && s.at < time && time < s.at + b.duration) active.set(s.id, play(b, s.gain, 0, time - s.at));
    }
  }
  const a = audio();
  for (const s of sfx) {
    if (active.has(s.id)) continue;
    const b = buffers.get(s.src);
    if (!b) continue;
    if (s.at >= time && s.at < time + LOOKAHEAD) {
      const src = play(b, s.gain, a.currentTime + (s.at - time));
      active.set(s.id, src);
    }
  }
  lastT = time;
  lastWall = now;
}
