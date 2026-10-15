import fs from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newId, type Clip } from '@cb/schema';
import { files, SFX_DIR } from './paths';
import { run, probe } from './ffmpeg';
import { startJob } from './events';

const VIDEO_EXT = /\.(mov|mp4|m4v|mkv|webm|avi|mts)$/i;

export async function makeClip(file: string): Promise<Clip> {
  const abs = path.resolve(file.replace(/^~(?=\/)/, os.homedir()));
  if (!existsSync(abs)) throw Object.assign(new Error('Dosya bulunamadı: ' + abs), { statusCode: 404 });
  if (!VIDEO_EXT.test(abs)) throw Object.assign(new Error('Video dosyası değil: ' + path.basename(abs)), { statusCode: 422 });
  return { id: newId('clip'), path: abs, name: path.basename(abs), probe: await probe(abs) };
}

const proxyPath = (slug: string, clipId: string) => path.join(files(slug).cache, 'proxy', clipId + '.mp4');
const sheetDir = (slug: string, clipId: string) => path.join(files(slug).cache, 'sheet', clipId);
const wavePath = (slug: string, clipId: string) => path.join(files(slug).cache, 'wave', clipId + '.json');

const running = new Set<string>();

/**
 * Önizleme proxy'si: 720p, H.264, sık keyframe (scrub akıcı olsun). Döndürme uygulanmış hâlde.
 * Export her zaman orijinal dosyayı kullanır.
 */
export async function ensureProxy(slug: string, clip: Clip) {
  const out = proxyPath(slug, clip.id);
  if (existsSync(out) || running.has(out)) return;
  running.add(out);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const job = startJob(slug, 'proxy', clip.id);
  job.update({ message: `${clip.name} için önizleme kopyası hazırlanıyor` });
  const tmp = out + '.part.mp4';
  try {
    await run(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', clip.path, '-vf', "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',fps=30,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', '15', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp],
      { duration: clip.probe.duration, onProgress: (p) => job.update({ progress: p }) },
    );
    await fs.rename(tmp, out);
    job.update({ status: 'done', progress: 1, message: `${clip.name} hazır` });
  } catch (e) {
    job.update({ status: 'error', message: (e as Error).message });
  } finally {
    running.delete(out);
  }
}

export function proxyStatus(slug: string, clipId: string) {
  return existsSync(proxyPath(slug, clipId)) ? 'ready' : running.has(proxyPath(slug, clipId)) ? 'running' : 'missing';
}

/** Keyframe contact sheet: `-skip_frame nokey` (4K HEVC'de hızlı). Saniye etiketleri UI'da. */
export async function keyframeSheet(slug: string, clip: Clip): Promise<{ t: number; file: string }[]> {
  const dir = sheetDir(slug, clip.id);
  const index = path.join(dir, 'index.json');
  if (existsSync(index)) return JSON.parse(await fs.readFile(index, 'utf8'));
  await fs.mkdir(dir, { recursive: true });
  const job = startJob(slug, 'sheet', clip.id);
  job.update({ message: `${clip.name} kareleri çıkarılıyor` });
  try {
    // showinfo her karenin pts_time değerini stderr'e yazar; dosyalar sırayla 1.jpg, 2.jpg… olur.
    const { stderr } = await run(
      'ffmpeg',
      ['-v', 'info', '-y', '-skip_frame', 'nokey', '-i', clip.path, '-fps_mode', 'passthrough', '-vf', 'showinfo,scale=360:-2', '-q:v', '5', '-an', path.join(dir, '%d.jpg')],
      { duration: clip.probe.duration, onProgress: (p) => job.update({ progress: p }) },
      { fullStderr: true },
    );
    // Log satırları sırasız gelebiliyor; kare numarası (n) ile eşle.
    const hits = [...stderr.matchAll(/\bn:\s*(\d+)\b.*?pts_time:\s*(-?[\d.]+)/g)].map((m) => ({ n: Number(m[1]), t: Number(m[2]) }));
    const frames = hits
      .map((h) => ({ t: Math.max(0, Math.round(h.t * 100) / 100), file: `${h.n + 1}.jpg` }))
      .filter((f) => existsSync(path.join(dir, f.file)))
      .sort((a, b) => a.t - b.t);
    await fs.writeFile(index, JSON.stringify(frames));
    job.update({ status: 'done', progress: 1, message: `${frames.length} kare` });
    return frames;
  } catch (e) {
    job.update({ status: 'error', message: (e as Error).message });
    throw e;
  }
}

