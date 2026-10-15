import { useEffect, useState } from 'react';
import { api, hubEvents, type Hook, type Idea, type ResearchKind, type ResearchRun } from './api';
import { Markdown } from './Markdown';
import { Plus, Search, Sparkle, Stop, Trash, Check } from './icons';
import { ago, host } from './util';

const KIND_LABEL: Record<ResearchKind, string> = {
  trends: "Bu hafta nişimde çalışan hook'lar",
  topic: "Bu konuya 10 hook yaz",
  formats: 'Benzer hesapların formatları',
  free: 'Serbest araştırma',
};

/** Fikre dönüşen hook'un metni; "eklendi" durumunu da bununla anlarız. */
const hookIdeaText = (h: Hook) => (h.why ? `${h.text}\n\nNeden: ${h.why}` : h.text);

/**
 * Araştır: nişe göre web taraması (yalnızca WebSearch/WebFetch açık bir `claude -p`).
 * Hook'lar fikirlere ya da doğrudan reel projesine dönüşür.
 */
export function Research({ busy, ideas, onAddIdea, onCreateReel }: { busy: boolean; ideas: Idea[] | null; onAddIdea: (text: string, url: string | null) => void; onCreateReel: (title: string) => void }) {
  const [runs, setRuns] = useState<ResearchRun[] | null>(null);
  const [niche, setNiche] = useState('');
  const [savedNiche, setSavedNiche] = useState('');
  const [defaultNiche, setDefaultNiche] = useState('');
  const [topic, setTopic] = useState('');
  const [free, setFree] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nicheMsg, setNicheMsg] = useState('');

  useEffect(() => {
    api
      .research()
      .then((r) => {
        setRuns(r.runs);
        setNiche(r.niche);
        setSavedNiche(r.niche);
        setDefaultNiche(r.defaultNiche);
      })
      .catch((e) => setError('Araştırmalar yüklenemedi: ' + e.message));
    return hubEvents((e) => {
      if (e.type !== 'research') return;
      setRuns((l) => {
        const list = l ?? [];
        return list.some((r) => r.id === e.run.id) ? list.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...list];
      });
    });
  }, []);

  const running = runs?.find((r) => r.status === 'running');
  const added = new Set((ideas ?? []).map((i) => i.text));

  async function start(kind: ResearchKind, prompt?: string) {
    setError(null);
    setStarting(true);
    try {
      const { run } = await api.startResearch(kind, prompt);
      setRuns((l) => (l?.some((r) => r.id === run.id) ? l : [run, ...(l ?? [])]));
      if (kind === 'free') setFree('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function saveNiche(text: string) {
    try {
      const r = await api.saveNiche(text);
      setNiche(r.niche);
      setSavedNiche(r.niche);
      setNicheMsg('Kaydedildi');
    } catch (e) {
      setNicheMsg('Kaydedilemedi: ' + (e as Error).message);
    }
  }

  async function remove(id: string) {
    const prev = runs;
    setRuns((l) => l && l.filter((r) => r.id !== id));
    try {
      await api.deleteResearch(id);
    } catch (e) {
      setRuns(prev);
      setError('Silinemedi: ' + (e as Error).message);
    }
  }

  const disabled = !!running || starting;

  return (
    <section className="hub-sec first rs" aria-labelledby="research-h">
      <header className="hub-sec-h">
        <h1 id="research-h">Araştır</h1>
      </header>
      <p className="hub-lede">Claude web'de nişine bakar, işe yarayan hook'ları ve formatları bulur. Beğendiğin hook'u fikirlere ekle ya da doğrudan reel'e çevir.</p>

      {error && (
        <p className="err hub-err" role="alert">
          {error}
        </p>
      )}

      <form
        className="rs-niche"
        onSubmit={(e) => {
          e.preventDefault();
          void saveNiche(niche);
        }}
      >
        <label className="field">
          <span>Nişin (her taramada Claude'a verilir)</span>
          <textarea
            className="textarea"
            rows={3}
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value);
              setNicheMsg('');
            }}
          />
        </label>
        <div className="row">
          <button className="btn" type="submit" disabled={niche.trim() === savedNiche.trim() || !niche.trim()}>
            Kaydet
          </button>
          {defaultNiche && niche !== defaultNiche && (
            <button className="btn ghost" type="button" onClick={() => void saveNiche(defaultNiche)}>
              Varsayılana dön
            </button>
          )}
          <span className="hint" role="status">
            {nicheMsg}
          </span>
        </div>
      </form>

      <div className="rs-scans">
        <div className="rs-card">
          <h2>{KIND_LABEL.trends}</h2>
          <p>Son 1–2 haftada nişinde öne çıkan hook kalıpları ve sana uygun 10 öneri.</p>
          <button className="btn" disabled={disabled} onClick={() => void start('trends')}>
            <Search size={14} /> Tara
          </button>
        </div>
        <form
          className="rs-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (topic.trim()) void start('topic', topic);
          }}
        >
          <h2>
            <label htmlFor="rs-topic">{KIND_LABEL.topic}</label>
          </h2>
          <input id="rs-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Konu, ör. Claude Code ile ilk agent" />
          <button className="btn" type="submit" disabled={disabled || !topic.trim()}>
            <Sparkle size={14} /> Hook yaz
          </button>
        </form>
        <div className="rs-card">
          <h2>{KIND_LABEL.formats}</h2>
          <p>Benzer hesapların tekrar eden seri ve kurgu formatları, örnek hesaplarla.</p>
          <button className="btn" disabled={disabled} onClick={() => void start('formats')}>
            <Search size={14} /> Tara
          </button>
        </div>
      </div>

      <form
        className="rs-free"
        onSubmit={(e) => {
          e.preventDefault();
          if (free.trim()) void start('free', free);
        }}
      >
        <label className="field grow">
          <span>Ya da kendin sor</span>
          <textarea
            className="textarea"
            rows={3}
            value={free}
            onChange={(e) => setFree(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (free.trim() && !disabled) void start('free', free);
              }
            }}
            placeholder="ör. Türk yazılım öğrencilerinin staj hakkında en çok sorduğu sorular"
          />
        </label>
        <button className="btn primary" type="submit" disabled={disabled || !free.trim()}>
          Araştır
        </button>
      </form>
      {running && <p className="hint">Bir tarama çalışıyor. Bitince yenisini başlatabilirsin.</p>}

      <section className="hub-sec" aria-labelledby="runs-h">
        <header className="hub-sec-h">
          <h2 id="runs-h">Taramalar</h2>
        </header>
        {!runs && (
          <p className="empty" role="status">
            Yükleniyor…
          </p>
        )}
        {runs && runs.length === 0 && <p className="empty">Henüz tarama yok. Yukarıdan birini başlat.</p>}
        {runs && runs.length > 0 && (
          <ul className="rs-runs">
            {runs.map((r, k) => (
              <li key={r.id}>
                <RunCard run={r} first={k === 0} busy={busy} added={added} onStop={() => void api.stopResearch(r.id)} onDelete={() => void remove(r.id)} onAddIdea={onAddIdea} onCreateReel={onCreateReel} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

const STATUS: Record<ResearchRun['status'], string> = { running: 'Çalışıyor', done: 'Bitti', error: 'Hata', stopped: 'Durduruldu' };

function RunCard({
  run: r,
  first,
  busy,
  added,
  onStop,
  onDelete,
  onAddIdea,
  onCreateReel,
}: {
  run: ResearchRun;
  first: boolean;
  busy: boolean;
  added: Set<string>;
  onStop: () => void;
  onDelete: () => void;
  onAddIdea: (text: string, url: string | null) => void;
  onCreateReel: (title: string) => void;
}) {
  const titleId = 'run-' + r.id;
  return (
    <article className={'rs-run ' + r.status} aria-labelledby={titleId}>
      <header className="rs-run-h">
        <div className="grow">
          <h3 id={titleId}>{r.kind === 'free' || r.kind === 'topic' ? r.prompt : KIND_LABEL[r.kind]}</h3>
          <span className="rs-run-meta">
            {r.kind === 'topic' ? KIND_LABEL.topic + ' · ' : r.kind === 'free' ? 'Serbest · ' : ''}
            {ago(r.createdAt)} · <span className={'rs-status ' + r.status}>{STATUS[r.status]}</span>
          </span>
        </div>
        {r.status === 'running' ? (
          <button className="btn small" onClick={onStop}>
            <Stop size={12} /> Durdur
          </button>
        ) : (
          <button className="btn small ghost icon danger" aria-label="Taramayı sil" title="Taramayı sil" onClick={onDelete}>
            <Trash size={14} />
          </button>
        )}
      </header>

      {r.status === 'running' && (
        <ol className="rs-steps" role="status" aria-live="polite" aria-label="Claude'un adımları">
          {r.steps.slice(-6).map((s, k, arr) => (
            <li key={r.steps.length - arr.length + k} className={k === arr.length - 1 ? 'now' : undefined}>
              {s}
            </li>
          ))}
        </ol>
      )}
      {r.status === 'error' && <p className="err">{r.error}</p>}

      {r.hooks.length > 0 && (
        <ol className="hooks">
          {r.hooks.map((h, k) => {
            const isAdded = added.has(hookIdeaText(h));
            return (
              <li key={k} className="hook">
                <div className="hook-body">
                  <p className="hook-text">{h.text}</p>
                  {h.why && <p className="hook-why">{h.why}</p>}
                  {h.source && (
                    <a className="idea-url" href={h.source} target="_blank" rel="noreferrer noopener">
                      {host(h.source)}
                    </a>
                  )}
                </div>
                <div className="hook-acts">
                  <button className="btn small" disabled={isAdded} onClick={() => onAddIdea(hookIdeaText(h), h.source ?? null)}>
                    {isAdded ? (
                      <>
                        <Check size={14} /> Eklendi
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> Fikirlere ekle
                      </>
                    )}
                  </button>
                  <button className="btn small" disabled={busy} onClick={() => onCreateReel(h.text)}>
                    Reel yap
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {r.summary && (
        <SummaryDetails open={first}>
          <Markdown text={r.summary} shift={2} />
        </SummaryDetails>
      )}
    </article>
  );
}

function SummaryDetails({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <details className="rs-sum" open={isOpen} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Özet ve kaynaklar</summary>
      {children}
    </details>
  );
}
