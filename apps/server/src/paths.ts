import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT = Number(process.env.CB_PORT || 4318);
/** Projeler repo dışında durur, videolar büyük. */
export const ROOT = process.env.CB_ROOT || path.join(os.homedir(), 'cerenbuilds', 'projects');

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(here, '..');
export const REPO_DIR = path.resolve(SERVER_DIR, '..', '..');
export const RENDERER_DIR = path.join(REPO_DIR, 'packages', 'renderer');
export const FONTS_DIR = path.join(RENDERER_DIR, 'fonts');
/** Hazır ses efektleri (ffmpeg ile üretildi, CC0). */
export const SFX_DIR = path.join(SERVER_DIR, 'assets', 'sfx');

export function projectDir(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw Object.assign(new Error('Geçersiz proje adı'), { statusCode: 400 });
  return path.join(ROOT, slug);
}

export const files = (slug: string) => {
  const dir = projectDir(slug);
  return {
    dir,
    project: path.join(dir, 'project.json'),
    scenes: path.join(dir, 'scenes.js'),
    claudeMd: path.join(dir, 'CLAUDE.md'),
    history: path.join(dir, '.history'),
    editor: path.join(dir, '.editor'),
    cache: path.join(dir, 'cache'),
    exports: path.join(dir, 'exports'),
  };
};

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' };
  return (
    s
      .toLocaleLowerCase('tr')
      .replace(/[çğıİöşü]/g, (c) => map[c] ?? c)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'proje'
  );
}
