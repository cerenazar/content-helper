import { Fragment, useMemo } from 'react';
import { parseMarkdown, type Inline } from './md';

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, k) => {
        if (n.t === 'text') return <Fragment key={k}>{n.v}</Fragment>;
        if (n.t === 'code') return <code key={k}>{n.v}</code>;
        if (n.t === 'b') return <strong key={k}><Inl nodes={n.c} /></strong>;
        if (n.t === 'i') return <em key={k}><Inl nodes={n.c} /></em>;
        return (
          <a key={k} href={n.href} target="_blank" rel="noreferrer noopener">
            <Inl nodes={n.c} />
          </a>
        );
      })}
    </>
  );
}

/** Güvenli markdown: metin React düğümü olarak çizilir. `shift` başlık seviyesini sayfa düzenine göre kaydırır (## → h3). */
export function Markdown({ text, shift = 1, className = 'md' }: { text: string; shift?: number; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={className}>
      {blocks.map((b, k) => {
        switch (b.t) {
          case 'h': {
            const H = `h${Math.min(6, b.level + shift)}` as 'h3';
            return <H key={k}><Inl nodes={b.c} /></H>;
          }
          case 'p':
            return <p key={k}><Inl nodes={b.c} /></p>;
          case 'quote':
            return <blockquote key={k}><Inl nodes={b.c} /></blockquote>;
          case 'pre':
            return <pre key={k}>{b.v}</pre>;
          case 'ul':
          case 'ol': {
            const L = b.t;
            return (
              <L key={k}>
                {b.items.map((it, j) => (
                  <li key={j}><Inl nodes={it} /></li>
                ))}
              </L>
            );
          }
        }
      })}
    </div>
  );
}
