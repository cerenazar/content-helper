import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SERVER_DIR } from './paths';
import { emit, HUB } from './events';
import { runClaude, type ClaudeRun } from './claude-run';
import { DEFAULT_NICHE } from './analysis';
import { cleanRun, extractHooks, researchPrompt, stepFor, KINDS, RESEARCH_SKILL, type ResearchKind, type ResearchRun } from './research-lib';

/** Araştır bölümü: niş tanımı ve geçmiş taramalar `$CB_ROOT/.research.json`'da, Claude'un çalışma klasörü `.research/<id>/`. */
interface Store {
  niche: string;
  runs: ResearchRun[];
}

const FILE = () => path.join(ROOT, '.research.json');
const active = new Map<string, ClaudeRun>();

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function readRaw(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return {
      niche: typeof raw.niche === 'string' && raw.niche.trim() ? raw.niche.slice(0, 2000) : DEFAULT_NICHE,
      runs: Array.isArray(raw.runs) ? raw.runs.map(cleanRun).filter((r: ResearchRun | null): r is ResearchRun => !!r) : [],
    };
  } catch {
    return { niche: DEFAULT_NICHE, runs: [] };
  }
}

async function writeRaw(s: Store) {
  await fs.mkdir(ROOT, { recursive: true });
  const tmp = FILE() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE());
}

const stale = (r: ResearchRun): ResearchRun =>
  r.status === 'running' && !active.has(r.id) ? { ...r, status: 'error', error: 'Sunucu yeniden başladı, araştırma yarıda kaldı.' } : r;

export async function readResearch() {
  const s = await readRaw();
  return { niche: s.niche, defaultNiche: DEFAULT_NICHE, runs: s.runs.map(stale), running: active.size > 0 };
}

export async function readNiche() {
  return (await readRaw()).niche;
}

export function saveNiche(niche: unknown) {
  if (typeof niche !== 'string') throw Object.assign(new Error('Niş metni geçersiz'), { statusCode: 400 });
  return locked(async () => {
    const s = await readRaw();
    s.niche = niche.trim().slice(0, 2000) || DEFAULT_NICHE;
    await writeRaw(s);
    return { niche: s.niche };
  });
}

function updateRun(id: string, fn: (r: ResearchRun) => ResearchRun): Promise<ResearchRun | null> {
  return locked(async () => {
    const s = await readRaw();
    const k = s.runs.findIndex((r) => r.id === id);
    if (k < 0) return null;
    const next = cleanRun(fn(s.runs[k]));
    if (!next) return null;
    s.runs[k] = next;
    await writeRaw(s);
    emit({ type: 'research', slug: HUB, run: next });
    return next;
  });
}

export function deleteRun(id: string) {
  active.get(id)?.stop();
  return locked(async () => {
    const s = await readRaw();
    s.runs = s.runs.filter((r) => r.id !== id);
    await writeRaw(s);
    await fs.rm(path.join(ROOT, '.research', id.replace(/[^\w-]/g, '_')), { recursive: true, force: true }).catch(() => {});
    return { ok: true };
  });
}

export function stopRun(id: string) {
  active.get(id)?.stop();
  return { ok: true };
}

export async function startResearch(body: { kind?: unknown; prompt?: unknown }): Promise<ResearchRun> {
  const kind = body.kind as ResearchKind;
  if (!KINDS.includes(kind)) throw Object.assign(new Error('Bilinmeyen araştırma türü'), { statusCode: 400 });
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  if ((kind === 'topic' || kind === 'free') && !prompt)
    throw Object.assign(new Error(kind === 'topic' ? 'Önce bir konu yaz.' : 'Önce ne araştırılacağını yaz.'), { statusCode: 400 });
  if (active.size > 0) throw Object.assign(new Error('Bir araştırma zaten çalışıyor. Bitmesini bekle ya da durdur.'), { statusCode: 409 });

  const id = 'r_' + Date.now().toString(36);
  const run: ResearchRun = { id, kind, prompt, createdAt: Date.now(), status: 'running', steps: ['Claude başlatılıyor…'], summary: '', hooks: [], error: null };
  const niche = await locked(async () => {
    const s = await readRaw();
    s.runs.unshift(run);
    await writeRaw(s);
    return s.niche;
  });
  emit({ type: 'research', slug: HUB, run });

  const cwd = path.join(ROOT, '.research', id);
  await fs.mkdir(cwd, { recursive: true });
  // Skill, çalışma klasörünün proje skill'i olarak yüklenir (`.claude/skills/<ad>/SKILL.md`).
  await fs.cp(path.join(SERVER_DIR, 'skills', RESEARCH_SKILL), path.join(cwd, '.claude', 'skills', RESEARCH_SKILL), { recursive: true });
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const c = runClaude({
    cwd,
    prompt: researchPrompt(kind, niche, prompt, today),
    tools: ['Skill', 'WebSearch', 'WebFetch'],
    onTool: (name, input) => void updateRun(id, (r) => ({ ...r, steps: [...r.steps, stepFor(name, input)] })),
  });
  active.set(id, c);
  void c.done.then(async (res) => {
    if (res.stopped) {
      active.delete(id);
      await updateRun(id, (r) => ({ ...r, status: 'stopped', steps: [...r.steps, 'Durduruldu.'] }));
      return;
    }
    if (res.error || !res.text.trim()) {
      active.delete(id);
      await updateRun(id, (r) => ({ ...r, status: 'error', error: 'Claude araştırmayı tamamlayamadı: ' + (res.error || 'boş cevap') }));
      return;
    }
    const { summary, hooks, found } = extractHooks(res.text);
    active.delete(id);
    await updateRun(id, (r) => ({
      ...r,
      status: 'done',
      summary,
      hooks,
      steps: [...r.steps, found ? `${hooks.length} hook bulundu.` : "Hook listesi ayrıştırılamadı, özet aşağıda."],
    }));
  });
  return run;
}
