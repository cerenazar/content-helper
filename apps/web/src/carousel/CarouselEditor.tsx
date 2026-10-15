import { useEffect, useRef, useState } from "react";
import {
  createCarouselRenderer,
  ensureFonts,
  slideEl as el,
  picksCoverSlide,
  picksPickSlide,
  type ImageSource,
} from "@cb/renderer";
import {
  SLIDE,
  newId,
  WORLDS,
  ACCENTS,
  PICKS_GOLD,
  nextSeriesNumber,
  type CarouselProject,
  type Slide,
  type SlideElement,
} from "@cb/schema";
import { useStore } from "../store";
import { api } from "../api";
import { TopBar } from "../Editor";
import { Header } from "../reel/Inspector";
import { Plus, Copy, ChevronLeft, ChevronRight, Trash, Alert } from "../icons";

const ACCENT_TR: Record<string, string> = {
  orange: "turuncu",
  sage: "adaçayı",
  lav: "lavanta",
  sky: "gök",
  gold: "altın",
  ink: "mürekkep",
};

/** Picks vurgu renkleri: kapak altını ve sık kullanılan marka renkleri. */
const PICKS_ACCENTS: [string, string][] = [
  [PICKS_GOLD, "Altın"],
  ["#E0168F", "Magenta"],
  ["#D2404B", "Kırmızı"],
  ["#3B82F6", "Mavi"],
  ["#3FB950", "Yeşil"],
];

/** Proje klasörüne kopyalanan görselin yolunu döndürür (seçim iptal edilirse null). */
async function pickImage(slug: string): Promise<string | null> {
  const { paths } = await api.pick("image");
  if (!paths.length) return null;
  const { srcs } = await api.addImages(slug, paths);
  return srcs[0] ?? null;
}

/** Görselleri bir kez yükler, yüklenince yeniden çizim tetikler. */
function useImages(slug: string, p: CarouselProject) {
  const [, bump] = useState(0);
  const cache = useRef(new Map<string, ImageSource>());
  useEffect(() => {
    const srcs = p.slides.flatMap((s) => [
      s.bg,
      ...s.elements
        .filter((e) => e.type === "image" || e.type === "window")
        .map((e) => e.src),
    ]);
    for (const src of srcs)
      if (src && !cache.current.has(src)) {
        const img = new Image();
        img.onload = () => {
          cache.current.set(src, img);
          bump((n) => n + 1);
        };
        img.src = api.mediaUrl(slug, src);
      }
  }, [p, slug]);
  return cache.current;
}

let fontsReady: Promise<void> | null = null;
const fonts = () => (fontsReady ??= ensureFonts());

