import { useEffect, useMemo, useState } from 'react';
import { timeline } from '@cb/renderer';
import type { ReelProject } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';
import { TopBar } from '../Editor';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { MediaPanel } from './MediaPanel';
import { ExportDialog } from './ExportDialog';
import { Play, Pause } from '../icons';

const FPS = 30;

export function ReelEditor({ slug, claudePanel, claudeRunning }: { slug: string; claudePanel: React.ReactNode; claudeRunning: boolean }) {
  const project = useStore((s) => s.project) as ReelProject;
  const scenes = useStore((s) => s.scenes);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const [tab, setTab] = useState<'edit' | 'claude'>('edit');
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const tl = useMemo(() => timeline(project.captions), [project.captions]);

  // Oynatma kısayolları
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]') && e.key !== 'Escape') return;
      const st = useStore.getState();
      if (e.key === ' ') {
        e.preventDefault();
        if (!st.playing && st.time >= tl.duration - 0.02) st.setTime(0);
        st.setPlaying(!st.playing);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        st.setPlaying(false);
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 1 / FPS);
        st.setTime(Math.min(tl.duration, Math.round((st.time + d) * FPS) / FPS));
      } else if (e.key === 'Home') st.setTime(0);
      else if (e.key === 'Escape') st.select(null);
      else if ((e.key === 'Backspace' || e.key === 'Delete') && st.selection) {
        const s = st.selection;
        if (s.kind === 'caption' && project.captions.length > 1) st.updateReel((p) => ({ ...p, captions: p.captions.filter((c) => c.id !== s.id) }));
        else if (s.kind === 'cut') st.updateReel((p) => ({ ...p, edl: p.edl.filter((c) => c.id !== s.id) }));
        else return;
        st.select(null);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [tl.duration, project.captions.length]);

  // Claude çalışmaya başlayınca panelini göster
  useEffect(() => {
    if (claudeRunning) setTab('claude');
  }, [claudeRunning]);

  async function startExport() {
    setExportErr(null);
    try {
      await useStore.getState().flush();
      const { job } = await api.exportReel(slug);
      useStore.getState().setJob(job);
      setExportJob(job.id);
    } catch (e) {
      setExportErr((e as Error).message);
    }
  }

  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  return (
    <div className="editor">
      <TopBar slug={slug}>
        {exportErr && <span className="err">{exportErr}</span>}
        <button className="btn primary" onClick={startExport} disabled={claudeRunning}>
          Dışa aktar
        </button>
      </TopBar>

      <MediaPanel slug={slug} project={project} />

      <section className="stage" aria-label="Önizleme">
        <Preview slug={slug} project={project} scenes={scenes} />
        <div className="transport">
          <button
            className="btn icon"
            aria-label={playing ? 'Durdur (boşluk)' : 'Oynat (boşluk)'}
            title={playing ? 'Durdur (boşluk)' : 'Oynat (boşluk)'}
            onClick={() => {
              const st = useStore.getState();
              if (!st.playing && st.time >= tl.duration - 0.02) st.setTime(0);
              st.setPlaying(!st.playing);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <span className="tnum time">{fmt(time)}</span>
          <span className="tnum dur">/ {fmt(tl.duration)}</span>
          <span className="hint">← → kare · ⇧ ile 1 sn</span>
          <div className="meter">
            <span className={tl.duration < 35 || tl.duration > 45 ? 'bad' : ''}>
              Süre <b className="tnum">{tl.duration.toFixed(1)} sn</b>
            </span>
            <span>
              Caption <b className="tnum">{project.captions.length}</b>
            </span>
            <span>
              Kesit <b className="tnum">{project.edl.length}</b>
            </span>
          </div>
        </div>
      </section>

      <aside className="right" aria-label="Yan panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>
            Düzenle
          </button>
          <button role="tab" className="claude-tab" aria-selected={tab === 'claude'} onClick={() => setTab('claude')}>
            Claude{claudeRunning && <span className="dot" aria-label="çalışıyor" />}
          </button>
        </div>
        <div className="tabpanel" role="tabpanel">
          {tab === 'edit' ? <Inspector project={project} /> : claudePanel}
        </div>
      </aside>

      <Timeline slug={slug} project={project} />

      {exportJob && <ExportDialog slug={slug} jobId={exportJob} onClose={() => setExportJob(null)} />}
    </div>
  );
}
