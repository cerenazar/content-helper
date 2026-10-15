import { describe, expect, it } from 'vitest';
import { Project, ReelProject } from '@cb/schema';
import { splitCut, trimCut, rippleDelete, moveCut, dropIndex, snap, snapTargets, zoomScroll, clampZoom, moveSfx, sfxFilter, MIN_CUT, ZOOM_MAX } from '../src/edit';
import { starterReel } from '../src/templates';
import { cutStarts } from '../src/crop';

const cut = (id: string, inn: number, dur: number, clip = 'c1') => ({ id, clip, in: inn, dur, kind: 'face' as const });
const clips = [{ id: 'c1', probe: { duration: 20, width: 1920, height: 1080, fps: 30, rotation: 0, codec: 'h264', hasAudio: true } }];
const edl = [cut('a', 2, 3), cut('b', 10, 2), cut('c', 0, 4)];

describe('kesit bölme', () => {
  it('oynatma kafasında ikiye böler, kaynak zamanı süreklidir', () => {
    const r = splitCut(edl, 4, () => 'n')!;
    expect(r.edl.map((c) => [c.id, c.in, c.dur])).toEqual([
      ['a', 2, 3],
      ['b', 10, 1],
      ['n', 11, 1],
      ['c', 0, 4],
    ]);
    expect(r.left).toBe('b');
    expect(r.right).toBe('n');
    // Toplam süre değişmez
    expect(r.edl.reduce((s, c) => s + c.dur, 0)).toBe(9);
  });
  it('kenarda ya da kesit dışında bölmez', () => {
    expect(splitCut(edl, 3, () => 'n')).toBeNull();
    expect(splitCut(edl, 3.05, () => 'n')).toBeNull();
    expect(splitCut(edl, 50, () => 'n')).toBeNull();
    expect(splitCut([], 1, () => 'n')).toBeNull();
  });
});

describe('kesit kırpma', () => {
  it('sol kenar girişi ve süreyi birlikte değiştirir', () => {
    expect(trimCut(edl, clips, 'a', 'l', 1)[0]).toMatchObject({ in: 3, dur: 2 });
    expect(trimCut(edl, clips, 'a', 'l', -1)[0]).toMatchObject({ in: 1, dur: 4 });
  });
  it('kaynak başını (0) ve en kısa süreyi aşmaz', () => {
    expect(trimCut(edl, clips, 'a', 'l', -5)[0]).toMatchObject({ in: 0, dur: 5 });
    expect(trimCut(edl, clips, 'a', 'l', 10)[0]).toMatchObject({ in: 4.8, dur: MIN_CUT });
  });
  it('sağ kenar klip sonunu aşmaz', () => {
    expect(trimCut(edl, clips, 'b', 'r', 100)[1]).toMatchObject({ in: 10, dur: 10 });
    expect(trimCut(edl, clips, 'b', 'r', -100)[1].dur).toBe(MIN_CUT);
    expect(trimCut(edl, clips, 'b', 'r', 0.5)[1].dur).toBe(2.5);
  });
  it('ripple: sonraki kesitlerin başlangıcı kayar', () => {
    const t = trimCut(edl, clips, 'a', 'r', -1);
    expect(cutStarts({ edl: t })).toEqual([0, 2, 4]);
  });
});

