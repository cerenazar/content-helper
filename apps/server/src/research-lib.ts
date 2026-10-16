/** Araştırma asistanının saf parçaları: istem, hook JSON'unu ayıklama, kayıt doğrulama. */

export type ResearchKind = 'trends' | 'topic' | 'formats' | 'free';

export interface Hook {
  text: string;
  why: string;
  source?: string;
}

export interface ResearchRun {
  id: string;
  kind: ResearchKind;
  /** Serbest istem ya da "Bu konuya 10 hook yaz" konusu. */
  prompt: string;
  createdAt: number;
  status: 'running' | 'done' | 'error' | 'stopped';
  /** Çalışırken son adımlar ("Web'de aranıyor: …"). */
  steps: string[];
  summary: string;
  hooks: Hook[];
  error: string | null;
}

export const KINDS: ResearchKind[] = ['trends', 'topic', 'formats', 'free'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const httpUrl = (v: unknown) => (typeof v === 'string' && /^https?:\/\/\S+$/.test(v.trim()) ? v.trim().slice(0, 600) : undefined);

export function cleanHook(x: any): Hook | null {
  if (typeof x === 'string') x = { text: x };
  if (!x || typeof x !== 'object') return null;
  const text = str(x.text ?? x.hook, 300);
  if (!text) return null;
  const h: Hook = { text, why: str(x.why ?? x.reason ?? x.neden, 600) };
  const source = httpUrl(x.source ?? x.url ?? x.kaynak);
  if (source) h.source = source;
  return h;
}

export function cleanRun(x: any): ResearchRun | null {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[\w-]{1,64}$/.test(x.id)) return null;
  if (!KINDS.includes(x.kind)) return null;
  const status = ['running', 'done', 'error', 'stopped'].includes(x.status) ? x.status : 'error';
  return {
    id: x.id,
    kind: x.kind,
    prompt: str(x.prompt, 2000),
    createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
    status,
    steps: Array.isArray(x.steps) ? x.steps.filter((s: unknown) => typeof s === 'string').map((s: string) => s.slice(0, 200)).slice(-30) : [],
    summary: str(x.summary, 30000),
    hooks: Array.isArray(x.hooks) ? x.hooks.map(cleanHook).filter((h: Hook | null): h is Hook => !!h).slice(0, 40) : [],
    error: status === 'error' ? str(x.error, 600) || 'Araştırma başarısız oldu.' : null,
  };
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Sık görülen küçük bozukluk: sondaki virgül.
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

/**
 * Claude'un cevabından hook listesini ve özeti ayırır. Hooklar son ```json bloğunda beklenir
 * (`{"hooks":[…]}` ya da doğrudan dizi). Blok özetten çıkarılır. Bulunamazsa hooks boş döner.
 */
export function extractHooks(text: string): { summary: string; hooks: Hook[]; found: boolean } {
  const lines = text.replace(/\r/g, '').split('\n');
  // Kod bloklarını satır satır bul: açılış ```dil, kapanış ```.
  const blocks: { lang: string; from: number; to: number }[] = [];
  for (let k = 0; k < lines.length; k++) {
    const open = /^\s*```\s*([\w-]*)\s*$/.exec(lines[k]);
    if (!open) continue;
    let end = k + 1;
    while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
    blocks.push({ lang: open[1].toLowerCase(), from: k, to: Math.min(end, lines.length - 1) });
    k = end;
  }
  for (let b = blocks.length - 1; b >= 0; b--) {
    const { lang, from, to } = blocks[b];
    if (lang && lang !== 'json') continue;
    const data = tryParse(lines.slice(from + 1, to).join('\n').trim()) as any;
    const list = Array.isArray(data) ? data : Array.isArray(data?.hooks) ? data.hooks : null;
    if (!list) continue;
    const hooks = list.map(cleanHook).filter((h: Hook | null): h is Hook => !!h).slice(0, 40);
    const summary = [...lines.slice(0, from), ...lines.slice(to + 1)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { summary, hooks, found: true };
  }
  return { summary: text.trim(), hooks: [], found: false };
}

export const KIND_LABEL: Record<ResearchKind, string> = {
  trends: "Bu hafta nişimde çalışan hook'lar",
  topic: "Bu konuya 10 hook yaz",
  formats: 'Benzer hesapların formatları',
  free: 'Serbest araştırma',
};

/** Taramayı yapan skill'in adı. Kaynağı `apps/server/skills/<ad>/SKILL.md`; her taramada çalışma klasörüne kopyalanır. */
export const RESEARCH_SKILL = 'cerenbuilds-arastirma';

/**
 * Tarama istemi: yöntem ve kurallar skill'dedir, burada yalnızca parametreler var.
 * Sondaki biçim satırı, skill bir sebeple yüklenemezse editörün ayrıştırabileceği bir çıktı için yedek.
 */
export function researchPrompt(kind: ResearchKind, niche: string, prompt: string, today: string): string {
  const label: Record<ResearchKind, string> = {
    trends: "trends (bu hafta nişimde çalışan hook'lar)",
    topic: 'topic (bu konuya 10 hook)',
    formats: 'formats (benzer hesapların formatları)',
    free: 'free (serbest istek)',
  };
  return [
    `Skill aracıyla \`${RESEARCH_SKILL}\` skill'ini çağır ve talimatlarına göre bu taramayı yap.`,
    '',
    `Tarama türü: ${label[kind]}`,
    `Bugünün tarihi: ${today}`,
    `Niş: ${niche}`,
    kind === 'topic' ? `Konu: "${prompt}"` : kind === 'free' ? `İstek: ${prompt}` : '',
    '',
    'Çıktı Türkçe olsun: markdown özet, en sonda tek bir ```json bloğu: {"hooks": [{"text": "...", "why": "...", "source": "https://..."}]}',
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n');
}

/** Araç çağrısından kısa bir Türkçe adım cümlesi. */
export function stepFor(name: string, input: any): string {
  if (name === 'WebSearch') return "Web'de aranıyor: " + String(input?.query ?? '').slice(0, 120);
  if (name === 'WebFetch') {
    let host = String(input?.url ?? '');
    try {
      host = new URL(host).hostname.replace(/^www\./, '');
    } catch {}
    return 'Sayfa okunuyor: ' + host.slice(0, 120);
  }
  if (name === 'Skill') return "Araştırma skill'i yükleniyor";
  return name;
}
