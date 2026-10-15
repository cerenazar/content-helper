import { useEffect, useState } from 'react';
import { newId, type ReelProject, type Cut } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function MediaPanel({ slug, project }: { slug: string; project: ReelProject }) {
  const sel = useStore((s) => s.selection);
  const jobs = useStore((s) => s.jobs);
  const { updateReel, select } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(project.clips[0]?.id ?? null);
  const [frames, setFrames] = useState<{ t: number; file: string }[] | null>(null);
  const [mark, setMark] = useState<number | null>(null);
  const [dur, setDur] = useState(2);
  const [kind, setKind] = useState<Cut['kind']>('face');

  const clip = project.clips.find((c) => c.id === active) ?? null;
  const selCut = sel?.kind === 'cut' ? project.edl.find((c) => c.id === sel.id) : undefined;

  useEffect(() => {
    setFrames(null);
    setMark(null);
    if (!clip) return;
    let gone = false;
    api
      .sheet(slug, clip.id)
      .then((r) => !gone && setFrames(r.frames))
      .catch((e) => !gone && setError(e.message));
    return () => {
      gone = true;
    };
  }, [slug, clip?.id]);

  async function addVideos() {
    setError(null);
    setBusy(true);
    try {
      const { paths } = await api.pick('video');
      if (!paths.length) return;
      const { clips } = await api.addClips(slug, paths);
      updateReel((p) => ({ ...p, clips: [...p.clips, ...clips] }));
      await useStore.getState().flush();
      setActive(clips[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addCut() {
    if (!clip || mark === null) return;
    const id = newId('cut');
    const cut: Cut = { id, clip: clip.id, in: mark, dur: Math.min(dur, Math.max(0.2, clip.probe.duration - mark)), kind };
    updateReel((p) => {
      const edl = p.edl.slice();
      const at = selCut ? edl.findIndex((c) => c.id === selCut.id) + 1 : edl.length;
      edl.splice(at, 0, cut);
      return { ...p, edl };
    });
    select({ kind: 'cut', id });
  }

  const jobFor = (clipId: string) => Object.values(jobs).filter((j) => j.target === clipId && j.status === 'running');

  return (
    <aside className="left" aria-label="Medya">
      <div className="panel-h">
        <h2>Medya</h2>
        <button className="btn small" onClick={addVideos} disabled={busy}>
          Video ekle
        </button>
      </div>
      <div className="section" style={{ gap: 4 }}>
        {project.clips.length === 0 && <p className="hint">Alt yarı için çektiğin videoları ekle. Dosyalar kopyalanmaz, yerinde okunur.</p>}
        {project.clips.map((c) => (
          <div
            key={c.id}
            className="clip"
            role="button"
            tabIndex={0}
            aria-selected={c.id === active}
            onClick={() => {
              setActive(c.id);
              select({ kind: 'clip', id: c.id });
            }}
            onKeyDown={(e) => e.key === 'Enter' && setActive(c.id)}
          >
            <span className="name" title={c.path}>
              {c.name}
            </span>
            <span className="tnum hint">{fmt(c.probe.duration)}</span>
            <span className="meta">
              {c.probe.width}×{c.probe.height} · {c.probe.codec} · {c.probe.fps} fps{c.probe.hasAudio ? ' · sesli' : ''}
            </span>
            {jobFor(c.id).map((j) => (
              <span key={j.id} style={{ gridColumn: '1 / -1', display: 'grid', gap: 3 }}>
                <span className="hint">{j.message}</span>
                <span className="progress">
                  <i style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </span>
              </span>
            ))}
          </div>
        ))}
        {error && <p className="err">{error}</p>}
      </div>

      {clip && (
        <div className="section">
          <h2 style={{ margin: 0, fontSize: 13 }}>Kareler: {clip.name}</h2>
          <p className="hint">Bulanık, eli kameranın önünde ya da yarım ifadeli kareleri kullanma. Bir kareye tıklayıp kesit başlat.</p>
          {!frames && <p className="hint">Kareler çıkarılıyor…</p>}
          {frames && (
            <div className="sheet">
              {frames.map((f) => (
                <button key={f.file} aria-pressed={mark === f.t} onClick={() => setMark(f.t)} aria-label={`${f.t} saniyedeki kare`}>
                  <img src={api.sheetUrl(slug, clip.id, f.file)} alt="" loading="lazy" />
                  <span>{f.t.toFixed(1)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <label className="field grow">
              <span>Giriş (sn)</span>
              <input className="input tnum" type="number" step={0.1} min={0} max={clip.probe.duration} value={mark ?? ''} placeholder="kare seç" onChange={(e) => setMark(e.target.value === '' ? null : Number(e.target.value))} />
            </label>
            <label className="field" style={{ width: 84 }}>
              <span>Süre</span>
              <input className="input tnum" type="number" step={0.1} min={0.2} value={dur} onChange={(e) => setDur(Math.max(0.2, Number(e.target.value) || 2))} />
            </label>
          </div>
          <div className="seg" role="group" aria-label="Kırpma türü">
            <button aria-pressed={kind === 'face'} onClick={() => setKind('face')}>
              Yüz çekimi
            </button>
            <button aria-pressed={kind === 'hands'} onClick={() => setKind('hands')}>
              El / masa
            </button>
          </div>
          <div className="row wrap">
            <button className="btn primary small" disabled={mark === null} onClick={addCut}>
              {selCut ? 'Seçili kesitten sonra ekle' : 'Kesit ekle'}
            </button>
            {selCut && (
              <button
                className="btn small"
                disabled={mark === null}
                onClick={() => updateReel((p) => ({ ...p, edl: p.edl.map((c) => (c.id === selCut.id ? { ...c, clip: clip.id, in: mark! } : c)) }))}
              >
                Seçili kesitin girişini buraya al
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
