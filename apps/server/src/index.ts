import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import type { Clip } from '@cb/schema';
import { PORT, FONTS_DIR, files, ROOT } from './paths';
import { subscribe, HUB } from './events';
import { listProjects, listSeries, createProject, readProject, writeProject, snapshot, listHistory, restoreSnapshot, watchProject, writeClaudeMd } from './projects';
import { makeClip, ensureProxy, proxyStatus, proxyPath, keyframeSheet, sheetDir, waveform, sendFile, pickFiles } from './media';
import { exportReel, renderBundle, RENDER_HTML } from './export';
import { askClaude, chatHistory, resetChat, stopClaude, isRunning } from './claude';
import { run } from './ffmpeg';
import { readIdeas, writeIdeas, inspirationDir } from './ideas';
import { analyzeIdea } from './inspire';
import { readResearch, saveNiche, startResearch, stopRun, deleteRun } from './research';

const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 50 * 1024 * 1024 });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (code >= 500) console.error(err);
  reply.code(code).send({ error: err.message });
});

type P = { slug: string };

async function clipOf(slug: string, clipId: string): Promise<Clip> {
  const { project } = await readProject(slug);
  const clip = project.kind === 'reel' ? project.clips.find((c) => c.id === clipId) : undefined;
  if (!clip) throw Object.assign(new Error('Klip bulunamadı'), { statusCode: 404 });
  return clip;
}

// ---- Projeler ----
app.get('/api/projects', async () => ({ root: ROOT.replace(os.homedir(), '~'), projects: await listProjects() }));

app.post<{ Body: { title: string; kind: 'reel' | 'carousel'; style?: 'picks' | 'pixel' } }>('/api/projects', async (req) => {
  const title = (req.body.title || '').trim() || 'Yeni proje';
  return createProject(title, req.body.kind === 'carousel' ? 'carousel' : 'reel', req.body.style === 'pixel' ? 'pixel' : 'picks');
});

app.get('/api/series', async () => ({ series: await listSeries() }));

// ---- Fikirler ----
app.get('/api/ideas', async () => ({ ideas: await readIdeas() }));
app.put<{ Body: { ideas: unknown } }>('/api/ideas', async (req) => ({ ideas: await writeIdeas(req.body?.ideas) }));
app.post<{ Params: { id: string } }>('/api/ideas/:id/analyze', async (req) => ({ analysis: await analyzeIdea(req.params.id) }));
app.get<{ Params: { id: string; file: string } }>('/api/inspiration/:id/:file', (req, reply) => {
  if (!/^frame-\d{2}\.jpg$/.test(req.params.file)) return reply.code(400).send();
  return sendFile(req, reply, path.join(inspirationDir(req.params.id), req.params.file), 'image/jpeg');
});

// ---- Araştır ----
app.get('/api/research', async () => readResearch());
app.put<{ Body: { niche: unknown } }>('/api/research/niche', async (req) => saveNiche(req.body?.niche));
app.post<{ Body: { kind?: unknown; prompt?: unknown } }>('/api/research', async (req) => ({ run: await startResearch(req.body ?? {}) }));
app.post<{ Params: { id: string } }>('/api/research/:id/stop', async (req) => stopRun(req.params.id));
app.delete<{ Params: { id: string } }>('/api/research/:id', async (req) => deleteRun(req.params.id));

/** Ana sayfa olayları: analiz ve araştırma ilerlemesi. */
app.get('/api/events', (_req, reply) => subscribe(HUB, reply));

app.get<{ Params: P }>('/api/projects/:slug', async (req) => {
  watchProject(req.params.slug);
  await writeClaudeMd(req.params.slug).catch(() => {});
  return { ...(await readProject(req.params.slug)), claudeRunning: isRunning(req.params.slug) };
});

app.put<{ Params: P; Body: { project: unknown; scenes: string } }>('/api/projects/:slug', async (req, reply) => {
  if (isRunning(req.params.slug)) return reply.code(409).send({ error: 'Claude düzenlerken kayıt yapılamaz' });
  const project = await writeProject(req.params.slug, req.body.project, req.body.scenes ?? '');
  return { ok: true, project };
});

app.get<{ Params: P }>('/api/projects/:slug/events', (req, reply) => {
  watchProject(req.params.slug);
  subscribe(req.params.slug, reply);
});

app.get<{ Params: P }>('/api/projects/:slug/history', async (req) => ({ snapshots: await listHistory(req.params.slug) }));
app.post<{ Params: P; Body: { label?: string } }>('/api/projects/:slug/snapshot', async (req) => ({ id: await snapshot(req.params.slug, req.body?.label || 'elle') }));
app.post<{ Params: P & { id: string } }>('/api/projects/:slug/history/:id/restore', async (req) => restoreSnapshot(req.params.slug, req.params.id));

// ---- Medya ----
app.post('/api/pick', async (req) => ({ paths: await pickFiles(((req.body as any)?.kind as 'video' | 'image') || 'video') }));

app.post<{ Params: P; Body: { paths: string[] } }>('/api/projects/:slug/clips', async (req) => {
  const clips = await Promise.all(req.body.paths.map((p) => makeClip(p)));
  return { clips };
});

