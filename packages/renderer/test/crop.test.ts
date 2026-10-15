import { describe, expect, it } from 'vitest';
import { cropRect, cutAt } from '../src/crop';

describe('alt yarı kırpma', () => {
  it('4K değerleri skill ile aynı', () => {
    expect(cropRect('face', 3840, 2160)).toEqual({ x: 835, y: 0, w: 2170, h: 1929 });
    expect(cropRect('hands', 3840, 2160)).toEqual({ x: 705, y: 0, w: 2430, h: 2160 });
  });
  it('1080p ve dikey kaynakta oran 1.125 ve sınırlar içinde', () => {
    for (const [W, H] of [[1920, 1080], [1080, 1920], [1440, 1080], [2160, 3840]]) {
      for (const k of ['face', 'hands'] as const) {
        const r = cropRect(k, W, H);
        expect(Math.abs(r.w / r.h - 1.125)).toBeLessThan(0.01);
        expect(r.x + r.w).toBeLessThanOrEqual(W);
        expect(r.y + r.h).toBeLessThanOrEqual(H);
        expect(r.w % 2 + r.h % 2 + r.x % 2 + r.y % 2).toBe(0);
      }
    }
  });
  it('cutAt kaynak zamanını hesaplar', () => {
    const p = { edl: [{ id: 'a', clip: 'c', in: 10, dur: 2, kind: 'face' as const }, { id: 'b', clip: 'c', in: 30, dur: 3, kind: 'hands' as const }] };
    expect(cutAt(p, 2.5)).toMatchObject({ index: 1, start: 2, srcT: 30.5 });
    expect(cutAt(p, 5)).toBeNull();
  });
});
