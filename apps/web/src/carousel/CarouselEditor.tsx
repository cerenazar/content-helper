import { useEffect, useRef, useState } from 'react';
import { slideEl as el, picksCoverSlide, picksPickSlide, moveItem, reorderZ, pasteOffset, slideVideos, type ImageSource, type ZOp } from '@cb/renderer';
import { SLIDE, newId, type CarouselProject, type Slide, type SlideElement } from '@cb/schema';
import { useStore, selectedElementIds } from '../store';
import { api } from '../api';
import { TopBar } from '../Editor';
import { ChevronLeft, ChevronRight, Alert, Copy, Trash } from '../icons';
import { ZoomIn, ZoomOut } from './icons';
import { useImages, useVideos } from './media';
import { Stage, TEXT_TYPES, type Zoom } from './Stage';
import { Layers } from './Layers';
import { SlideStrip } from './SlideStrip';
import { ElementInspector, MultiInspector, CarouselInspector, pickImage, pickVideo } from './Inspectors';
import './carousel.css';

/** Uygulama içi pano (⌘C/⌘V): öğeler slaytlar arasında taşınabilir. */
const clipboard: { els: SlideElement[]; from: string | null; pastes: number } = { els: [], from: null, pastes: 0 };

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

const cloneEl = (e: SlideElement, d: number): SlideElement => ({ ...e, id: newId('el'), x: e.x + d, y: e.y + d, locked: false });

