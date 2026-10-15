import { useEffect, useRef, useState } from 'react';
import { timeline } from '@cb/renderer';
import { useStore, type Selection } from './store';
import type { ClaudeState } from './useClaude';
import type { Project } from '@cb/schema';
import type { ChatEntry } from './api';
import { AgentAvatar } from './icons';

/** Seçili öğeyi ve oynatma kafasını Claude'a okunur bağlam olarak verir. */
function describe(p: Project, sel: Selection, time: number): { short: string; full: string } {
  const lines: string[] = [];
  let short = '';
  if (p.kind === 'reel') {
    const tl = timeline(p.captions);
    const at = tl.captions.find((c) => time >= c.start && time < c.end);
    lines.push(`oynatma kafası: ${time.toFixed(2)} sn${at ? ` (caption "${at.text}", sahne ${at.scene})` : ''}`);
    if (sel?.kind === 'caption') {
      const i = p.captions.findIndex((c) => c.id === sel.id);
      const c = p.captions[i];
      if (c) {
        short = `caption ${i + 1}: "${c.text}"`;
        lines.unshift(`seçili caption #${i + 1} id=${c.id}: "${c.text}" vurgu=${c.emph ?? 'yok'} sahne=${c.scene}`);
      }
    } else if (sel?.kind === 'cut') {
      const i = p.edl.findIndex((c) => c.id === sel.id);
      const c = p.edl[i];
      if (c) {
        short = `kesit ${i + 1}`;
        lines.unshift(`seçili kesit #${i + 1} id=${c.id}: klip=${p.clips.find((k) => k.id === c.clip)?.name} giriş=${c.in} süre=${c.dur} tür=${c.kind}`);
      }
    } else if (sel?.kind === 'scene') {
      const i = p.scenes.findIndex((s) => s.id === sel.id);
      if (i >= 0) {
        short = `sahne ${i + 1}: ${p.scenes[i].name}`;
        lines.unshift(`seçili sahne #${i + 1} id=${sel.id} (scenes.js içinde scene${i + 1}) ad="${p.scenes[i].name}"`);
      }
    } else if (sel?.kind === 'clip') {
      const c = p.clips.find((k) => k.id === sel.id);
      if (c) {
        short = `klip: ${c.name}`;
        lines.unshift(`seçili klip id=${c.id} yol=${c.path} süre=${c.probe.duration.toFixed(1)} sn ${c.probe.width}x${c.probe.height}`);
      }
    }
  } else {
    if (sel?.kind === 'slide' || sel?.kind === 'element') {
      const sid = sel.kind === 'slide' ? sel.id : sel.slide;
      const i = p.slides.findIndex((s) => s.id === sid);
      short = `slayt ${i + 1}`;
      lines.push(`seçili slayt #${i + 1} id=${sid}`);
      if (sel.kind === 'element') {
        const el = p.slides[i]?.elements.find((e) => e.id === sel.id);
        if (el) {
          short += ` · ${el.type}`;
          lines.push(`seçili öğe id=${el.id} tür=${el.type} metin="${el.text}"`);
        }
      }
    }
  }
  return { short, full: lines.join('\n') };
}

const SUGGEST = {
  reel: ['Hook için 3 seçenek öner, birini seç', "Caption'ları skill kurallarına göre gözden geçir", 'Toplam süreyi 40 sn civarına getir', 'Bu videodan reel planı çıkar'],
  carousel: ['Bu konuyla 6 slaytlık carousel taslağı yaz', 'İlk slaydın başlığını daha merak uyandırıcı yap', "Metinleri kısalt, slayt başına en fazla 20 kelime"],
};

export function ClaudePanel({ claude }: { slug: string; claude: ClaudeState }) {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const time = useStore((s) => s.time);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const ctx = describe(project, sel, time);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [claude.log.length, claude.running]);

  const submit = () => {
    const m = text.trim();
    if (!m || claude.running) return;
    setText('');
    void claude.send(m, ctx.full);
  };

  const groups = groupTurns(claude.log);

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef} aria-live="polite">
        {groups.length === 0 && (
          <div className="chat-empty">
            <p style={{ margin: 0 }}>Claude bu projeyi seninle aynı anda düzenler. Bir şey seçip "bunu kısalt" diyebilirsin. Her değişiklik geri alınabilir.</p>
            <div className="sugs">
              {SUGGEST[project.kind].map((s) => (
                <button key={s} onClick={() => setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={gi} style={{ display: 'grid', gap: 8 }}>
            {g.map((e, i) => {
              if ('role' in e)
                return (
                  <div key={i} className="msg-user">
                    {e.text}
                    {e.context && <span className="ctx">{e.context.split('\n')[0]}</span>}
                  </div>
                );
              if (e.kind === 'text')
                return (
                  <div key={i} className="msg-claude">
                    <AgentAvatar />
                    <div className="body">{e.text}</div>
                  </div>
                );
              if (e.kind === 'tool')
                return (
                  <div key={i} className="msg-tool">
                    {toolLabel(e.name)} {e.summary}
                  </div>
                );
              if (e.kind === 'end') {
                const start = g.find((x) => !('role' in x) && x.kind === 'start') as { snapshot: string } | undefined;
                return (
                  <div key={i} className="msg-end">
                    {e.error && <span className="err">{e.error}</span>}
                    {e.changed && <span className="ok">Proje güncellendi</span>}
                    {e.changed && start && (
                      <button className="btn small" onClick={() => void claude.revert(start.snapshot)}>
                        Bu değişikliği geri al
                      </button>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {claude.running && <div className="thinking">Claude çalışıyor</div>}
        {claude.error && <p className="err">{claude.error}</p>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="ctx-line">
          {ctx.short ? (
            <>
              Bağlam: <b>{ctx.short}</b>
            </>
          ) : (
            'Bağlam: tüm proje'
          )}
        </div>
        <textarea
          className="textarea"
          rows={3}
          placeholder="Claude'a yaz… (⌘↩ gönderir)"
          aria-label="Claude'a mesaj"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="row">
          <button type="button" className="btn ghost small" onClick={() => void claude.reset()} disabled={claude.running}>
            Yeni sohbet
          </button>
          <span className="grow" />
          {claude.running ? (
            <button type="button" className="btn" onClick={claude.stop}>
              Durdur
            </button>
          ) : (
            <button type="submit" className="btn claude" disabled={!text.trim()}>
              Gönder
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function toolLabel(name: string) {
  return ({ Read: 'okudu', Edit: 'düzenledi', Write: 'yazdı', MultiEdit: 'düzenledi', Grep: 'aradı', Glob: 'listeledi', Bash: 'çalıştırdı', WebSearch: 'web araması', WebFetch: 'sayfa okudu', Skill: 'skill' } as Record<string, string>)[name] ?? name;
}

function groupTurns(log: ChatEntry[]): ChatEntry[][] {
  const out: ChatEntry[][] = [];
  for (const e of log) {
    if ('role' in e || !out.length) out.push([e]);
    else out[out.length - 1].push(e);
  }
  return out;
}
