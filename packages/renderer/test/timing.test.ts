import { describe, expect, it } from 'vitest';
import { formulaDur, timeline, sceneRange, edlDuration } from '../src/timing';
import { starterReel } from '../src/templates';
import { Project } from '@cb/schema';

const cap = (text: string, emph: string | null, scene: number, dur: number | null = null) => ({ id: text, text, emph, scene, dur });

describe('caption zamanlaması (skill formülü)', () => {
  it('formülü uygular ve sınırlar', () => {
    expect(formulaDur('Ben çay içerken', null)).toBe(0.93); // 0.34 + 0.039×15
    expect(formulaDur('4 agent', '4 agent')).toBe(0.91); // 0.34+0.273+0.3
    expect(formulaDur('a', null)).toBe(0.62); // alt sınır
    expect(formulaDur('x'.repeat(60), 'x')).toBe(1.7); // üst sınır
    expect(formulaDur('bitti.', null)).toBe(0.72); // 0.34+0.234+0.15
  });

  it('başlangıç/bitişleri ve toplamı captions.py ile aynı üretir', () => {
    const tl = timeline([cap('Ben çay içerken', null, 1), cap('4 agent', '4 agent', 1), cap('bitti.', null, 2)]);
    expect(tl.captions.map((c) => [c.start, c.end])).toEqual([
      [0, 0.93],
      [0.93, 1.84],
      [1.84, 2.56],
    ]);
    expect(tl.duration).toBe(3.76);
  });

  it('elle verilen süre formülü ezer', () => {
    const tl = timeline([cap('kısa', null, 1, 2.5)]);
    expect(tl.captions[0].end).toBe(2.5);
  });

  it('sahne aralığı: son sahne süre+5 e kadar uzar', () => {
    const tl = timeline([cap('a', null, 1), cap('b', null, 2)]);
    expect(sceneRange(tl, 0, 2)).toEqual([0, 0.62]);
    expect(sceneRange(tl, 1, 2)).toEqual([0.62, tl.duration + 5]);
    expect(sceneRange(tl, 2, 3)).toBeNull();
  });

  it('EDL toplamı', () => {
    expect(edlDuration({ edl: [{ id: 'a', clip: 'c', in: 0, dur: 1.25, kind: 'face' }, { id: 'b', clip: 'c', in: 3, dur: 2, kind: 'hands' }] })).toBe(3.25);
  });
});

describe('şema', () => {
  it('başlangıç reel projesi geçerli', () => {
    expect(Project.safeParse(starterReel('Deneme')).success).toBe(true);
  });
  it('3 kelimeden uzun caption yine geçer (uyarı UI işi), boş caption geçmez', () => {
    const p = starterReel('x');
    p.captions[0].text = '';
    expect(Project.safeParse(p).success).toBe(false);
  });
});
