import { createReelRenderer, createCarouselRenderer, ensureFonts } from '@cb/renderer';
import { REEL, SLIDE } from '@cb/schema';
import { api } from './api';

/**
 * Ana sayfadaki proje kartlarının küçük resmi. Önizleme/export ile aynı renderer çizer;
 * tek bir tam boy canvas sırayla kullanılır, sonuç küçültülüp blob URL olarak saklanır.
 * Alt yarı (video) çizilmez, koyu zemin kalır.
 */
const cache = new Map<string, string>(); // slug@updatedAt → blob URL
let queue: Promise<unknown> = Promise.resolve();
let full: HTMLCanvasElement | null = null;

export function thumbnail(slug: string, updatedAt: number): Promise<string> {
  const key = `${slug}@${updatedAt}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(() => draw(slug)).then((url) => {
    cache.set(key, url);
    return url;
  });
  queue = job.catch(() => {});
  return job;
}

async function draw(slug: string): Promise<string> {
  await ensureFonts();
  const { project, scenes } = await api.get(slug);
  full ??= document.createElement('canvas');
  const out = document.createElement('canvas');
  if (project.kind === 'reel') {
    full.width = REEL.W;
    full.height = REEL.H;
    const g = full.getContext('2d')!;
    const r = createReelRenderer(g);
    r.load(project, scenes);
    r.render(Math.min(0.8, r.timeline.duration), (g) => {
      g.fillStyle = '#2a2420';
      g.fillRect(0, REEL.TOP, REEL.W, REEL.H - REEL.TOP);
    });
    out.width = 270;
    out.height = 480;
  } else {
    full.width = SLIDE.W;
    full.height = SLIDE.H;
    createCarouselRenderer(full.getContext('2d')!).render(project, 0);
    out.width = 288;
    out.height = 360;
  }
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Küçük resim oluşturulamadı');
  return URL.createObjectURL(blob);
}
