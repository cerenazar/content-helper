import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  COL,
  SANS,
  MONO,
  HANDLES,
  bounds,
  intersects,
  rectFrom,
  resizeBox,
  snapMove,
  snapResize,
  windowContentRect,
  type Box,
  type Guide,
  type Handle,
  type ImageSource,
} from '@cb/renderer';
import { SLIDE, type CarouselProject, type Slide, type SlideElement } from '@cb/schema';
import { SlideCanvas } from './SlideCanvas';
import type { VideoInfo } from './media';
import { Play, Pause } from '../icons';

export type Zoom = 'fit' | number;

export const TEXT_TYPES: SlideElement['type'][] = ['title', 'text', 'pill', 'chip'];

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const boxStyle = (b: Box) => ({ left: pct(b.x, SLIDE.W), top: pct(b.y, SLIDE.H), width: pct(b.w, SLIDE.W), height: pct(b.h, SLIDE.H) });

const TYPE_TR: Record<SlideElement['type'], string> = {
  title: 'Başlık',
  text: 'Metin',
  chip: 'Chip',
  image: 'Görsel',
  agent: 'Pixel agent',
  window: 'Pencere',
  pill: 'CTA hapı',
};
export const typeLabel = (e: SlideElement, picks: boolean) =>
  e.type === 'image' && picks ? 'Logo / görsel' : e.type === 'window' && e.video ? 'Pencere (video)' : TYPE_TR[e.type];

export interface StageProps {
  project: CarouselProject;
  slide: Slide;
  index: number;
  media: Map<string, ImageSource>;
  picks: boolean;
  margin: number;
  selIds: string[];
  flash: Set<string>;
  overflow: Map<string, number>;
  setOverflow: (m: Map<string, number>) => void;
  selectIds: (ids: string[], primary?: string) => void;
  patchEls: (patches: Record<string, Partial<SlideElement>>, key?: string) => void;
  editing: string | null;
  setEditing: React.Dispatch<React.SetStateAction<string | null>>;
  zoom: Zoom;
  stageRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  playing: boolean;
  togglePlay: () => void;
  videoInfo: Map<string, VideoInfo>;
}

