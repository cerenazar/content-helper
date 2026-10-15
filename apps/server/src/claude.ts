import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { files } from './paths';
import { emit, type ClaudeEvent } from './events';
import { snapshot, quiet, onExternalChange, restoreSnapshot, writeClaudeMd } from './projects';

/**
 * Yan panel: proje klasöründe Claude Code'u (`claude -p`) çalıştırır.
 * Mevcut Claude girişi kullanılır. Claude dosyaları düzenler, editör değişikliği izleyip yeniler.
 */
const ALLOWED = ['Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'Bash(ffprobe:*)', 'Bash(ffmpeg:*)', 'Bash(ls:*)', 'WebSearch', 'WebFetch', 'Skill'];

const running = new Map<string, ChildProcess>();

interface Session {
  sessionId: string | null;
}

const sessionFile = (slug: string) => path.join(files(slug).editor, 'claude.json');
const chatFile = (slug: string) => path.join(files(slug).editor, 'chat.jsonl');

async function readSession(slug: string): Promise<Session> {
  try {
    return JSON.parse(await fs.readFile(sessionFile(slug), 'utf8'));
  } catch {
    return { sessionId: null };
  }
}

async function writeSession(slug: string, s: Session) {
  await fs.mkdir(files(slug).editor, { recursive: true });
  await fs.writeFile(sessionFile(slug), JSON.stringify(s));
}

export type ChatEntry = { role: 'user'; turn: string; text: string; context?: string } | ClaudeEvent;

async function log(slug: string, e: ChatEntry) {
  await fs.mkdir(files(slug).editor, { recursive: true });
  await fs.appendFile(chatFile(slug), JSON.stringify(e) + '\n');
}

export async function chatHistory(slug: string): Promise<ChatEntry[]> {
  try {
    return (await fs.readFile(chatFile(slug), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function resetChat(slug: string) {
  await writeSession(slug, { sessionId: null });
  await fs.rm(chatFile(slug), { force: true });
}

export function isRunning(slug: string) {
  return running.has(slug);
}

export function stopClaude(slug: string) {
  running.get(slug)?.kill('SIGINT');
}

function toolSummary(name: string, input: any): string {
  const p = input?.file_path || input?.path || input?.pattern || input?.command || input?.url || input?.query || '';
  return String(p).replace(/^.*\/(?=[^/]+$)/, '').slice(0, 120);
}

export async function askClaude(slug: string, message: string, context?: string) {
  if (running.has(slug)) throw Object.assign(new Error('Claude hâlâ çalışıyor'), { statusCode: 409 });
  const f = files(slug);
  await writeClaudeMd(slug);
  const turn = 't_' + Date.now().toString(36);
  const snap = await snapshot(slug, 'claude-oncesi');
  const send = (event: ClaudeEvent) => {
    emit({ type: 'claude', slug, event });
    void log(slug, event);
  };
  await log(slug, { role: 'user', turn, text: message, context });
  send({ kind: 'start', turn, snapshot: snap });

  const session = await readSession(slug);
  const prompt = context ? `${message}\n\n<editör-bağlamı>\n${context}\n</editör-bağlamı>` : message;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED.join(' ')];
  if (session.sessionId) args.push('--resume', session.sessionId);

  quiet.add(slug);
  const child = spawn('claude', args, { cwd: f.dir, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cerenbuilds-editor' } });
  running.set(slug, child);
  child.stdin.end(prompt);

  let buf = '';
  let stderr = '';
  let resultError: string | undefined;
  let cost: number | undefined;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.session_id && m.session_id !== session.sessionId) {
        session.sessionId = m.session_id;
        void writeSession(slug, session);
      }
      if (m.type === 'assistant') {
        for (const b of m.message?.content ?? []) {
          if (b.type === 'text' && b.text?.trim()) send({ kind: 'text', turn, text: b.text });
          if (b.type === 'tool_use') send({ kind: 'tool', turn, name: b.name, summary: toolSummary(b.name, b.input) });
        }
      }
      if (m.type === 'result') {
        cost = m.total_cost_usd;
        if (m.is_error || m.subtype !== 'success') resultError = m.result || m.subtype;
      }
    }
  });
  child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));

  child.on('close', async (code) => {
    running.delete(slug);
    quiet.delete(slug);
    const state = await onExternalChange(slug, 'claude');
    let error = resultError ?? (code !== 0 ? stderr.trim().split('\n').slice(-3).join(' ') || `claude çıkış kodu ${code}` : undefined);
    if (state === 'invalid') {
      // Claude geçersiz proje bıraktı: tur öncesine dön.
      const restored = await restoreSnapshot(slug, snap);
      emit({ type: 'project-changed', slug, source: 'claude', project: restored.project, scenes: restored.scenes });
      error = 'Claude geçersiz bir proje dosyası bıraktı, değişiklik geri alındı. ' + (error ?? '');
    }
    send({ kind: 'end', turn, ok: !error, error, changed: state === 'changed', cost });
  });
  child.on('error', (e) => {
    running.delete(slug);
    quiet.delete(slug);
    send({ kind: 'end', turn, ok: false, error: 'claude başlatılamadı: ' + e.message, changed: false });
  });
  return { turn, snapshot: snap };
}