describe('ripple silme ve sıralama', () => {
  it('silinen kesitin boşluğu kapanır', () => {
    const d = rippleDelete(edl, 'b');
    expect(d.map((c) => c.id)).toEqual(['a', 'c']);
    expect(cutStarts({ edl: d })).toEqual([0, 3]);
  });
  it('kesiti taşır', () => {
    expect(moveCut(edl, 0, 2).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(moveCut(edl, 2, 0).map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(moveCut(edl, 1, 1)).toBe(edl);
  });
  it('bırakma sırası orta noktalara göre', () => {
    // a sürükleniyor; geriye b(0-2) c(2-6) kalır
    expect(dropIndex(edl, 0, 0.5)).toBe(0);
    expect(dropIndex(edl, 0, 1.5)).toBe(1);
    expect(dropIndex(edl, 0, 5)).toBe(2);
  });
});

describe('yapışma', () => {
  it('tolerans içindeki en yakın hedefe yapışır', () => {
    expect(snap(2.04, [0, 2, 3], 0.1)).toEqual({ t: 2, to: 2 });
    expect(snap(2.5, [0, 2, 3], 0.1)).toEqual({ t: 2.5, to: null });
    expect(snap(2.56, [2.5, 2.6], 0.1).t).toBe(2.6);
  });
  it('hedefler: oynatma kafası, kesit ve caption kenarları, SFX', () => {
    const p = { edl: [cut('a', 0, 1.5)], captions: [{ id: 'x', text: 'Ben çay içerken', emph: null, scene: 1, dur: null }], sfx: [{ id: 's', src: 'media/a.wav', at: 4, gain: 1 }] };
    expect(snapTargets(p, 2.2)).toEqual([0, 0.93, 1.5, 2.2, 4]);
    expect(snapTargets(p, 2.2, ['a', 's'])).toEqual([0, 0.93, 2.2]);
  });
});

describe('yakınlaştırma', () => {
  it('imleç altındaki an sabit kalır', () => {
    const s = zoomScroll(100, 200, 40, 80);
    expect((s + 200) / 80).toBeCloseTo((100 + 200) / 40);
    expect(zoomScroll(0, 0, 40, 10)).toBe(0);
  });
  it('sınırlar', () => {
    expect(clampZoom(10000)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBeGreaterThan(0);
  });
});

describe('SFX', () => {
  it('eski reel dosyası sfx olmadan da açılır (boş liste)', () => {
    const old = starterReel('eski') as Record<string, unknown>;
    delete old.sfx;
    const r = Project.safeParse(old);
    expect(r.success).toBe(true);
    expect(r.success && r.data.kind === 'reel' && r.data.sfx).toEqual([]);
  });
  it('gain varsayılanı 1, sınırlar korunur', () => {
    const base = starterReel('x');
    const ok = ReelProject.parse({ ...base, sfx: [{ id: 's', src: 'media/pop.wav', at: 1.5 }] });
    expect(ok.sfx[0].gain).toBe(1);
    expect(ReelProject.safeParse({ ...base, sfx: [{ id: 's', src: 'media/pop.wav', at: -1, gain: 1 }] }).success).toBe(false);
    expect(ReelProject.safeParse({ ...base, sfx: [{ id: 's', src: 'media/pop.wav', at: 1, gain: 3 }] }).success).toBe(false);
  });
  it('taşıma 0 altına inmez', () => {
    expect(moveSfx([{ id: 's', src: 'a', at: 1, gain: 1 }], 's', -2)[0].at).toBe(0);
  });
  it('ffmpeg filtresi: adelay, volume, amix normalize=0', () => {
    const f = sfxFilter('[0:a]', [{ at: 1.25, gain: 0.5 }, { at: 3, gain: 1 }], 3, 10);
    expect(f).toBe(
      '[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:10.000[base];' +
        '[3:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.500,adelay=1250|1250[s0];' +
        '[4:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1.000,adelay=3000|3000[s1];' +
        '[base][s0][s1]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,atrim=0:10.000[a]',
    );
  });
  it('süre dışındaki ve sessiz SFX atlanır; hiç yoksa sadece ana ses', () => {
    expect(sfxFilter('[2:a]', [{ at: 12, gain: 1 }, { at: 1, gain: 0 }], 3, 10)).toBe('[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:10.000[a]');
    const f = sfxFilter('[2:a]', [{ at: 12, gain: 1 }, { at: 1, gain: 1 }], 3, 10);
    expect(f).toContain('[4:a]');
    expect(f).not.toContain('[3:a]');
    expect(f).toContain('amix=inputs=2');
  });
});
