import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright-core';
import { REEL, IG_LIMIT_BYTES, type ReelProject } from '@cb/schema';
import { timeline, frameCount, ffmpegCrop } from '@cb/renderer';
import { files, PORT, SERVER_DIR } from './paths';
import { run, probe } from './ffmpeg';
import { startJob } from './events';
import { readProject } from './projects';

// ---- Export sayfası (headless Chromium) ----

let bundle: string | null = null;
export async function renderBundle(): Promise<string> {
  if (bundle && process.env.NODE_ENV === 'production') return bundle;
  const r = await build({ entryPoints: [path.join(SERVER_DIR, 'src', 'render-entry.ts')], bundle: true, format: 'iife', write: false, target: 'chrome120', logLevel: 'silent' });
  bundle = r.outputFiles[0].text;
  return bundle;
}

export const RENDER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>html,body{margin:0;background:transparent}canvas{display:block}</style></head>
<body><canvas id="c" width="${REEL.W}" height="${REEL.H}"></canvas><script src="/render/app.js"></script></body></html>`;

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

const busy = new Set<string>();

export async function exportReel(slug: string) {
  if (busy.has(slug)) throw Object.assign(new Error('Bu proje için export zaten sürüyor'), { statusCode: 409 });
  busy.add(slug);
  const job = startJob(slug, 'export');
  // Uzun iş: yanıtı beklemeden arka planda sürer, ilerleme SSE ile gelir.
  void doExport(slug, job)
    .catch((e) => job.update({ status: 'error', message: (e as Error).message }))
    .finally(() => busy.delete(slug));
  return job;
}

async function doExport(slug: string, job: ReturnType<typeof startJob>) {
  const { project, scenes } = await readProject(slug);
  if (project.kind !== 'reel') throw new Error('Sadece reel export edilebilir');
  const f = files(slug);
  const work = path.join(f.cache, 'export');
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(path.join(work, 'ov'), { recursive: true });
  await fs.mkdir(path.join(work, 'seg'), { recursive: true });
  await fs.mkdir(f.exports, { recursive: true });

  const tl = timeline(project.captions);
  const N = frameCount(tl.duration, REEL.FPS);
  const step = (from: number, to: number, msg: string) => (p: number) => job.update({ progress: from + (to - from) * p, message: msg });

  // 1) Overlay kareleri (4 paralel sayfa) ve alt yarı segmentleri aynı anda.
  const overlay = renderOverlay(project, scenes, N, path.join(work, 'ov'), step(0, 0.6, `Overlay kareleri (${N})`));
  const bottom = renderBottom(project, work);
  const [, bottomFile] = await Promise.all([overlay, bottom]);

  // 2) Compose
  const out = path.join(f.exports, `${slug}.mp4`);
  const speech = project.audio === 'speech' && bottomFile !== null;
  const args = ['-v', 'error', '-y'];
  if (bottomFile) args.push('-i', bottomFile);
  else args.push('-f', 'lavfi', '-i', `color=c=0xF5F0E9:s=1080x960:r=30:d=${tl.duration}`);
  args.push('-framerate', '30', '-i', path.join(work, 'ov', '%05d.png'));
  if (!speech) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push(
    '-filter_complex',
    `[0:v]tpad=stop_mode=add:stop_duration=600:color=0xF5F0E9,pad=1080:1920:0:960:color=0xF5F0E9[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]` + (speech ? ';[0:a]apad[a]' : ''),
    '-map', '[v]', '-map', speech ? '[a]' : '2:a',
    '-frames:v', String(N), '-t', String(N / REEL.FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', out,
  );
  await run('ffmpeg', args, { duration: N / REEL.FPS, onProgress: step(0.75, 0.88, 'Birleştiriliyor') });

  // 3) Instagram kopyası (<30 MB)
  const ig = path.join(f.exports, `${slug}_ig.mp4`);
  let kbps = 4500;
  for (let attempt = 0; attempt < 3; attempt++) {
    await run(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', out, '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.22)}k`, '-bufsize', `${kbps * 2}k`, '-c:a', 'copy', '-movflags', '+faststart', ig],
      { duration: N / REEL.FPS, onProgress: step(0.88, 0.97, `Instagram kopyası (${kbps} kbps)`) },
    );
    const size = (await fs.stat(ig)).size;
    if (size < IG_LIMIT_BYTES * 0.98) break;
    kbps = Math.floor((((IG_LIMIT_BYTES * 0.9 * 8) / (N / REEL.FPS) - 128_000) / 1000) * 0.95);
  }

  // 4) QA kareleri
  job.update({ progress: 0.97, message: 'Kontrol kareleri' });
  const check = path.join(f.exports, 'check.jpg');
  const hook = path.join(f.exports, 'hook.jpg');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vf', `fps=1/${Math.max(1, tl.duration / 16).toFixed(2)},scale=270:480,tile=8x2`, '-frames:v', '1', check]);
  await run('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vf', "select='lt(t,3.6)',fps=3,scale=270:480,tile=6x2", '-frames:v', '1', hook]);

  const info = await probe(ig);
  const sizes = { full: (await fs.stat(out)).size, ig: (await fs.stat(ig)).size };
  job.update({
    status: 'done',
    progress: 1,
    message: `Hazır · ${(sizes.ig / 1024 / 1024).toFixed(1)} MB`,
    result: { out, ig, check, hook, sizes, under30: sizes.ig < IG_LIMIT_BYTES, probe: info, duration: N / REEL.FPS },
  });
}

