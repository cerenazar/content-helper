import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './paths';

/** Fikir notları ve ilham linkleri. Proje klasörlerinin yanında tek bir dosyada durur (listProjects dosyaları atlar). */
export interface Idea {
  id: string;
  text: string;
  url: string | null;
  createdAt: number;
  /** Bu fikirden açılan proje. */
  project: string | null;
}

const FILE = () => path.join(ROOT, '.ideas.json');

export async function readIdeas(): Promise<Idea[]> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return Array.isArray(raw.ideas) ? raw.ideas.map(clean).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function writeIdeas(list: unknown): Promise<Idea[]> {
  if (!Array.isArray(list)) throw Object.assign(new Error('Fikir listesi geçersiz'), { statusCode: 400 });
  const ideas = list.map(clean).filter((x): x is Idea => !!x);
  await fs.mkdir(ROOT, { recursive: true });
  const tmp = FILE() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ ideas }, null, 2));
  await fs.rename(tmp, FILE());
  return ideas;
}

function clean(x: any): Idea | null {
  if (!x || typeof x.id !== 'string' || typeof x.text !== 'string') return null;
  const url = typeof x.url === 'string' && /^https?:\/\//.test(x.url) ? x.url : null;
  if (!x.text.trim() && !url) return null;
  return {
    id: x.id.slice(0, 64),
    text: x.text.slice(0, 4000),
    url,
    createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
    project: typeof x.project === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(x.project) ? x.project : null,
  };
}
