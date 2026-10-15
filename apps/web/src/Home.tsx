import { useEffect, useRef, useState } from 'react';
import { newId } from '@cb/schema';
import { api, hubEvents, type Analysis, type Idea, type ProjectSummary } from './api';
import { thumbnail } from './thumbs';
import { House, Folder, Bulb, LinkIcon, Trash, Plus, Search, Sparkle } from './icons';
import { Markdown } from './Markdown';
import { Research } from './Research';
import { ago, host, count } from './util';

export type Section = 'home' | 'projects' | 'ideas' | 'research';
type Kind = 'reel' | 'carousel';

/** Bir fikirden proje adı: ilk satır, yoksa linkin sitesi. */
const ideaTitle = (i: Idea) =>
  i.text.split('\n')[0].trim().slice(0, 60) || (i.analysis?.meta?.title ? 'İlham: ' + i.analysis.meta.title.slice(0, 52) : i.url ? 'İlham: ' + host(i.url) : 'Yeni proje');

/** Analiz notundan panel Claude'una giden ilk mesaj. */
function planMessage(i: Idea): string {
  const a = i.analysis!;
  return [
    'Aşağıdaki ilham notuna göre bu proje için bir reel planı çıkar.',
    "Önce planı kısaca yaz: hook (ilk 3 sn), sahne sahne akış (üstteki pixel-art sahnede ne olacak, alttaki videoda ne çekmem gerekiyor), 3 kelimelik caption'lar.",
    "Sonra caption'ları ve sahneleri bu projeye taslak olarak ekle. Videoyu ben çekeceğim, klip ekleme.",
    '',
    `Kaynak video: ${i.url}${a.meta?.title ? ` (${a.meta.title}${a.meta.uploader ? ', ' + a.meta.uploader : ''})` : ''}`,
    i.text.trim() ? `Benim notum: ${i.text.trim()}` : '',
    '',
    '<ilham-notu>',
    a.note,
    '</ilham-notu>',
  ]
    .filter((l, k, arr) => l !== '' || arr[k - 1] !== '')
    .join('\n');
}

