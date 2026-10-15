import { useMemo, useState } from 'react';
import { timeline, formulaDur, captionDur, edlDuration } from '@cb/renderer';
import { newId, WORLDS, ACCENTS, type ReelProject, type Caption } from '@cb/schema';
import { useStore } from '../store';
import { Close, Trash, Check, Alert, Scissors, Speaker } from '../icons';
import { api } from '../api';
import { splitAtPlayhead, canSplitAt } from './actions';
import { previewSfx, sfxName, useSfxMeta } from './sfxAudio';

const ACCENT_TR: Record<string, string> = { orange: 'turuncu', sage: 'adaçayı', lav: 'lavanta', sky: 'gök', gold: 'altın', ink: 'mürekkep' };

function move<T>(xs: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = xs.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function Inspector({ project, onCloseProject }: { project: ReelProject; onCloseProject?: () => void }) {
  const sel = useStore((s) => s.selection);
  if (sel?.kind === 'sfx') {
    const i = project.sfx.findIndex((c) => c.id === sel.id);
    if (i >= 0) return <SfxInspector project={project} i={i} />;
  }
  if (sel?.kind === 'caption') {
    const i = project.captions.findIndex((c) => c.id === sel.id);
    if (i >= 0) return <CaptionInspector project={project} i={i} />;
  }
  if (sel?.kind === 'cut') {
    const i = project.edl.findIndex((c) => c.id === sel.id);
    if (i >= 0) return <CutInspector project={project} i={i} />;
  }
  if (sel?.kind === 'scene') {
    const i = project.scenes.findIndex((c) => c.id === sel.id);
    if (i >= 0) return <SceneInspector project={project} i={i} />;
  }
  return <ProjectInspector project={project} onClose={onCloseProject} />;
}

/** Seçili öğe başlığı: sağda sil ve seçimi kaldır (Esc). Carousel öğe paneliyle aynı düzen. */
export function Header({ title, onClose, onDelete, deleteDisabled }: { title: string; onClose?: () => void; onDelete?: () => void; deleteDisabled?: boolean }) {
  return (
    <div className="panel-h">
      <h2>{title}</h2>
      <div className="acts">
        {onDelete && (
          <button className="btn ghost small danger" onClick={onDelete} disabled={deleteDisabled} title="Sil (⌫)">
            <Trash size={15} /> Sil
          </button>
        )}
        {onClose && (
          <button className="btn ghost icon small" onClick={onClose} aria-label="Seçimi kaldır (Esc)" title="Seçimi kaldır (Esc)">
            <Close size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function CheckItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? 'ok' : 'warn'}>
      {ok ? <Check size={14} title="Uygun" /> : <Alert size={14} title="Dikkat" />}
      <span>{children}</span>
    </li>
  );
}

function CaptionInspector({ project, i }: { project: ReelProject; i: number }) {
  const c = project.captions[i];
  const { updateReel, select, setTime } = useStore.getState();
  const tl = useMemo(() => timeline(project.captions), [project.captions]);
  const words = c.text.trim().split(/\s+/).filter(Boolean);
  const set = (patch: Partial<Caption>, key?: string) => updateReel((p) => ({ ...p, captions: p.captions.map((k) => (k.id === c.id ? { ...k, ...patch } : k)) }), key);
  const emphCount = project.captions.filter((k) => k.emph).length;
  const emphOk = c.emph === null || c.text.includes(c.emph);

  return (
    <>
      <Header
        title={`Caption ${i + 1} / ${project.captions.length}`}
        onClose={() => select(null)}
        deleteDisabled={project.captions.length <= 1}
        onDelete={() => {
          updateReel((p) => ({ ...p, captions: p.captions.filter((k) => k.id !== c.id) }));
          select(null);
          setTime(tl.captions[Math.max(0, i - 1)].start);
        }}
      />
      <div className="section">
        <label className="field">
          <span>Metin</span>
          <input className="input" value={c.text} onChange={(e) => set({ text: e.target.value }, 'cap-text-' + c.id)} />
        </label>
        {words.length > 3 && <p className="warn">{words.length} kelime. Format en fazla 3 kelime istiyor; ikiye bölebilirsin.</p>}
        <div className="field">
          <span>Vurgu (turuncu kutu)</span>
          <div className="row wrap">
            <button className="btn small" aria-pressed={c.emph === null} onClick={() => set({ emph: null })}>
              Yok
            </button>
            {words.map((w, k) => (
              <button key={k} className="btn small" aria-pressed={c.emph === w} onClick={() => set({ emph: w })}>
                {w}
              </button>
            ))}
            {words.length > 1 && (
              <button className="btn small" aria-pressed={c.emph === c.text} onClick={() => set({ emph: c.text })}>
                Tümü
              </button>
            )}
          </div>
          {!emphOk && <p className="warn">Vurgu metinde geçmiyor: "{c.emph}"</p>}
          <p className="hint">
            Projede {emphCount} vurgu / {project.captions.length} parça. Ölçü: 40 parçada ~7–8.
          </p>
        </div>
        <div className="row">
          <label className="field grow">
            <span>Sahne</span>
            <select className="select" value={c.scene} onChange={(e) => set({ scene: Number(e.target.value) })}>
              {project.scenes.map((s, k) => (
                <option key={s.id} value={k + 1}>
                  {k + 1}. {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>Süre (sn)</span>
            <input
              className="input tnum"
              type="number"
              step={0.05}
              min={0.3}
              value={captionDur(c)}
              onChange={(e) => set({ dur: Math.max(0.3, Number(e.target.value) || 0.3) }, 'cap-dur-' + c.id)}
            />
          </label>
        </div>
        <p className="hint">
          <span className="tnum">
            {tl.captions[i].start.toFixed(2)}–{tl.captions[i].end.toFixed(2)} sn
          </span>
          {' · '}
          {c.dur === null ? (
            <>süre okuma formülünden ({formulaDur(c.text, c.emph)} sn).</>
          ) : (
            <>
              elle verilmiş süre.{' '}
              <button className="btn ghost small" onClick={() => set({ dur: null })}>
                Formüle dön ({formulaDur(c.text, c.emph)} sn)
              </button>
            </>
          )}
        </p>
      </div>
      <div className="section">
        <div className="row wrap">
          <button className="btn small" disabled={i === 0} onClick={() => updateReel((p) => ({ ...p, captions: move(p.captions, i, -1) }))}>
            Öne al
          </button>
          <button className="btn small" disabled={i === project.captions.length - 1} onClick={() => updateReel((p) => ({ ...p, captions: move(p.captions, i, 1) }))}>
            Arkaya al
          </button>
          <button
            className="btn small"
            onClick={() => {
              const id = newId('cap');
              updateReel((p) => {
                const caps = p.captions.slice();
                caps.splice(i + 1, 0, { id, text: 'yeni', emph: null, scene: c.scene, dur: null });
                return { ...p, captions: caps };
              });
              select({ kind: 'caption', id });
            }}
          >
            Sonrasına ekle
          </button>
          {words.length > 1 && (
            <button
              className="btn small"
              onClick={() => {
                const cut = Math.ceil(words.length / 2);
                const a = words.slice(0, cut).join(' '),
                  b = words.slice(cut).join(' ');
                updateReel((p) => {
                  const caps = p.captions.slice();
                  caps.splice(i, 1, { ...c, text: a, emph: c.emph && a.includes(c.emph) ? c.emph : null, dur: null }, { id: newId('cap'), text: b, emph: c.emph && b.includes(c.emph) ? c.emph : null, scene: c.scene, dur: null });
                  return { ...p, captions: caps };
                });
              }}
            >
              İkiye böl
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function CutInspector({ project, i }: { project: ReelProject; i: number }) {
  const c = project.edl[i];
  const clip = project.clips.find((k) => k.id === c.clip);
  const { updateReel, select } = useStore.getState();
  const set = (patch: Partial<typeof c>, key?: string) => updateReel((p) => ({ ...p, edl: p.edl.map((k) => (k.id === c.id ? { ...k, ...patch } : k)) }), key);
  const dup = project.edl.some((k, j) => j !== i && k.clip === c.clip && k.in < c.in + c.dur && c.in < k.in + k.dur);
  return (
    <>
      <Header
        title={`Kesit ${i + 1} / ${project.edl.length}`}
        onClose={() => select(null)}
        onDelete={() => {
          updateReel((p) => ({ ...p, edl: p.edl.filter((k) => k.id !== c.id) }));
          select(null);
        }}
      />
      <div className="section">
        <label className="field">
          <span>Klip</span>
          <select className="select" value={c.clip} onChange={(e) => set({ clip: e.target.value })}>
            {project.clips.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="field grow">
            <span>Giriş (sn)</span>
            <input className="input tnum" type="number" step={0.05} min={0} max={clip?.probe.duration} value={c.in} onChange={(e) => set({ in: Math.max(0, Number(e.target.value) || 0) }, 'cut-in-' + c.id)} />
          </label>
          <label className="field grow">
            <span>Süre (sn)</span>
            <input className="input tnum" type="number" step={0.05} min={0.2} value={c.dur} onChange={(e) => set({ dur: Math.max(0.2, Number(e.target.value) || 0.2) }, 'cut-dur-' + c.id)} />
          </label>
        </div>
        {clip && c.in + c.dur > clip.probe.duration + 0.01 && <p className="warn">Kesit klibin sonunu aşıyor ({clip.probe.duration.toFixed(2)} sn).</p>}
        {dup && <p className="warn">Bu kesit başka bir kesitle aynı görüntüyü kullanıyor. Format aynı kesiti tekrarlamamayı istiyor.</p>}
        <div className="field">
          <span>Kırpma</span>
          <div className="seg" role="group" aria-label="Kırpma türü">
            <button aria-pressed={c.kind === 'face'} onClick={() => set({ kind: 'face' })}>
              Yüz çekimi
            </button>
            <button aria-pressed={c.kind === 'hands'} onClick={() => set({ kind: 'hands' })}>
              El / masa
            </button>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="row wrap">
          <button className="btn small" disabled={i === 0} onClick={() => updateReel((p) => ({ ...p, edl: move(p.edl, i, -1) }))}>
            Öne al
          </button>
          <button className="btn small" disabled={i === project.edl.length - 1} onClick={() => updateReel((p) => ({ ...p, edl: move(p.edl, i, 1) }))}>
            Arkaya al
          </button>
          <SplitButton project={project} />
        </div>
      </div>
    </>
  );
}

function SceneInspector({ project, i }: { project: ReelProject; i: number }) {
  const sc = project.scenes[i];
  const { updateReel, select } = useStore.getState();
  const set = (patch: Partial<typeof sc>, key?: string) => updateReel((p) => ({ ...p, scenes: p.scenes.map((k) => (k.id === sc.id ? { ...k, ...patch } : k)) }), key);
  const caps = project.captions.filter((c) => c.scene === i + 1).length;
  return (
    <>
      <Header
        title={`Sahne ${i + 1}`}
        onClose={() => select(null)}
        deleteDisabled={caps > 0 || project.scenes.length <= 1}
        onDelete={() => {
          updateReel((p) => ({ ...p, scenes: p.scenes.filter((k) => k.id !== sc.id), captions: p.captions.map((k) => (k.scene > i + 1 ? { ...k, scene: k.scene - 1 } : k)) }));
          select(null);
        }}
      />
      <div className="section">
        <label className="field">
          <span>Ad</span>
          <input className="input" value={sc.name} onChange={(e) => set({ name: e.target.value }, 'sc-name-' + sc.id)} />
        </label>
        <div className="field">
          <span>Sağ üst chip</span>
          <div className="row">
            <input
              className="input grow"
              placeholder="ör. SUBAGENTS (boş = yok)"
              value={sc.chip?.label ?? ''}
              onChange={(e) => set({ chip: e.target.value ? { label: e.target.value, color: sc.chip?.color ?? 'orange' } : null }, 'sc-chip-' + sc.id)}
            />
            <select className="select" style={{ width: 120 }} disabled={!sc.chip} value={sc.chip?.color ?? 'orange'} onChange={(e) => sc.chip && set({ chip: { ...sc.chip, color: e.target.value as typeof sc.chip.color } })} aria-label="Chip rengi">
              {ACCENTS.map((a) => (
                <option key={a} value={a}>
                  {ACCENT_TR[a]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          Bu sahnede {caps} caption var; sahnenin süresi onlardan gelir. Çizim kodu <code>scenes.js</code> içinde <code>scene{i + 1}</code>.{caps > 0 && ' Silmek için önce caption’larını başka sahneye taşı.'}
        </p>
      </div>
    </>
  );
}

function ProjectInspector({ project, onClose }: { project: ReelProject; onClose?: () => void }) {
  const { updateReel } = useStore.getState();
  const tl = useMemo(() => timeline(project.captions), [project.captions]);
  const edl = edlDuration(project);
  const diff = Math.round((edl - tl.duration) * 100) / 100;
  const hookEnd = tl.captions.filter((c) => c.scene === 1).at(-1)?.end ?? 0;
  const hookWords = project.captions.filter((c) => c.scene === 1).reduce((s, c) => s + c.text.trim().split(/\s+/).length, 0);
  const emph = project.captions.filter((c) => c.emph).length;
  const over = project.captions.filter((c) => c.text.trim().split(/\s+/).length > 3).length;

  const checks: [boolean, string][] = [
    [tl.duration >= 35 && tl.duration <= 45, `Süre ${tl.duration.toFixed(1)} sn (hedef 35–45)`],
    [hookEnd <= 3.01, `Hook ${hookEnd.toFixed(2)} sn'de bitiyor (en geç 3 sn)`],
    [hookWords < 12, `Hook ${hookWords} kelime (12'nin altında)`],
    [over === 0, over ? `${over} caption 3 kelimeden uzun` : "Caption'lar en fazla 3 kelime"],
    [emph <= Math.ceil(project.captions.length * 0.22), `${emph} vurgu / ${project.captions.length} parça`],
    [project.edl.length === 0 || Math.abs(diff) < 0.05, project.edl.length === 0 ? 'Alt yarıda kesit yok' : diff === 0 ? 'Alt yarı süresi caption süresine eşit' : `Alt yarı ${Math.abs(diff).toFixed(2)} sn ${diff > 0 ? 'uzun' : 'kısa'}`],
  ];

  return (
    <>
      <Header title="Proje" onClose={onClose} />
      <div className="section">
        <label className="field">
          <span>Başlık</span>
          <input className="input" value={project.title} onChange={(e) => updateReel((p) => ({ ...p, title: e.target.value }), 'title')} />
        </label>
        <div className="row">
          <label className="field" style={{ width: 120 }}>
            <span>İçerik dünyası</span>
            <select className="select" value={project.header.world} onChange={(e) => updateReel((p) => ({ ...p, header: { ...p.header, world: e.target.value as typeof p.header.world } }))}>
              {WORLDS.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>Konu etiketi</span>
            <input className="input" value={project.header.topic} onChange={(e) => updateReel((p) => ({ ...p, header: { ...p.header, topic: e.target.value } }), 'topic')} />
          </label>
        </div>
        <div className="field">
          <span>Ses</span>
          <div className="seg" role="group" aria-label="Ses">
            <button aria-pressed={project.audio === 'silent'} onClick={() => updateReel((p) => ({ ...p, audio: 'silent' }))}>
              Sessiz (müzik Instagram'da)
            </button>
            <button aria-pressed={project.audio === 'speech'} onClick={() => updateReel((p) => ({ ...p, audio: 'speech' }))}>
              Konuşma korunur
            </button>
          </div>
        </div>
      </div>
      <div className="section">
        <h2 style={{ margin: 0, fontSize: 13 }}>Format kontrolü</h2>
        <ul className="checks">
          {checks.map(([ok, label]) => (
            <CheckItem key={label} ok={ok}>
              {label}
            </CheckItem>
          ))}
        </ul>
        {project.edl.length > 0 && Math.abs(diff) >= 0.05 && (
          <button
            className="btn small"
            onClick={() =>
              updateReel((p) => {
                const edl2 = p.edl.slice();
                const last = edl2[edl2.length - 1];
                edl2[edl2.length - 1] = { ...last, dur: Math.max(0.2, Math.round((last.dur - diff) * 100) / 100) };
                return { ...p, edl: edl2 };
              })
            }
          >
            Son kesiti caption süresine eşitle
          </button>
        )}
      </div>
      <ScenesSection project={project} />
    </>
  );
}

function ScenesSection({ project }: { project: ReelProject }) {
  const scenes = useStore((s) => s.scenes);
  const { updateReel, setScenes, select } = useStore.getState();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="section">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 13 }} className="grow">
          Sahneler
        </h2>
        <button
          className="btn small"
          onClick={() => {
            const id = newId('sc');
            updateReel((p) => ({ ...p, scenes: [...p.scenes, { id, name: `Sahne ${p.scenes.length + 1}`, chip: null }] }));
            select({ kind: 'scene', id });
          }}
        >
          Sahne ekle
        </button>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-2)' }}>
        {project.scenes.map((s) => (
          <li key={s.id}>
            <button className="btn ghost small" onClick={() => select({ kind: 'scene', id: s.id })}>
              {s.name}
            </button>
          </li>
        ))}
      </ol>
      <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Sahne kodunu gizle' : 'Sahne kodunu göster (scenes.js)'}
      </button>
      {open && (
        <>
          <textarea className="textarea tnum" rows={16} spellCheck={false} value={draft ?? scenes} onChange={(e) => setDraft(e.target.value)} aria-label="Sahne kodu" />
          <div className="row">
            <button className="btn small" disabled={draft === null || draft === scenes} onClick={() => (setScenes(draft!), setDraft(null))}>
              Kodu uygula
            </button>
            <button className="btn ghost small" disabled={draft === null} onClick={() => setDraft(null)}>
              Vazgeç
            </button>
          </div>
          <p className="hint">Çizim kodunu genelde Claude yazar. Buradaki değişiklik de geri alınabilir.</p>
        </>
      )}
    </div>
  );
}

function SplitButton({ project }: { project: ReelProject }) {
  const time = useStore((s) => s.time);
  return (
    <button className="btn small" disabled={!canSplitAt(project, time)} onClick={() => splitAtPlayhead()} title="Oynatma kafasında böl (B)">
      <Scissors size={15} /> Oynatma kafasında böl
    </button>
  );
}

function SfxInspector({ project, i }: { project: ReelProject; i: number }) {
  const s = project.sfx[i];
  const slug = useStore((st) => st.slug)!;
  const dur = useSfxMeta((m) => m.meta[s.src]?.dur);
  const { updateReel, select, setTime } = useStore.getState();
  const set = (patch: Partial<typeof s>, key?: string) => updateReel((p) => ({ ...p, sfx: p.sfx.map((k) => (k.id === s.id ? { ...k, ...patch } : k)) }), key);
  const tl = timeline(project.captions);
  return (
    <>
      <Header
        title={`Ses efekti: ${sfxName(s.src)}`}
        onClose={() => select(null)}
        onDelete={() => {
          updateReel((p) => ({ ...p, sfx: p.sfx.filter((k) => k.id !== s.id) }));
          select(null);
        }}
      />
      <div className="section">
        <div className="row">
          <label className="field grow">
            <span>Başlangıç (sn)</span>
            <input className="input tnum" type="number" step={0.05} min={0} value={s.at} onChange={(e) => set({ at: Math.max(0, Number(e.target.value) || 0) }, 'sfx-at-' + s.id)} />
          </label>
          <button className="btn small" style={{ alignSelf: 'end', minHeight: 32 }} onClick={() => set({ at: Math.round(useStore.getState().time * 1000) / 1000 })}>
            Oynatma kafasına al
          </button>
        </div>
        <label className="field">
          <span>
            Ses düzeyi <b className="tnum">{Math.round(s.gain * 100)}%</b>
          </span>
          <input type="range" min={0} max={2} step={0.05} value={s.gain} onChange={(e) => set({ gain: Number(e.target.value) }, 'sfx-gain-' + s.id)} aria-label="Ses düzeyi" />
        </label>
        <div className="row wrap">
          <button className="btn small" onClick={() => void previewSfx(s.src, api.mediaUrl(slug, s.src), s.gain)}>
            <Speaker size={15} /> Dinle
          </button>
          <button className="btn small" onClick={() => setTime(s.at)}>
            Başına git
          </button>
        </div>
        <p className="hint">
          {dur !== undefined && <>Süre {dur.toFixed(2)} sn. </>}
          {s.at >= tl.duration ? <span className="warn">Reel {tl.duration.toFixed(1)} sn'de bitiyor; bu efekt export'ta duyulmaz.</span> : project.audio === 'speech' ? 'Konuşma sesinin üstüne karışır.' : 'Sessiz reelde tek ses bu efektler olur.'}
        </p>
      </div>
    </>
  );
}
