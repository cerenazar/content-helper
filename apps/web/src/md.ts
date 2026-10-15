/**
 * Claude'un yazdığı notlar için küçük markdown ayrıştırıcı. HTML üretmez: blok/satır içi düğümler döner,
 * React bunları eleman olarak çizer (dangerouslySetInnerHTML yok). Linklerde yalnızca http(s) kabul edilir.
 */
export type Inline = { t: 'text'; v: string } | { t: 'b'; c: Inline[] } | { t: 'i'; c: Inline[] } | { t: 'code'; v: string } | { t: 'a'; href: string; c: Inline[] };

export type Block =
  | { t: 'h'; level: 2 | 3 | 4; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'pre'; v: string };

const safeHref = (h: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(h) ? h : null);

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`]+)`/.exec(rest))) {
      flush();
      out.push({ t: 'code', v: m[1] });
    } else if ((m = /^\*\*(.+?)\*\*/.exec(rest)) || (m = /^__(.+?)__/.exec(rest))) {
      flush();
      out.push({ t: 'b', c: parseInline(m[1]) });
    } else if ((m = /^\*(?!\s)(.+?)\*/.exec(rest)) || (m = /^_(?!\s)(.+?)_(?![\p{L}\d])/u.exec(rest))) {
      flush();
      out.push({ t: 'i', c: parseInline(m[1]) });
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      const href = safeHref(m[2]);
      if (href) out.push({ t: 'a', href, c: parseInline(m[1]) });
      else out.push(...parseInline(m[1]));
    } else if ((m = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(rest)) && !/[\p{L}\d]$/u.test(buf)) {
      flush();
      out.push({ t: 'a', href: m[0], c: [{ t: 'text', v: m[0] }] });
    } else {
      buf += s[i];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;
  const endPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) });
    list = null;
  };
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      endPara();
      endList();
      const code: string[] = [];
      for (k++; k < lines.length && !/^```/.test(lines[k].trim()); k++) code.push(lines[k]);
      blocks.push({ t: 'pre', v: code.join('\n') });
      continue;
    }
    if (!trimmed) {
      endPara();
      endList();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed))) {
      endPara();
      endList();
      const level = Math.min(4, Math.max(2, m[1].length)) as 2 | 3 | 4;
      blocks.push({ t: 'h', level, c: parseInline(m[2]) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      endPara();
      endList();
      continue;
    }
    if ((m = /^>\s?(.*)$/.exec(trimmed))) {
      endPara();
      endList();
      blocks.push({ t: 'quote', c: parseInline(m[1]) });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      endPara();
      const t = ul ? 'ul' : 'ol';
      if (!list || list.t !== t) {
        endList();
        list = { t, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    // Liste maddesinin girintili devamı
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ' ' + trimmed;
      continue;
    }
    endList();
    para.push(trimmed);
  }
  endPara();
  endList();
  return blocks;
}
