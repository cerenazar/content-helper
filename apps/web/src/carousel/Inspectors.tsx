import { useEffect, useState } from "react";
import { reorderZ, alignBoxes, distributeBoxes, type AlignMode, type ZOp } from "@cb/renderer";
import { SLIDE, ACCENTS, WORLDS, PICKS_GOLD, nextSeriesNumber, CAROUSEL_VIDEO_MAX_SEC, type CarouselProject, type Slide, type SlideElement } from "@cb/schema";
import { useStore } from "../store";
import { api } from "../api";
import { Header } from "../reel/Inspector";
import { typeLabel } from "./Stage";
import type { VideoInfo } from "./media";
import { AlignLeft, AlignHCenter, AlignRight, AlignTop, AlignVMiddle, AlignBottom, DistH, DistV, ToFront, ToBack, Forward, Backward, Lock, Unlock, Eye, EyeOff } from "./icons";

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
export async function pickImage(slug: string): Promise<string | null> {
  const { paths } = await api.pick("image");
  if (!paths.length) return null;
  const { srcs } = await api.addImages(slug, paths);
  return srcs[0] ?? null;
}

/** Video seçer; kaynak yerinde kalır (kopyalanmaz), mutlak yolu döner. Önizleme proxy'si arka planda hazırlanır. */
export async function pickVideo(slug: string): Promise<string | null> {
  const { paths } = await api.pick("video");
  if (!paths.length) return null;
  const { videos } = await api.addVideos(slug, paths.slice(0, 1));
  return videos[0]?.path ?? null;
}

type Ic = (p: { size?: number }) => React.ReactElement;
const ALIGNS: [AlignMode, string, Ic][] = [
  ["left", "Sola hizala", AlignLeft],
  ["hcenter", "Yatay ortala", AlignHCenter],
  ["right", "Sağa hizala", AlignRight],
  ["top", "Üste hizala", AlignTop],
  ["vmiddle", "Dikey ortala", AlignVMiddle],
  ["bottom", "Alta hizala", AlignBottom],
];
const ZOPS: [ZOp, string, Ic][] = [
  ["front", "En öne getir (⇧⌘])", ToFront],
  ["forward", "Bir öne getir (⌘])", Forward],
  ["backward", "Bir geri gönder (⌘[)", Backward],
  ["back", "En arkaya gönder (⇧⌘[)", ToBack],
];

export interface ArrangeProps {
  slide: Slide;
  ids: string[];
  setElements: (fn: (els: SlideElement[]) => SlideElement[], key?: string) => void;
}

