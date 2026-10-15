import { useState } from 'react';
import { moveItem, reorderZ } from '@cb/renderer';
import type { Slide, SlideElement } from '@cb/schema';
import { typeLabel } from './Stage';
import { Eye, EyeOff, Lock, Unlock, Grip, IconTitle, IconText, IconImage, IconWindow, IconVideo, IconPill, IconChip, IconAgent } from './icons';

export function TypeIcon({ e, size = 15 }: { e: SlideElement; size?: number }) {
  switch (e.type) {
    case 'title':
      return <IconTitle size={size} />;
    case 'text':
      return <IconText size={size} />;
    case 'image':
      return <IconImage size={size} />;
    case 'window':
      return e.video ? <IconVideo size={size} /> : <IconWindow size={size} />;
    case 'pill':
      return <IconPill size={size} />;
    case 'chip':
      return <IconChip size={size} />;
    case 'agent':
      return <IconAgent size={size} />;
  }
}

const preview = (e: SlideElement) =>
  e.text.replace(/\s+/g, ' ').trim() || (e.video ? e.video.split('/').pop()! : e.src ? e.src.split('/').pop()! : '');

/**
 * Katmanlar: en üstteki öğe listenin başında. Sürükleyerek ya da ⌥↑/⌥↓ ile sıra değişir.
 * Göz: gizle/göster. Kilit: sürükleme, boyutlandırma ve silmeyi engeller.
 */
export function Layers({
  slide,
  picks,
  selIds,
  selectIds,
  setElements,
  patchEls,
}: {
  slide: Slide;
  picks: boolean;
  selIds: string[];
  selectIds: (ids: string[], primary?: string) => void;
  setElements: (fn: (els: SlideElement[]) => SlideElement[], key?: string) => void;
  patchEls: (patches: Record<string, Partial<SlideElement>>, key?: string) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const rows = slide.elements.slice().reverse(); // üstteki önce
  const n = rows.length;

  const drop = (to: number) => {
    if (!drag) return;
    const from = drag.from;
    setDrag(null);
    setElements((els) => moveItem(els.slice().reverse(), from, to).reverse());
  };

  if (!n) return <p className="hint layers-empty">Bu slaytta öğe yok.</p>;
  return (
    <ul className="layers" aria-label="Katmanlar" onDragLeave={(e) => e.currentTarget === e.target && setDrag((d) => (d ? { ...d, over: null } : d))}>
      {rows.map((e, i) => {
        const sel = selIds.includes(e.id);
        return (
          <li
            key={e.id}
            className={'layer' + (sel ? ' sel' : '') + (e.hidden ? ' is-hidden' : '') + (drag?.over === i ? ' drop-before' : '') + (drag?.over === n && i === n - 1 ? ' drop-after' : '')}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('text/plain', e.id);
              setDrag({ from: i, over: null });
            }}
            onDragOver={(ev) => {
              if (!drag) return;
              ev.preventDefault();
              const r = ev.currentTarget.getBoundingClientRect();
              const over = ev.clientY > r.top + r.height / 2 ? i + 1 : i;
              if (over !== drag.over) setDrag({ ...drag, over });
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              if (drag?.over != null) drop(drag.over);
            }}
            onDragEnd={() => setDrag(null)}
          >
            <span className="grip" aria-hidden>
              <Grip size={14} />
            </span>
            <button
              className="layer-main"
              aria-pressed={sel}
              aria-label={`${typeLabel(e, picks)}: ${preview(e) || 'boş'}${e.hidden ? ', gizli' : ''}${e.locked ? ', kilitli' : ''}. ⌥↑ ⌥↓ ile sırasını değiştir`}
              onClick={(ev) => {
                if (ev.shiftKey || ev.metaKey) selectIds(sel ? selIds.filter((x) => x !== e.id) : [...selIds, e.id], sel ? undefined : e.id);
                else selectIds([e.id]);
              }}
              onKeyDown={(ev) => {
                if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
                  ev.preventDefault();
                  setElements((els) => reorderZ(els, [e.id], ev.key === 'ArrowUp' ? 'forward' : 'backward'));
                }
              }}
            >
              <span className="layer-ic" aria-hidden>
                <TypeIcon e={e} />
              </span>
              <span className="layer-txt">
                <span className="layer-type">{typeLabel(e, picks)}</span>
                <span className="layer-prev">{preview(e)}</span>
              </span>
            </button>
            <button
              className="btn ghost icon tiny"
              aria-pressed={e.hidden}
              aria-label={e.hidden ? 'Göster' : 'Gizle'}
              title={e.hidden ? 'Göster' : 'Gizle'}
              onClick={() => patchEls({ [e.id]: { hidden: !e.hidden } })}
            >
              {e.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              className="btn ghost icon tiny"
              aria-pressed={e.locked}
              aria-label={e.locked ? 'Kilidi aç' : 'Kilitle'}
              title={e.locked ? 'Kilidi aç' : 'Kilitle'}
              onClick={() => patchEls({ [e.id]: { locked: !e.locked } })}
            >
              {e.locked ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