/** Timeline için ses dalgası: saniyede 50 tepe değeri (0–1). */
export async function waveform(slug: string, clip: Clip): Promise<number[]> {
  const out = wavePath(slug, clip.id);
  if (existsSync(out)) return JSON.parse(await fs.readFile(out, 'utf8'));
  if (!clip.probe.hasAudio) return [];
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', clip.path, '-vn', '-ac', '1', '-ar', '2000', '-f', 's16le', '-']);
    const chunks: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (c: number) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ses okunamadı'))));
  });
  const per = 40; // 2000 Hz / 50
  const peaks: number[] = [];
  for (let i = 0; i + 1 < raw.length; i += per * 2) {
    let m = 0;
    for (let j = i; j < Math.min(raw.length - 1, i + per * 2); j += 2) m = Math.max(m, Math.abs(raw.readInt16LE(j)));
    peaks.push(Math.round((m / 32768) * 1000) / 1000);
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(peaks));
  return peaks;
}

/** HTTP Range destekli dosya akışı (video scrub için şart). */
export function sendFile(req: FastifyRequest, reply: FastifyReply, file: string, type: string) {
  if (!existsSync(file)) return reply.code(404).send({ error: 'Dosya yok' });
  const size = statSync(file).size;
  const range = req.headers.range;
  reply.header('Accept-Ranges', 'bytes').header('Content-Type', type).header('Cache-Control', 'no-cache');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : size - 1;
    if (!m || !m[1]) {
      // bytes=-N: son N bayt
      start = m && m[2] ? Math.max(0, size - Number(m[2])) : 0;
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`).header('Content-Length', end - start + 1);
    return reply.send(createReadStream(file, { start, end }));
  }
  reply.header('Content-Length', size);
  return reply.send(createReadStream(file));
}

export { proxyPath, sheetDir };

/** macOS'un kendi dosya seçicisi (tarayıcı gerçek yolu veremez). */
export async function pickFiles(kind: 'video' | 'image' | 'audio'): Promise<string[]> {
  const types = kind === 'video' ? '{"public.movie"}' : kind === 'audio' ? '{"public.audio"}' : '{"public.image"}';
  const prompt = kind === 'video' ? 'Video seç' : kind === 'audio' ? 'Ses efekti seç' : 'Görsel seç';
  const script = `set fs to choose file with prompt "${prompt}" of type ${types} with multiple selections allowed
set out to ""
repeat with f in fs
set out to out & POSIX path of f & linefeed
end repeat
return out`;
  try {
    const { stdout } = await run('osascript', ['-e', script]);
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (/-128/.test((e as Error).message)) return []; // kullanıcı vazgeçti
    throw e;
  }
}

export const AUDIO_EXT = /\.(wav|mp3|m4a|aac|aif|aiff|caf|ogg|flac)$/i;

export const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.caf': 'audio/x-caf',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

/** Hazır ses efektleri: assets/sfx altındaki .wav dosyaları. */
export async function builtinSfx(): Promise<{ name: string; file: string }[]> {
  const list = await fs.readdir(SFX_DIR).catch(() => [] as string[]);
  return list.filter((f) => f.endsWith('.wav')).sort().map((f) => ({ name: f.replace(/\.wav$/, ''), file: f }));
}

/**
 * Ses efektlerini proje klasörünün media/ altına kopyalar (küçük dosyalar; proje taşınabilir kalsın).
 * builtin: hazır efektin adı (ör. "pop"); aynı efekt ikinci kez kopyalanmaz.
 */
export async function addSfxFiles(slug: string, input: { paths?: string[]; builtin?: string }): Promise<string[]> {
  const dir = path.join(files(slug).dir, 'media');
  await fs.mkdir(dir, { recursive: true });
  const out: string[] = [];
  if (input.builtin) {
    const file = path.basename(input.builtin).replace(/\.wav$/, '') + '.wav';
    const src = path.join(SFX_DIR, file);
    if (!existsSync(src)) throw Object.assign(new Error('Hazır efekt bulunamadı: ' + input.builtin), { statusCode: 404 });
    const name = 'sfx-' + file;
    if (!existsSync(path.join(dir, name))) await fs.copyFile(src, path.join(dir, name));
    out.push('media/' + name);
  }
  for (const p of input.paths ?? []) {
    const abs = path.resolve(p.replace(/^~(?=\/)/, os.homedir()));
    if (!AUDIO_EXT.test(abs)) throw Object.assign(new Error('Ses dosyası değil: ' + path.basename(abs)), { statusCode: 422 });
    if (!existsSync(abs)) throw Object.assign(new Error('Dosya bulunamadı: ' + abs), { statusCode: 404 });
    const name = Date.now().toString(36) + '-' + path.basename(abs).replace(/[^\w.-]+/g, '_');
    await fs.copyFile(abs, path.join(dir, name));
    out.push('media/' + name);
  }
  return out;
}
