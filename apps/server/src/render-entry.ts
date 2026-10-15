// Headless Chromium'da çalışan export sayfası. Editördeki önizlemeyle aynı renderer'ı kullanır.
import { createReelRenderer, ensureFonts } from '@cb/renderer';
import type { ReelProject } from '@cb/schema';

const cv = document.getElementById('c') as HTMLCanvasElement;
const g = cv.getContext('2d')!;
const r = createReelRenderer(g, { throwOnError: true });

declare global {
  interface Window {
    setup(p: ReelProject, scenes: string): Promise<number>;
    frame(t: number): string;
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