export function Home({ section }: { section: Section }) {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [root, setRoot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Analiz ilerlemesi sunucudan akar.
  useEffect(
    () =>
      hubEvents((e) => {
        if (e.type === 'analysis') setIdeas((l) => l && l.map((i) => (i.id === e.id ? { ...i, analysis: e.analysis } : i)));
      }),
    [],
  );

  useEffect(() => {
    api
      .list()
      .then((r) => {
        setList(r.projects);
        setRoot(r.root);
      })
      .catch((e) => setError('Sunucuya bağlanılamadı. Terminalde `npm run dev` çalışıyor mu? (' + e.message + ')'));
    api
      .ideas()
      .then((r) => setIdeas(r.ideas))
      .catch(() => setIdeas([]));
  }, []);

  async function create(kind: Kind, title: string, idea?: Idea) {
    setBusy(true);
    try {
      const { slug } = await api.create(title.trim() || (kind === 'reel' ? 'Yeni reel' : 'Yeni carousel'), kind);
      if (idea && ideas) await api.saveIdeas(ideas.map((i) => (i.id === idea.id ? { ...i, project: slug } : i)));
      location.hash = `#/p/${slug}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function saveIdeas(next: Idea[]) {
    const prev = ideas;
    setIdeas(next);
    try {
      await api.saveIdeas(next);
    } catch (e) {
      setIdeas(prev);
      setError('Fikirler kaydedilemedi: ' + (e as Error).message);
    }
  }
  const addIdea = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const url = /^https?:\/\/\S+$/.test(t) ? t : null;
    void saveIdeas([{ id: newId('idea'), text: url ? '' : t, url, createdAt: Date.now(), project: null }, ...(ideas ?? [])]);
  };

  async function analyze(i: Idea) {
    setError(null);
    try {
      const { analysis } = await api.analyze(i.id);
      setIdeas((l) => l && l.map((x) => (x.id === i.id ? { ...x, analysis } : x)));
    } catch (e) {
      setError('Analiz başlatılamadı: ' + (e as Error).message);
    }
  }

  /** Analizden reel: proje açılır, fikre bağlanır, panel Claude'una plan isteği gider, editöre geçilir. */
  async function planFromAnalysis(i: Idea) {
    setBusy(true);
    setError(null);
    try {
      const { slug } = await api.create(ideaTitle(i), 'reel');
      const fresh = (await api.ideas()).ideas;
      await api.saveIdeas(fresh.map((x) => (x.id === i.id ? { ...x, project: slug } : x)));
      await api.ask(slug, planMessage(i));
      location.hash = `#/p/${slug}`;
    } catch (e) {
      setError('Reel planı başlatılamadı: ' + (e as Error).message);
      setBusy(false);
    }
  }
  const ideaProps = {
    ideas,
    busy,
    onAdd: addIdea,
    onDelete: (id: string) => void saveIdeas((ideas ?? []).filter((i) => i.id !== id)),
    onCreate: (kind: Kind, i: Idea) => void create(kind, ideaTitle(i), i),
    onAnalyze: (i: Idea) => void analyze(i),
    onPlan: (i: Idea) => void planFromAnalysis(i),
  };

  return (
    <div className="hub">
      <nav className="hub-nav" aria-label="Bölümler">
        <a className="hub-brand" href="#/">
          @cerenbuilds
        </a>
        <NavLink href="#/" current={section === 'home'} icon={<House size={17} />}>
          Ana sayfa
        </NavLink>
        <NavLink href="#/projects" current={section === 'projects'} icon={<Folder size={17} />} count={list?.length}>
          Projelerim
        </NavLink>
        <NavLink href="#/ideas" current={section === 'ideas'} icon={<Bulb size={17} />} count={ideas?.length}>
          Fikirlerim
        </NavLink>
        <NavLink href="#/research" current={section === 'research'} icon={<Search size={17} />}>
          Araştır
        </NavLink>
        <span className="hub-spacer" />
        {root && <p className="hub-root">Projeler: {root}</p>}
      </nav>

      <main className="hub-main">
        {error && (
          <p className="err hub-err" role="alert">
            {error}
          </p>
        )}

        {section === 'home' && (
          <>
            <CreateBand busy={busy} onCreate={(k, t) => void create(k, t)} />
            <section className="hub-sec" aria-labelledby="recent-h">
              <header className="hub-sec-h">
                <h2 id="recent-h">Son projeler</h2>
                {list && list.length > 6 && <a href="#/projects">Tümünü gör ({list.length})</a>}
              </header>
              <ProjectGrid list={list?.slice(0, 6) ?? null} />
            </section>
            <section className="hub-sec" aria-labelledby="ideas-h">
              <header className="hub-sec-h">
                <h2 id="ideas-h">Fikirlerim</h2>
                {ideas && ideas.length > 4 && <a href="#/ideas">Tümünü gör ({ideas.length})</a>}
              </header>
              <Ideas {...ideaProps} limit={4} />
            </section>
          </>
        )}

        {section === 'projects' && <ProjectsPage list={list} />}

        {section === 'ideas' && (
          <section className="hub-sec first" aria-labelledby="ideas-h">
            <header className="hub-sec-h">
              <h1 id="ideas-h">Fikirlerim</h1>
            </header>
            <p className="hub-lede">
              Aklına gelenleri ve beğendiğin videoların linklerini buraya kaydet. Linkleri Claude'a analiz ettir, hazır olduğunda tek tıkla reel ya da carousel'e çevir.
            </p>
            <Ideas {...ideaProps} />
          </section>
        )}

        {section === 'research' && (
          <Research
            busy={busy}
            ideas={ideas}
            onAddIdea={(text, url) => void saveIdeas([{ id: newId('idea'), text, url, createdAt: Date.now(), project: null }, ...(ideas ?? [])])}
            onCreateReel={(title) => void create('reel', title)}
          />
        )}
      </main>
    </div>
  );
}

function NavLink({ href, current, icon, count, children }: { href: string; current: boolean; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <a className="hub-link" href={href} aria-current={current ? 'page' : undefined}>
      {icon}
      <span className="grow">{children}</span>
      {!!count && <span className="hub-count tnum">{count}</span>}
    </a>
  );
}

function CreateBand({ busy, onCreate }: { busy: boolean; onCreate: (k: Kind, title: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <section className="create" aria-labelledby="create-h">
      <h1 id="create-h">Ne üretelim?</h1>
      <form
        className="create-topic"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate('reel', title);
        }}
      >
        <input className="input" placeholder="Konu, ör. 4 agent 1 çay (boş da bırakabilirsin)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Konu" />
      </form>
      <div className="create-tiles">
        <button className="tile" disabled={busy} onClick={() => onCreate('reel', title)}>
          <span className="mini-reel" aria-hidden>
            <span className="mr-top">
              <span className="mr-sprite" />
              <span className="mr-pill">{title.trim().split(/\s+/).slice(0, 3).join(' ') || '4 agent 1 çay'}</span>
            </span>
            <span className="mr-bottom" />
          </span>
          <span className="tile-text">
            <strong>Reel oluştur</strong>
            <span>9:16 split reel. Üstte pixel-art animasyon, altta senin videon.</span>
          </span>
        </button>
        <button className="tile" disabled={busy} onClick={() => onCreate('carousel', title)}>
          <span className="mini-car" aria-hidden>
            <span className="mc-card c3" />
            <span className="mc-card c2" />
            <span className="mc-card c1">
              <span className="mc-line w1" />
              <span className="mc-line w2" />
              <span className="mc-mark" />
            </span>
          </span>
          <span className="tile-text">
            <strong>Carousel oluştur</strong>
            <span>4:5 Ceren's Picks. Üst/alt bant, seri numarası ve sayfa numarası kendiliğinden gelir.</span>
          </span>
        </button>
      </div>
    </section>
  );
}

