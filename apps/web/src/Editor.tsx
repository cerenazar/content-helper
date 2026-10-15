import { useEffect, useState } from 'react';
import { api, events } from './api';
import { useStore } from './store';
import { ReelEditor } from './reel/ReelEditor';
import { CarouselEditor } from './carousel/CarouselEditor';
import { ClaudePanel } from './ClaudePanel';
import { useClaude } from './useClaude';
import { Undo, Redo, ArrowLeft } from './icons';

export function Editor({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const loaded = useStore((s) => s.slug === slug && !!s.project);
  const kind = useStore((s) => (s.slug === slug ? s.project?.kind : undefined));
  const claude = useClaude(slug);

  useEffect(() => {
    let off = () => {};
    api
      .get(slug)
      .then((r) => {
        useStore.getState().open(slug, r.project, r.scenes, r.claudeRunning);
        off = events(slug, (e) => {
          const st = useStore.getState();
          if (e.type === 'project-changed') st.fromServer(e.project, e.scenes, e.source);
          if (e.type === 'project-invalid') useStore.setState({ invalidError: e.error });
          if (e.type === 'job') st.setJob(e.job);
          if (e.type === 'claude') claude.onEvent(e.event);
        });
      })
      .catch((e) => setError(e.message));
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Geri al / yinele (metin alanlarında tarayıcının kendi geri alması çalışsın)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  if (error)
    return (
      <main className="state-page">
        <div role="alert">
          <h1>Proje açılamadı</h1>
          <p className="err">{error}</p>
          <p>Proje klasörü taşınmış ya da project.json bozulmuş olabilir.</p>
          <a className="btn primary" href="#/projects">
            Projelerime dön
          </a>
        </div>
      </main>
    );
  if (!loaded)
    return (
      <div className="loading" role="status">
        Proje açılıyor…
      </div>
    );

  const right = <ClaudePanel slug={slug} claude={claude} />;
  return kind === 'reel' ? <ReelEditor slug={slug} claudePanel={right} claudeRunning={claude.running} /> : <CarouselEditor slug={slug} claudePanel={right} claudeRunning={claude.running} />;
}

export function TopBar({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const title = useStore((s) => s.project.title);
  const saveState = useStore((s) => s.saveState);
  const saveError = useStore((s) => s.saveError);
  const canUndo = useStore((s) => s.past.length > 0 && !s.claudeRunning);
  const canRedo = useStore((s) => s.future.length > 0 && !s.claudeRunning);
  const claudeRunning = useStore((s) => s.claudeRunning);
  const label = claudeRunning ? 'Claude düzenliyor' : saveState === 'saved' ? 'Kaydedildi' : saveState === 'error' ? 'Kaydedilemedi: ' + saveError : 'Kaydediliyor';
  return (
    <header className="topbar">
      <a className="back row" href="#/" aria-label="Ana sayfaya dön" title="Ana sayfaya dön" style={{ gap: 6 }}>
        <ArrowLeft size={15} /> Ana sayfa
      </a>
      <span className="ptitle">{title}</span>
      <span className={'save' + (saveState === 'error' ? ' error' : '')} role="status">
        {label}
      </span>
      <span className="grow" />
      <button className="btn ghost icon" aria-label="Geri al (⌘Z)" title="Geri al (⌘Z)" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
        <Undo />
      </button>
      <button className="btn ghost icon" aria-label="Yinele (⇧⌘Z)" title="Yinele (⇧⌘Z)" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
        <Redo />
      </button>
      {children}
    </header>
  );
}

/** Sağdaki her zaman açık Claude sütunu: reel ve carousel editöründe aynı. */
export function ClaudeColumn({ running, children }: { running: boolean; children: React.ReactNode }) {
  return (
    <aside className="right claude-col" aria-label="Claude">
      <div className="panel-h claude-h">
        <h2>Claude</h2>
        {running && (
          <span className="claude-run" role="status">
            <span className="dot" aria-hidden /> düzenliyor
          </span>
        )}
      </div>
      <div className="claude-body">{children}</div>
    </aside>
  );
}
