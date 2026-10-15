// Carousel export: her slayt aynı renderer'la headless Chrome'da çizilir.
// Videosuz slayt → PNG/JPG. Pencerede video olan slayt → 4:5 MP4 (1080×1350, H.264, ≤ 60 sn, < 30 MB):
// overlay PNG'de video alanı şeffaf bırakılır, ffmpeg videoyu (cover) pencere alanına koyup overlay'i üstüne biner.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SLIDE, IG_LIMIT_BYTES, CAROUSEL_VIDEO_MAX_SEC, type CarouselProject } from '@cb/schema';
import { slideVideos, windowContentRect } from '@cb/renderer';
import { files, PORT } from './paths';
import { run, probe } from './ffmpeg';
import { startJob } from './events';
import { readProject } from './projects';
import { launchBrowser } from './export';

const busy = new Set<string>();

export async function exportCarousel(slug: string, fmt: 'png' | 'jpg') {
  if (busy.has(slug)) throw Object.assign(new Error('Bu proje için export zaten sürüyor'), { statusCode: 409 });
  busy.add(slug);
  const job = startJob(slug, 'export', 'carousel');
  void doExport(slug, fmt, job)
    .catch((e) => job.update({ status: 'error', message: (e as Error).message }))
    .finally(() => busy.delete(slug));
  return job;
}

/** Çift sayıya genişletilmiş dikdörtgen (yuv420p için). Taşan 1 px overlay'in opak kenarının altında kalır. */
export function evenRect(r: { x: number; y: number; w: number; h: number }) {
  const x0 = Math.max(0, Math.floor(r.x / 2) * 2);
  const y0 = Math.max(0, Math.floor(r.y / 2) * 2);
  const x1 = Math.min(SLIDE.W, Math.ceil((r.x + r.w) / 2) * 2);
  const y1 = Math.min(SLIDE.H, Math.ceil((r.y + r.h) / 2) * 2);
  return { x: x0, y: y0, w: Math.max(2, x1 - x0), h: Math.max(2, y1 - y0) };
}

