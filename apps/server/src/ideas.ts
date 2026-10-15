import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './paths';
import { cleanAnalysis, type Analysis } from './analysis';

/** Fikir notları ve ilham linkleri. Proje klasörlerinin yanında tek bir dosyada durur (listProjects dosyaları atlar). */
export interface Idea {
  id: string;
  text: string;
  url: string | null;
  createdAt: number;
  /** Bu fikirden açılan proje. */
  project: string | null;
  /** Link analizi. Yalnızca sunucu yazar; istemciden gelen değer yok sayılır. */
  analysis?: Analysis;
}

const FILE = () => path.join(ROOT, '.ideas.json');
export const inspirationDir = (id: string) => path.join(ROOT, '.inspiration', id.replace(/[^\w-]/g, '_'));

/** Şu an analizi süren fikirler. Diskte "running" görünüp burada olmayan iş, sunucu yeniden başladığı için yarıda kalmıştır. */
export const analysing = new Set<string>();

/** Okuma-yazma sırası: istemci kaydı ile analiz işi aynı dosyayı aynı anda yazmasın. */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function readRaw(): Promise<Idea[]> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return Array.isArray(raw.ideas) ? raw.ideas.map(clean).filter((x: Idea | null): x is Idea => !!x) : [];
  } catch {
    return [];
  }
}

async function writeRaw(ideas: Idea[]) {
  await fs.mkdir(ROOT, { recursive: true });
  const tmp = FILE() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ ideas }, null, 2));
  await fs.rename(tmp, FILE());
}

function stale(i: Idea): Idea {
  if (i.analysis?.status === 'running' && !analysing.has(i.id))
    return { ...i, analysis: { ...i.analysis, status: 'error', step: '', error: 'Sunucu yeniden başladı, analiz yarıda kaldı. Tekrar dene.' } };
  return i;
}

export async function readIdeas(): Promise<Idea[]> {
  return (await readRaw()).map(stale);
}

/** İstemciden gelen liste. `analysis` alanı diskteki haliyle korunur; silinen fikirlerin analiz klasörü de silinir. */
export function writeIdeas(list: unknown): Promise<Idea[]> {
  if (!Array.isArray(list)) throw Object.assign(new Error('Fikir listesi geçersiz'), { statusCode: 400 });
  return locked(async () => {
    const prev = new Map((await readRaw()).map((i) => [i.id, i]));
    const ideas = list
      .map(clean)
      .filter((x): x is Idea => !!x)
      .map((i) => {
        const { analysis: _ignored, ...rest } = i;
        const a = prev.get(i.id)?.analysis;
        return a ? { ...rest, analysis: a } : rest;
      });
    await writeRaw(ideas);
    const kept = new Set(ideas.map((i) => i.id));
    for (const id of prev.keys()) if (!kept.has(id)) await fs.rm(inspirationDir(id), { recursive: true, force: true }).catch(() => {});
    return ideas.map(stale);
  });
}

/** Tek bir fikri sunucu tarafında günceller (analiz işi). Fikir silinmişse null döner. */
export function updateIdea(id: string, fn: (i: Idea) => Idea): Promise<Idea | null> {
  return locked(async () => {
    const ideas = await readRaw();
    const k = ideas.findIndex((i) => i.id === id);
    if (k < 0) return null;
    const next = clean(fn(ideas[k]));
    if (!next) return null;
    ideas[k] = next;
    await writeRaw(ideas);
    return next;
  });
}

export function clean(x: any): Idea | null {
  if (!x || typeof x.id !== 'string' || typeof x.text !== 'string') return null;
  const url = typeof x.url === 'string' && /^https?:\/\//.test(x.url) ? x.url : null;
  if (!x.text.trim() && !url) return null;
  const idea: Idea = {
    id: x.id.slice(0, 64),
    text: x.text.slice(0, 4000),
    url,
    createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
    project: typeof x.project === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(x.project) ? x.project : null,
  };
  const analysis = url ? cleanAnalysis(x.analysis) : null;
  if (analysis) idea.analysis = analysis;
  return idea;
}
