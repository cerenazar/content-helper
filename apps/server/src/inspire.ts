import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, probe } from './ffmpeg';
import { emit, HUB } from './events';
import { readIdeas, updateIdea, analysing, inspirationDir } from './ideas';
import { readNiche } from './research';
import { runClaude } from './claude-run';
import { analysisPrompt, contextFile, extractNote, frameTimes, metaFromInfo, pickSubtitle, vttToText, ytdlpError, type Analysis } from './analysis';

/**
 * Link analizi: yt-dlp ile bilgi + altyazı + video (en fazla 720p), ffmpeg ile eşit aralıklı kareler,
 * sonra yalnızca Read aracıyla `claude -p` kareleri ve metni okuyup ilham notunu yazar.
 */

class StepError extends Error {}

function ytdlp(args: string[], onLine?: (l: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', ['--no-playlist', '--no-warnings', '--newline', ...args]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (onLine) for (const l of String(d).split('\n')) if (l.trim()) onLine(l);
    });
    p.stderr.on('data', (d) => (err = (err + d).slice(-8000)));
    p.on('error', (e) => reject(Object.assign(new Error(String(e.message)), { stderr: 'ENOENT ' + e.message })));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(Object.assign(new Error(err), { stderr: err }))));
  });
}

export async function analyzeIdea(id: string): Promise<Analysis> {
  const idea = (await readIdeas()).find((i) => i.id === id);
  if (!idea) throw Object.assign(new Error('Fikir bulunamadı'), { statusCode: 404 });
  if (!idea.url) throw Object.assign(new Error('Bu fikirde link yok'), { statusCode: 400 });
  if (analysing.has(id)) throw Object.assign(new Error('Bu link zaten analiz ediliyor'), { statusCode: 409 });

  analysing.add(id);
  const a: Analysis = { status: 'running', step: 'Bilgiler alınıyor…', startedAt: Date.now(), finishedAt: null, meta: null, frames: [], hasSubtitles: false, note: '', error: null };
  const set = async (patch: Partial<Analysis>) => {
    Object.assign(a, patch);
    const saved = await updateIdea(id, (i) => ({ ...i, analysis: { ...a } }));
    if (saved?.analysis) emit({ type: 'analysis', slug: HUB, id, analysis: saved.analysis });
    return saved;
  };
  /** İndirme yüzdesi: diske yazmadan yalnızca ekrana. */
  const ping = (step: string) => {
    a.step = step;
    emit({ type: 'analysis', slug: HUB, id, analysis: { ...a } });
  };
  await set({});
  void work(idea.url, id, a, set, ping).finally(() => analysing.delete(id));
  return a;
}

async function work(url: string, id: string, a: Analysis, set: (p: Partial<Analysis>) => Promise<unknown>, ping: (s: string) => void) {
  const dir = inspirationDir(id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });

    // 1. Bilgi
    let info: any;
    try {
      info = JSON.parse(await ytdlp(['-J', url]));
    } catch (e: any) {
      throw new StepError(ytdlpError(e.stderr ?? e.message, url));
    }
    if (info?._type === 'playlist') throw new StepError('Bu link bir oynatma listesi ya da profil. Tek bir videonun linkini yapıştır.');
    const infoFile = path.join(dir, 'info.json');
    await fs.writeFile(infoFile, JSON.stringify(info));
    const meta = metaFromInfo(info);
    await set({ meta, step: 'Altyazı aranıyor…' });

    // 2. Altyazı (yoksa ya da indirilemezse devam)
    let transcript = '';
    const sub = pickSubtitle(info);
    if (sub) {
      try {
        await ytdlp(['--load-info-json', infoFile, '--skip-download', sub.auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', sub.lang, '--sub-format', 'vtt/best', '--convert-subs', 'vtt', '-o', path.join(dir, 'sub.%(ext)s')]);
        const vtt = (await fs.readdir(dir)).find((f) => f.endsWith('.vtt'));
        if (vtt) transcript = vttToText(await fs.readFile(path.join(dir, vtt), 'utf8'));
      } catch {
        // Altyazı opsiyonel (YouTube sık sık 429 verir).
      }
    }
    await set({ hasSubtitles: !!transcript, step: 'Video indiriliyor…' });

    // 3. Video (kısa kenar en fazla 720p)
    try {
      await ytdlp(
        ['--load-info-json', infoFile, '-f', 'bv*+ba/b', '-S', 'res:720,ext:mp4:m4a', '--merge-output-format', 'mp4', '-o', path.join(dir, 'video.%(ext)s')],
        (l) => {
          const m = /\[download\]\s+([\d.]+)%/.exec(l);
          if (m) ping(`Video indiriliyor… %${Math.round(Number(m[1]))}`);
        },
      );
    } catch (e: any) {
      throw new StepError(ytdlpError(e.stderr ?? e.message, url));
    }
    const video = (await fs.readdir(dir)).find((f) => /^video\.(mp4|webm|mkv|mov)$/.test(f));
    if (!video) throw new StepError('Video indirildi ama dosya bulunamadı. Tekrar dene.');

    // 4. Kareler
    await set({ step: 'Kareler çıkarılıyor…' });
    const vpath = path.join(dir, video);
    const duration = (await probe(vpath)).duration || meta.duration || 0;
    const times = frameTimes(duration);
    if (!times.length) throw new StepError('Videonun süresi okunamadı, kare çıkarılamadı.');
    const frames: { file: string; t: number }[] = [];
    for (let k = 0; k < times.length; k++) {
      const file = `frame-${String(k + 1).padStart(2, '0')}.jpg`;
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(times[k]), '-i', vpath, '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '4', path.join(dir, file)]);
      frames.push({ file, t: times[k] });
    }
    await fs.writeFile(path.join(dir, 'context.md'), contextFile(url, meta, frames, transcript));
    // Büyük video Claude'un klasöründe durmasın; kareler yeter.
    await fs.rm(vpath, { force: true });
    await set({ frames: frames.map((f) => f.file), step: 'Claude kareleri inceliyor…' });

    // 5. Claude notu
    const niche = await readNiche();
    let seen = 0;
    const c = runClaude({
      cwd: dir,
      prompt: analysisPrompt(niche, !!transcript, frames.length),
      tools: ['Read'],
      onTool: (name, input) => {
        if (name !== 'Read') return;
        const f = path.basename(String(input?.file_path ?? ''));
        if (/^frame-/.test(f)) seen++;
        ping(/^frame-/.test(f) ? `Claude kareleri inceliyor (${seen}/${frames.length})…` : 'Claude video bilgisini okuyor…');
      },
    });
    const res = await c.done;
    if (res.error || !res.text.trim()) throw new StepError('Claude notu yazamadı: ' + (res.error || 'boş cevap'));
    await set({ status: 'done', step: '', note: extractNote(res.text), finishedAt: Date.now() });
  } catch (e: any) {
    const msg = e instanceof StepError ? e.message : 'Analiz başarısız: ' + String(e?.message ?? e).slice(0, 300);
    await set({ status: 'error', step: '', error: msg, finishedAt: Date.now() });
  }
}