async function doExport(slug: string, fmt: 'png' | 'jpg', job: ReturnType<typeof startJob>) {
  const { project } = await readProject(slug);
  if (project.kind !== 'carousel') throw new Error('Bu proje carousel değil');
  const f = files(slug);
  const outDir = path.join(f.exports, 'carousel');
  const work = path.join(f.cache, 'export-carousel');
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  // Eski çıktılar (ör. önceki PNG yerine artık MP4 olan slayt) karışmasın.
  for (const old of await fs.readdir(outDir)) if (old.startsWith(slug + '-')) await fs.rm(path.join(outDir, old), { force: true });

  const n = project.slides.length;
  const videoSlides = project.slides.map((_, i) => slideVideos(project, i));
  for (const vs of videoSlides) for (const v of vs) if (!existsSync(v.video!)) throw new Error(`Kaynak video yok: ${v.video}`);
  const nVideo = videoSlides.filter((v) => v.length).length;
  const name = (i: number, ext: string) => `${slug}-${String(i + 1).padStart(2, '0')}.${ext}`;
  const outputs: string[] = [];

  // 1) Görüntüler (tüm slaytlar tek sayfada sırayla).
  job.update({ progress: 0.02, message: 'Slaytlar çiziliyor' });
  const browser = await launchBrowser();
  const overlays = new Map<number, string>();
  try {
    const page = await browser.newPage({ viewport: { width: SLIDE.W, height: SLIDE.H } });
    page.on('pageerror', (e) => console.error('[render]', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/render/index.html`);
    await page.evaluate(([p, s]) => window.setupCarousel(p as CarouselProject, s as string), [project, slug] as const);
    for (let i = 0; i < n; i++) {
      const hasVideo = videoSlides[i].length > 0;
      const url = await page.evaluate(([k, ft, h]) => window.slide(k as number, ft as 'png' | 'jpg', h as boolean), [i, hasVideo ? 'png' : fmt, hasVideo] as const);
      const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (hasVideo) {
        const ov = path.join(work, `ov-${i}.png`);
        await fs.writeFile(ov, buf);
        overlays.set(i, ov);
      } else {
        const out = path.join(outDir, name(i, fmt));
        await fs.writeFile(out, buf);
        outputs[i] = out;
      }
      job.update({ progress: 0.02 + (nVideo ? 0.18 : 0.96) * ((i + 1) / n), message: `Slayt ${i + 1} / ${n} çizildi` });
    }
    await page.close();
  } finally {
    await browser.close();
  }

  // 2) Video slaytları
  const videos: { index: number; out: string; size: number; duration: number }[] = [];
  let done = 0;
  for (const [i, ov] of overlays) {
    const from = 0.2 + (0.78 * done) / nVideo,
      to = 0.2 + (0.78 * (done + 1)) / nVideo;
    const out = path.join(outDir, name(i, 'mp4'));
    const r = await composeVideoSlide(videoSlides[i], ov, out, (p, msg) => job.update({ progress: from + (to - from) * p, message: `Slayt ${i + 1} videosu: ${msg}` }));
    outputs[i] = out;
    videos.push({ index: i, out, ...r });
    done++;
  }

  const kinds = nVideo ? `${n - nVideo} görsel, ${nVideo} video` : `${n} ${fmt.toUpperCase()}`;
  job.update({
    status: 'done',
    progress: 1,
    message: `${n} slayt kaydedildi (${kinds})`,
    result: { dir: outDir, outputs, videos, under30: videos.every((v) => v.size < IG_LIMIT_BYTES) },
  });
}

type El = ReturnType<typeof slideVideos>[number];

/** Pencere videolarını siyah 1080×1350 zemine (cover) yerleştirir, overlay PNG'yi üstüne biner. */
async function composeVideoSlide(els: El[], overlay: string, out: string, progress: (p: number, msg: string) => void) {
  const probes = await Promise.all(els.map((e) => probe(e.video!)));
  // Süre: en uzun video, en fazla 60 sn. Kısa videolar döngüyle doldurulur.
  const D = Math.min(CAROUSEL_VIDEO_MAX_SEC, Math.max(...probes.map((p) => p.duration || 0)));
  if (!(D > 0)) throw new Error('Video süresi okunamadı');
  const audioIdx = probes.findIndex((p) => p.hasAudio);

  const args = ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${SLIDE.W}x${SLIDE.H}:r=30:d=${D}`];
  els.forEach((e) => args.push('-stream_loop', '-1', '-i', e.video!));
  args.push('-loop', '1', '-framerate', '30', '-i', overlay);
  const ovIn = els.length + 1;
  if (audioIdx < 0) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const filters: string[] = [];
  let base = '[0:v]';
  els.forEach((e, k) => {
    const r = evenRect(windowContentRect(e));
    filters.push(`[${k + 1}:v]scale=${r.w}:${r.h}:force_original_aspect_ratio=increase,crop=${r.w}:${r.h},setsar=1,fps=30[v${k}]`);
    filters.push(`${base}[v${k}]overlay=${r.x}:${r.y}:shortest=0:eof_action=repeat[b${k}]`);
    base = `[b${k}]`;
  });
  filters.push(`${base}[${ovIn}:v]overlay=0:0:shortest=0,format=yuv420p[v]`);
  const audio = audioIdx >= 0 ? `${audioIdx + 1}:a:0` : `${ovIn + 1}:a`;

  const encode = async (vArgs: string[], label: string, from: number, to: number) => {
    await run(
      'ffmpeg',
      [...args, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', audio, '-t', D.toFixed(3), ...vArgs, '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out],
      { duration: D, onProgress: (p) => progress(from + (to - from) * p, label) },
    );
    return (await fs.stat(out)).size;
  };

  // Önce kalite (CRF 19, tepe 10 Mbps); 30 MB'ı aşarsa hedef bit hızıyla yeniden.
  const cap = Math.min(10000, Math.floor(((IG_LIMIT_BYTES * 0.9 * 8) / D - 128_000) / 1000));
  let size = await encode(['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-maxrate', `${cap}k`, '-bufsize', `${cap * 2}k`], 'kodlanıyor', 0, 0.8);
  let kbps = Math.floor(cap * 0.85);
  for (let attempt = 0; size >= IG_LIMIT_BYTES * 0.98 && attempt < 3; attempt++) {
    size = await encode(['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`], `küçültülüyor (${kbps} kbps)`, 0.8, 1);
    kbps = Math.floor(kbps * 0.75);
  }
  return { size, duration: D };
}
