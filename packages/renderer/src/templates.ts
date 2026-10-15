import type { CarouselProject, CarouselStyle, Picks, ReelProject, Slide, SlideElement } from '@cb/schema';
import { newId } from '@cb/schema';

/** Yeni reel için başlangıç sahne kodu: skill'deki hook kuralına uyan bir örnek. */
export const STARTER_SCENES = `// Sahne kodu. Sözleşme: CLAUDE.md → "scenes.js".
// h: g, W, H, TOP, COL, SANS, MONO, clamp, eo, eio, back, lerp, shade, cue,
//    rr, text, sprite, agent, label, chip, chipRight, dashed, packet,
//    laptop, teaGlass, paper, bubble, folder, task, arrowDown
const { g, W, COL, SANS, text, agent, laptop, teaGlass, dashed, packet, label, back, eio, clamp, lerp, cue } = h;

// Sahne 1 (hook): frame 0'da her şey görünür, pop-in yok.
function scene1(t, lt, a) {
  g.globalAlpha = a;
  text('Ben çay içerken', W / 2, 220, 96, COL.ink, SANS, 900);
  text('4 agent çalıştı', W / 2, 330, 108, COL.orange, SANS, 900);
  teaGlass(250, 760, 1.6, t);
  [COL.orange, COL.sage, COL.lav, COL.sky].forEach((c, i) =>
    agent(470 + i * 150, 760, 11, c, t, { blinkSeed: i, crown: i === 0 }));
}

// Sahne 2: lider görev dağıtır, paketler kesikli çizgi boyunca gider.
function scene2(t, lt, a) {
  g.globalAlpha = a;
  const lead = { x: W / 2, y: 470 };
  agent(lead.x, lead.y, 13, COL.orange, t, { crown: true });
  label('lider', lead.x, lead.y + 44);
  const xs = [200, 420, 660, 880];
  const cols = [COL.sage, COL.lav, COL.sky, COL.gold];
  xs.forEach((x, i) => {
    const p = eio((lt - 0.2 - i * 0.25) / 0.6);
    dashed(lead.x, lead.y + 70, x, 720, COL.line, p);
    if (p > 0 && p < 1) packet(lerp(lead.x, x, p), lerp(lead.y + 70, 720, p), 22, cols[i]);
    const s = back((lt - 0.6 - i * 0.25) / 0.4);
    if (s > 0) agent(x, 840, 9 * s, cols[i], t, { blinkSeed: i + 1 });
  });
}

return [scene1, scene2];
`;

export function starterReel(title: string): ReelProject {
  return {
    version: 1,
    kind: 'reel',
    title,
    header: { world: 'BUILD', topic: 'claude code · agent ekibi' },
    audio: 'silent',
    scenes: [
      { id: newId('sc'), name: 'Hook', chip: null },
      { id: newId('sc'), name: 'Görev dağıtımı', chip: { label: 'SUBAGENTS', color: 'orange' } },
    ],
    captions: [
      ['Ben çay içerken', null, 1],
      ['4 agent', '4 agent', 1],
      ['kodumu yazdı.', null, 1],
      ['Lider agent', 'Lider', 2],
      ['görevleri böler', null, 2],
      ['ve dağıtır.', null, 2],
    ].map(([text, emph, scene]) => ({ id: newId('cap'), text: text as string, emph: emph as string | null, scene: scene as number, dur: null })),
    clips: [],
    edl: [],
    sfx: [],
  };
}

/** Carousel öğesi: eksik alanlar varsayılanla dolar. */
export function slideEl(o: Partial<SlideElement> & Pick<SlideElement, 'type'>): SlideElement {
  return {
    id: newId('el'),
    x: 72,
    y: 300,
    w: 936,
    h: 200,
    text: '',
    emph: null,
    size: 64,
    color: 'ink',
    align: 'left',
    src: null,
    fill: null,
    weight: null,
    hidden: false,
    locked: false,
    video: null,
    ...o,
  };
}

/** Picks kapağı: tam ekran fotoğraf (sonradan seçilir), büyük başlık, altın vurgu, alt satır. */
export function picksCoverSlide(title = 'Üniversite mailin var.\nBu avantajları kullanıyor musun?', emph: string | null = 'Bu avantajları kullanıyor musun?'): Slide {
  return {
    id: newId('sl'),
    bg: null,
    accent: null,
    elements: [
      slideEl({ type: 'title', text: title, emph, x: 90, y: 160, w: 860, h: 600, size: 120 }),
      slideEl({ type: 'text', text: 'Alt satır buraya.', x: 90, y: 1060, w: 760, h: 120, size: 50, weight: 600 }),
    ],
  };
}

/** Picks seçki sayfası: logo + marka renginde başlık, alt cümle, pencere içinde ekran görüntüsü, açıklama, CTA hapı. */
export function picksPickSlide(accent: string | null = null): Slide {
  return {
    id: newId('sl'),
    bg: null,
    accent,
    elements: [
      slideEl({ type: 'image', x: 55, y: 112, w: 145, h: 145 }),
      slideEl({ type: 'title', text: 'ARAÇ ADI', emph: 'ARAÇ ADI', x: 226, y: 158, w: 800, h: 60, size: 46, weight: 700 }),
      slideEl({ type: 'text', text: 'Tek cümlede ne işe yaradığı.', x: 76, y: 305, w: 925, h: 60, size: 44 }),
      slideEl({ type: 'window', x: 76, y: 393, w: 925, h: 551 }),
      slideEl({ type: 'text', text: 'Neden seçtiğim, iki satırlık açıklama.', x: 76, y: 980, w: 925, h: 110, size: 44 }),
      slideEl({ type: 'pill', text: 'Nasıl alınır, tek cümle.', x: 205, y: 1116, w: 670, h: 97, size: 30 }),
    ],
  };
}

export function starterCarousel(title: string, style: CarouselStyle = 'picks', picks: Partial<Picks> = {}): CarouselProject {
  const base = { version: 1 as const, kind: 'carousel' as const, title, header: { world: 'LEARN' as const, topic: 'claude code · ipuçları' } };
  if (style === 'picks')
    return {
      ...base,
      style,
      picks: { handle: '@CERENBUILDS', category: 'SOFTWARE ENGINEERING', series: "CEREN'S PICKS", number: 1, ...picks },
      slides: [picksCoverSlide(title, null), picksPickSlide()],
    };
  const el = slideEl;
  return {
    ...base,
    style,
    picks: { handle: '@CERENBUILDS', category: 'SOFTWARE ENGINEERING', series: "CEREN'S PICKS", number: 1, ...picks },
    slides: [
      {
        id: newId('sl'),
        bg: null,
        accent: null,
        elements: [
          el({ type: 'title', text: '3 ayarla Claude Code\n2 kat hızlı', emph: '2 kat', size: 104, y: 380, h: 400 }),
          el({ type: 'agent', x: 460, y: 820, w: 160, h: 160, color: 'orange' }),
          el({ type: 'text', text: 'kaydır →', size: 40, color: 'orange', align: 'right', y: 1180, h: 60 }),
        ],
      },
      {
        id: newId('sl'),
        bg: null,
        accent: null,
        elements: [
          el({ type: 'chip', text: '01', size: 32, y: 240, w: 120, h: 60, color: 'orange' }),
          el({ type: 'title', text: 'Plan modu', emph: null, size: 88, y: 340, h: 120 }),
          el({ type: 'text', text: 'Shift+Tab ile plan moduna geç. Claude önce plan çıkarır, sen onaylarsın.', size: 48, y: 500, h: 300 }),
        ],
      },
    ],
  };
}