export function Stage(props: StageProps) {
  const { project, slide, index, media, picks, margin, selIds, flash, overflow, selectIds, patchEls, editing, setEditing, zoom, stageRef, scrollRef } = props;
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [stageW, setStageW] = useState(540);
  const frame = { W: SLIDE.W, H: SLIDE.H, margin };

  // Ekrandaki slayt genişliği (yerinde metin düzenleyicinin font ölçeği için).
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.getBoundingClientRect().width));
    ro.observe(el);
    setStageW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [stageRef]);

  // Düzenlenen metin canvas'ta gizlenir, yerine aynı ölçüdeki textarea görünür (hap zemini kalır).
  const drawProject = useMemo(() => {
    if (!editing) return project;
    return {
      ...project,
      slides: project.slides.map((s) => (s.id !== slide.id ? s : { ...s, elements: s.elements.map((e) => (e.id === editing ? { ...e, text: '' } : e)) })),
    };
  }, [project, editing, slide.id]);

  const scaleNow = () => SLIDE.W / stageRef.current!.getBoundingClientRect().width;
  const selected = slide.elements.filter((e) => selIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

  function track(onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) {
    const up = (e: PointerEvent) => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      onUp(e);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  function startMove(ev: React.PointerEvent, el: SlideElement) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (editing === el.id) return;
    if (ev.shiftKey) {
      // ⇧-tık: seçime ekle / çıkar
      const has = selIds.includes(el.id);
      selectIds(has ? selIds.filter((i) => i !== el.id) : [...selIds, el.id], has ? undefined : el.id);
      return;
    }
    const already = selIds.includes(el.id);
    const group = already && selIds.length > 1 ? selIds : [el.id];
    if (!already) selectIds([el.id]);
    const movers = slide.elements.filter((e) => group.includes(e.id) && !e.locked && !e.hidden);
    const scale = scaleNow();
    const starts = movers.map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h }));
    const box0 = bounds(starts);
    const others = slide.elements.filter((e) => !group.includes(e.id) && !e.hidden);
    const x0 = ev.clientX,
      y0 = ev.clientY;
    let moved = false;
    const key = 'move-' + group.join(',');
    track(
      (pe) => {
        if (!starts.length) return;
        if (!moved && Math.hypot(pe.clientX - x0, pe.clientY - y0) < 3) return;
        moved = true;
        const dx = (pe.clientX - x0) * scale,
          dy = (pe.clientY - y0) * scale;
        // ⌘ basılıyken yapışma kapalı (ince ayar için).
        const s = pe.metaKey ? { dx: 0, dy: 0, guides: [] } : snapMove({ ...box0, x: box0.x + dx, y: box0.y + dy }, others, frame, 6 * scale);
        patchEls(Object.fromEntries(starts.map((st) => [st.id, { x: Math.round(st.x + dx + s.dx), y: Math.round(st.y + dy + s.dy) }])), key);
        setGuides(s.guides);
      },
      () => {
        setGuides([]);
        // Çoklu seçimde sürüklemeden tıklanan öğe tek başına seçilir (Canva gibi).
        if (!moved && already && selIds.length > 1) selectIds([el.id]);
      },
    );
  }

  function startResize(ev: React.PointerEvent, el: SlideElement, h: Handle) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const scale = scaleNow();
    const start = { x: el.x, y: el.y, w: el.w, h: el.h };
    const others = slide.elements.filter((e) => e.id !== el.id && !e.hidden);
    const x0 = ev.clientX,
      y0 = ev.clientY;
    const ratioType = el.type === 'image' || el.type === 'window' || el.type === 'agent';
    track(
      (pe) => {
        const keep = pe.shiftKey && ratioType;
        let b = resizeBox(start, h, (pe.clientX - x0) * scale, (pe.clientY - y0) * scale, { keepAspect: keep, minW: 40, minH: 30 });
        let gs: Guide[] = [];
        if (!keep && !pe.metaKey) {
          const s = snapResize(b, h, others, frame, 6 * scale);
          b = s.box;
          gs = s.guides;
        }
        patchEls({ [el.id]: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } }, 'rz-' + el.id);
        setGuides(gs);
      },
      () => setGuides([]),
    );
  }

  // Boş alanda sürükle: seçim dikdörtgeni. Kısa tık: seçimi kaldır.
  function startMarquee(ev: React.PointerEvent) {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('.el-box, button, textarea, input, .rz')) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const scale = SLIDE.W / rect.width;
    const at = (cx: number, cy: number) => ({ x: (cx - rect.left) * scale, y: (cy - rect.top) * scale });
    const p0 = at(ev.clientX, ev.clientY);
    const base = ev.shiftKey ? selIds : [];
    const x0 = ev.clientX,
      y0 = ev.clientY;
    let moved = false;
    track(
      (pe) => {
        if (!moved && Math.hypot(pe.clientX - x0, pe.clientY - y0) < 4) return;
        moved = true;
        const p1 = at(pe.clientX, pe.clientY);
        const m = rectFrom(p0.x, p0.y, p1.x, p1.y);
        setMarquee(m);
        const hits = slide.elements.filter((e) => !e.hidden && !e.locked && intersects(m, e)).map((e) => e.id);
        selectIds([...new Set([...base, ...hits])]);
      },
      () => {
        setMarquee(null);
        if (!moved && !base.length) selectIds([]);
      },
    );
  }

  const k = stageW / SLIDE.W;
  const editEl = editing ? slide.elements.find((e) => e.id === editing) : undefined;
  const groupBox = selected.length > 1 ? bounds(selected.filter((e) => !e.hidden)) : null;

  return (
    <div className={'stage-scroll' + (zoom === 'fit' ? ' fit' : '')} ref={scrollRef} onPointerDown={startMarquee}>
      <div className="preview slide slide-stage" ref={stageRef} style={zoom === 'fit' ? undefined : { width: SLIDE.W * zoom }}>
        <SlideCanvas project={drawProject} index={index} images={media} onOverflow={props.setOverflow} live={props.playing} />
        {slide.elements.map((e) =>
          e.hidden ? null : (
            <div
              key={e.id}
              className={'el-box' + (flash.has(e.id) ? ' flash' : '') + (overflow.has(e.id) ? ' over' : '') + (e.locked ? ' locked' : '') + (editing === e.id ? ' editing' : '')}
              aria-selected={selIds.includes(e.id)}
              role="button"
              tabIndex={0}
              aria-label={`${typeLabel(e, picks)}: ${e.text || e.video?.split('/').pop() || e.src || ''}${e.locked ? ' (kilitli)' : ''}`}
              title={e.locked ? 'Kilitli: Katmanlar panelinden açabilirsin' : TEXT_TYPES.includes(e.type) ? 'Çift tıkla: metni düzenle' : undefined}
              style={boxStyle(e)}
              onPointerDown={(ev) => startMove(ev, e)}
              onDoubleClick={() => TEXT_TYPES.includes(e.type) && !e.locked && setEditing(e.id)}
              onFocus={(ev) => {
                // Klavyeyle (Tab) gelince seç; fareyle tıklama zaten pointerdown'da seçer.
                if (ev.currentTarget.matches(':focus-visible') && !selIds.includes(e.id)) selectIds([e.id]);
              }}
            >
              {e.type === 'window' && e.video && picks && (
                <VideoBadge el={e} info={props.videoInfo.get(e.video)} playing={props.playing} toggle={props.togglePlay} />
              )}
              {single?.id === e.id &&
                !e.locked &&
                editing !== e.id &&
                HANDLES.map((h) => <span key={h} className={'rz rz-' + h} aria-hidden onPointerDown={(ev) => startResize(ev, e, h)} />)}
            </div>
          ),
        )}
        {groupBox && <div className="group-box" aria-hidden style={boxStyle(groupBox)} />}
        <svg className="guides" viewBox={`0 0 ${SLIDE.W} ${SLIDE.H}`} preserveAspectRatio="none" aria-hidden>
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <line key={i} x1={g.pos} x2={g.pos} y1={g.from} y2={g.to} vectorEffect="non-scaling-stroke" />
            ) : (
              <line key={i} y1={g.pos} y2={g.pos} x1={g.from} x2={g.to} vectorEffect="non-scaling-stroke" />
            ),
          )}
          {marquee && <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} vectorEffect="non-scaling-stroke" />}
        </svg>
        {editEl && <InlineEditor key={editEl.id} el={editEl} picks={picks} k={k} onDone={(text) => (text !== editEl.text && patchEls({ [editEl.id]: { text } }), setEditing((c) => (c === editEl.id ? null : c)))} />}
      </div>
    </div>
  );
}

