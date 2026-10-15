// Renderer eşdeğerlik testi: skill'in orijinal scene.html'i ile bizim renderer'ın aynı kareyi çizip çizmediği.
// Kullanım: npm run test:parity [-- <.skill | SKILL.md | scene.html> [sunucu-url]]  (sunucu açık olmalı)
// Varsayılan: repodaki cerenbuilds-split-reel.skill
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { timeline, starterReel } from '../src/index.ts';

const [, , skillHtml = 'cerenbuilds-split-reel.skill', server = 'http://127.0.0.1:4318'] = process.argv;
const SCENES = `const { g, W, COL, SANS, text, agent, label, chip, dashed, packet, back, eio, lerp } = h;
function scene1(t, lt, a) { g.globalAlpha = a; text('Ben çay içerken', W/2, 220, 96, COL.ink, SANS, 900); text('4 agent çalıştı', W/2, 330, 108, COL.orange, SANS, 900);
  [COL.orange, COL.sage, COL.lav, COL.sky].forEach((c, i) => agent(240 + i * 200, 760, 11, c, t, { blinkSeed: i, crown: i === 0 })); }
function scene2(t, lt, a) { g.globalAlpha = a; agent(W/2, 470, 13, COL.orange, t, { crown: true }); label('lider', W/2, 514);
  [200, 420, 660, 880].forEach((x, i) => { const p = eio((lt - 0.2 - i * 0.25) / 0.6); dashed(W/2, 540, x, 720, COL.line, p); if (p > 0 && p < 1) packet(lerp(W/2, x, p), lerp(540, 720, p), 22, COL.sage); });
  chip('SUBAGENTS', W/2, 860, { align: 'center', bg: COL.lav }); }
return [scene1, scene2];`;

const p = starterReel('parity');
p.scenes.forEach((s) => (s.chip = null));
const tl = timeline(p.captions);
const times = [0.5, 1.2, 1.9, 2.9, 3.6, 4.4, 5.3, tl.duration - 0.1];

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 } });
let html = skillHtml.endsWith('.skill')
  ? execFileSync('unzip', ['-p', skillHtml, 'cerenbuilds-split-reel/SKILL.md'], { encoding: 'utf8' })
  : await fs.readFile(skillHtml, 'utf8');
if (!skillHtml.endsWith('.html')) {
  // SKILL.md içindeki scene.html bloğunu çıkar, sahne dizisini dışarıdan doldurulabilir yap.
  html = /```html\n([\s\S]*?)```/.exec(html)[1]
    .replace('<style>', '<link rel="stylesheet" href="/fonts/fonts.css"><style>')
    .replace('const SCENES=[/* scene1, scene2, ... */];', 'window.__setScenes=(arr)=>{SCENES.length=0;SCENES.push(...arr)};const SCENES=[];');
}
await ctx.route(server + '/skill.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));

const A = await ctx.newPage();
await A.goto(server + '/skill.html');
await A.evaluate(async ([caps, code]) => {
  await document.fonts.load('900 40px "Inter Display"');
  await document.fonts.load('800 26px "DejaVu Sans Mono"');
  await document.fonts.load('600 26px "DejaVu Sans Mono"');
  setCaps(caps);
  const h = { g, W, H, TOP, COL, SANS, MONO, text, agent, label, chip, dashed, packet, back, eio, lerp, clamp, cue };
  __setScenes(new Function('h', code)(h));
}, [{ captions: tl.captions, duration: tl.duration }, SCENES]);

const B = await ctx.newPage();
await B.goto(server + '/render/index.html');
await B.evaluate(([proj, code]) => window.setup(proj, code), [p, SCENES]);

let worst = 0;
for (const t of times) {
  // Orijinal scene.html sahnelerden sonra globalAlpha'yı geri almıyor, bir sonraki karenin arka planı soluk çiziliyor.
  // Bizim renderer her sahneyi save/restore ile sarar (bilinçli düzeltme). Karşılaştırmayı eşitlemek için alpha'yı sıfırla.
  const a = await A.evaluate((t) => ((g.globalAlpha = 1), render(t), document.getElementById('c').toDataURL()), t);
  const bb = await B.evaluate((t) => window.frame(t), t);
  const diff = await B.evaluate(async ([x, y]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [i1, i2] = await Promise.all([load(x), load(y)]);
    const c = new OffscreenCanvas(1080, 1920), g = c.getContext('2d');
    g.drawImage(i1, 0, 0); const d1 = g.getImageData(0, 0, 1080, 1920).data;
    g.clearRect(0, 0, 1080, 1920); g.drawImage(i2, 0, 0); const d2 = g.getImageData(0, 0, 1080, 1920).data;
    // y 942–960: birleşim gölgesi. Orijinalde crossfade sırasında son sahnenin alpha'sı buraya da sızıyor (aynı hata).
    let n = 0; for (let k = 0; k < d1.length; k += 4) if (!((k / 4 / 1080 | 0) >= 942 && (k / 4 / 1080 | 0) < 960) && (Math.abs(d1[k] - d2[k]) + Math.abs(d1[k+1] - d2[k+1]) + Math.abs(d1[k+2] - d2[k+2]) + Math.abs(d1[k+3] - d2[k+3]) > 8)) n++;
    return n / (1080 * 1920);
  }, [a, bb]);
  worst = Math.max(worst, diff);
  console.log(`t=${t.toFixed(2)}  farklı piksel: ${(diff * 100).toFixed(4)}%`);
}
await b.close();
console.log(worst < 0.0005 ? 'EŞDEĞER ✓' : 'FARK VAR ✗');
process.exitCode = worst < 0.0005 ? 0 : 1;
