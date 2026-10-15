import { useEffect, useState } from 'react';
import { newId, type ReelProject, type Cut } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';
import { previewSfx } from './sfxAudio';
import { Speaker, Plus } from '../icons';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function MediaPanel({ slug, project }: { slug: string; project: ReelProject }) {
  const [tab, setTab] = useState<'video' | 'audio'>('video');
  return (
    <aside className="left" aria-label="Medya">
      <div className="tabs" role="tablist" aria-label="Medya türü">
        <button role="tab" id="mt-video" aria-controls="mp-video" aria-selected={tab === 'video'} onClick={() => setTab('video')}>
          Video
        </button>
        <button role="tab" id="mt-audio" aria-controls="mp-audio" aria-selected={tab === 'audio'} onClick={() => setTab('audio')}>
          Ses efektleri{project.sfx.length > 0 && <span className="count tnum">{project.sfx.length}</span>}
        </button>
      </div>
      {tab === 'video' ? (
        <div role="tabpanel" id="mp-video" aria-labelledby="mt-video">
          <VideoPanel slug={slug} project={project} />
        </div>
      ) : (
        <div role="tabpanel" id="mp-audio" aria-labelledby="mt-audio">
          <SfxPanel slug={slug} />
        </div>
      )}
    </aside>
  );
}

/** Ses efektleri: hazır efektler (CC0, ffmpeg ile üretildi) ve dosyadan ekleme. Oynatma kafasına eklenir. */
function SfxPanel({ slug }: { slug: string }) {
  const [builtins, setBuiltins] = useState<{ name: string; file: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const time = useStore((s) => s.time);
  useEffect(() => {
    api
      .builtinSfx()
      .then((r) => setBuiltins(r.sfx))
      .catch((e) => setError(e.message));
  }, []);

  const add = (srcs: string[]) => {
    const st = useStore.getState();
    const at = Math.round(st.time * 1000) / 1000;
    const items = srcs.map((src) => ({ id: newId('sfx'), src, at, gain: 1 }));
    if (!items.length) return;
    st.updateReel((p) => ({ ...p, sfx: [...p.sfx, ...items] }));
    st.select({ kind: 'sfx', id: items[items.length - 1].id });
  };

  async function run(fn: () => Promise<string[]>) {
    setError(null);
    setBusy(true);
    try {
      add(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-h">
        <h2>Ses efektleri</h2>
        <button
          className="btn small"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const { paths } = await api.pick('audio');
              if (!paths.length) return [];
              return (await api.addSfx(slug, { paths })).srcs;
            })
          }
        >
          Dosyadan ekle
        </button>
      </div>
      <div className="section" style={{ gap: 4 }}>
        <p className="hint" style={{ margin: '0 0 6px' }}>
          Efekt oynatma kafasına (<span className="tnum">{time.toFixed(2)} sn</span>) eklenir. Timeline'da sürükleyerek kaydırabilirsin.
        </p>
        {!builtins && !error && <p className="hint">Yükleniyor…</p>}
        {builtins?.map((b) => (
          <div key={b.file} className="sfx-row">
            <button className="btn ghost icon small" aria-label={`${b.name} efektini dinle`} title="Dinle" onClick={() => void previewSfx('builtin:' + b.file, api.builtinSfxUrl(b.file))}>
              <Speaker size={15} />
            </button>
            <span className="name">{b.name}</span>
            <button className="btn small" disabled={busy} aria-label={`${b.name} efektini ekle`} onClick={() => void run(async () => (await api.addSfx(slug, { builtin: b.name })).srcs)}>
              <Plus size={14} /> Ekle
            </button>
          </div>
        ))}
        {error && <p className="err">{error}</p>}
        <p className="hint" style={{ marginTop: 8 }}>
          Hazır efektler bu editör için ffmpeg ile üretildi (CC0), telifsiz. Dosyalar projenin media/ klasörüne kopyalanır.
        </p>
      </div>
    </>
  );
}

function VideoPanel({ slug, project }: { slug: string; project: ReelProject }) {
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
    <>
      <div className="panel-h">
        <h2>Videolar</h2>
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
    </>
  );
}
