import { useEffect, useRef, useState } from 'react';
import type { ImageSource } from '@cb/renderer';
import type { CarouselProject } from '@cb/schema';
import { api } from '../api';

/** Görselleri bir kez yükler, yüklenince yeniden çizim tetikler. */
export function useImages(slug: string, p: CarouselProject) {
  const [, bump] = useState(0);
  const cache = useRef(new Map<string, ImageSource>());
  useEffect(() => {
    const srcs = p.slides.flatMap((s) => [s.bg, ...s.elements.filter((e) => e.type === 'image' || e.type === 'window').map((e) => e.src)]);
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

export interface VideoInfo {
  id: string;
  status: 'ready' | 'running' | 'missing' | 'error';
  duration: number;
  error?: string;
}

/**
 * Pencere videoları: kaynak yol başına bir gizli, sessiz, döngülü <video> (720p proxy).
 * Kare yüklenince renderer'a görsel gibi verilir (aynı cover kırpması). Otomatik oynatma yok;
 * oynat/durdur kullanıcıdadır (prefers-reduced-motion'a da uyar).
 */
export function useVideos(slug: string, p: CarouselProject) {
  const [, bump] = useState(0);
  const els = useRef(new Map<string, HTMLVideoElement>());
  const frames = useRef(new Map<string, ImageSource>());
  const info = useRef(new Map<string, VideoInfo>());
  const paths = [...new Set(p.slides.flatMap((s) => s.elements.map((e) => (e.type === 'window' ? e.video : null))).filter((x): x is string => !!x))];
  const key = paths.join('\n');

  useEffect(() => {
    for (const path of paths) {
      if (els.current.has(path)) continue;
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      els.current.set(path, v);
      v.addEventListener('loadedmetadata', () => {
        // Renderer genişlik/yükseklik okur: <video> için bunlar videoWidth/videoHeight olmalı.
        v.width = v.videoWidth;
        v.height = v.videoHeight;
      });
      v.addEventListener('loadeddata', () => {
        frames.current.set(path, v as unknown as ImageSource);
        bump((n) => n + 1);
      });
      v.addEventListener('seeked', () => bump((n) => n + 1));
      const alive = () => els.current.get(path) === v;
      const kick = (n = 0) =>
        void api.videoProxy(slug, path).then(
          (r) => {
            if (!alive()) return;
            info.current.set(path, { id: r.id, status: r.status, duration: r.duration });
            bump((k) => k + 1);
            if (r.status === 'ready') v.src = api.proxyUrl(slug, r.id);
            else if (n < 240) setTimeout(() => kick(n + 1), 1000); // proxy hazırlanıyor
          },
          (e: Error) => {
            if (!alive()) return;
            info.current.set(path, { id: '', status: 'error', duration: 0, error: e.message });
            bump((k) => k + 1);
          },
        );
      kick();
    }
    for (const [path, v] of els.current)
      if (!paths.includes(path)) {
        v.pause();
        v.removeAttribute('src');
        els.current.delete(path);
        frames.current.delete(path);
        info.current.delete(path);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug]);

  // Editörden çıkınca videoları durdur ve bırak.
  useEffect(
    () => () => {
      for (const v of els.current.values()) (v.pause(), v.removeAttribute('src'));
      els.current.clear();
      frames.current.clear();
      info.current.clear();
    },
    [],
  );

  return {
    frames: frames.current,
    info: info.current,
    element: (path: string) => els.current.get(path),
    refresh: () => bump((n) => n + 1),
  };
}
