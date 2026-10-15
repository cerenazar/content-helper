import { useEffect, useMemo, useRef, useState } from 'react';
import { timeline } from '@cb/renderer';
import type { ReelProject } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';
import { TopBar, ClaudeColumn } from '../Editor';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { MediaPanel } from './MediaPanel';
import { ExportDialog } from './ExportDialog';
import { ShortcutsDialog } from './Shortcuts';
import { loadSfx } from './sfxAudio';
import { splitAtPlayhead, deleteSelection, nudgeCut, togglePlay, shuttle } from './actions';
import { Play, Pause, Keyboard } from '../icons';

const FPS = 30;
const TL_KEY = 'cb.reel.timelineHeight';
const TL_MIN = 170;
const tlMax = () => Math.max(TL_MIN, Math.round(innerHeight * 0.62));

function readTlHeight(): number {
  try {
    const v = Number(localStorage.getItem(TL_KEY));
    if (v >= TL_MIN) return v;
  } catch {
    /* depolama yoksa varsayılan */
  }
  return 300;
}

/**
 * Reel düzenleyici (CapCut düzeni): solda medya, ortada önizleme, seçime göre açılan özellik paneli,
 * sağda her zaman açık Claude paneli, altta tam genişlikte, yüksekliği ayarlanabilir timeline.
 */
export function ReelEditor({ slug, claudePanel, claudeRunning }: { slug: string; claudePanel: React.ReactNode; claudeRunning: boolean }) {
  const project = useStore((s) => s.project) as ReelProject;
  const scenes = useStore((s) => s.scenes);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const rate = useStore((s) => s.rate);
  const sel = useStore((s) => s.selection);
  const [projectOpen, setProjectOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [tlH, setTlH] = useState(readTlHeight);
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const tl = useMemo(() => timeline(project.captions), [project.captions]);
  const keysRef = useRef(keysOpen);
  keysRef.current = keysOpen;
  const projRef = useRef(projectOpen);
  projRef.current = projectOpen;

  const inspectorOpen = (!!sel && sel.kind !== 'clip') || projectOpen;

  // Ses efektlerini çöz (süre ve dalga timeline'da, ses önizlemede)
  const srcs = useMemo(() => [...new Set(project.sfx.map((s) => s.src))].join('|'), [project.sfx]);
  useEffect(() => {
    for (const src of srcs.split('|').filter(Boolean)) void loadSfx(src, api.mediaUrl(slug, src));
  }, [srcs, slug]);

  // Kısayollar (zoom ve N timeline'ın içinde)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (keysRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') && e.key !== 'Escape') return;
      // Odaktaki düğme boşluk/Enter ile kendi işini yapsın
      if (t.closest('button, [role="button"], [role="tab"]') && (e.key === ' ' || e.key === 'Enter')) {
        if (e.key === 'Enter' || t.tagName === 'BUTTON') return;
      }
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (plain && (k === 'j' || k === 'k' || k === 'l')) {
        e.preventDefault();
        shuttle(k);
      } else if (k === 'b' && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        nudgeCut(e.key === 'ArrowLeft' ? -1 : 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        st.setPlaying(false);
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 1 / FPS);
        st.setTime(Math.min(tl.duration, Math.round((st.time + d) * FPS) / FPS));
      } else if (e.key === 'Home') st.setTime(0);
      else if (e.key === 'End') st.setTime(tl.duration);
      else if (e.key === '?') {
        e.preventDefault();
        setKeysOpen(true);
      } else if (e.key === 'Escape') {
        if (st.selection) st.select(null);
        else if (projRef.current) setProjectOpen(false);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && st.selection) {
        if (deleteSelection()) e.preventDefault();
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [tl.duration]);

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

  // Timeline yüksekliği: ayırıcıyı sürükle ya da ok tuşlarıyla ayarla
  const setHeight = (h: number) => {
    const v = Math.round(Math.max(TL_MIN, Math.min(tlMax(), h)));
    setTlH(v);
    try {
      localStorage.setItem(TL_KEY, String(v));
    } catch {
      /* depolama yoksa sadece bu oturum */
    }
  };
  const resize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = tlH;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setHeight(h0 - (ev.clientY - y0));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const tlHeight = Math.min(tlH, tlMax());

  return (
    <div className={'editor reel' + (inspectorOpen ? ' insp-open' : '')} style={{ '--tl-h': tlHeight + 'px' } as React.CSSProperties}>
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
          <button className="btn icon" aria-label={playing ? 'Durdur (boşluk)' : 'Oynat (boşluk)'} title={playing ? 'Durdur (boşluk)' : 'Oynat (boşluk)'} onClick={togglePlay}>
            {playing ? <Pause /> : <Play />}
          </button>
          <span className="tnum time">{fmt(time)}</span>
          <span className="tnum dur">/ {fmt(tl.duration)}</span>
          {playing && rate !== 1 && (
            <span className="rate tnum" role="status">
              {rate < 0 ? '◀ ' : ''}
              {Math.abs(rate)}×
            </span>
          )}
          <div className="meter">
            <span className={tl.duration < 35 || tl.duration > 45 ? 'bad' : ''}>
              Süre <b className="tnum">{tl.duration.toFixed(1)} sn</b>
            </span>
            <span>
              Kesit <b className="tnum">{project.edl.length}</b>
            </span>
            <span>
              SFX <b className="tnum">{project.sfx.length}</b>
            </span>
          </div>
          <button className="btn small" aria-pressed={projectOpen} aria-expanded={inspectorOpen} aria-controls="reel-insp" onClick={() => setProjectOpen(!projectOpen)} title="Başlık, ses, format kontrolü, sahneler">
            Proje
          </button>
          <button className="btn ghost icon small" onClick={() => setKeysOpen(true)} aria-label="Klavye kısayolları (?)" title="Klavye kısayolları (?)">
            <Keyboard size={16} />
          </button>
        </div>
      </section>

      {inspectorOpen && (
        <aside className="insp" id="reel-insp" aria-label="Özellikler">
          <Inspector project={project} onCloseProject={() => setProjectOpen(false)} />
        </aside>
      )}

      <ClaudeColumn running={claudeRunning}>{claudePanel}</ClaudeColumn>

      <div
        className="tl-split"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Timeline yüksekliği"
        aria-valuemin={TL_MIN}
        aria-valuemax={tlMax()}
        aria-valuenow={tlHeight}
        tabIndex={0}
        onPointerDown={resize}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setHeight(tlHeight + (e.key === 'ArrowUp' ? 24 : -24));
          }
        }}
      />

      <Timeline slug={slug} project={project} onShortcuts={() => setKeysOpen(true)} />

      {exportJob && <ExportDialog slug={slug} jobId={exportJob} onClose={() => setExportJob(null)} />}
      {keysOpen && <ShortcutsDialog onClose={() => setKeysOpen(false)} />}
    </div>
  );
}
