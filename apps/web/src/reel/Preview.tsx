import { useEffect, useMemo, useRef, useState } from 'react';
import { createReelRenderer, ensureFonts, cutAt, cropRect, displaySize, type ReelRenderer } from '@cb/renderer';
import { REEL, type ReelProject } from '@cb/schema';
import { useStore } from '../store';
import { api } from '../api';
import { tickSfx } from './sfxAudio';

/**
 * 9:16 önizleme. Üst yarı ve caption'lar export'la AYNI renderer'dan gelir.
 * Alt yarı: kesitin klibinin proxy'si, aynı kırpma hesabıyla canvas'a çizilir.
 * Saat: oynatırken performance.now ana saattir, videolar ona hizalanır.
 */
export function Preview({ slug, project, scenes }: { slug: string; project: ReelProject; scenes: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<ReelRenderer | null>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const dirty = useRef(true);
  const [ready, setReady] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const invalidError = useStore((s) => s.invalidError);

  // Renderer + fontlar
  useEffect(() => {
    const g = canvasRef.current!.getContext('2d')!;
    rRef.current = createReelRenderer(g);
    ensureFonts().then(() => {
      setReady(true);
      dirty.current = true;
    });
  }, []);

  // Proje ya da sahne kodu değişince yeniden yükle
  useEffect(() => {
    if (!rRef.current) return;
    setSceneError(rRef.current.load(project, scenes));
    dirty.current = true;
  }, [project, scenes, ready]);

  // Klip başına bir gizli <video> (proxy)
  const clipIds = useMemo(() => project.clips.map((c) => c.id).join(','), [project.clips]);
  useEffect(() => {
    const map = videos.current;
    for (const c of project.clips) {
      if (map.has(c.id)) continue;
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.playsInline = true;
      v.crossOrigin = 'anonymous';
      // src yalnızca proxy hazır olunca verilir: hazırlanırken istek atılıp 404 alınmasın.
      let errors = 0;
      const load = () => {
        if (map.get(c.id) !== v) return; // klip bu arada kaldırıldı
        v.src = api.proxyUrl(slug, c.id) + '?v=' + Date.now();
      };
      v.addEventListener('seeked', () => (dirty.current = true));
      v.addEventListener('loadeddata', () => (dirty.current = true));
      v.addEventListener('error', () => {
        if (v.getAttribute('src') && ++errors <= 3) setTimeout(() => kick(), 2500);
      });
      map.set(c.id, v);
      // Sunucu proxy'yi arka planda üretir; durum "ready" olana kadar saniyede bir sorulur.
      const kick = (n = 0): void => {
        if (map.get(c.id) !== v) return;
        void api.proxy(slug, c.id).then(
          (r) => (r.status === 'ready' ? load() : n < 600 && setTimeout(() => kick(n + 1), 1000)),
          () => n < 10 && setTimeout(() => kick(n + 1), 1000),
        );
      };
      kick();
    }
    for (const [id, v] of map)
      if (!project.clips.some((c) => c.id === id)) {
        v.removeAttribute('src');
        map.delete(id);
      }
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipIds, slug]);

  // Ana döngü
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let prevTime = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const st = useStore.getState();
      const r = rRef.current;
      if (!r || st.project.kind !== 'reel') return;
      const p = st.project;
      const dur = r.timeline.duration;
      let t = st.time;
      if (st.playing) {
        // J/K/L: rate negatifse geri, 2/4 ise hızlı
        t = t + ((now - last) / 1000) * st.rate;
        if (t >= dur) {
          t = dur;
          st.setPlaying(false);
        } else if (t <= 0) {
          t = 0;
          st.setPlaying(false);
        }
        useStore.setState({ time: t });
      }
      last = now;
      const fwd = st.playing && st.rate > 0;
      tickSfx(p.sfx, t, st.playing, st.rate);
      const at = cutAt(p, t);
      // Videoları senkronla
      for (const [id, v] of videos.current) {
        const active = at && at.cut.clip === id;
        if (!active) {
          if (!v.paused) v.pause();
          continue;
        }
        v.muted = !(p.audio === 'speech' && fwd);
        if (fwd) {
          if (v.playbackRate !== st.rate) v.playbackRate = st.rate;
          if (v.paused) {
            v.currentTime = at.srcT;
            void v.play().catch(() => {});
          } else if (Math.abs(v.currentTime - at.srcT) > 0.12 * st.rate) v.currentTime = at.srcT;
        } else {
          // Durunca ya da geri oynatırken: video durur, kare kare aranır
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - at.srcT) > 0.02 && !v.seeking) v.currentTime = at.srcT;
        }
      }
      if (!st.playing && !dirty.current && t === prevTime) return;
      prevTime = t;
      dirty.current = false;
      r.render(t, (g) => {
        g.fillStyle = '#F5F0E9';
        g.fillRect(0, REEL.TOP, REEL.W, REEL.H - REEL.TOP);
        if (!at) return;
        const clip = p.clips.find((c) => c.id === at.cut.clip);
        const v = videos.current.get(at.cut.clip);
        if (!clip || !v || v.readyState < 2 || !v.videoWidth) {
          g.fillStyle = '#2a2420';
          g.fillRect(0, REEL.TOP, REEL.W, REEL.H - REEL.TOP);
          g.fillStyle = '#a9aaa4';
          g.font = '600 30px -apple-system, sans-serif';
          g.textAlign = 'center';
          g.fillText('önizleme hazırlanıyor…', REEL.W / 2, REEL.TOP + 480);
          dirty.current = true;
          return;
        }
        const { W, H } = displaySize(clip);
        const c = cropRect(at.cut.kind, W, H);
        const k = v.videoWidth / W;
        g.drawImage(v, c.x * k, c.y * k, c.w * k, c.h * k, 0, REEL.TOP, REEL.W, REEL.H - REEL.TOP);
      });
      if (r.lastError !== sceneErrRef.current) {
        sceneErrRef.current = r.lastError;
        setRunErr(r.lastError);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sceneErrRef = useRef<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  useEffect(() => {
    // Seçim, zaman vb. değişince yeniden çiz
    return useStore.subscribe(() => (dirty.current = true));
  }, []);

  const err = sceneError || runErr;
  return (
    <div className="preview-wrap">
      <div className="preview" role="img" aria-label="Reel önizlemesi">
        <canvas ref={canvasRef} width={REEL.W} height={REEL.H} />
        {err && (
          <div className="scene-error" role="alert">
            Sahne kodu hatası: {err}
          </div>
        )}
      </div>
      {invalidError && (
        <div className="invalid-banner" role="alert">
          Dosyada geçersiz değişiklik var, uygulanmadı: {invalidError}
        </div>
      )}
    </div>
  );
}
