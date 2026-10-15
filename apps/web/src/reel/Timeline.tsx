import { useEffect, useMemo, useRef, useState } from 'react';
import { timeline, sceneRange, cutStarts, formulaDur, COL } from '@cb/renderer';
import type { ReelProject } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';

const LABEL_W = 92;

function useWaves(slug: string, p: ReelProject) {
  const [waves, setWaves] = useState<Record<string, number[]>>({});
  const ids = p.clips.map((c) => c.id).join(',');
  useEffect(() => {
    for (const c of p.clips)
      if (!waves[c.id] && c.probe.hasAudio)
        api
          .wave(slug, c.id)
          .then((r) => setWaves((w) => ({ ...w, [c.id]: r.peaks })))
          .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, slug]);
  return waves;
}

/** Sürükleme yardımcısı: pointer capture ile, saniye farkını verir. */
function drag(e: React.PointerEvent, pxPerSec: number, onMove: (dt: number) => void) {
  e.stopPropagation();
  e.preventDefault();
  const x0 = e.clientX;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / pxPerSec);
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function Timeline({ slug, project }: { slug: string; project: ReelProject }) {
  const [zoom, setZoom] = useState(42); // px / sn
  const fitted = useRef(false);
  const time = useStore((s) => s.time);
  const sel = useStore((s) => s.selection);
  const flash = useStore((s) => s.flash);
  const { select, updateReel, setTime, setPlaying } = useStore.getState();
  const tl = useMemo(() => timeline(project.captions), [project.captions]);
  const starts = useMemo(() => cutStarts(project), [project]);
  const waves = useWaves(slug, project);
  const scrollRef = useRef<HTMLDivElement>(null);

  const edlTotal = project.edl.reduce((s, c) => s + c.dur, 0);
  const total = Math.max(tl.duration, edlTotal, 46) + 2;
  const width = total * zoom;
  const x = (t: number) => t * zoom;

  // İlk açılışta tüm videoyu görünür sığdır
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fitted.current) return;
    fitted.current = true;
    setZoom(Math.max(14, Math.min(140, Math.floor((el.clientWidth - LABEL_W - 16) / Math.max(tl.duration + 2, 12)))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Oynatma kafasını görünür tut
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const px = LABEL_W + x(time);
    if (px < el.scrollLeft + LABEL_W || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, zoom]);

  const scrub = (e: React.PointerEvent) => {
    const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPlaying(false);
    const at = (cx: number) => setTime(Math.max(0, Math.min(tl.duration, (cx - lane.left) / zoom)));
    at(e.clientX);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const ticks = [];
  const step = zoom > 60 ? 1 : zoom > 25 ? 2 : 5;
  for (let s = 0; s <= total; s += step)
    ticks.push(
      <div key={s} className="tl-tick" style={{ left: x(s) }}>
        {s}
      </div>,
    );

  return (
    <div className="bottom" style={{ display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <div className="tl-tools">
        <span className="hint">Kenarları sürükleyerek süre değiştir. Boşluğa tıklayınca oynatma kafası oraya gider.</span>
        <span className="grow" />
        <label className="row hint">
          Yakınlaştır
          <input type="range" min={14} max={140} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline yakınlaştırma" />
        </label>
      </div>
      <div className="timeline" ref={scrollRef}>
        <div className="tl-inner" style={{ width: width + LABEL_W }}>
          <div className="tl-ruler" onPointerDown={scrub} role="slider" aria-label="Oynatma konumu" aria-valuemin={0} aria-valuemax={tl.duration} aria-valuenow={Number(time.toFixed(2))} tabIndex={-1}>
            <div className="tl-band" style={{ left: x(35), width: x(10) }} title="Hedef süre 35–45 sn" />
            <div className="tl-hook" style={{ left: x(3) }} />
            {ticks}
          </div>

          {/* Sahneler (caption'ların sahne numarasından türetilir) */}
          <div className="tl-track">
            <div className="tl-label">Sahneler</div>
            <div className="tl-lane" style={{ left: 0 }} onPointerDown={scrub}>
              {project.scenes.map((sc, i) => {
                const r = sceneRange(tl, i, project.scenes.length);
                if (!r) return null;
                const end = Math.min(r[1], tl.duration);
                return (
                  <button
                    key={sc.id}
                    className={'blk scene' + (flash.has(sc.id) ? ' flash' : '')}
                    aria-selected={sel?.kind === 'scene' && sel.id === sc.id}
                    style={{ left: x(r[0]), width: Math.max(8, x(end - r[0]) - 2) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      select({ kind: 'scene', id: sc.id });
                      setTime(r[0]);
                    }}
                  >
                    {i + 1}. {sc.name}
                    {sc.chip && (
                      <span className="sc-chip" style={{ background: COL[sc.chip.color === 'ink' ? 'ink' : sc.chip.color] }}>
                        {sc.chip.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caption'lar */}
          <div className="tl-track caps">
            <div className="tl-label">Caption</div>
            <div className="tl-lane" style={{ left: 0 }} onPointerDown={scrub}>
              {tl.captions.map((c, i) => {
                const cap = project.captions[i];
                const words = c.text.trim().split(/\s+/).length;
                const parts = c.emph && c.text.includes(c.emph) ? c.text.split(c.emph) : null;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={'blk cap' + (flash.has(c.id) ? ' flash' : '') + (words > 3 ? ' over' : '')}
                    aria-selected={sel?.kind === 'caption' && sel.id === c.id}
                    aria-label={`Caption ${i + 1}: ${c.text}`}
                    title={words > 3 ? `${words} kelime (en fazla 3)` : c.text}
                    style={{ left: x(c.start), width: Math.max(6, x(c.end - c.start) - 2) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      select({ kind: 'caption', id: c.id });
                      // Giriş animasyonu (0.18 sn) bitmiş hâli göster
                      setTime(Math.min(c.end - 0.01, c.start + 0.2));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && select({ kind: 'caption', id: c.id })}
                  >
                    <span className="pill">
                      {parts ? (
                        <>
                          {parts[0]}
                          <em>{c.emph}</em>
                          {parts.slice(1).join(c.emph!)}
                        </>
                      ) : (
                        c.text
                      )}
                    </span>
                    <span
                      className="handle r"
                      aria-hidden
                      onPointerDown={(e) => {
                        const d0 = c.end - c.start;
                        select({ kind: 'caption', id: c.id });
                        drag(e, zoom, (dt) =>
                          updateReel(
                            (p) => ({ ...p, captions: p.captions.map((k) => (k.id === cap.id ? { ...k, dur: Math.max(0.3, r2(d0 + dt)) } : k)) }),
                            'cap-dur-' + cap.id,
                          ),
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alt yarı kesitleri + ses dalgası */}
          <div className="tl-track cuts">
            <div className="tl-label">Alt yarı</div>
            <div className="tl-lane" style={{ left: 0 }} onPointerDown={scrub}>
              {project.edl.map((cut, i) => {
                const clip = project.clips.find((c) => c.id === cut.clip);
                const peaks = waves[cut.clip];
                const w = Math.max(6, x(cut.dur) - 2);
                const n = Math.max(1, Math.floor(w / 3));
                return (
                  <div
                    key={cut.id}
                    role="button"
                    tabIndex={0}
                    className={'blk cut' + (flash.has(cut.id) ? ' flash' : '')}
                    aria-selected={sel?.kind === 'cut' && sel.id === cut.id}
                    aria-label={`Kesit ${i + 1}`}
                    style={{ left: x(starts[i]), width: w }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      select({ kind: 'cut', id: cut.id });
                      setTime(starts[i] + 0.01);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && select({ kind: 'cut', id: cut.id })}
                  >
                    <span className="cut-meta">
                      {i + 1}. {clip?.name ?? 'klip yok'} · {cut.in.toFixed(1)} sn · {cut.kind === 'face' ? 'yüz' : 'el/masa'}
                    </span>
                    {peaks && (
                      <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none" aria-hidden>
                        {Array.from({ length: n }, (_, k) => {
                          const t = cut.in + (k / n) * cut.dur;
                          const v = peaks[Math.floor(t * 50)] ?? 0;
                          const h = Math.max(1, v * 26);
                          return <rect key={k} x={k + 0.15} y={40 - 4 - h} width={0.7} height={h} fill="rgba(127,176,220,0.55)" />;
                        })}
                      </svg>
                    )}
                    <span
                      className="handle l"
                      aria-hidden
                      onPointerDown={(e) => {
                        const { in: in0, dur: d0 } = cut;
                        select({ kind: 'cut', id: cut.id });
                        drag(e, zoom, (dt) => {
                          const d = Math.max(-in0, Math.min(d0 - 0.2, dt));
                          updateReel((p) => ({ ...p, edl: p.edl.map((k) => (k.id === cut.id ? { ...k, in: r2(in0 + d), dur: r2(d0 - d) } : k)) }), 'cut-l-' + cut.id);
                        });
                      }}
                    />
                    <span
                      className="handle r"
                      aria-hidden
                      onPointerDown={(e) => {
                        const d0 = cut.dur;
                        const max = clip ? clip.probe.duration - cut.in : Infinity;
                        select({ kind: 'cut', id: cut.id });
                        drag(e, zoom, (dt) =>
                          updateReel((p) => ({ ...p, edl: p.edl.map((k) => (k.id === cut.id ? { ...k, dur: r2(Math.max(0.2, Math.min(max, d0 + dt))) } : k)) }), 'cut-r-' + cut.id),
                        );
                      }}
                    />
                  </div>
                );
              })}
              {project.edl.length === 0 && (
                <div className="hint" style={{ position: 'absolute', left: 12, top: 18 }}>
                  Soldaki Medya panelinden video ekleyip kesit oluştur.
                </div>
              )}
            </div>
          </div>
          <div className="playhead" style={{ left: LABEL_W + x(time) }} />
        </div>
      </div>
    </div>
  );
}

export { formulaDur };