export function CarouselEditor({ slug, claudePanel, claudeRunning }: { slug: string; claudePanel: React.ReactNode; claudeRunning: boolean }) {
  const project = useStore((s) => s.project) as CarouselProject;
  const sel = useStore((s) => s.selection);
  const flash = useStore((s) => s.flash);
  const jobs = useStore((s) => s.jobs);
  const { updateCarousel, select } = useStore.getState();
  const [tab, setTab] = useState<'edit' | 'claude'>('edit');
  const [exportJob, setExportJob] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [playing, setPlaying] = useState(false);
  const images = useImages(slug, project);
  const videos = useVideos(slug, project);
  const [overflow, setOverflowState] = useState<Map<string, number>>(new Map());
  const setOverflow = (m: Map<string, number>) => {
    const key = (x: Map<string, number>) => JSON.stringify([...x]);
    setOverflowState((prev) => (key(prev) === key(m) ? prev : m));
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const slideId = sel?.kind === 'slide' ? sel.id : sel?.kind === 'element' ? sel.slide : project.slides[0].id;
  const index = Math.max(0, project.slides.findIndex((s) => s.id === slideId));
  const slide = project.slides[index];
  const picks = project.style === 'picks';
  const margin = picks ? 76 : 72;
  const selIds = selectedElementIds(sel).filter((id) => slide.elements.some((e) => e.id === id));
  const selEls = slide.elements.filter((e) => selIds.includes(e.id));
  const primary = sel?.kind === 'element' ? slide.elements.find((e) => e.id === sel.id) : undefined;
  const vids = slideVideos(project, index);

  // Görseller + oynatılan videoların son karesi: aynı renderer'a görsel gibi verilir.
  const media = new Map<string, ImageSource>([...images, ...videos.frames]);

  useEffect(() => {
    if (claudeRunning) setTab('claude');
  }, [claudeRunning]);

  // Slayt değişince düzenleme biter, videolar durur.
  useEffect(() => {
    setEditing(null);
    setPlaying(false);
  }, [slide.id]);

  // Oynat/durdur: yalnız bu slaydın videoları oynar (sessiz önizleme).
  const vidKey = vids.map((v) => v.video).join('\n');
  useEffect(() => {
    for (const v of vids) {
      const node = videos.element(v.video!);
      if (!node) continue;
      if (playing) void node.play().catch(() => setPlaying(false));
      else node.pause();
    }
    return () => {
      for (const v of vids) videos.element(v.video!)?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, vidKey, videos.frames.size]);

  // ---- düzenleme işlemleri ----
  const setSlide = (fn: (s: Slide) => Slide, key?: string) =>
    updateCarousel((p) => ({ ...p, slides: p.slides.map((s) => (s.id === slide.id ? fn(s) : s)) }), key);
  const setElements = (fn: (els: SlideElement[]) => SlideElement[], key?: string) => setSlide((s) => ({ ...s, elements: fn(s.elements) }), key);
  const patchEls = (patches: Record<string, Partial<SlideElement>>, key?: string) =>
    setElements((els) => els.map((e) => (patches[e.id] ? { ...e, ...patches[e.id] } : e)), key);
  const setEl = (id: string, patch: Partial<SlideElement>, key?: string) => patchEls({ [id]: patch }, key);

  const selectIds = (ids: string[], primaryId?: string) => {
    if (!ids.length) return select({ kind: 'slide', id: slide.id });
    const id = primaryId && ids.includes(primaryId) ? primaryId : ids[ids.length - 1];
    select(ids.length === 1 ? { kind: 'element', slide: slide.id, id } : { kind: 'element', slide: slide.id, id, ids });
  };

  const addEls = (els: SlideElement[]) => {
    setElements((cur) => [...cur, ...els]);
    selectIds(els.map((e) => e.id));
  };
  const addEl = (n: SlideElement) => addEls([n]);

  const deleteSelected = () => {
    const del = new Set(selEls.filter((e) => !e.locked).map((e) => e.id));
    if (!del.size) return;
    setElements((els) => els.filter((e) => !del.has(e.id)));
    selectIds(selIds.filter((id) => !del.has(id)));
  };
  const zorder = (op: ZOp) => selIds.length && setElements((els) => reorderZ(els, selIds, op));

  const insertSlide = (n: Slide, at = index + 1) => {
    updateCarousel((p) => {
      const sl = p.slides.slice();
      sl.splice(at, 0, n);
      return { ...p, slides: sl };
    });
    select({ kind: 'slide', id: n.id });
  };
  const blankSlide = (): Slide =>
    picks
      ? picksPickSlide(slide.accent)
      : { id: newId('sl'), bg: null, accent: null, elements: [el({ type: 'title', text: 'Yeni slayt', size: 88, y: 300, h: 140 })] };
  const strip = {
    select: (i: number) => select({ kind: 'slide', id: project.slides[i].id }),
    move: (from: number, to: number) => updateCarousel((p) => ({ ...p, slides: moveItem(p.slides, from, to) })),
    duplicate: (i: number) => {
      const s = project.slides[i];
      insertSlide({ ...s, id: newId('sl'), elements: s.elements.map((e) => ({ ...e, id: newId('el') })) }, i + 1);
    },
    remove: (i: number) => {
      if (project.slides.length <= 1) return;
      const s = project.slides[i];
      updateCarousel((p) => ({ ...p, slides: p.slides.filter((x) => x.id !== s.id) }));
      select({ kind: 'slide', id: project.slides[i === 0 ? 1 : i - 1].id });
    },
    addAfter: (i: number) => insertSlide(blankSlide(), i + 1),
  };

  // ---- yakınlaştırma ----
  const currentScale = () => (zoom === 'fit' ? (stageRef.current?.getBoundingClientRect().width ?? 540) / SLIDE.W : zoom);
  const zoomBy = (dir: 1 | -1) => {
    const s = currentScale();
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > s + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < s - 0.01);
    if (next) setZoom(next);
  };

  // ---- klavye ----
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], [role="menu"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Yakınlaştırma
      if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), zoomBy(1));
      if (mod && k === '-') return void (e.preventDefault(), zoomBy(-1));
      if (mod && k === '0') return void (e.preventDefault(), setZoom('fit'));
      if (mod && k === 'a') {
        e.preventDefault();
        return selectIds(slide.elements.filter((x) => !x.hidden).map((x) => x.id));
      }
      if (mod && k === 'v' && clipboard.els.length) {
        e.preventDefault();
        const same = clipboard.from === slide.id;
        clipboard.pastes++;
        const d = pasteOffset(same, clipboard.pastes);
        return addEls(clipboard.els.map((x) => cloneEl(x, d)));
      }
      if (!selEls.length) return;
      if (mod && (k === 'c' || k === 'x')) {
        e.preventDefault();
        clipboard.els = selEls.map((x) => ({ ...x }));
        clipboard.from = slide.id;
        clipboard.pastes = 0;
        if (k === 'x') deleteSelected();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        return addEls(selEls.map((x) => cloneEl(x, pasteOffset(true, 1))));
      }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        return void zorder(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
      }
      if (mod) return;
      const d = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (delta[e.key]) {
        e.preventDefault();
        const [dx, dy] = delta[e.key];
        patchEls(Object.fromEntries(selEls.filter((x) => !x.locked).map((x) => [x.id, { x: x.x + dx, y: x.y + dy }])), 'nudge-' + selIds.join(','));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') selectIds([]);
      else if (e.key === 'Enter' && primary && selIds.length === 1 && TEXT_TYPES.includes(primary.type) && !primary.locked) {
        e.preventDefault();
        setEditing(primary.id);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  // ---- export (sunucuda aynı renderer; videolu slaytlar MP4) ----
  const job = exportJob ? jobs[exportJob] : undefined;
  const exporting = job?.status === 'running';
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (job?.status === 'done' && revealed.current !== job.id) {
      revealed.current = job.id;
      const first = (job.result?.outputs as string[] | undefined)?.find(Boolean);
      if (first) void api.reveal(first);
    }
  }, [job]);
  async function exportSlides(fmt: 'png' | 'jpg') {
    setExportErr(null);
    try {
      await useStore.getState().flush();
      const { job } = await api.exportCarousel(slug, fmt);
      useStore.getState().setJob(job);
      setExportJob(job.id);
    } catch (e) {
      setExportErr('Kaydedilemedi: ' + (e as Error).message);
    }
  }

  async function addImage(type: 'image' | 'window' = 'image') {
    const src = await pickImage(slug);
    if (!src) return;
    addEl(
      type === 'window'
        ? el({ type, src, x: 76, y: 393, w: 925, h: 551 })
        : picks
          ? el({ type, src, x: 55, y: 112, w: 145, h: 145 })
          : el({ type, src, x: 72, y: 520, w: 936, h: 640 }),
    );
  }
  async function addVideoWindow() {
    const video = await pickVideo(slug);
    if (video) addEl(el({ type: 'window', video, x: 76, y: 393, w: 925, h: 551 }));
  }

  const nVideoSlides = project.slides.filter((_, i) => slideVideos(project, i).length).length;
  const zoomLabel = zoom === 'fit' ? 'Sığdır' : `%${Math.round(zoom * 100)}`;

  return (
    <div className="editor carousel-editor">
      <TopBar slug={slug}>
        {exportErr && <span className="err">{exportErr}</span>}
        {job && (
          <span className={'export-status' + (job.status === 'error' ? ' err' : '')} role="status">
            {exporting && (
              <span className="bar" role="progressbar" aria-label="Export ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
                <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </span>
            )}
            {job.message}
            {job.status === 'done' && (job.result?.outputs as string[] | undefined)?.length ? (
              <button className="btn ghost small" onClick={() => void api.reveal((job.result!.outputs as string[]).find(Boolean)!)}>
                Klasörü göster
              </button>
            ) : null}
          </span>
        )}
        <button className="btn" onClick={() => void exportSlides('jpg')} disabled={claudeRunning || exporting} title={nVideoSlides ? 'Videolu slaytlar MP4 olarak kaydedilir' : undefined}>
          JPEG kaydet
        </button>
        <button className="btn primary" onClick={() => void exportSlides('png')} disabled={claudeRunning || exporting} title={nVideoSlides ? 'Videolu slaytlar MP4 olarak kaydedilir' : undefined}>
          PNG kaydet
        </button>
      </TopBar>

      <aside className="left" aria-label="Öğe ekle ve katmanlar">
        <div className="panel-h">
          <h2>Öğe ekle</h2>
        </div>
        {picks ? (
          <>
            <div className="section add-grid">
              <button className="btn" onClick={() => addEl(el({ type: 'title', text: 'Başlık', x: 76, y: 300, w: 925, h: 130, size: 96 }))}>
                Başlık
              </button>
              <button className="btn" onClick={() => addEl(el({ type: 'text', text: 'Metin', x: 76, y: 600, w: 925, h: 110, size: 44 }))}>
                Metin
              </button>
              <button className="btn" onClick={() => void addImage('window')}>
                Pencerede görsel
              </button>
              <button className="btn" onClick={() => void addVideoWindow()}>
                Pencerede video
              </button>
              <button className="btn" onClick={() => void addImage('image')}>
                Logo / görsel
              </button>
              <button className="btn" onClick={() => addEl(el({ type: 'pill', text: 'Nasıl alınır, tek cümle.', x: 205, y: 1116, w: 670, h: 97, size: 30 }))}>
                CTA hapı
              </button>
              <button className="btn" onClick={() => insertSlide(picksCoverSlide())}>
                + Kapak
              </button>
              <button className="btn" onClick={() => insertSlide(picksPickSlide(slide.accent))}>
                + Seçki sayfası
              </button>
            </div>
          </>
        ) : (
          <div className="section add-grid">
            <button className="btn" onClick={() => addEl(el({ type: 'title', text: 'Başlık', size: 96, y: 300, h: 240 }))}>
              Başlık
            </button>
            <button className="btn" onClick={() => addEl(el({ type: 'text', text: 'Metin', size: 48, y: 600, h: 200 }))}>
              Metin
            </button>
            <button className="btn" onClick={() => addEl(el({ type: 'chip', text: '01', size: 32, y: 220, w: 140, h: 60, color: 'orange' }))}>
              Chip
            </button>
            <button className="btn" onClick={() => addEl(el({ type: 'agent', x: 460, y: 900, w: 160, h: 160, color: 'orange' }))}>
              Pixel agent
            </button>
            <button className="btn" onClick={() => void addImage()}>
              Görsel
            </button>
          </div>
        )}
        <div className="panel-h">
          <h2>Katmanlar</h2>
          <span className="hint">üstteki önde</span>
        </div>
        <div className="layers-wrap">
          <Layers slide={slide} picks={picks} selIds={selIds} selectIds={selectIds} setElements={setElements} patchEls={patchEls} />
        </div>
        <details className="section shortcuts">
          <summary>Kısayollar</summary>
          <p className="hint">
            Çift tık ya da Enter: metni düzenle · ⇧-tık / boş alanda sürükle: çoklu seçim · ⌘A tümü · ⌘C ⌘V ⌘D kopyala, yapıştır, çoğalt · ⌫ sil ·
            oklar 1 px, ⇧ 10 px · ⌘] ⌘[ katman · ⌘+ ⌘− ⌘0 yakınlaştır · sürüklerken ⌘: yapışma kapalı · köşede ⇧: oran sabit (görsel, pencere)
            {picks && ' · Üst/alt bant, seri adı ve sayfa numarası otomatik çizilir.'}
          </p>
        </details>
      </aside>

      <section className="stage" aria-label="Slayt">
        <Stage
          project={project}
          slide={slide}
          index={index}
          media={media}
          picks={picks}
          margin={margin}
          selIds={selIds}
          flash={flash}
          overflow={overflow}
          setOverflow={setOverflow}
          selectIds={selectIds}
          patchEls={patchEls}
          editing={editing}
          setEditing={setEditing}
          zoom={zoom}
          stageRef={stageRef}
          scrollRef={scrollRef}
          playing={playing}
          togglePlay={() => setPlaying((p) => !p)}
          videoInfo={videos.info}
        />
        <div className="transport">
          <span className="hint">
            Slayt {index + 1} / {project.slides.length} · 1080×1350{vids.length ? ' · video (MP4)' : ''}
          </span>
          {overflow.size > 0 && (
            <span className="warn row" style={{ gap: 6 }}>
              <Alert size={14} /> {overflow.size} metin kutusundan taşıyor
            </span>
          )}
          <div className="stage-acts">
            <div className="zoom" role="group" aria-label="Yakınlaştırma">
              <button className="btn small icon" aria-label="Uzaklaştır (⌘−)" title="Uzaklaştır (⌘−)" onClick={() => zoomBy(-1)}>
                <ZoomOut size={15} />
              </button>
              <select className="select small" aria-label="Yakınlaştırma düzeyi" value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
                <option value="fit">Sığdır</option>
                {zoom !== 'fit' && ![0.5, 1, 1.5].includes(zoom) && <option value={String(zoom)}>{zoomLabel}</option>}
                <option value="0.5">%50</option>
                <option value="1">%100</option>
                <option value="1.5">%150</option>
              </select>
              <button className="btn small icon" aria-label="Yakınlaştır (⌘+)" title="Yakınlaştır (⌘+)" onClick={() => zoomBy(1)}>
                <ZoomIn size={15} />
              </button>
            </div>
            <button className="btn small icon" aria-label="Slaydı sola taşı" title="Slaydı sola taşı" disabled={index === 0} onClick={() => strip.move(index, index - 1)}>
              <ChevronLeft size={15} />
            </button>
            <button
              className="btn small icon"
              aria-label="Slaydı sağa taşı"
              title="Slaydı sağa taşı"
              disabled={index === project.slides.length - 1}
              onClick={() => strip.move(index, index + 2)}
            >
              <ChevronRight size={15} />
            </button>
            <button className="btn small" onClick={() => strip.duplicate(index)}>
              <Copy size={15} /> Çoğalt
            </button>
            <button className="btn small danger" disabled={project.slides.length <= 1} onClick={() => strip.remove(index)}>
              <Trash size={15} /> Slaydı sil
            </button>
          </div>
        </div>
      </section>

      <aside className="right" aria-label="Yan panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>
            Düzenle
          </button>
          <button role="tab" className="claude-tab" aria-selected={tab === 'claude'} onClick={() => setTab('claude')}>
            Claude
            {claudeRunning && <span className="dot" aria-label="çalışıyor" />}
          </button>
        </div>
        <div className="tabpanel" role="tabpanel">
          {tab === 'claude' ? (
            claudePanel
          ) : selEls.length > 1 ? (
            <MultiInspector slide={slide} ids={selIds} setElements={setElements} onClose={() => selectIds([])} onDelete={deleteSelected} />
          ) : selEls.length === 1 ? (
            <ElementInspector
              key={selEls[0].id}
              e={selEls[0]}
              picks={picks}
              onPickImage={async () => {
                const src = await pickImage(slug);
                if (src) setEl(selEls[0].id, { src });
              }}
              onPickVideo={async () => {
                const video = await pickVideo(slug);
                if (video) setEl(selEls[0].id, { video });
              }}
              video={selEls[0].video ? videos.info.get(selEls[0].video) : undefined}
              arrange={{ slide, ids: selIds, setElements }}
              need={overflow.get(selEls[0].id)}
              set={(p, k) => setEl(selEls[0].id, p, k)}
              onClose={() => selectIds([])}
              onDelete={deleteSelected}
            />
          ) : (
            <CarouselInspector slug={slug} project={project} slide={slide} index={index} setSlide={setSlide} />
          )}
        </div>
      </aside>

      <div className="bottom">
        <SlideStrip project={project} index={index} images={media} flash={flash} act={strip} />
      </div>
    </div>
  );
}
