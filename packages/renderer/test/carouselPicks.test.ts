import { describe, expect, it } from 'vitest';
import { pageLabel, seriesLabel, nextSeriesNumber, parseProject } from '@cb/schema';
import { starterCarousel } from '../src/templates';

describe('picks: sayfa numarası', () => {
  it('ilk sayfada yok', () => {
    expect(pageLabel(0, 7)).toBeNull();
  });
  it('ikinci sayfadan itibaren 02/07 biçiminde', () => {
    expect(pageLabel(1, 7)).toBe('02/07');
    expect(pageLabel(6, 7)).toBe('07/07');
    expect(pageLabel(9, 12)).toBe('10/12');
  });
});

describe('picks: seri', () => {
  it('etiket üç haneli numara alır', () => {
    expect(seriesLabel("CEREN'S PICKS", 4)).toBe("CEREN'S PICKS / 004");
  });
  it('sıradaki numara = aynı serinin en büyüğü + 1', () => {
    const list = [
      { series: "CEREN'S PICKS", number: 3 },
      { series: "ceren's picks ", number: 4 },
      { series: 'ENGINEERING NOTES', number: 9 },
    ];
    expect(nextSeriesNumber("CEREN'S PICKS", list)).toBe(5);
    expect(nextSeriesNumber('ENGINEERING NOTES', list)).toBe(10);
    expect(nextSeriesNumber('YENİ SERİ', list)).toBe(1);
  });
});

describe('carousel şeması', () => {
  it('eski (stilsiz) dosya pixel olarak okunur', () => {
    const old = {
      version: 1,
      kind: 'carousel',
      title: 'eski',
      header: { world: 'LEARN', topic: 'x' },
      slides: [{ id: 'sl_1', elements: [{ id: 'el_1', type: 'title', x: 72, y: 300, w: 936, h: 200 }] }],
    };
    const r = parseProject(old);
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'carousel') {
      expect(r.data.style).toBe('pixel');
      expect(r.data.slides[0].bg).toBeNull();
      expect(r.data.picks.series).toBe("CEREN'S PICKS");
    }
  });
  it('yeni picks başlangıcı şemadan geçer', () => {
    const p = starterCarousel('Deneme', 'picks', { number: 5 });
    const r = parseProject(p);
    expect(r.success).toBe(true);
    expect(p.picks.number).toBe(5);
    expect(p.slides.map((s) => s.elements.map((e) => e.type))).toEqual([
      ['title', 'text'],
      ['image', 'title', 'text', 'window', 'text', 'pill'],
    ]);
  });
  it('geçersiz renk reddedilir', () => {
    const p = starterCarousel('Deneme', 'picks');
    p.slides[0].accent = 'pembe';
    expect(parseProject(p).success).toBe(false);
  });
});
