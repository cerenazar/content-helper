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

  await step('format kontrolü görünür', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('text=Format kontrolü');
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

  const car = await api('/api/projects', { title: 'e2e carousel ' + Date.now(), kind: 'carousel' });
  await page.goto(`${WEB}/#/p/${car.slug}`);
  await page.waitForSelector('.slide-stage canvas');

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