function VideoBadge({ el, info, playing, toggle }: { el: SlideElement; info?: VideoInfo; playing: boolean; toggle: () => void }) {
  const r = windowContentRect(el);
  const ready = info?.status === 'ready';
  // Pencere içindeki konum: video alanının sol altı (öğe kutusuna göre yüzde).
  const style = { left: pct(r.x - el.x + 18, el.w), bottom: pct(18, el.h) };
  if (!ready)
    return (
      <span className="vid-status" style={style} role="status">
        {info?.status === 'error' ? 'Video açılamadı' : 'Önizleme hazırlanıyor…'}
      </span>
    );
  return (
    <button
      className="vid-btn"
      style={style}
      aria-label={playing ? 'Videoyu durdur' : 'Videoyu oynat'}
      title={playing ? 'Videoyu durdur' : 'Videoyu oynat (sessiz önizleme)'}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => (e.stopPropagation(), toggle())}
    >
      {playing ? <Pause size={14} /> : <Play size={14} />}
      {info && info.duration > 60 && <span className="vid-note">ilk 60 sn</span>}
    </button>
  );
}

/** Canvas'taki yazıyla aynı font, boyut ve hizada yerinde metin düzenleyici. Esc ya da dışarı tık: kaydeder. */
function InlineEditor({ el, picks, k, onDone }: { el: SlideElement; picks: boolean; k: number; onDone: (text: string) => void }) {
  const [draft, setDraft] = useState(el.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const latest = useRef({ draft, onDone });
  latest.current = { draft, onDone };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    latest.current.onDone(latest.current.draft);
  };
  useEffect(() => {
    const ta = ref.current!;
    ta.focus();
    ta.select();
    done.current = false; // StrictMode çift çalıştırma
    // Slayt değişirse ya da öğe kaybolursa da kaydet.
    return () => {
      queueMicrotask(() => {
        if (!ta.isConnected) finish();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = el.type === 'title',
    pill = el.type === 'pill',
    chip = el.type === 'chip';
  const weight = picks ? (el.weight ?? (title ? 800 : pill ? 700 : 400)) : chip ? 800 : title ? 900 : 700;
  const lineH = picks ? (title ? 0.95 : 1.08) : 1.22;
  const family = picks ? '"Inter",sans-serif' : chip ? MONO : SANS;
  const color = picks
    ? pill
      ? '#FFFFFF'
      : (el.fill ?? (el.color === 'ink' ? '#FFFFFF' : COL[el.color]))
    : chip
      ? '#FFFFFF'
      : el.color === 'ink'
        ? COL.ink
        : COL[el.color];
  const size = el.size * k;
  const lines = Math.max(1, draft.split('\n').length);
  const padX = pill ? el.h * 0.32 * k : 0;
  const padY = pill ? Math.max(0, (el.h - lines * el.size * lineH) / 2) * k : 0;
  useLayoutEffect(() => {
    const ta = ref.current!;
    ta.style.height = 'auto';
    ta.style.height = Math.max(el.h * k, ta.scrollHeight) + 'px';
  }, [draft, el.h, k]);
  return (
    <textarea
      ref={ref}
      className="inline-edit"
      aria-label="Metni düzenle (Esc: bitir)"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
          e.preventDefault();
          ref.current!.blur();
        }
      }}
      style={{
        left: pct(el.x, SLIDE.W),
        top: pct(el.y, SLIDE.H),
        width: pct(el.w, SLIDE.W),
        font: `${weight} ${size}px/${lineH} ${family}`,
        letterSpacing: picks ? `${(title ? -0.03 : -0.01) * size}px` : undefined,
        color,
        textAlign: pill || chip ? 'center' : el.align,
        padding: `${padY}px ${padX}px 0`,
      }}
    />
  );
}
