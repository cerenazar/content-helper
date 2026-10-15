// Tarayıcı testi: `npm run test:browser` (sunucu + web açıkken).
// CB_ROOT ile ayrı bir proje klasörü kullan, gerçek projelerine dokunmasın.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const WEB = process.env.CB_WEB || 'http://127.0.0.1:5180';
const ROOT = process.env.CB_ROOT;
const OUT = process.env.CB_SHOTS || 'test-results';
if (!ROOT) throw new Error('CB_ROOT gerekli (test projelerinin klasörü)');
await fs.mkdir(OUT, { recursive: true });

const api = (p, body) => fetch(WEB + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
const disk = async (slug) => JSON.parse(await fs.readFile(path.join(ROOT, slug, 'project.json'), 'utf8'));
const until = async (fn, ms = 4000) => {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 100));
  }
};

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Proxy hazırlanırken önizleme istek atmamalı (404 yok).
const proxy404 = [];
page.on('response', (r) => r.status() === 404 && r.url().includes('/proxy.mp4') && proxy404.push(r.url()));
let ok = 0;
const step = async (name, fn) => {
  await fn();
  ok++;
  console.log('✓', name);
};

try {
  const { slug } = await api('/api/projects', { title: 'e2e reel ' + Date.now(), kind: 'reel' });
  await page.goto(`${WEB}/#/p/${slug}`);
  await page.waitForSelector('.preview canvas');

  await step('oynat / durdur ve kare adımı', async () => {
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    const t1 = await page.textContent('.transport .time');
    assert.notEqual(t1, '0:00.00');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.textContent('.transport .time'), '0:00.03');
  });

  await step('caption seç ve metnini değiştir → diske yazılır', async () => {
    await page.click('.blk.cap >> nth=0');
    const input = page.locator('.field:has-text("Metin") input');
    await input.fill('Çay bitmeden');
    await until(async () => (await disk(slug)).captions[0].text === 'Çay bitmeden');
  });

  await step('vurgu kelimesi seç', async () => {
    await page.getByRole('button', { name: 'bitmeden', exact: true }).click();
    await until(async () => (await disk(slug)).captions[0].emph === 'bitmeden');
  });

  await step('caption kenarını sürükle → elle süre', async () => {
    const h = page.locator('.blk.cap >> nth=0').locator('.handle.r');
    const b = await h.boundingBox();
    await page.mouse.move(b.x + 3, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, b.y + 10, { steps: 6 });
    await page.mouse.up();
    const d = await until(async () => (await disk(slug)).captions[0].dur);
    assert.ok(d > 1, 'süre uzamalı: ' + d);
  });

  await step('geri al (⌘Z) sürüklemeyi tek adımda geri alır', async () => {
    await page.click('.preview-wrap');
    await page.keyboard.press('Meta+z');
    await until(async () => (await disk(slug)).captions[0].dur === null);
  });

  await step('seçim kalkınca panel kapanır, Proje düğmesi format kontrolünü açar', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.insp', { state: 'detached' });
    await page.getByRole('button', { name: 'Proje', exact: true }).click();
    await page.waitForSelector('text=Format kontrolü');
  });

  await step('Claude paneli her zaman görünür', async () => {
    assert.ok(await page.isVisible('.claude-col textarea'));
  });
  await page.screenshot({ path: path.join(OUT, 'reel.png') });

  // Dışarıdan (Claude gibi) değişiklik → editör yenilenir ve öğe turuncu yanar
  await step('dış değişiklik canlı yansır', async () => {
    const p = await disk(slug);
    p.captions[1].text = 'dışarıdan';
    await fs.writeFile(path.join(ROOT, slug, 'project.json'), JSON.stringify(p, null, 1));
    await page.waitForSelector('.blk.cap:has-text("dışarıdan")', { timeout: 5000 });
  });

  await step('geçersiz dış değişiklik uygulanmaz, uyarı çıkar', async () => {
    await fs.writeFile(path.join(ROOT, slug, 'project.json'), '{ "bozuk": ');
    await page.waitForSelector('.invalid-banner', { timeout: 5000 });
    assert.ok(await page.isVisible('.blk.cap:has-text("dışarıdan")'));
  });

  // ---- CapCut tarzı timeline: böl, kırp, ripple sil, sırala, SFX ----
  const { execFileSync } = await import('node:child_process');
  const video = path.join(ROOT, 'e2e-kaynak.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=12', '-f', 'lavfi', '-i', 'sine=f=330:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  const ed = await api('/api/projects', { title: 'e2e kurgu ' + Date.now(), kind: 'reel' });
  const edGet = await fetch(`${WEB}/api/projects/${ed.slug}`).then((r) => r.json());
  const { clips } = await api(`/api/projects/${ed.slug}/clips`, { paths: [video] });
  const p0 = { ...edGet.project, clips, edl: [
    { id: 'cut_a', clip: clips[0].id, in: 1, dur: 2, kind: 'face' },
    { id: 'cut_b', clip: clips[0].id, in: 5, dur: 2, kind: 'hands' },
    { id: 'cut_c', clip: clips[0].id, in: 8, dur: 2, kind: 'face' },
  ] };
  await fetch(`${WEB}/api/projects/${ed.slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: p0, scenes: edGet.scenes }) });
  await page.goto(`${WEB}/#/p/${ed.slug}`);
  await page.waitForSelector('.blk.cut');
  const edl = async () => (await disk(ed.slug)).edl;

  await step('B: oynatma kafasında kesiti böl', async () => {
    await page.click('.preview-wrap');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight'); // 1.0 sn, ilk kesitin ortası
    await page.keyboard.press('b');
    const e = await until(async () => ((await edl()).length === 4 ? edl() : null));
    assert.deepEqual([e[0].in, e[0].dur, e[1].in, e[1].dur], [1, 1, 2, 1]);
  });

  await step('kesit sağ kenarını sürükle → süre kısalır (ripple)', async () => {
    const h = page.locator('.blk.cut >> nth=2').locator('.handle.r');
    const b = await h.boundingBox();
    await page.mouse.move(b.x + 5, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x - 25, b.y + 10, { steps: 6 });
    await page.mouse.up();
    const e = await until(async () => ((await edl())[2].dur < 1.9 ? edl() : null));
    assert.equal(e[2].in, 5, 'giriş değişmemeli');
  });

  await step('kesit sol kenarını sürükle → giriş ilerler, kaynak sınırı korunur', async () => {
    const h = page.locator('.blk.cut >> nth=3').locator('.handle.l');
    const b = await h.boundingBox();
    await page.mouse.move(b.x + 4, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 30, b.y + 10, { steps: 6 });
    await page.mouse.up();
    const e = await until(async () => ((await edl())[3].in > 8 ? edl() : null));
    assert.ok(e[3].dur < 2 && Math.abs(e[3].in + e[3].dur - 10) < 0.01, 'çıkış noktası sabit: ' + JSON.stringify(e[3]));
  });

  await step('kesiti sürükleyerek sırala', async () => {
    const ids = (await edl()).map((c) => c.id);
    const a = await page.locator('.blk.cut >> nth=0').boundingBox();
    const last = await page.locator('.blk.cut >> nth=3').boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width + 10, a.y + a.height / 2, { steps: 10 });
    await page.mouse.up();
    await until(async () => (await edl()).at(-1).id === ids[0]);
  });

  await step('⌫ ile ripple sil: boşluk kalmaz', async () => {
    await page.click('.blk.cut >> nth=0');
    await page.keyboard.press('Backspace');
    await until(async () => (await edl()).length === 3);
    const starts = await page.$$eval('.blk.cut', (els) => els.map((e) => parseFloat(e.style.left)));
    assert.equal(starts[0], 0);
  });

  await step('⌘+ timeline yakınlaştırır', async () => {
    const w0 = await page.$eval('.tl-inner', (e) => e.getBoundingClientRect().width);
    await page.keyboard.press('Meta+Equal');
    await until(async () => (await page.$eval('.tl-inner', (e) => e.getBoundingClientRect().width)) > w0 * 1.3);
  });

  await step('SFX: hazır efekti ekle → diske ve media/ altına yazılır', async () => {
    await page.keyboard.press('Home');
    await page.getByRole('tab', { name: /Ses efektleri/ }).click();
    await page.getByRole('button', { name: 'pop efektini ekle' }).click();
    const sfx = await until(async () => ((await disk(ed.slug)).sfx.length === 1 ? (await disk(ed.slug)).sfx : null));
    assert.equal(sfx[0].src, 'media/sfx-pop.wav');
    await fs.access(path.join(ROOT, ed.slug, 'media', 'sfx-pop.wav'));
    await page.waitForSelector('.blk.sfx');
  });

  await step('SFX bloğunu sürükle → başlangıç değişir', async () => {
    const b = await page.locator('.blk.sfx >> nth=0').boundingBox();
    await page.mouse.move(b.x + 4, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await until(async () => (await disk(ed.slug)).sfx[0].at > 0.3);
    await page.waitForSelector('text=Ses düzeyi');
  });

  await step('L oynatır, K durdurur', async () => {
    await page.click('.preview-wrap');
    await page.keyboard.press('Home');
    await page.keyboard.press('l');
    await page.waitForTimeout(500);
    await page.keyboard.press('k');
    assert.notEqual(await page.textContent('.transport .time'), '0:00.00');
  });

  await step('yeni klibin proxy\'si hazırlanırken 404 isteği yok', async () => {
    await until(async () => (await fetch(`${WEB}/api/projects/${ed.slug}/clips/${clips[0].id}/proxy`, { method: 'POST' }).then((r) => r.json())).status === 'ready', 30000);
    await page.waitForTimeout(1200);
    assert.deepEqual(proxy404, []);
  });

  await step('? kısayol listesini açar, Esc kapatır', async () => {
    await page.keyboard.press('?');
    await page.waitForSelector('role=dialog[name="Klavye kısayolları"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.keys-dialog', { state: 'detached' });
  });
  await page.screenshot({ path: path.join(OUT, 'reel-kurgu.png') });

  const car = await api('/api/projects', { title: 'e2e carousel ' + Date.now(), kind: 'carousel' });
  await page.goto(`${WEB}/#/p/${car.slug}`);
  await page.waitForSelector('.slide-stage canvas');

  await step('carousel: Claude paneli her zaman görünür, özellikler ayrı sütunda', async () => {
    assert.ok(await page.isVisible('.claude-col textarea'));
    assert.equal(await page.locator('[role=tab]').count(), 0, 'Düzenle / Claude sekmesi kalmamalı');
    await page.waitForSelector('.insp >> text=Carousel');
  });

  await step('carousel: ? kısayol listesini açar, Esc kapatır', async () => {
    await page.click('.stage-scroll');
    await page.keyboard.press('?');
    await page.waitForSelector('role=dialog[name="Klavye kısayolları"] >> text=Seçiliyi çoğalt');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.keys-dialog', { state: 'detached' });
  });

  await step('carousel: öğeyi sürükle → x/y değişir', async () => {
    const box = page.locator('.el-box >> nth=0');
    const b = await box.boundingBox();
    const before = (await disk(car.slug)).slides[0].elements[0];
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    await until(async () => (await disk(car.slug)).slides[0].elements[0].y > before.y + 50);
  });

  await step('carousel: öğe seçilince özellikler açılır, Claude yerinde kalır', async () => {
    await page.locator('.el-box >> nth=0').click();
    await page.waitForSelector('.insp >> text=Kilitle');
    assert.ok(await page.isVisible('.claude-col textarea'));
    assert.match(await page.textContent('.composer .ctx-line'), /slayt 1 · (başlık|metin)/);
  });

  await step('carousel: çift tıkla yerinde metin düzenle, Esc kaydeder', async () => {
    await page.locator('.el-box >> nth=0').dblclick();
    const ta = page.locator('.inline-edit');
    await ta.waitFor();
    await ta.fill('Yerinde düzenlendi');
    await page.keyboard.press('Escape');
    await until(async () => (await disk(car.slug)).slides[0].elements[0].text === 'Yerinde düzenlendi');
    assert.equal(await page.locator('.inline-edit').count(), 0);
  });

  await step('carousel: ⇧-tık çoklu seçim, birlikte taşınır', async () => {
    const before = (await disk(car.slug)).slides[0].elements.map((e) => e.y);
    await page.locator('.el-box >> nth=0').click();
    await page.locator('.el-box >> nth=1').click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('.el-box[aria-selected=true]').count(), 2);
    const b = await page.locator('.el-box >> nth=1').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 60, { steps: 6 });
    await page.mouse.up();
    await until(async () => {
      const ys = (await disk(car.slug)).slides[0].elements.map((e) => e.y);
      return ys[0] < before[0] - 30 && ys[1] < before[1] - 30 && Math.abs(ys[0] - before[0] - (ys[1] - before[1])) <= 1;
    });
  });

  await step('carousel: ⌘D çoğaltır, ⌘C/⌘V başka slayta yapıştırır', async () => {
    await page.keyboard.press('Meta+d');
    await until(async () => (await disk(car.slug)).slides[0].elements.length === 4);
    const d = (await disk(car.slug)).slides[0].elements;
    assert.equal(d[2].x, d[0].x + 20, 'kopya 20 px kayar');
    assert.notEqual(d[2].id, d[0].id);
    await page.keyboard.press('Meta+c');
    await page.click('.thumb >> nth=1');
    const n = (await disk(car.slug)).slides[1].elements.length;
    await page.keyboard.press('Meta+v');
    await until(async () => (await disk(car.slug)).slides[1].elements.length === n + 2);
  });

  await step('carousel: katmanlar paneli gizle ve kilitle', async () => {
    await page.locator('.layer >> nth=0').getByRole('button', { name: 'Gizle' }).click();
    await until(async () => (await disk(car.slug)).slides[1].elements.at(-1).hidden === true);
    await page.locator('.layer >> nth=1').getByRole('button', { name: 'Kilitle' }).click();
    await until(async () => (await disk(car.slug)).slides[1].elements.at(-2).locked === true);
  });

  await step('carousel: slayt ekle', async () => {
    await page.click('text=Slayt ekle');
    await until(async () => (await disk(car.slug)).slides.length === 3);
  });

  await step('carousel: slaytı sürükleyerek sırala', async () => {
    const ids = (await disk(car.slug)).slides.map((s) => s.id);
    await page.locator('.thumb-wrap >> nth=2').dragTo(page.locator('.thumb-wrap >> nth=0'), { targetPosition: { x: 5, y: 40 } });
    await until(async () => (await disk(car.slug)).slides.map((s) => s.id).join() === [ids[2], ids[0], ids[1]].join());
  });
  await page.screenshot({ path: path.join(OUT, 'carousel.png') });

  assert.deepEqual(errors, [], 'sayfa hatası olmamalı');
  console.log(`\n${ok} adım geçti. Ekran görüntüleri: ${OUT}/`);
} catch (e) {
  await page.screenshot({ path: path.join(OUT, 'failure.png') });
  console.error('✗', e.message, errors.length ? '\nSayfa hataları: ' + errors.join(' | ') : '');
  process.exitCode = 1;
} finally {
  await browser.close();
}
