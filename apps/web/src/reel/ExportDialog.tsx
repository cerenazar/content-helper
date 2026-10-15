import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { api, type Job } from '../api';
import { CheckItem } from './Inspector';

const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + ' MB';

export function ExportDialog({ slug, jobId, onClose }: { slug: string; jobId: string; onClose: () => void }) {
  const job = useStore((s) => s.jobs[jobId]) as Job | undefined;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onClose]);

  const r = job?.result;
  const v = Date.now();
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="exp-h" tabIndex={-1} ref={ref}>
        <div className="row">
          <h2 id="exp-h" className="grow">
            Dışa aktar
          </h2>
          <button className="btn ghost small" onClick={onClose}>
            Kapat
          </button>
        </div>
        {!job && <p className="hint">Başlatılıyor…</p>}
        {job?.status === 'running' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="hint">{job.message || 'Hazırlanıyor'}</span>
            <span className="progress">
              <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </span>
            <span className="hint">Export sürerken düzenlemeye devam edebilirsin. Çıktı, başlattığın andaki hâlden üretilir.</span>
          </div>
        )}
        {job?.status === 'error' && <p className="err">Export durdu: {job.message}</p>}
        {job?.status === 'done' && r && (
          <div className="export-grid">
            <video src={api.exportUrl(slug, `${slug}_ig.mp4`) + '?v=' + v} controls playsInline />
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <ul className="checks">
                <CheckItem ok={r.under30}>
                  Instagram kopyası {mb(r.sizes.ig)} {r.under30 ? '(30 MB altında)' : '(30 MB üstünde)'}
                </CheckItem>
                <CheckItem ok={r.probe.width === 1080 && r.probe.height === 1920}>
                  {r.probe.width}×{r.probe.height}, {r.probe.fps} fps, {r.probe.codec.toUpperCase()}, {r.duration.toFixed(1)} sn
                </CheckItem>
                <li className="hint">Tam kalite: {mb(r.sizes.full)}</li>
              </ul>
              <div className="row wrap">
                <button className="btn primary" onClick={() => void api.reveal(r.ig)}>
                  Finder'da göster
                </button>
              </div>
              <div>
                <p className="hint" style={{ margin: '0 0 4px' }}>
                  Hook, ilk 3,6 sn (3 fps). Önemli bir obje yazının arkasında kalmasın.
                </p>
                <img src={api.exportUrl(slug, 'hook.jpg') + '?v=' + v} alt="Hook kontrol kareleri" />
              </div>
              <div>
                <p className="hint" style={{ margin: '0 0 4px' }}>
                  Tüm video
                </p>
                <img src={api.exportUrl(slug, 'check.jpg') + '?v=' + v} alt="Video kontrol kareleri" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
