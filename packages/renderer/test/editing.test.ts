import { describe, expect, it } from 'vitest';
import { parseProject } from '@cb/schema';
import {
  snapMove,
  snapResize,
  resizeBox,
  alignBoxes,
  distributeBoxes,
  reorderZ,
  moveItem,
  intersects,
  rectFrom,
  bounds,
  pasteOffset,
  windowContentRect,
  slideVideos,
  starterCarousel,
} from '../src/index';

const F = { W: 1080, H: 1350, margin: 76 };

describe('yapışma: taşıma', () => {
  it('sol kenar kenar boşluğuna yapışır ve slayt boyu kılavuz çizer', () => {
    const r = snapMove({ x: 80, y: 500, w: 200, h: 100 }, [], F);
    expect(r.dx).toBe(-4);
    expect(r.dy).toBe(0);
    expect(r.guides).toContainEqual({ axis: 'x', pos: 76, from: 0, to: 1350 });
  });
  it('kutu merkezi slayt ortasına yapışır', () => {
    const r = snapMove({ x: 443, y: 200, w: 200, h: 100 }, [], F);
    expect(r.dx).toBe(-3); // merkez 543 → 540
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 540)).toBe(true);
  });
  it('eşik dışında yapışma yok', () => {
    const r = snapMove({ x: 300, y: 300, w: 100, h: 100 }, [], F);
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('başka öğenin üst kenarına yapışır, kılavuz iki öğeyi kapsar', () => {
    const other = { x: 600, y: 400, w: 200, h: 100 };
    const r = snapMove({ x: 200, y: 405, w: 100, h: 60 }, [other], F);
    expect(r.dy).toBe(-5);
    const g = r.guides.find((x) => x.axis === 'y' && x.pos === 400)!;
    expect(g).toBeTruthy();
    expect(g.from).toBe(200);
    expect(g.to).toBe(800);
  });
  it('en yakın hedef kazanır', () => {
    // sol kenar 74 → 76'ya 2 px; sağ kenar 1004+... başka hedef yok
    const r = snapMove({ x: 74, y: 300, w: 300, h: 100 }, [{ x: 0, y: 0, w: 70, h: 10 }], F);
    expect(r.dx).toBe(2);
  });
});

describe('yapışma: boyutlandırma', () => {
  it('sağ kenar sağ kenar boşluğuna yapışır, sol kenar sabit', () => {
    const r = snapResize({ x: 100, y: 100, w: 900, h: 200 }, 'e', [], F);
    expect(r.box).toEqual({ x: 100, y: 100, w: 904, h: 200 });
    expect(r.guides[0]).toMatchObject({ axis: 'x', pos: 1004 });
  });
  it('kuzeybatı tutamağı sol ve üst kenarı yapıştırır', () => {
    const r = snapResize({ x: 79, y: 3, w: 200, h: 200 }, 'nw', [], F);
    expect(r.box).toEqual({ x: 76, y: 0, w: 203, h: 203 });
  });
});

describe('boyutlandırma tutamakları', () => {
  const b = { x: 100, y: 100, w: 400, h: 200 };
  it('güneydoğu genişler', () => expect(resizeBox(b, 'se', 50, 20)).toEqual({ x: 100, y: 100, w: 450, h: 220 }));
  it('batı: sağ kenar sabit kalır', () => expect(resizeBox(b, 'w', 40, 0)).toEqual({ x: 140, y: 100, w: 360, h: 200 }));
  it('kuzey: alt kenar sabit kalır', () => expect(resizeBox(b, 'n', 0, -30)).toEqual({ x: 100, y: 70, w: 400, h: 230 }));
  it('en küçük boyutun altına inmez', () => {
    const r = resizeBox(b, 'nw', 1000, 1000, { minW: 40, minH: 30 });
    expect(r.w).toBe(40);
    expect(r.h).toBe(30);
    expect(r.x + r.w).toBe(500);
    expect(r.y + r.h).toBe(300);
  });
  it('⇧ köşe: oran korunur', () => {
    const r = resizeBox(b, 'se', 200, 0, { keepAspect: true });
    expect(r.w / r.h).toBeCloseTo(2);
    expect(r.w).toBe(600);
  });
  it('⇧ kuzeybatı: oran korunur, sağ alt köşe sabit', () => {
    const r = resizeBox(b, 'nw', -100, 0, { keepAspect: true });
    expect(r.w / r.h).toBeCloseTo(2);
    expect(r.x + r.w).toBe(500);
    expect(r.y + r.h).toBe(300);
  });
});

