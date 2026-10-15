import { useEffect, useRef, useState } from 'react';
import { createCarouselRenderer, ensureFonts, type ImageSource } from '@cb/renderer';
import { SLIDE, type CarouselProject } from '@cb/schema';

let fontsReady: Promise<void> | null = null;
export const fonts = () => (fontsReady ??= ensureFonts());

/**
 * Slaytı export'la aynı renderer'la çizer. live: video oynarken her karede yeniden çiz.
 */
export function SlideCanvas({
  project,
  index,
  images,
  className,
  live = false,
  onOverflow,
}: {
  project: CarouselProject;
  index: number;
  images: Map<string, ImageSource>;
  className?: string;
  live?: boolean;
  onOverflow?: (m: Map<string, number>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ project, index, images });
  latest.current = { project, index, images };
  useEffect(() => void fonts().then(() => setReady(true)), []);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    const over = createCarouselRenderer(g).render(project, index, images);
    if (ready) onOverflow?.(over);
  });
  useEffect(() => {
    if (!live) return;
    const r = createCarouselRenderer(ref.current!.getContext('2d')!);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const l = latest.current;
      r.render(l.project, l.index, l.images);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  return <canvas ref={ref} width={SLIDE.W} height={SLIDE.H} className={className} data-ready={ready} />;
}