async function renderOverlay(project: ReelProject, scenes: string, N: number, outDir: string, progress: (p: number) => void) {
  const browser = await launchBrowser();
  const workers = Math.min(4, Math.max(1, os.cpus().length - 2));
  let done = 0;
  try {
    const Q = Math.ceil(N / workers);
    await Promise.all(
      Array.from({ length: workers }, async (_, k) => {
        const page = await browser.newPage({ viewport: { width: REEL.W, height: REEL.H } });
        page.on('pageerror', (e) => console.error('[render]', e.message));
        await page.goto(`http://127.0.0.1:${PORT}/render/index.html`);
        await page.evaluate(([p, s]) => window.setup(p as ReelProject, s as string), [project, scenes] as const);
        for (let i = k * Q; i < Math.min(N, (k + 1) * Q); i++) {
          const url = await page.evaluate((t) => window.frame(t), i / REEL.FPS);
          await fs.writeFile(path.join(outDir, String(i).padStart(5, '0') + '.png'), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
          if (++done % 15 === 0) progress(done / N);
        }
        await page.close();
      }),
    );
  } finally {
    await browser.close();
  }
}

/** Alt yarı: EDL kesitlerini kes (paralel), birleştir. Kesit yoksa null (krem dolgu kullanılır). */
async function renderBottom(project: ReelProject, work: string): Promise<string | null> {
  if (!project.edl.length) return null;
  const speech = project.audio === 'speech';
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const segs = project.edl.map((cut, i) => {
    const clip = clips.get(cut.clip);
    if (!clip) throw new Error(`Kesit ${i + 1}: klip bulunamadı`);
    if (!existsSync(clip.path)) throw new Error(`Kaynak video yok: ${clip.path}`);
    const out = path.join(work, 'seg', String(i).padStart(3, '0') + '.mp4');
    const args = ['-v', 'error', '-y', '-ss', String(cut.in), '-i', clip.path];
    if (speech && !clip.probe.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    args.push('-t', String(cut.dur), '-vf', `${ffmpegCrop(cut, clip)},fps=30,setsar=1,format=yuv420p`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-g', '30');
    if (speech) args.push('-map', '0:v:0', '-map', clip.probe.hasAudio ? '0:a:0' : '1:a:0', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', '-shortest');
    else args.push('-an');
    args.push(out);
    return { args, out };
  });
  // 4K HEVC çözmek ağır: 3 paralel.
  const queue = [...segs];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) await run('ffmpeg', s.args);
    }),
  );
  const list = path.join(work, 'list.txt');
  await fs.writeFile(list, segs.map((s) => `file '${s.out.replace(/'/g, "'\\''")}'`).join('\n'));
  const bottom = path.join(work, 'bottom.mp4');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', bottom]);
  return bottom;
}