/** Hizala (tek öğe: slayta göre, çoklu: gruba göre), dağıt (3+ öğe) ve katman sırası düğmeleri. */
export function ArrangeTools({ slide, ids, setElements }: ArrangeProps) {
  const sel = slide.elements.filter((e) => ids.includes(e.id) && !e.locked);
  const apply = (pos: { x: number; y: number }[]) => {
    const m = new Map(sel.map((e, i) => [e.id, pos[i]]));
    setElements((els) => els.map((e) => (m.has(e.id) ? { ...e, x: Math.round(m.get(e.id)!.x), y: Math.round(m.get(e.id)!.y) } : e)));
  };
  return (
    <>
      <div className="field">
        <span>{ids.length > 1 ? "Hizala (seçime göre)" : "Hizala (slayta göre)"}</span>
        <div className="toolrow" role="group" aria-label="Hizala">
          {ALIGNS.map(([m, label, I]) => (
            <button key={m} className="btn icon small" aria-label={label} title={label} disabled={!sel.length} onClick={() => apply(alignBoxes(sel, m, SLIDE))}>
              <I size={16} />
            </button>
          ))}
        </div>
      </div>
      {ids.length > 1 && (
        <div className="field">
          <span>Dağıt (en az 3 öğe)</span>
          <div className="toolrow" role="group" aria-label="Dağıt">
            <button className="btn small" disabled={sel.length < 3} onClick={() => apply(distributeBoxes(sel, "h"))}>
              <DistH size={16} /> Yatay dağıt
            </button>
            <button className="btn small" disabled={sel.length < 3} onClick={() => apply(distributeBoxes(sel, "v"))}>
              <DistV size={16} /> Dikey dağıt
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <span>Katman sırası</span>
        <div className="toolrow" role="group" aria-label="Katman sırası">
          {ZOPS.map(([op, label, I]) => (
            <button key={op} className="btn icon small" aria-label={label} title={label} onClick={() => setElements((els) => reorderZ(els, ids, op))}>
              <I size={16} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Çoklu seçim paneli. */
export function MultiInspector({ slide, ids, setElements, onClose, onDelete }: ArrangeProps & { onClose: () => void; onDelete: () => void }) {
  const sel = slide.elements.filter((e) => ids.includes(e.id));
  const allLocked = sel.every((e) => e.locked);
  const allHidden = sel.every((e) => e.hidden);
  const patchAll = (p: Partial<SlideElement>) => setElements((els) => els.map((e) => (ids.includes(e.id) ? { ...e, ...p } : e)));
  return (
    <>
      <Header title={`${sel.length} öğe seçili`} onDelete={onDelete} onClose={onClose} />
      <div className="section">
        <p className="hint">Birlikte taşımak için sürükle. ⇧-tık ile seçime ekle ya da çıkar, ⌘D ile çoğalt.</p>
        <ArrangeTools slide={slide} ids={ids} setElements={setElements} />
        <div className="row">
          <button className="btn small" aria-pressed={allLocked} onClick={() => patchAll({ locked: !allLocked })}>
            {allLocked ? <Lock size={15} /> : <Unlock size={15} />} {allLocked ? "Kilidi aç" : "Hepsini kilitle"}
          </button>
          <button className="btn small" aria-pressed={allHidden} onClick={() => patchAll({ hidden: !allHidden })}>
            {allHidden ? <EyeOff size={15} /> : <Eye size={15} />} {allHidden ? "Göster" : "Gizle"}
          </button>
        </div>
      </div>
    </>
  );
}

export function ElementInspector({
  e,
  picks,
  need,
  set,
  onPickImage,
  onPickVideo,
  video,
  arrange,
  onDelete,
  onClose,
}: {
  e: SlideElement;
  picks: boolean;
  need?: number;
  set: (p: Partial<SlideElement>, key?: string) => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  video?: VideoInfo;
  arrange: ArrangeProps;
  onDelete: () => void;
  onClose: () => void;
}) {
  const isText = e.type === "title" || e.type === "text";
  const hasText = isText || e.type === "pill";
  const words = e.text.split(/\s+/).filter(Boolean);
  return (
    <>
      <Header title={typeLabel(e, picks)} onDelete={e.locked ? undefined : onDelete} onClose={onClose} />
      <div className="section">
        <div className="row">
          <button className="btn small" aria-pressed={e.locked} onClick={() => set({ locked: !e.locked })}>
            {e.locked ? <Lock size={15} /> : <Unlock size={15} />} {e.locked ? "Kilitli" : "Kilitle"}
          </button>
          <button className="btn small" aria-pressed={e.hidden} onClick={() => set({ hidden: !e.hidden })}>
            {e.hidden ? <EyeOff size={15} /> : <Eye size={15} />} {e.hidden ? "Gizli" : "Gizle"}
          </button>
        </div>
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
            {e.src ? (e.type === "window" && e.video ? "Poster görselini değiştir" : "Görseli değiştir") : e.type === "window" && e.video ? "Poster görseli seç" : "Görsel seç"}
          </button>
        )}
        {e.type === "window" && picks && (
          <div className="field">
            <span>Video (kaynak dosya yerinde kalır, kopyalanmaz)</span>
            <div className="row wrap">
              <button className="btn" onClick={onPickVideo}>
                {e.video ? "Videoyu değiştir" : "Video seç"}
              </button>
              {e.video && (
                <button className="btn ghost danger" onClick={() => set({ video: null })}>
                  Videoyu kaldır
                </button>
              )}
            </div>
            {e.video && (
              <p className="hint" style={{ wordBreak: "break-all" }}>
                {e.video.split("/").pop()}
                {video?.status === "ready" && ` · ${video.duration.toFixed(1)} sn`}
                {video?.status === "running" && " · önizleme hazırlanıyor"}
                {video?.status === "error" && ` · açılamadı: ${video.error}`}
              </p>
            )}
            {e.video && video && video.duration > CAROUSEL_VIDEO_MAX_SEC && (
              <p className="warn">Instagram carousel videosu en fazla {CAROUSEL_VIDEO_MAX_SEC} sn: ilk {CAROUSEL_VIDEO_MAX_SEC} sn kullanılacak.</p>
            )}
            {e.video && <p className="hint">Bu slayt export'ta 4:5 MP4 olur (1080×1350, sesli, 30 MB altı).</p>}
          </div>
        )}
        {(hasText || e.type === "chip") && (
          <label className="field">
            <span>Metin</span>
            <textarea
              className="textarea"
              rows={hasText ? 4 : 1}
              value={e.text}
              onChange={(ev) => set({ text: ev.target.value }, "text-" + e.id)}
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
        <ArrangeTools {...arrange} />
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

export function CarouselInspector({
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