app.post<{ Params: P & { clip: string } }>('/api/projects/:slug/clips/:clip/proxy', async (req) => {
  const clip = await clipOf(req.params.slug, req.params.clip);
  void ensureProxy(req.params.slug, clip);
  return { status: proxyStatus(req.params.slug, clip.id) };
});

app.get<{ Params: P & { clip: string } }>('/api/projects/:slug/clips/:clip/proxy.mp4', (req, reply) =>
  sendFile(req, reply, proxyPath(req.params.slug, req.params.clip), 'video/mp4'),
);

app.get<{ Params: P & { clip: string } }>('/api/projects/:slug/clips/:clip/sheet', async (req) => {
  const clip = await clipOf(req.params.slug, req.params.clip);
  return { frames: await keyframeSheet(req.params.slug, clip) };
});

app.get<{ Params: P & { clip: string; file: string } }>('/api/projects/:slug/clips/:clip/sheet/:file', (req, reply) => {
  if (!/^\d+\.jpg$/.test(req.params.file)) return reply.code(400).send();
  return sendFile(req, reply, path.join(sheetDir(req.params.slug, req.params.clip), req.params.file), 'image/jpeg');
});

app.get<{ Params: P & { clip: string } }>('/api/projects/:slug/clips/:clip/wave', async (req) => {
  const clip = await clipOf(req.params.slug, req.params.clip);
  return { peaks: await waveform(req.params.slug, clip), rate: 50 };
});

/** Carousel görselleri: proje klasöründeki media/ altına kopyalanır (küçük dosyalar). */
app.post<{ Params: P; Body: { paths: string[] } }>('/api/projects/:slug/images', async (req) => {
  const dir = path.join(files(req.params.slug).dir, 'media');
  await fs.mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const p of req.body.paths) {
    const name = Date.now().toString(36) + '-' + path.basename(p).replace(/[^\w.-]+/g, '_');
    await fs.copyFile(p, path.join(dir, name));
    out.push('media/' + name);
  }
  return { srcs: out };
});

app.get<{ Params: P & { file: string } }>('/api/projects/:slug/media/:file', (req, reply) => {
  const file = path.basename(req.params.file);
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  return sendFile(req, reply, path.join(files(req.params.slug).dir, 'media', file), type);
});

// ---- Export ----
app.post<{ Params: P }>('/api/projects/:slug/export', async (req) => ({ job: await exportReel(req.params.slug) }));

app.get<{ Params: P & { file: string } }>('/api/projects/:slug/exports/:file', (req, reply) => {
  const file = path.basename(req.params.file);
  return sendFile(req, reply, path.join(files(req.params.slug).exports, file), file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.png') ? 'image/png' : 'image/jpeg');
});

/** Carousel: tarayıcı aynı renderer'la slaytı çizer, burada kaydedilir. */
app.post<{ Params: P & { name: string }; Body: { data: string } }>('/api/projects/:slug/exports/:name', async (req) => {
  const name = path.basename(req.params.name);
  if (!/^[\w-]+\.(png|jpg)$/.test(name)) throw Object.assign(new Error('Geçersiz dosya adı'), { statusCode: 400 });
  const dir = path.join(files(req.params.slug).exports, 'carousel');
  await fs.mkdir(dir, { recursive: true });
  const data = req.body.data;
  await fs.writeFile(path.join(dir, name), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  return { path: path.join(dir, name) };
});

app.post<{ Body: { path: string } }>('/api/reveal', async (req) => {
  const p = req.body.path;
  if (!p.startsWith(ROOT)) throw Object.assign(new Error('İzin yok'), { statusCode: 403 });
  await run('open', ['-R', p]);
  return { ok: true };
});

// ---- Claude ----
app.get<{ Params: P }>('/api/projects/:slug/claude', async (req) => ({ history: await chatHistory(req.params.slug), running: isRunning(req.params.slug) }));
app.post<{ Params: P; Body: { message: string; context?: string } }>('/api/projects/:slug/claude', async (req) => askClaude(req.params.slug, req.body.message, req.body.context));
app.post<{ Params: P }>('/api/projects/:slug/claude/stop', async (req) => {
  stopClaude(req.params.slug);
  return { ok: true };
});
app.post<{ Params: P }>('/api/projects/:slug/claude/reset', async (req) => {
  await resetChat(req.params.slug);
  return { ok: true };
});

// ---- Export sayfası ve fontlar ----
app.get('/render/index.html', (_req, reply) => reply.type('text/html').send(RENDER_HTML));
app.get('/render/app.js', async (_req, reply) => reply.type('application/javascript').send(await renderBundle()));
app.get<{ Params: { file: string } }>('/fonts/:file', (req, reply) => {
  const file = path.basename(req.params.file);
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
  return sendFile(req, reply, path.join(FONTS_DIR, file), type);
});

app.listen({ port: PORT, host: '127.0.0.1' }).then(() => {
  console.log(`cerenbuilds sunucusu: http://127.0.0.1:${PORT} · projeler: ${ROOT}`);
});
