import type { Clip, Project } from '@cb/schema';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Sunucu hatası (${r.status})`), { status: r.status });
  return data as T;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  kind: 'reel' | 'carousel';
  updatedAt: number;
}

export interface Idea {
  id: string;
  text: string;
  url: string | null;
  createdAt: number;
  project: string | null;
  /** Link analizi; yalnızca sunucu yazar. */
  analysis?: Analysis;
}

export interface Analysis {
  status: 'running' | 'done' | 'error';
  step: string;
  startedAt: number;
  finishedAt: number | null;
  meta: { title: string; uploader: string; platform: string; description: string; duration: number | null; viewCount: number | null; likeCount: number | null } | null;
  frames: string[];
  hasSubtitles: boolean;
  note: string;
  error: string | null;
}

export type ResearchKind = 'trends' | 'topic' | 'formats' | 'free';
export interface Hook {
  text: string;
  why: string;
  source?: string;
}
export interface ResearchRun {
  id: string;
  kind: ResearchKind;
  prompt: string;
  createdAt: number;
  status: 'running' | 'done' | 'error' | 'stopped';
  steps: string[];
  summary: string;
  hooks: Hook[];
  error: string | null;
}

export type HubEvent = { type: 'analysis'; slug: string; id: string; analysis: Analysis } | { type: 'research'; slug: string; run: ResearchRun };

export interface Job {
  id: string;
  kind: 'proxy' | 'sheet' | 'export';
  target?: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message: string;
  result?: any;
}

export type ClaudeEvent =
  | { kind: 'start'; turn: string; snapshot: string }
  | { kind: 'text'; turn: string; text: string }
  | { kind: 'tool'; turn: string; name: string; summary: string }
  | { kind: 'end'; turn: string; ok: boolean; error?: string; changed: boolean; cost?: number };

export type ChatEntry = { role: 'user'; turn: string; text: string; context?: string } | ClaudeEvent;

export type ServerEvent =
  | { type: 'project-changed'; slug: string; source: 'claude' | 'external'; project: Project; scenes: string }
  | { type: 'project-invalid'; slug: string; error: string }
  | { type: 'job'; slug: string; job: Job }
  | { type: 'claude'; slug: string; event: ClaudeEvent };

const P = (slug: string) => `/api/projects/${slug}`;

export const api = {
  list: () => req<{ root: string; projects: ProjectSummary[] }>('GET', '/api/projects'),
  create: (title: string, kind: 'reel' | 'carousel', style?: 'picks' | 'pixel') => req<{ slug: string }>('POST', '/api/projects', { title, kind, style }),
  series: () => req<{ series: { slug: string; series: string; category: string; number: number }[] }>('GET', '/api/series'),
  ideas: () => req<{ ideas: Idea[] }>('GET', '/api/ideas'),
  saveIdeas: (ideas: Idea[]) => req<{ ideas: Idea[] }>('PUT', '/api/ideas', { ideas }),
  analyze: (id: string) => req<{ analysis: Analysis }>('POST', `/api/ideas/${encodeURIComponent(id)}/analyze`),
  frameUrl: (id: string, file: string) => `/api/inspiration/${encodeURIComponent(id)}/${file}`,
  research: () => req<{ niche: string; defaultNiche: string; runs: ResearchRun[]; running: boolean }>('GET', '/api/research'),
  saveNiche: (niche: string) => req<{ niche: string }>('PUT', '/api/research/niche', { niche }),
  startResearch: (kind: ResearchKind, prompt?: string) => req<{ run: ResearchRun }>('POST', '/api/research', { kind, prompt }),
  stopResearch: (id: string) => req('POST', `/api/research/${id}/stop`),
  deleteResearch: (id: string) => req('DELETE', `/api/research/${id}`),
  get: (slug: string) => req<{ slug: string; project: Project; scenes: string; claudeRunning: boolean }>('GET', P(slug)),
  save: (slug: string, project: Project, scenes: string) => req<{ ok: true }>('PUT', P(slug), { project, scenes }),
  restore: (slug: string, id: string) => req<{ project: Project; scenes: string }>('POST', `${P(slug)}/history/${id}/restore`),
  pick: (kind: 'video' | 'image' | 'audio') => req<{ paths: string[] }>('POST', '/api/pick', { kind }),
  addClips: (slug: string, paths: string[]) => req<{ clips: Clip[] }>('POST', `${P(slug)}/clips`, { paths }),
  proxy: (slug: string, clip: string) => req<{ status: 'ready' | 'running' | 'missing' }>('POST', `${P(slug)}/clips/${clip}/proxy`),
  sheet: (slug: string, clip: string) => req<{ frames: { t: number; file: string }[] }>('GET', `${P(slug)}/clips/${clip}/sheet`),
  wave: (slug: string, clip: string) => req<{ peaks: number[]; rate: number }>('GET', `${P(slug)}/clips/${clip}/wave`),
  addImages: (slug: string, paths: string[]) => req<{ srcs: string[] }>('POST', `${P(slug)}/images`, { paths }),
  builtinSfx: () => req<{ sfx: { name: string; file: string }[] }>('GET', '/api/sfx'),
  builtinSfxUrl: (file: string) => `/api/sfx/${file}`,
  addSfx: (slug: string, body: { paths?: string[]; builtin?: string }) => req<{ srcs: string[] }>('POST', `${P(slug)}/sfx`, body),
  addVideos: (slug: string, paths: string[]) =>
    req<{ videos: { id: string; path: string; name: string; probe: Clip['probe'] }[] }>('POST', `${P(slug)}/videos`, { paths }),
  videoProxy: (slug: string, path: string) => req<{ id: string; status: 'ready' | 'running' | 'missing'; duration: number }>('POST', `${P(slug)}/videos/proxy`, { path }),
  exportCarousel: (slug: string, fmt: 'png' | 'jpg') => req<{ job: Job }>('POST', `${P(slug)}/export-carousel`, { fmt }),
  exportReel: (slug: string) => req<{ job: Job }>('POST', `${P(slug)}/export`),
  saveSlide: (slug: string, name: string, data: string) => req<{ path: string }>('POST', `${P(slug)}/exports/${name}`, { data }),
  reveal: (path: string) => req('POST', '/api/reveal', { path }),
  claudeHistory: (slug: string) => req<{ history: ChatEntry[]; running: boolean }>('GET', `${P(slug)}/claude`),
  ask: (slug: string, message: string, context?: string) => req<{ turn: string }>('POST', `${P(slug)}/claude`, { message, context }),
  stopClaude: (slug: string) => req('POST', `${P(slug)}/claude/stop`),
  resetClaude: (slug: string) => req('POST', `${P(slug)}/claude/reset`),
  proxyUrl: (slug: string, clip: string) => `${P(slug)}/clips/${clip}/proxy.mp4`,
  sheetUrl: (slug: string, clip: string, file: string) => `${P(slug)}/clips/${clip}/sheet/${file}`,
  mediaUrl: (slug: string, src: string) => `${P(slug)}/media/${src.replace(/^media\//, '')}`,
  exportUrl: (slug: string, file: string) => `${P(slug)}/exports/${file}`,
};

export function events(slug: string, on: (e: ServerEvent) => void): () => void {
  const es = new EventSource(`${P(slug)}/events`);
  es.onmessage = (m) => on(JSON.parse(m.data));
  return () => es.close();
}

/** Ana sayfa olayları (analiz ve araştırma ilerlemesi). */
export function hubEvents(on: (e: HubEvent) => void): () => void {
  const es = new EventSource('/api/events');
  es.onmessage = (m) => on(JSON.parse(m.data));
  return () => es.close();
}