function SlideCanvas({
  project,
  index,
  images,
  className,
  onOverflow,
}: {
  project: CarouselProject;
  index: number;
  images: Map<string, ImageSource>;
  className?: string;
  onOverflow?: (m: Map<string, number>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => void fonts().then(() => setReady(true)), []);
  useEffect(() => {
    const g = ref.current!.getContext("2d")!;
    const over = createCarouselRenderer(g).render(project, index, images);
    if (ready) onOverflow?.(over);
  });
  return (
    <canvas
      ref={ref}
      width={SLIDE.W}
      height={SLIDE.H}
      className={className}
      data-ready={ready}
    />
  );
}

export function CarouselEditor({
  slug,
  claudePanel,
  claudeRunning,
}: {
  slug: string;
  claudePanel: React.ReactNode;
  claudeRunning: boolean;
}) {
  const project = useStore((s) => s.project) as CarouselProject;
  const sel = useStore((s) => s.selection);
  const flash = useStore((s) => s.flash);
  const { updateCarousel, select } = useStore.getState();
  const [tab, setTab] = useState<"edit" | "claude">("edit");
  const [exporting, setExporting] = useState<string | null>(null);
  const images = useImages(slug, project);
  const [overflow, setOverflowState] = useState<Map<string, number>>(new Map());
  const setOverflow = (m: Map<string, number>) => {
    const key = (x: Map<string, number>) => JSON.stringify([...x]);
    setOverflowState((prev) => (key(prev) === key(m) ? prev : m));
  };
  const stageRef = useRef<HTMLDivElement>(null);

  const slideId =
    sel?.kind === "slide"
      ? sel.id
      : sel?.kind === "element"
        ? sel.slide
        : project.slides[0].id;
  const index = Math.max(
    0,
    project.slides.findIndex((s) => s.id === slideId),
  );
  const slide = project.slides[index];
  const picks = project.style === "picks";
  const margin = picks ? 76 : 72;
  const selEl =
    sel?.kind === "element"
      ? slide.elements.find((e) => e.id === sel.id)
      : undefined;

  useEffect(() => {
    if (claudeRunning) setTab("claude");
  }, [claudeRunning]);

  const setSlide = (fn: (s: Slide) => Slide, key?: string) =>
    updateCarousel(
      (p) => ({
        ...p,
        slides: p.slides.map((s) => (s.id === slide.id ? fn(s) : s)),
      }),
      key,
    );
  const setEl = (id: string, patch: Partial<SlideElement>, key?: string) =>
    setSlide(
      (s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }),
      key,
    );

  // Sürükle / boyutlandır (canvas pikseline çevrilmiş)
  const startDrag = (
    e: React.PointerEvent,
    target: SlideElement,
    mode: "move" | "resize",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    select({ kind: "element", slide: slide.id, id: target.id });
    const scale = SLIDE.W / stageRef.current!.getBoundingClientRect().width;
    const x0 = e.clientX,
      y0 = e.clientY;
    const node = e.currentTarget as HTMLElement;
    node.setPointerCapture(e.pointerId);
    const snap = (v: number) =>
      Math.abs(v - margin) < 12 ? margin : Math.round(v);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * scale,
        dy = (ev.clientY - y0) * scale;
      if (mode === "move")
        setEl(
          target.id,
          { x: snap(target.x + dx), y: Math.round(target.y + dy) },
          "move-" + target.id,
        );
      else
        setEl(
          target.id,
          {
            w: Math.max(40, Math.round(target.w + dx)),
            h: Math.max(30, Math.round(target.h + dy)),
          },
          "rz-" + target.id,
        );
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  };

  // Klavye: seçili öğeyi oklarla it, Delete ile sil
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      const st = useStore.getState();
      const s = st.selection;
      if (s?.kind !== "element") return;
      const d = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-d, 0],
        ArrowRight: [d, 0],
        ArrowUp: [0, -d],
        ArrowDown: [0, d],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const cur = slide.elements.find((x) => x.id === s.id);
        if (cur)
          setEl(
            s.id,
            { x: cur.x + delta[e.key][0], y: cur.y + delta[e.key][1] },
            "nudge-" + s.id,
          );
      } else if (e.key === "Backspace" || e.key === "Delete") {
        setSlide((sl) => ({
          ...sl,
          elements: sl.elements.filter((x) => x.id !== s.id),
        }));
        st.select({ kind: "slide", id: slide.id });
      } else if (e.key === "Escape") st.select({ kind: "slide", id: slide.id });
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });

  async function exportSlides(fmt: "png" | "jpg") {
    setExporting("Slaytlar hazırlanıyor…");
    try {
      await fonts();
      const cv = document.createElement("canvas");
      cv.width = SLIDE.W;
      cv.height = SLIDE.H;
      const r = createCarouselRenderer(cv.getContext("2d")!);
      let last = "";
      for (let i = 0; i < project.slides.length; i++) {
        r.render(project, i, images);
        const data =
          fmt === "png"
            ? cv.toDataURL("image/png")
            : cv.toDataURL("image/jpeg", 0.92);
        last = (
          await api.saveSlide(
            slug,
            `${slug}-${String(i + 1).padStart(2, "0")}.${fmt}`,
            data,
          )
        ).path;
        setExporting(`${i + 1} / ${project.slides.length} kaydedildi`);
      }
      setExporting(`${project.slides.length} slayt kaydedildi.`);
      if (last) void api.reveal(last);
    } catch (e) {
      setExporting("Kaydedilemedi: " + (e as Error).message);
    }
  }

  async function addImage(type: "image" | "window" = "image") {
    const src = await pickImage(slug);
    if (!src) return;
    addEl(
      type === "window"
        ? el({ type, src, x: 76, y: 393, w: 925, h: 551 })
        : picks
          ? el({ type, src, x: 55, y: 112, w: 145, h: 145 })
          : el({ type, src, x: 72, y: 520, w: 936, h: 640 }),
    );
  }

  const addEl = (n: SlideElement) => {
    setSlide((s) => ({ ...s, elements: [...s.elements, n] }));
    select({ kind: "element", slide: slide.id, id: n.id });
  };

  const insertSlide = (n: Slide) => {
    updateCarousel((p) => {
      const sl = p.slides.slice();
      sl.splice(index + 1, 0, n);
      return { ...p, slides: sl };
    });
    select({ kind: "slide", id: n.id });
  };

  return (
    <div className="editor">
      <TopBar slug={slug}>
        {exporting && <span className="hint">{exporting}</span>}
        <button
          className="btn"
          onClick={() => void exportSlides("jpg")}
          disabled={claudeRunning}
        >
          JPEG kaydet
        </button>
        <button
          className="btn primary"
          onClick={() => void exportSlides("png")}
          disabled={claudeRunning}
        >
          PNG kaydet
        </button>
      </TopBar>

      <aside className="left" aria-label="Öğe ekle">
        <div className="panel-h">
          <h2>Öğe ekle</h2>
        </div>
        {picks ? (
          <>
            <div className="section" style={{ gap: 6 }}>
              <button
                className="btn"
                onClick={() =>
                  addEl(
                    el({
                      type: "title",
                      text: "Başlık",
                      x: 76,
                      y: 300,
                      w: 925,
                      h: 130,
                      size: 96,
                    }),
                  )
                }
              >
                Başlık
              </button>
              <button
                className="btn"
                onClick={() =>
                  addEl(
                    el({
                      type: "text",
                      text: "Metin",
                      x: 76,
                      y: 600,
                      w: 925,
                      h: 110,
                      size: 44,
                    }),
                  )
                }
              >
                Metin
              </button>
              <button className="btn" onClick={() => void addImage("window")}>
                Pencerede ekran görüntüsü
              </button>
              <button className="btn" onClick={() => void addImage("image")}>
                Logo ya da görsel
              </button>
              <button
                className="btn"
                onClick={() =>
                  addEl(
                    el({
                      type: "pill",
                      text: "Nasıl alınır, tek cümle.",
                      x: 205,
                      y: 1116,
                      w: 670,
                      h: 97,
                      size: 30,
                    }),
                  )
                }
              >
                CTA hapı
              </button>
            </div>
            <div className="panel-h">
              <h2>Hazır sayfa</h2>
            </div>
            <div className="section" style={{ gap: 6 }}>
              <button
                className="btn"
                onClick={() => insertSlide(picksCoverSlide())}
              >
                Kapak ekle
              </button>
              <button
                className="btn"
                onClick={() => insertSlide(picksPickSlide(slide.accent))}
              >
                Seçki sayfası ekle
              </button>
            </div>
          </>
        ) : (
          <div className="section" style={{ gap: 6 }}>
            <button
              className="btn"
              onClick={() =>
                addEl(
                  el({
                    type: "title",
                    text: "Başlık",
                    size: 96,
                    y: 300,
                    h: 240,
                  }),
                )
              }
            >
              Başlık
            </button>
            <button
              className="btn"
              onClick={() =>
                addEl(
                  el({ type: "text", text: "Metin", size: 48, y: 600, h: 200 }),
                )
              }
            >
              Metin
            </button>
            <button
              className="btn"
              onClick={() =>
                addEl(
                  el({
                    type: "chip",
                    text: "01",
                    size: 32,
                    y: 220,
                    w: 140,
                    h: 60,
                    color: "orange",
                  }),
                )
              }
            >
              Chip
            </button>
            <button
              className="btn"
              onClick={() =>
                addEl(
                  el({
                    type: "agent",
                    x: 460,
                    y: 900,
                    w: 160,
                    h: 160,
                    color: "orange",
                  }),
                )
              }
            >
              Pixel agent
            </button>
            <button className="btn" onClick={() => void addImage()}>
              Görsel
            </button>
          </div>
        )}
        <div className="section">
          <p className="hint">
            Öğeyi sürükleyerek taşı, sağ alt köşeden boyutlandır. Oklarla 1 px,
            ⇧ ile 10 px it. Sol kenar {margin} px'e yapışır.
            {picks &&
              " Üst ve alt bant, seri adı ve sayfa numarası otomatik çizilir."}
          </p>
        </div>
      </aside>

      <section className="stage" aria-label="Slayt">
        <div
          className="preview-wrap"
          onPointerDown={() => select({ kind: "slide", id: slide.id })}
        >
          <div className="preview slide slide-stage" ref={stageRef}>
            <SlideCanvas
              project={project}
              index={index}
              images={images}
              onOverflow={setOverflow}
            />
            {slide.elements.map((e) => (
              <div
                key={e.id}
                className={
                  "el-box" +
                  (flash.has(e.id) ? " flash" : "") +
                  (overflow.has(e.id) ? " over" : "")
                }
                aria-selected={selEl?.id === e.id}
                role="button"
                tabIndex={0}
                aria-label={`${e.type}: ${e.text || e.src || ""}`}
                style={{
                  left: `${(e.x / SLIDE.W) * 100}%`,
                  top: `${(e.y / SLIDE.H) * 100}%`,
                  width: `${(e.w / SLIDE.W) * 100}%`,
                  height: `${(e.h / SLIDE.H) * 100}%`,
                }}
                onPointerDown={(ev) => startDrag(ev, e, "move")}
                onFocus={() =>
                  select({ kind: "element", slide: slide.id, id: e.id })
                }
              >
                {selEl?.id === e.id && (
                  <span
                    className="rz"
                    onPointerDown={(ev) => startDrag(ev, e, "resize")}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="transport">
          <span className="hint">
            Slayt {index + 1} / {project.slides.length} · 1080×1350
          </span>
          {overflow.size > 0 && (
            <span className="warn row" style={{ gap: 6 }}>
              <Alert size={14} /> {overflow.size} metin kutusundan taşıyor
            </span>
          )}
          <div className="stage-acts">
            <button
              className="btn small icon"
              aria-label="Slaydı sola taşı"
              title="Slaydı sola taşı"
              disabled={index === 0}
              onClick={() =>
                updateCarousel((p) => ({
                  ...p,
                  slides: swap(p.slides, index, index - 1),
                }))
              }
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="btn small icon"
              aria-label="Slaydı sağa taşı"
              title="Slaydı sağa taşı"
              disabled={index === project.slides.length - 1}
              onClick={() =>
                updateCarousel((p) => ({
                  ...p,
                  slides: swap(p.slides, index, index + 1),
                }))
              }
            >
              <ChevronRight size={15} />
            </button>
            <button
              className="btn small"
              onClick={() => {
                insertSlide({
                  ...slide,
                  id: newId("sl"),
                  elements: slide.elements.map((e) => ({
                    ...e,
                    id: newId("el"),
                  })),
                });
              }}
            >
              <Copy size={15} /> Kopyala
            </button>
            <button
              className="btn small danger"
              disabled={project.slides.length <= 1}
              onClick={() => {
                updateCarousel((p) => ({
                  ...p,
                  slides: p.slides.filter((s) => s.id !== slide.id),
                }));
                select({
                  kind: "slide",
                  id: project.slides[Math.max(0, index - 1)].id,
                });
              }}
            >
              <Trash size={15} /> Slaydı sil
            </button>
          </div>
        </div>
      </section>

      <aside className="right" aria-label="Yan panel">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "edit"}
            onClick={() => setTab("edit")}
          >
            Düzenle
          </button>
          <button
            role="tab"
            className="claude-tab"
            aria-selected={tab === "claude"}
            onClick={() => setTab("claude")}
          >
            Claude
            {claudeRunning && <span className="dot" aria-label="çalışıyor" />}
          </button>
        </div>
        <div className="tabpanel" role="tabpanel">
          {tab === "claude" ? (
            claudePanel
          ) : selEl ? (
            <ElementInspector
              e={selEl}
              picks={picks}
              onPickImage={async () => {
                const src = await pickImage(slug);
                if (src) setEl(selEl.id, { src });
              }}
              need={overflow.get(selEl.id)}
              set={(p, k) => setEl(selEl.id, p, k)}
              onClose={() => select({ kind: "slide", id: slide.id })}
              onDelete={() => (
                setSlide((s) => ({
                  ...s,
                  elements: s.elements.filter((x) => x.id !== selEl.id),
                })),
                select({ kind: "slide", id: slide.id })
              )}
            />
          ) : (
            <CarouselInspector
              slug={slug}
              project={project}
              slide={slide}
              index={index}
              setSlide={setSlide}
            />
          )}
        </div>
      </aside>

      <div className="bottom">
        <div className="strip" role="listbox" aria-label="Slaytlar">
          {project.slides.map((s, i) => (
            <button
              key={s.id}
              className={"thumb" + (flash.has(s.id) ? " flash" : "")}
              role="option"
              aria-selected={i === index}
              onClick={() => select({ kind: "slide", id: s.id })}
              aria-label={`Slayt ${i + 1}`}
            >
              <SlideCanvas project={project} index={i} images={images} />
              <span>{i + 1}</span>
            </button>
          ))}
          <button
            className="add-tile"
            onClick={() =>
              insertSlide(
                picks
                  ? picksPickSlide(slide.accent)
                  : {
                      id: newId("sl"),
                      bg: null,
                      accent: null,
                      elements: [
                        el({
                          type: "title",
                          text: "Yeni slayt",
                          size: 88,
                          y: 300,
                          h: 140,
                        }),
                      ],
                    },
              )
            }
          >
            <Plus size={18} />
            Slayt ekle
          </button>
        </div>
      </div>
    </div>
  );
}

function swap<T>(xs: T[], i: number, j: number) {
  const o = xs.slice();
  [o[i], o[j]] = [o[j], o[i]];
  return o;
}

function ElementInspector({
  e,
  picks,
  need,
  set,
  onPickImage,
  onDelete,
  onClose,
}: {
  e: SlideElement;
  picks: boolean;
  need?: number;
  set: (p: Partial<SlideElement>, key?: string) => void;
  onPickImage: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const isText = e.type === "title" || e.type === "text";
  const hasText = isText || e.type === "pill";
  const words = e.text.split(/\s+/).filter(Boolean);
  const TYPE_TR = {
    title: "Başlık",
    text: "Metin",
    chip: "Chip",
    image: picks ? "Logo / görsel" : "Görsel",
    agent: "Pixel agent",
    window: "Pencere",
    pill: "CTA hapı",
  };
  return (
    <>
      <Header title={TYPE_TR[e.type]} onDelete={onDelete} onClose={onClose} />
      <div className="section">
        {need !== undefined && (
          <div className="row wrap">
            <span className="warn grow">
              Metin kutudan taşıyor ({need} px gerekiyor).
            </span>
            <button className="btn small" onClick={() => set({ h: need })}>
              Kutuyu metne göre uzat
            </button>
          </div>
        )}
        {(e.type === "image" || e.type === "window") && (
          <button className="btn" onClick={onPickImage}>
            {e.src ? "Görseli değiştir" : "Görsel seç"}
          </button>
        )}
        {(hasText || e.type === "chip") && (
          <label className="field">
            <span>Metin</span>
            <textarea
              className="textarea"
              rows={hasText ? 4 : 1}
              value={e.text}
              onChange={(ev) => set({ text: ev.target.value }, "text-" + e.id)}
              autoFocus
            />
          </label>
        )}
        {isText && (
          <div className="field">
            <span>
              {picks
                ? "Vurgu (slaydın vurgu renginde)"
                : "Vurgu (turuncu kutu)"}
            </span>
            <div className="row wrap">
              <button
                className="btn small"
                aria-pressed={!e.emph}
                onClick={() => set({ emph: null })}
              >
                Yok
              </button>
              {picks && e.text.trim() && (
                <button
                  className="btn small"
                  aria-pressed={e.emph === e.text.trim()}
                  onClick={() => set({ emph: e.text.trim() })}
                >
                  Tümü
                </button>
              )}
              {picks &&
                e.text
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l, _i, all) => l && all.length > 1)
                  .map((l, k) => (
                    <button
                      key={"l" + k}
                      className="btn small"
                      aria-pressed={e.emph === l}
                      onClick={() => set({ emph: l })}
                    >
                      {k + 1}. satır
                    </button>
                  ))}
              {words.slice(0, 16).map((w, k) => (
                <button
                  key={k}
                  className="btn small"
                  aria-pressed={e.emph === w}
                  onClick={() => set({ emph: w })}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}
        {picks && hasText && (
          <div className="row">
            <label className="field" style={{ width: 96 }}>
              <span>Boyut</span>
              <input
                className="input tnum"
                type="number"
                min={12}
                max={200}
                value={e.size}
                onChange={(ev) =>
                  set({ size: Number(ev.target.value) || 12 }, "size-" + e.id)
                }
              />
            </label>
            <label className="field grow">
              <span>Kalınlık</span>
              <select
                className="select"
                value={e.weight ?? ""}
                onChange={(ev) =>
                  set({
                    weight: ev.target.value ? Number(ev.target.value) : null,
                  })
                }
              >
                <option value="">Varsayılan</option>
                {[400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {
                      {
                        400: "Normal",
                        500: "Orta",
                        600: "Yarı kalın",
                        700: "Kalın",
                        800: "Çok kalın",
                        900: "Siyah",
                      }[w]
                    }
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {picks && hasText && (
          <div className="field">
            <span>{e.type === "pill" ? "Hap rengi" : "Metin rengi"}</span>
            <div className="row">
              <input
                type="color"
                className="swatch-input"
                aria-label="Renk seç"
                value={e.fill ?? (e.type === "pill" ? "#7c6538" : "#ffffff")}
                onChange={(ev) =>
                  set({ fill: ev.target.value.toUpperCase() }, "fill-" + e.id)
                }
              />
              <button
                className="btn small"
                aria-pressed={!e.fill}
                onClick={() => set({ fill: null })}
              >
                {e.type === "pill" ? "Vurgu renginden" : "Beyaz"}
              </button>
            </div>
          </div>
        )}
        {!picks && e.type !== "image" && (
          <div className="row">
            {e.type !== "agent" && (
              <label className="field" style={{ width: 96 }}>
                <span>Boyut</span>
                <input
                  className="input tnum"
                  type="number"
                  min={12}
                  max={200}
                  value={e.size}
                  onChange={(ev) =>
                    set({ size: Number(ev.target.value) || 12 }, "size-" + e.id)
                  }
                />
              </label>
            )}
            <label className="field grow">
              <span>Renk</span>
              <select
                className="select"
                value={e.color}
                onChange={(ev) =>
                  set({ color: ev.target.value as SlideElement["color"] })
                }
              >
                {ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {ACCENT_TR[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {isText && (
          <div className="seg" role="group" aria-label="Hizalama">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                aria-pressed={e.align === a}
                onClick={() => set({ align: a })}
              >
                {{ left: "Sola", center: "Ortaya", right: "Sağa" }[a]}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="field grow">
              <span>
                {{ x: "X", y: "Y", w: "Genişlik", h: "Yükseklik" }[k]}
              </span>
              <input
                className="input tnum"
                type="number"
                value={e[k]}
                onChange={(ev) =>
                  set({ [k]: Number(ev.target.value) || 0 }, k + "-" + e.id)
                }
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function CarouselInspector({
  slug,
  project,
  slide,
  index,
  setSlide,
}: {
  slug: string;
  project: CarouselProject;
  slide: Slide;
  index: number;
  setSlide: (fn: (s: Slide) => Slide, key?: string) => void;
}) {
  const { updateCarousel } = useStore.getState();
  const picks = project.style === "picks";
  const [series, setSeries] = useState<
    { slug: string; series: string; category: string; number: number }[]
  >([]);
  useEffect(() => {
    if (picks)
      void api.series().then(
        (r) => setSeries(r.series.filter((x) => x.slug !== slug)),
        () => {},
      );
  }, [picks, slug]);
  const setPicks = (patch: Partial<CarouselProject["picks"]>, key?: string) =>
    updateCarousel((p) => ({ ...p, picks: { ...p.picks, ...patch } }), key);
  const next = nextSeriesNumber(project.picks.series, series);
  const sameKey = (x: string) => x.trim().toUpperCase();
  const dup = series.find(
    (x) =>
      sameKey(x.series) === sameKey(project.picks.series) &&
      x.number === project.picks.number,
  );
  const names = [...new Set(series.map((x) => x.series))];
  const cats = [...new Set(series.map((x) => x.category).filter(Boolean))];
  const accent = slide.accent ?? PICKS_GOLD;
  return (
    <>
      <div className="panel-h">
        <h2>Carousel</h2>
      </div>
      <div className="section">
        <label className="field">
          <span>Başlık</span>
          <input
            className="input"
            value={project.title}
            onChange={(e) =>
              updateCarousel((p) => ({ ...p, title: e.target.value }), "title")
            }
          />
        </label>
        <div className="field">
          <span>Stil</span>
          <div className="seg" role="group" aria-label="Stil">
            <button
              aria-pressed={picks}
              onClick={() => updateCarousel((p) => ({ ...p, style: "picks" }))}
            >
              Ceren's Picks
            </button>
            <button
              aria-pressed={!picks}
              onClick={() => updateCarousel((p) => ({ ...p, style: "pixel" }))}
            >
              Pixel (krem)
            </button>
          </div>
        </div>
        {picks ? (
          <>
            <label className="field">
              <span>Hesap (sol üst)</span>
              <input
                className="input"
                value={project.picks.handle}
                onChange={(e) => setPicks({ handle: e.target.value }, "handle")}
              />
            </label>
            <label className="field">
              <span>Kategori (sağ üst)</span>
              <input
                className="input"
                list="cb-cats"
                value={project.picks.category}
                onChange={(e) =>
                  setPicks({ category: e.target.value }, "category")
                }
              />
              <datalist id="cb-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <div className="row" style={{ alignItems: "end" }}>
              <label className="field grow">
                <span>Seri (sol alt)</span>
                <input
                  className="input"
                  list="cb-series"
                  value={project.picks.series}
                  onChange={(e) =>
                    setPicks({ series: e.target.value }, "series")
                  }
                />
                <datalist id="cb-series">
                  {names.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <label className="field" style={{ width: 84 }}>
                <span>Numara</span>
                <input
                  className="input tnum"
                  type="number"
                  min={0}
                  value={project.picks.number}
                  onChange={(e) =>
                    setPicks(
                      {
                        number: Math.max(
                          0,
                          Math.round(Number(e.target.value) || 0),
                        ),
                      },
                      "number",
                    )
                  }
                />
              </label>
            </div>
            {dup && (
              <div className="row wrap">
                <span className="warn grow">
                  {String(project.picks.number).padStart(3, "0")} numarası “
                  {dup.slug}” projesinde de var. Bu serinin sıradaki numarası{" "}
                  {String(next).padStart(3, "0")}.
                </span>
                <button
                  className="btn small"
                  onClick={() => setPicks({ number: next })}
                >
                  {String(next).padStart(3, "0")} yap
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="row">
            <label className="field" style={{ width: 120 }}>
              <span>İçerik dünyası</span>
              <select
                className="select"
                value={project.header.world}
                onChange={(e) =>
                  updateCarousel((p) => ({
                    ...p,
                    header: {
                      ...p.header,
                      world: e.target.value as typeof p.header.world,
                    },
                  }))
                }
              >
                {WORLDS.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Konu etiketi</span>
              <input
                className="input"
                value={project.header.topic}
                onChange={(e) =>
                  updateCarousel(
                    (p) => ({
                      ...p,
                      header: { ...p.header, topic: e.target.value },
                    }),
                    "topic",
                  )
                }
              />
            </label>
          </div>
        )}
        <p className="hint">
          Bir öğeyi seçince ayarları burada açılır. Instagram carousel'i en
          fazla 20 slayt alır; bu projede {project.slides.length} slayt var.
        </p>
      </div>
      {picks && (
        <>
          <div className="panel-h">
            <h2>Slayt {index + 1}</h2>
          </div>
          <div className="section">
            <div className="field">
              <span>Vurgu rengi (vurgulu metin ve CTA hapı)</span>
              <div className="row wrap">
                {PICKS_ACCENTS.map(([hex, name]) => (
                  <button
                    key={hex}
                    className="swatch"
                    style={{ background: hex }}
                    aria-label={name}
                    title={name}
                    aria-pressed={accent.toUpperCase() === hex.toUpperCase()}
                    onClick={() =>
                      setSlide((s) => ({
                        ...s,
                        accent: hex === PICKS_GOLD ? null : hex,
                      }))
                    }
                  />
                ))}
                <input
                  type="color"
                  className="swatch-input"
                  aria-label="Özel renk"
                  value={accent.toLowerCase()}
                  onChange={(e) =>
                    setSlide(
                      (s) => ({ ...s, accent: e.target.value.toUpperCase() }),
                      "accent-" + slide.id,
                    )
                  }
                />
              </div>
            </div>
            <div className="field">
              <span>Arka plan fotoğrafı</span>
              <div className="row">
                <button
                  className="btn"
                  onClick={async () => {
                    const src = await pickImage(slug);
                    if (src) setSlide((s) => ({ ...s, bg: src }));
                  }}
                >
                  {slide.bg ? "Fotoğrafı değiştir" : "Fotoğraf seç"}
                </button>
                {slide.bg && (
                  <button
                    className="btn ghost danger"
                    onClick={() => setSlide((s) => ({ ...s, bg: null }))}
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
