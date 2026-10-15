// Headless Chromium'da çalışan export sayfası. Editördeki önizlemeyle aynı renderer'ı kullanır.
import { createReelRenderer, createCarouselRenderer, ensureFonts, type ImageSource } from '@cb/renderer';
import { SLIDE, type CarouselProject, type ReelProject } from '@cb/schema';

const cv = document.getElementById('c') as HTMLCanvasElement;
const g = cv.getContext('2d')!;
const r = createReelRenderer(g, { throwOnError: true });

declare global {
  interface Window {
    setup(p: ReelProject, scenes: string): Promise<number>;
    frame(t: number): string;
    setupCarousel(p: CarouselProject, slug: string): Promise<number>;
    slide(i: number, fmt: 'png' | 'jpg', videoHoles: boolean): string;
  }
}

window.setup = async (p, scenes) => {
  await ensureFonts();
  r.load(p, scenes);
  return r.timeline.duration;
};

/** Şeffaf PNG (alt yarı boş, ffmpeg altına videoyu koyar). */
window.frame = (t) => {
  r.render(t);
  return cv.toDataURL('image/png');
};

// ---- Carousel ----
let carousel: CarouselProject | null = null;
const images = new Map<string, ImageSource>();
const cr = createCarouselRenderer(g);

/** Projedeki görselleri (arka plan, logo, ekran görüntüsü) yükler; slayt sayısını döndürür. */
window.setupCarousel = async (p, slug) => {
  cv.width = SLIDE.W;
  cv.height = SLIDE.H;
  carousel = p;
  await ensureFonts();
  const srcs = new Set(p.slides.flatMap((s) => [s.bg, ...s.elements.map((e) => e.src)]).filter((x): x is string => !!x));
  await Promise.all(
    [...srcs].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => (images.set(src, img), resolve());
          img.onerror = () => resolve(); // eksik görsel: yer tutucu çizilir
          img.src = `/api/projects/${slug}/media/${src.replace(/^media\//, '')}`;
        }),
    ),
  );
  return p.slides.length;
};

/** Slayt görüntüsü. videoHoles: pencere videolarının alanı şeffaf bırakılır (MP4 için PNG overlay). */
window.slide = (i, fmt, videoHoles) => {
  if (!carousel) throw new Error('setupCarousel çağrılmadı');
  cr.render(carousel, i, images, 0.2, { videoHoles });
  return fmt === 'jpg' ? cv.toDataURL('image/jpeg', 0.92) : cv.toDataURL('image/png');
};