describe('hizala ve dağıt', () => {
  const boxes = [
    { x: 100, y: 100, w: 100, h: 50 },
    { x: 300, y: 200, w: 200, h: 100 },
    { x: 700, y: 50, w: 50, h: 50 },
  ];
  it('sola: grubun sol kenarına', () => {
    expect(alignBoxes(boxes, 'left').map((p) => p.x)).toEqual([100, 100, 100]);
  });
  it('sağa ve ortaya', () => {
    expect(alignBoxes(boxes, 'right').map((p) => p.x)).toEqual([650, 550, 700]);
    expect(alignBoxes(boxes, 'hcenter').map((p) => p.x)).toEqual([375, 325, 400]);
  });
  it('üst, orta, alt', () => {
    expect(alignBoxes(boxes, 'top').map((p) => p.y)).toEqual([50, 50, 50]);
    expect(alignBoxes(boxes, 'bottom').map((p) => p.y)).toEqual([250, 200, 250]);
    expect(alignBoxes(boxes, 'vmiddle').map((p) => p.y)).toEqual([150, 125, 150]);
  });
  it('tek öğe slayta göre hizalanır', () => {
    expect(alignBoxes([{ x: 10, y: 10, w: 80, h: 50 }], 'hcenter', { W: 1080, H: 1350 })).toEqual([{ x: 500, y: 10 }]);
  });
  it('yatay dağıt: uçlar sabit, boşluklar eşit', () => {
    const r = distributeBoxes(boxes, 'h');
    expect(r[0].x).toBe(100);
    expect(r[2].x).toBe(700);
    // toplam aralık 100..750 = 650, kutular 350 → boşluk 150
    expect(r[1].x).toBe(350);
    expect(r.map((p) => p.y)).toEqual([100, 200, 50]);
  });
  it('dikey dağıt ve 3 öğeden azsa değişmez', () => {
    const r = distributeBoxes(boxes, 'v');
    // sırayla y: 50(h50), 100(h50), 200(h100) → aralık 50..300 = 250, kutular 200 → boşluk 25
    expect(r.map((p) => p.y)).toEqual([125, 200, 50]);
    expect(distributeBoxes(boxes.slice(0, 2), 'h')).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ]);
  });
});

describe('katman sırası', () => {
  const xs = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const ids = (r: { id: string }[]) => r.map((x) => x.id).join('');
  it('bir öne / bir arkaya', () => {
    expect(ids(reorderZ(xs, ['b'], 'forward'))).toBe('acbd');
    expect(ids(reorderZ(xs, ['b'], 'backward'))).toBe('bacd');
    expect(ids(reorderZ(xs, ['d'], 'forward'))).toBe('abcd');
    expect(ids(reorderZ(xs, ['a'], 'backward'))).toBe('abcd');
  });
  it('en öne / en arkaya, çoklu seçimde iç sıra korunur', () => {
    expect(ids(reorderZ(xs, ['a', 'c'], 'front'))).toBe('bdac');
    expect(ids(reorderZ(xs, ['b', 'd'], 'back'))).toBe('bdac');
    expect(ids(reorderZ(xs, ['a', 'b'], 'forward'))).toBe('cabd');
  });
  it('sürükle-bırak taşıma', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3).join('')).toBe('bcad');
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0).join('')).toBe('dabc');
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 4).join('')).toBe('acdb');
  });
});

describe('seçim dikdörtgeni ve yapıştırma', () => {
  it('kısmi kesişme seçer', () => {
    const m = rectFrom(300, 300, 100, 100);
    expect(m).toEqual({ x: 100, y: 100, w: 200, h: 200 });
    expect(intersects(m, { x: 250, y: 250, w: 100, h: 100 })).toBe(true);
    expect(intersects(m, { x: 300, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('grup sınırı', () => {
    expect(bounds([{ x: 10, y: 20, w: 30, h: 40 }, { x: 100, y: 5, w: 10, h: 10 }])).toEqual({ x: 10, y: 5, w: 100, h: 55 });
  });
  it('yapıştırma kaydırması', () => {
    expect(pasteOffset(true, 1)).toBe(20);
    expect(pasteOffset(true, 3)).toBe(60);
    expect(pasteOffset(false, 3)).toBe(0);
  });
});

describe('şema: hidden / locked / video', () => {
  it('eski dosyada alanlar varsayılanla dolar', () => {
    const old = {
      version: 1,
      kind: 'carousel',
      title: 'eski',
      style: 'picks',
      header: { world: 'LEARN', topic: 'x' },
      slides: [{ id: 'sl_1', elements: [{ id: 'el_1', type: 'window', x: 76, y: 393, w: 925, h: 551 }] }],
    };
    const r = parseProject(old);
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === 'carousel') {
      const e = r.data.slides[0].elements[0];
      expect(e.hidden).toBe(false);
      expect(e.locked).toBe(false);
      expect(e.video).toBeNull();
    }
  });
  it('video yolu ve kilit okunur, yanlış tür reddedilir', () => {
    const p = starterCarousel('v', 'picks');
    const win = p.slides[1].elements.find((e) => e.type === 'window')!;
    win.video = '/Users/x/klip.mov';
    win.locked = true;
    const r = parseProject(p);
    expect(r.success).toBe(true);
    (win as { hidden: unknown }).hidden = 'evet';
    expect(parseProject(p).success).toBe(false);
  });
  it('slayt videoları: gizli ve pixel stilde sayılmaz', () => {
    const p = starterCarousel('v', 'picks');
    const win = p.slides[1].elements.find((e) => e.type === 'window')!;
    expect(slideVideos(p, 1)).toEqual([]);
    win.video = '/tmp/a.mp4';
    expect(slideVideos(p, 1).map((e) => e.id)).toEqual([win.id]);
    win.hidden = true;
    expect(slideVideos(p, 1)).toEqual([]);
    win.hidden = false;
    expect(slideVideos({ ...p, style: 'pixel' }, 1)).toEqual([]);
    expect(windowContentRect(win)).toEqual({ x: 76, y: 393 + 56, w: 925, h: 551 - 56 });
  });
});
