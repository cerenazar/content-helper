import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { timeline, sceneRange, cutStarts, formulaDur, COL, trimCut, moveCut, dropIndex, snap, snapTargets, clampZoom, zoomScroll, moveSfx, ZOOM_MIN, ZOOM_MAX } from '@cb/renderer';
import type { ReelProject } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';
import { useSfxMeta, PEAK_RATE, sfxName } from './sfxAudio';
import { splitAtPlayhead, canSplitAt, deleteSelection } from './actions';
import { Scissors, Trash, Magnet, Minus, Plus, Keyboard } from '../icons';

const LABEL_W = 92;
/** Yapışma mesafesi (px). */
const SNAP_PX = 8;

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

/**
 * Sürükleme yardımcısı (pointer capture). 3 px'ten az hareket tıklama sayılır.
 * onMove: piksel farkı; onEnd: sürüklendi mi.
 */
function drag(e: React.PointerEvent, onMove: (dx: number) => void, onEnd?: (moved: boolean) => void) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const x0 = e.clientX;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    onMove(dx);
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    onEnd?.(moved);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

const r2 = (x: number) => Math.round(x * 100) / 100;
/** Kayan dalga çubukları: n sütun, değerler 0–1. */
function Bars({ n, value, color }: { n: number; value: (k: number) => number; color: string }) {
  return (
    <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: n }, (_, k) => {
        const h = Math.max(1, value(k) * 30);
        return <rect key={k} x={k + 0.15} y={(40 - h) / 2 + 4} width={0.7} height={h} fill={color} />;
      })}
    </svg>
  );
}

