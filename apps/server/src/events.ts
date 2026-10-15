import type { FastifyReply } from 'fastify';

/** Sunucudan tarayıcıya olaylar (SSE). Kanal = proje slug'ı ya da '*'. */
export type ServerEvent =
  | { type: 'project-changed'; slug: string; source: 'claude' | 'external'; project: unknown; scenes: string }
  | { type: 'project-invalid'; slug: string; error: string }
  | { type: 'job'; slug: string; job: Job }
  | { type: 'claude'; slug: string; event: ClaudeEvent };

export interface Job {
  id: string;
  kind: 'proxy' | 'sheet' | 'export';
  target?: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message: string;
  result?: unknown;
}

export type ClaudeEvent =
  | { kind: 'start'; turn: string; snapshot: string }
  | { kind: 'text'; turn: string; text: string }
  | { kind: 'tool'; turn: string; name: string; summary: string }
  | { kind: 'end'; turn: string; ok: boolean; error?: string; changed: boolean; cost?: number };

const clients = new Set<{ slug: string; reply: FastifyReply }>();

export function subscribe(slug: string, reply: FastifyReply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  reply.raw.write(': bağlandı\n\n');
  const c = { slug, reply };
  clients.add(c);
  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);
  reply.raw.on('close', () => {
    clearInterval(ping);
    clients.delete(c);
  });
}

export function emit(ev: ServerEvent) {
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) if (c.slug === ev.slug || c.slug === '*') c.reply.raw.write(data);
}

const jobs = new Map<string, Job>();

export function startJob(slug: string, kind: Job['kind'], target?: string): Job & { update(p: Partial<Job>): void } {
  const job: Job = { id: kind + '_' + Date.now().toString(36), kind, target, status: 'running', progress: 0, message: '' };
  jobs.set(job.id, job);
  emit({ type: 'job', slug, job });
  return Object.assign(job, {
    update(p: Partial<Job>) {
      Object.assign(job, p);
      emit({ type: 'job', slug, job: { ...job, update: undefined } as Job });
    },
  });
}
