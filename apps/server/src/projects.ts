import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseProject, describeError, nextSeriesNumber, type Project, type CarouselStyle } from '@cb/schema';
import { STARTER_SCENES, starterReel, starterCarousel } from '@cb/renderer';
import { ROOT, files, slugify, SERVER_DIR } from './paths';
import { emit } from './events';

export interface ProjectBundle {
  slug: string;
  project: Project;
  scenes: string;
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Kendi yazdıklarımızı izleyiciden ayırmak için son yazılan içeriğin özeti. */
const written = new Map<string, string>();

async function readText(p: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return fallback;
  }
}

export async function listProjects() {
  await fs.mkdir(ROOT, { recursive: true });
  const out: { slug: string; title: string; kind: string; updatedAt: number }[] = [];
  for (const d of await fs.readdir(ROOT, { withFileTypes: true })) {
    // .inspiration, .research gibi gizli klasörler proje değil.
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    const f = files(d.name);
    try {
      const raw = JSON.parse(await fs.readFile(f.project, 'utf8'));
      const st = await fs.stat(f.project);
      out.push({ slug: d.name, title: raw.title ?? d.name, kind: raw.kind ?? '?', updatedAt: st.mtimeMs });
    } catch {
      /* project.json olmayan klasörleri atla */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Picks carousel'lerinin serileri: öneri listesi ve otomatik numara için. */
export async function listSeries() {
  await fs.mkdir(ROOT, { recursive: true });
  const out: { slug: string; series: string; category: string; number: number }[] = [];
  for (const d of await fs.readdir(ROOT, { withFileTypes: true })) {
    // .inspiration, .research gibi gizli klasörler proje değil.
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(files(d.name).project, 'utf8'));
      const pk = raw?.kind === 'carousel' && raw.style === 'picks' ? raw.picks : null;
      if (pk && typeof pk.series === 'string' && Number.isFinite(pk.number)) out.push({ slug: d.name, series: pk.series, category: String(pk.category ?? ''), number: pk.number });
    } catch {
      /* project.json olmayan klasörleri atla */
    }
  }
  return out;
}

export async function createProject(title: string, kind: 'reel' | 'carousel', style: CarouselStyle = 'picks'): Promise<ProjectBundle> {
  await fs.mkdir(ROOT, { recursive: true });
  const base = slugify(title);
  let slug = base;
  for (let i = 2; existsSync(path.join(ROOT, slug)); i++) slug = `${base}-${i}`;
  const f = files(slug);
  await fs.mkdir(f.dir, { recursive: true });
  let project: Project;
  if (kind === 'reel') project = starterReel(title);
  else {
    // Seri numarası: aynı serideki en büyük numara + 1; kategori o serinin son kullanılanı.
    const series = await listSeries();
    const name = series.sort((a, b) => b.number - a.number)[0]?.series ?? "CEREN'S PICKS";
    const same = series.filter((x) => x.series === name);
    project = starterCarousel(title, style, { series: name, number: nextSeriesNumber(name, series), ...(same[0]?.category ? { category: same[0].category } : {}) });
  }
  const scenes = kind === 'reel' ? STARTER_SCENES : '';
  await writeProject(slug, project, scenes);
  await writeClaudeMd(slug);
  return { slug, project, scenes };
}

/** Proje klasörüne Claude'a yönelik kuralları yazar (şablon değişince güncellenir). */
export async function writeClaudeMd(slug: string) {
  const tpl = await fs.readFile(path.join(SERVER_DIR, 'templates', 'CLAUDE.md'), 'utf8');
  await fs.writeFile(files(slug).claudeMd, tpl);
}

export async function readProject(slug: string): Promise<ProjectBundle & { error?: string }> {
  const f = files(slug);
  const raw = await fs.readFile(f.project, 'utf8');
  const scenes = await readText(f.scenes);
  const parsed = parseProject(JSON.parse(raw));
  if (!parsed.success) throw Object.assign(new Error('project.json geçersiz: ' + describeError(parsed.error)), { statusCode: 422 });
  return { slug, project: parsed.data, scenes };
}

export async function writeProject(slug: string, project: unknown, scenes: string) {
  const parsed = parseProject(project);
  if (!parsed.success) throw Object.assign(new Error(describeError(parsed.error)), { statusCode: 422 });
  const f = files(slug);
  const json = JSON.stringify(parsed.data, null, 1) + '\n';
  written.set(f.project, hash(json));
  written.set(f.scenes, hash(scenes));
  await atomicWrite(f.project, json);
  if (parsed.data.kind === 'reel') await atomicWrite(f.scenes, scenes);
  return parsed.data;
}

async function atomicWrite(p: string, s: string) {
  const tmp = p + '.tmp-' + process.pid;
  await fs.writeFile(tmp, s);
  await fs.rename(tmp, p);
}

// ---- Snapshot'lar (.history) ----

export async function snapshot(slug: string, label: string): Promise<string> {
  const f = files(slug);
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '_' + slugify(label).slice(0, 24);
  const dir = path.join(f.history, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(f.project, path.join(dir, 'project.json'));
  if (existsSync(f.scenes)) await fs.copyFile(f.scenes, path.join(dir, 'scenes.js'));
  await pruneHistory(slug, 80);
  return id;
}

async function pruneHistory(slug: string, keep: number) {
  const ids = (await fs.readdir(files(slug).history)).sort();
  for (const id of ids.slice(0, Math.max(0, ids.length - keep))) await fs.rm(path.join(files(slug).history, id), { recursive: true, force: true });
}

export async function listHistory(slug: string) {
  try {
    return (await fs.readdir(files(slug).history)).sort().reverse();
  } catch {
    return [];
  }
}

export async function restoreSnapshot(slug: string, id: string): Promise<ProjectBundle> {
  if (!/^[\w-]+$/.test(id)) throw Object.assign(new Error('Geçersiz snapshot'), { statusCode: 400 });
  const dir = path.join(files(slug).history, id);
  const project = JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8'));
  const scenes = await readText(path.join(dir, 'scenes.js'));
  await snapshot(slug, 'geri-yukleme-oncesi');
  const saved = await writeProject(slug, project, scenes);
  return { slug, project: saved, scenes };
}

// ---- Dış değişiklikleri izleme (Claude ya da elle düzenleme) ----

const watchers = new Map<string, FSWatcher>();
/** Claude turu sürerken ara hâlleri yayınlama; tur bitince claude.ts kontrol eder. */
export const quiet = new Set<string>();

export function watchProject(slug: string) {
  if (watchers.has(slug)) return;
  const f = files(slug);
  let timer: NodeJS.Timeout | null = null;
  const w = chokidar.watch([f.project, f.scenes], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } });
  w.on('all', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void onExternalChange(slug, 'external'), 150);
  });
  watchers.set(slug, w);
}

/** Diskteki hâli kontrol eder; bizim yazmadığımız bir değişiklikse yayınlar. */
export async function onExternalChange(slug: string, source: 'claude' | 'external'): Promise<'unchanged' | 'changed' | 'invalid'> {
  if (source === 'external' && quiet.has(slug)) return 'unchanged';
  const f = files(slug);
  const raw = await readText(f.project);
  const scenes = await readText(f.scenes);
  if (written.get(f.project) === hash(raw) && written.get(f.scenes) === hash(scenes)) return 'unchanged';
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    emit({ type: 'project-invalid', slug, error: 'project.json okunamadı: ' + (e as Error).message });
    return 'invalid';
  }
  const parsed = parseProject(data);
  if (!parsed.success) {
    emit({ type: 'project-invalid', slug, error: describeError(parsed.error) });
    return 'invalid';
  }
  written.set(f.project, hash(raw));
  written.set(f.scenes, hash(scenes));
  emit({ type: 'project-changed', slug, source, project: parsed.data, scenes });
  return 'changed';
}