export function Timeline({ slug, project, onShortcuts }: { slug: string; project: ReelProject; onShortcuts: () => void }) {
  const [zoom, setZoom] = useState(42); // px / sn
  const [snapOn, setSnapOn] = useState(true);
  const [guide, setGuide] = useState<number | null>(null);
  const [tip, setTip] = useState<{ t: number; text: string } | null>(null);
  const [reorder, setReorderState] = useState<{ id: string; from: number; dx: number; to: number } | null>(null);
  const reorderRef = useRef(reorder);
  const setReorder = (r: typeof reorder) => {
    reorderRef.current = r;
    setReorderState(r);
  };
  const fitted = useRef(false);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const sel = useStore((s) => s.selection);
  const flash = useStore((s) => s.flash);
  const meta = useSfxMeta((s) => s.meta);
  const { select, updateReel, setTime, setPlaying } = useStore.getState();
  const tl = useMemo(() => timeline(project.captions), [project.captions]);
  const starts = useMemo(() => cutStarts(project), [project]);
  const waves = useWaves(slug, project);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingScroll = useRef<number | null>(null);

  const edlTotal = project.edl.reduce((s, c) => s + c.dur, 0);
  const sfxEnd = project.sfx.reduce((m, s) => Math.max(m, s.at + (meta[s.src]?.dur ?? 0.3)), 0);
  const total = Math.max(tl.duration, edlTotal, sfxEnd, 46) + 2;
  const width = total * zoom;
  const x = (t: number) => t * zoom;
  const tol = SNAP_PX / zoom;

  // ---- Yakınlaştırma ----
  const zoomTo = (z1: number, anchorX?: number) => {
    const el = scrollRef.current;
    const z0 = zoomRef.current;
    const z = clampZoom(z1);
    if (!el || Math.abs(z - z0) < 0.01) return;
    const view = el.clientWidth - LABEL_W;
    const ax = anchorX ?? Math.min(Math.max(0, useStore.getState().time * z0 - el.scrollLeft), view);
    pendingScroll.current = zoomScroll(el.scrollLeft, ax, z0, z);
    setZoom(z);
  };
  const fit = () => {
    const el = scrollRef.current;
    if (!el) return;
    pendingScroll.current = 0;
    setZoom(clampZoom((el.clientWidth - LABEL_W - 24) / Math.max(Math.max(tl.duration, edlTotal, sfxEnd) + 1, 8)));
  };
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [zoom]);

  // İlk açılışta tüm videoyu görünür sığdır
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ctrl + tekerlek ya da trackpad pinch: imlecin altındaki anı sabit tutarak yakınlaştır
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), Math.max(0, e.clientX - r.left - LABEL_W));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘+ ⌘− ⌘0 ve N (yapışma)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') zoomTo(zoomRef.current * 1.5);
        else if (e.key === '-' || e.key === '_') zoomTo(zoomRef.current / 1.5);
        else if (e.key === '0') fit();
        else return;
        e.preventDefault();
      } else if (!e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setSnapOn((v) => !v);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.duration, edlTotal, sfxEnd]);

  // Oynatma kafasını görünür tut
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const px = x(time);
    const view = el.clientWidth - LABEL_W;
    if (px < el.scrollLeft || px > el.scrollLeft + view - 40) el.scrollLeft = Math.max(0, px - (playing ? 40 : view / 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const lane = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPlaying(false);
    const at = (cx: number) => setTime(Math.max(0, Math.min(tl.duration, (cx - lane.left) / zoomRef.current)));
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

  /** Hedeflere yapıştırır, kılavuz çizgiyi gösterir. */
  const snapTo = (t: number, targets: number[]) => {
    if (!snapOn) return t;
    const r = snap(t, targets, tol);
    setGuide(r.to);
    return r.t;
  };
  const endDrag = () => {
    setGuide(null);
    setTip(null);
  };

  // Cetvel: aralık ~60 px'ten sık olmasın
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30].find((s) => s * zoom >= 56) ?? 60;
  const ticks = [];
  for (let k = 0; k * step <= total; k++) {
    const s = k * step;
    ticks.push(
      <div key={k} className="tl-tick" style={{ left: x(s) }}>
        {step < 1 ? s.toFixed(1) : Math.round(s)}
      </div>,
    );
  }

  // SFX'ler üst üste binerse alt satırlara dağıt
  const sfxLanes = useMemo(() => {
    const ends: number[] = [];
    const lane = new Map<string, number>();
    for (const s of [...project.sfx].sort((a, b) => a.at - b.at)) {
      const d = meta[s.src]?.dur ?? 0.3;
      let k = ends.findIndex((e) => e <= s.at + 0.001);
      if (k < 0) k = ends.length;
      ends[k] = s.at + d;
      lane.set(s.id, k);
    }
    return { lane, count: Math.max(1, ends.length) };
  }, [project.sfx, meta]);

  // Sürüklenen kesitin bırakılacağı yer (çizgi)
  const dropX = reorder
    ? (() => {
        const rest = project.edl.filter((_, i) => i !== reorder.from);
        return x(rest.slice(0, reorder.to).reduce((s, c) => s + c.dur, 0));
      })()
    : null;

  const canSplit = canSplitAt(project, time);
  const canDelete = !!sel && (sel.kind === 'cut' || sel.kind === 'sfx' || (sel.kind === 'caption' && project.captions.length > 1));
  const zoomPos = Math.round((Math.log(zoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 100);

  return (
    <div className="bottom tl-wrap">
      <div className="tl-tools" role="toolbar" aria-label="Timeline araçları">
        <button className="btn small" onClick={() => splitAtPlayhead()} disabled={!canSplit} title="Oynatma kafasında böl (B)">
          <Scissors size={15} /> Böl
        </button>
        <button className="btn small" onClick={() => deleteSelection()} disabled={!canDelete} title="Seçiliyi sil (⌫). Kesitte boşluk kapanır.">
          <Trash size={15} /> Sil
        </button>
        <button className="btn small" aria-pressed={snapOn} onClick={() => setSnapOn(!snapOn)} title="Yapışma: oynatma kafasına, kesit ve caption kenarlarına (N)">
          <Magnet size={15} /> Yapışma
        </button>
        <span className="grow" />
        <button className="btn ghost icon small" onClick={() => zoomTo(zoom / 1.5)} aria-label="Uzaklaştır (⌘−)" title="Uzaklaştır (⌘−)">
          <Minus size={15} />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={zoomPos}
          onChange={(e) => zoomTo(ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, Number(e.target.value) / 100))}
          aria-label="Timeline yakınlaştırma"
          className="tl-zoom"
        />
        <button className="btn ghost icon small" onClick={() => zoomTo(zoom * 1.5)} aria-label="Yakınlaştır (⌘+)" title="Yakınlaştır (⌘+)">
          <Plus size={15} />
        </button>
        <button className="btn ghost small" onClick={fit} title="Tümünü sığdır (⌘0)">
          Sığdır
        </button>
        <button className="btn ghost icon small" onClick={onShortcuts} aria-label="Klavye kısayolları (?)" title="Klavye kısayolları (?)">
          <Keyboard size={16} />
        </button>
      </div>
      <div className="timeline" ref={scrollRef}>
        <div className="tl-inner" style={{ width: width + LABEL_W }}>
          <div className="tl-ruler" onPointerDown={scrub} role="slider" aria-label="Oynatma konumu" aria-valuemin={0} aria-valuemax={tl.duration} aria-valuenow={Number(time.toFixed(2))} tabIndex={-1}>
            <div className="tl-corner" aria-hidden />
            <div className="tl-band" style={{ left: x(35), width: x(10) }} title="Hedef süre 35–45 sn" />
            <div className="tl-hook" style={{ left: x(3) }} />
            {ticks}
          </div>

          {/* Sahneler (caption'ların sahne numarasından türetilir) */}
          <div className="tl-track scenes">
            <div className="tl-label">Sahne</div>
            <div className="tl-lane" onPointerDown={scrub}>
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
            <div className="tl-lane" onPointerDown={scrub}>
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
                        const targets = snapTargets(project, time, project.captions.slice(i).map((k) => k.id));
                        select({ kind: 'caption', id: c.id });
                        drag(
                          e,
                          (dx) => {
                            const end = snapTo(c.start + d0 + dx / zoom, targets);
                            const d = Math.max(0.3, r2(end - c.start));
                            setTip({ t: c.start + d, text: `${d.toFixed(2)} sn` });
                            updateReel((p) => ({ ...p, captions: p.captions.map((k) => (k.id === cap.id ? { ...k, dur: d } : k)) }), 'cap-dur-' + cap.id);
                          },
                          endDrag,
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Video: alt yarı kesitleri + ses dalgası */}
          <div className="tl-track cuts">
            <div className="tl-label">Video</div>
            <div className="tl-lane" onPointerDown={scrub}>
              {project.edl.map((cut, i) => {
                const clip = project.clips.find((c) => c.id === cut.clip);
                const peaks = waves[cut.clip];
                const w = Math.max(6, x(cut.dur) - 2);
                const n = Math.max(1, Math.floor(w / 3));
                const dragging = reorder?.id === cut.id;
                const edge = (side: 'l' | 'r') => (e: React.PointerEvent) => {
                  const edl0 = project.edl;
                  const start = starts[i];
                  const end0 = start + cut.dur;
                  // Ripple: bu kesit ve sonrakiler kayar; hedeflerden çıkar
                  const targets = snapTargets(project, time, project.edl.slice(i).map((k) => k.id));
                  select({ kind: 'cut', id: cut.id });
                  drag(
                    e,
                    (dx) => {
                      // İki kenarda da kesitin timeline'daki bitişi hareket eder; ona yapıştır.
                      const raw = side === 'r' ? end0 + dx / zoom : end0 - dx / zoom;
                      const end = snapTo(raw, targets);
                      const dt = side === 'r' ? end - end0 : end0 - end;
                      const c2 = trimCut(edl0, project.clips, cut.id, side, dt).find((k) => k.id === cut.id)!;
                      setTip({ t: start + c2.dur, text: `giriş ${c2.in.toFixed(2)} · süre ${c2.dur.toFixed(2)} sn` });
                      updateReel((p) => ({ ...p, edl: trimCut(edl0, p.clips, cut.id, side, dt) }), `cut-${side}-${cut.id}`);
                    },
                    endDrag,
                  );
                };
                return (
                  <div
                    key={cut.id}
                    role="button"
                    tabIndex={0}
                    className={'blk cut' + (flash.has(cut.id) ? ' flash' : '') + (dragging ? ' dragging' : '')}
                    aria-selected={sel?.kind === 'cut' && sel.id === cut.id}
                    aria-label={`Kesit ${i + 1}: ${clip?.name ?? 'klip yok'}, ${cut.dur.toFixed(2)} sn`}
                    style={{ left: x(starts[i]), width: w, transform: dragging ? `translateX(${reorder!.dx}px)` : undefined }}
                    onPointerDown={(e) => {
                      const edl0 = project.edl;
                      const mid = starts[i] + cut.dur / 2;
                      drag(
                        e,
                        (dx) => setReorder({ id: cut.id, from: i, dx, to: dropIndex(edl0, i, mid + dx / zoomRef.current) }),
                        (moved) => {
                          const r = reorderRef.current;
                          setReorder(null);
                          if (!moved) {
                            select({ kind: 'cut', id: cut.id });
                            setTime(starts[i] + 0.01);
                          } else if (r && r.to !== r.from) {
                            updateReel((p) => ({ ...p, edl: moveCut(p.edl, r.from, r.to) }));
                            select({ kind: 'cut', id: cut.id });
                          }
                        },
                      );
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && select({ kind: 'cut', id: cut.id })}
                  >
                    <span className="cut-meta">
                      {i + 1}. {clip?.name ?? 'klip yok'} · {cut.in.toFixed(1)} sn · {cut.kind === 'face' ? 'yüz' : 'el/masa'}
                    </span>
                    {peaks && <Bars n={n} color="rgba(127,176,220,0.55)" value={(k) => peaks[Math.floor((cut.in + (k / n) * cut.dur) * 50)] ?? 0} />}
                    <span className="handle l" aria-hidden onPointerDown={edge('l')} />
                    <span className="handle r" aria-hidden onPointerDown={edge('r')} />
                  </div>
                );
              })}
              {dropX !== null && <div className="tl-drop" style={{ left: dropX }} aria-hidden />}
              {project.edl.length === 0 && <div className="tl-empty hint">Soldaki Medya panelinden video ekleyip kesit oluştur.</div>}
            </div>
          </div>

          {/* SFX */}
          <div className="tl-track sfx" style={{ height: 12 + sfxLanes.count * 30 }}>
            <div className="tl-label">SFX</div>
            <div className="tl-lane" onPointerDown={scrub}>
              {project.sfx.map((s) => {
                const m = meta[s.src];
                const d = m?.dur ?? 0.3;
                const w = Math.max(14, x(d));
                const n = Math.max(1, Math.floor(w / 3));
                const lane = sfxLanes.lane.get(s.id) ?? 0;
                const name = sfxName(s.src);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className={'blk sfx' + (flash.has(s.id) ? ' flash' : '')}
                    aria-selected={sel?.kind === 'sfx' && sel.id === s.id}
                    aria-label={`Ses efekti ${name}, ${s.at.toFixed(2)} sn`}
                    title={`${name} · ${s.at.toFixed(2)} sn`}
                    style={{ left: x(s.at), width: w, top: 6 + lane * 30, height: 26, bottom: 'auto' }}
                    onPointerDown={(e) => {
                      const at0 = s.at;
                      const targets = snapTargets(project, time, [s.id]);
                      drag(
                        e,
                        (dx) => {
                          const at = Math.max(0, snapTo(at0 + dx / zoomRef.current, targets));
                          setTip({ t: at, text: `${at.toFixed(2)} sn` });
                          updateReel((p) => ({ ...p, sfx: moveSfx(p.sfx, s.id, at) }), 'sfx-at-' + s.id);
                        },
                        (moved) => {
                          endDrag();
                          select({ kind: 'sfx', id: s.id });
                          if (!moved) setTime(s.at);
                        },
                      );
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && select({ kind: 'sfx', id: s.id })}
                  >
                    {m && <Bars n={n} color="rgba(143,191,138,0.6)" value={(k) => m.peaks[Math.floor(((k / n) * d) * PEAK_RATE)] ?? 0} />}
                    <span className="sfx-name">{name}</span>
                  </div>
                );
              })}
              {project.sfx.length === 0 && <div className="tl-empty hint">Medya panelindeki Ses sekmesinden efekt ekle.</div>}
            </div>
          </div>

          {guide !== null && <div className="tl-guide" style={{ left: LABEL_W + x(guide) }} aria-hidden />}
          {tip && (
            <div className="tl-tip tnum" style={{ left: LABEL_W + x(tip.t) }} role="status">
              {tip.text}
            </div>
          )}
          <div className="playhead" style={{ left: LABEL_W + x(time) }} />
        </div>
      </div>
    </div>
  );
}

export { formulaDur };