function ProjectsPage({ list }: { list: ProjectSummary[] | null }) {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const shown = list && (filter === 'all' ? list : list.filter((p) => p.kind === filter));
  return (
    <section className="hub-sec first" aria-labelledby="projects-h">
      <header className="hub-sec-h">
        <h1 id="projects-h">Projelerim</h1>
        <div className="seg" role="group" aria-label="Türe göre süz">
          {(
            [
              ['all', 'Tümü'],
              ['reel', 'Reel'],
              ['carousel', 'Carousel'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <ProjectGrid list={shown} />
    </section>
  );
}

function ProjectGrid({ list }: { list: ProjectSummary[] | null }) {
  if (!list)
    return (
      <p className="empty" role="status">
        Projeler yükleniyor…
      </p>
    );
  if (list.length === 0) return <p className="empty">Henüz proje yok. Yukarıdan bir reel ya da carousel başlat.</p>;
  return (
    <ul className="pgrid">
      {list.map((p) => (
        <li key={p.slug}>
          <a href={`#/p/${p.slug}`} className="pcard">
            <Thumb p={p} />
            <span className="pcard-title">{p.title}</span>
            <span className="pcard-meta">
              {p.kind === 'reel' ? 'Reel' : 'Carousel'}, {ago(p.updatedAt)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ p }: { p: ProjectSummary }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    thumbnail(p.slug, p.updatedAt)
      .then((u) => live && setSrc(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [p.slug, p.updatedAt]);
  return (
    <span className={'pthumb ' + p.kind}>
      {src ? <img src={src} alt="" /> : <span className="pthumb-ph">{failed ? 'Önizleme yok' : ''}</span>}
    </span>
  );
}

function Ideas({
  ideas,
  busy,
  limit,
  onAdd,
  onDelete,
  onCreate,
  onAnalyze,
  onPlan,
}: {
  ideas: Idea[] | null;
  busy: boolean;
  limit?: number;
  onAdd: (t: string) => void;
  onDelete: (id: string) => void;
  onCreate: (k: Kind, i: Idea) => void;
  onAnalyze: (i: Idea) => void;
  onPlan: (i: Idea) => void;
}) {
  const [draft, setDraft] = useState('');
  const shown = ideas && (limit ? ideas.slice(0, limit) : ideas);
  return (
    <div className="ideas">
      <form
        className="idea-add"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draft);
          setDraft('');
        }}
      >
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Bir fikir yaz ya da beğendiğin videonun linkini yapıştır" aria-label="Yeni fikir" />
        <button className="btn" type="submit" disabled={!draft.trim()}>
          <Plus size={14} /> Ekle
        </button>
      </form>
      {!shown && (
        <p className="empty" role="status">
          Fikirler yükleniyor…
        </p>
      )}
      {shown && shown.length === 0 && <p className="empty">Henüz fikir yok. Aklına geleni ya da beğendiğin bir videonun linkini yukarıya yaz.</p>}
      {shown && shown.length > 0 && (
        <ul className="ilist">
          {shown.map((i) => {
            const a = i.analysis;
            const canAnalyze = !!i.url && a?.status !== 'running';
            return (
              <li key={i.id} className="idea">
                <span className={'idea-ic' + (i.url ? ' link' : '')} aria-hidden>
                  {i.url ? <LinkIcon size={15} /> : <Bulb size={15} />}
                </span>
                <div className="idea-body">
                  {i.text && <p className="idea-text">{i.text}</p>}
                  {!i.text && a?.meta?.title && <p className="idea-text">{a.meta.title}</p>}
                  {i.url && (
                    <a className="idea-url" href={i.url} target="_blank" rel="noreferrer">
                      {host(i.url)}
                    </a>
                  )}
                  <span className="idea-when">{ago(i.createdAt)}</span>
                </div>
                <div className="idea-acts">
                  {canAnalyze && !a && (
                    <button className="btn small ana-btn" onClick={() => onAnalyze(i)}>
                      <Sparkle size={14} /> Analiz et
                    </button>
                  )}
                  {i.project ? (
                    <a className="btn small" href={`#/p/${i.project}`}>
                      Projeyi aç
                    </a>
                  ) : (
                    <>
                      <button className="btn small" disabled={busy} onClick={() => onCreate('reel', i)}>
                        Reel yap
                      </button>
                      <button className="btn small" disabled={busy} onClick={() => onCreate('carousel', i)}>
                        Carousel yap
                      </button>
                    </>
                  )}
                  <button className="btn small ghost icon danger" aria-label="Fikri sil" title="Fikri sil" onClick={() => onDelete(i.id)}>
                    <Trash size={14} />
                  </button>
                </div>
                {a && <AnalysisView idea={i} a={a} compact={!!limit} busy={busy} onAnalyze={() => onAnalyze(i)} onPlan={() => onPlan(i)} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AnalysisView({ idea, a, compact, busy, onAnalyze, onPlan }: { idea: Idea; a: Analysis; compact: boolean; busy: boolean; onAnalyze: () => void; onPlan: () => void }) {
  if (a.status === 'running')
    return (
      <div className="ana running" role="status" aria-live="polite">
        <span className="ana-pulse" aria-hidden />
        <span>{a.step || 'Analiz ediliyor…'}</span>
      </div>
    );
  if (a.status === 'error')
    return (
      <div className="ana failed">
        <p className="err" role="alert">
          {a.error}
        </p>
        <button className="btn small" onClick={onAnalyze}>
          Tekrar dene
        </button>
      </div>
    );
  const m = a.meta;
  const stats = [m?.uploader, m?.duration ? Math.round(m.duration) + ' sn' : null, m?.viewCount != null ? count(m.viewCount) + ' izlenme' : null, m?.likeCount != null ? count(m.likeCount) + ' beğeni' : null].filter(Boolean);
  return (
    <AnaDetails defaultOpen={!compact} className="ana done">
      <summary>
        <Sparkle size={14} />
        <span className="ana-sum-t">
          İlham notu
        </span>
        {stats.length > 0 && <span className="ana-stats">{stats.join(' · ')}</span>}
      </summary>
      {a.frames.length > 0 && (
        <ol className="ana-frames" aria-label="Videodan eşit aralıklı kareler">
          {a.frames.map((f, k) => (
            <li key={f}>
              <img src={api.frameUrl(idea.id, f)} alt={`Kare ${k + 1}/${a.frames.length}`} loading="lazy" />
            </li>
          ))}
        </ol>
      )}
      {!a.hasSubtitles && <p className="hint ana-nosub">Altyazı yok, analiz görüntü ve açıklamadan yapıldı.</p>}
      <Markdown text={a.note} shift={1} className="md ana-note" />
      <div className="ana-acts">
        {!idea.project && (
          <button className="btn claude" disabled={busy} onClick={onPlan}>
            Bu analizden reel planı çıkar
          </button>
        )}
        <button className="btn small ghost" onClick={onAnalyze}>
          Yeniden analiz et
        </button>
      </div>
    </AnaDetails>
  );
}

/** <details>: varsayılan açıklık yalnızca ilk çizimde uygulanır, sonra kullanıcının seçimi korunur. */
function AnaDetails({ defaultOpen, className, children }: { defaultOpen: boolean; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = defaultOpen;
  }, []);
  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
