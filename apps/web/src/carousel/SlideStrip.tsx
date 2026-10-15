import { useEffect, useRef, useState } from 'react';
import type { ImageSource } from '@cb/renderer';
import type { CarouselProject } from '@cb/schema';
import { SlideCanvas } from './SlideCanvas';
import { Plus } from '../icons';
import { More, IconVideo } from './icons';
import { slideVideos } from '@cb/renderer';

export interface StripActions {
  select(i: number): void;
  move(from: number, to: number): void;
  duplicate(i: number): void;
  remove(i: number): void;
  addAfter(i: number): void;
}

/** Alt şerit: sürükleyerek sırala, sağ tık ya da ⋯ ile menü, ⌥←/⌥→ ile taşı. */
export function SlideStrip({
  project,
  index,
  images,
  flash,
  act,
}: {
  project: CarouselProject;
  index: number;
  images: Map<string, ImageSource>;
  flash: Set<string>;
  act: StripActions;
}) {
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const n = project.slides.length;
  return (
    <div className="strip" role="listbox" aria-label="Slaytlar" aria-orientation="horizontal">
      {project.slides.map((s, i) => (
        <div
          key={s.id}
          className={'thumb-wrap' + (drag?.over === i ? ' drop-before' : '') + (drag?.over === n && i === n - 1 ? ' drop-after' : '')}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', s.id);
            setDrag({ from: i, over: null });
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const over = e.clientX > r.left + r.width / 2 ? i + 1 : i;
            if (over !== drag.over) setDrag({ ...drag, over });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag && drag.over != null) act.move(drag.from, drag.over);
            setDrag(null);
          }}
          onDragEnd={() => setDrag(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            act.select(i);
            setMenu({ i, x: e.clientX, y: e.clientY });
          }}
        >
          <button
            className={'thumb' + (flash.has(s.id) ? ' flash' : '')}
            role="option"
            aria-selected={i === index}
            onClick={() => act.select(i)}
            onKeyDown={(e) => {
              if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                const to = e.key === 'ArrowLeft' ? i - 1 : i + 2;
                if (to >= 0 && to <= n) act.move(i, to);
              }
            }}
            aria-label={`Slayt ${i + 1}${slideVideos(project, i).length ? ' (video)' : ''}. ⌥← ⌥→ ile taşı`}
          >
            <SlideCanvas project={project} index={i} images={images} />
            <span>{i + 1}</span>
            {slideVideos(project, i).length > 0 && (
              <i className="thumb-vid" aria-hidden>
                <IconVideo size={12} />
              </i>
            )}
          </button>
          <button
            className="thumb-more"
            aria-label={`Slayt ${i + 1} menüsü`}
            aria-haspopup="menu"
            aria-expanded={menu?.i === i}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              act.select(i);
              setMenu({ i, x: r.left, y: r.bottom + 4 });
            }}
          >
            <More size={14} />
          </button>
        </div>
      ))}
      <button className="add-tile" onClick={() => act.addAfter(index)}>
        <Plus size={18} />
        Slayt ekle
      </button>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ['Çoğalt', () => act.duplicate(menu.i)],
            ['Sonrasına boş slayt ekle', () => act.addAfter(menu.i)],
            ['Sola taşı', () => act.move(menu.i, menu.i - 1), menu.i === 0],
            ['Sağa taşı', () => act.move(menu.i, menu.i + 2), menu.i === n - 1],
            ['Sil', () => act.remove(menu.i), n <= 1, true],
          ]}
        />
      )}
    </div>
  );
}

/** Basit açılır menü: ↑/↓ ile gez, Enter seç, Esc ya da dışarı tık kapatır. */
function Menu({ x, y, items, onClose }: { x: number; y: number; items: [string, () => void, boolean?, boolean?][]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus();
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close.current();
    addEventListener('pointerdown', away, true);
    return () => removeEventListener('pointerdown', away, true);
  }, []);
  // Ekrandan taşmasın.
  const left = Math.min(x, innerWidth - 220),
    top = Math.min(y, innerHeight - items.length * 36 - 16);
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      style={{ left, top }}
      onKeyDown={(e) => {
        const btns = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const at = btns.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), onClose());
        if (e.key === 'ArrowDown') (e.preventDefault(), btns[(at + 1) % btns.length]?.focus());
        if (e.key === 'ArrowUp') (e.preventDefault(), btns[(at - 1 + btns.length) % btns.length]?.focus());
      }}
    >
      {items.map(([label, fn, disabled, danger]) => (
        <button key={label} role="menuitem" className={danger ? 'danger' : undefined} disabled={disabled} onClick={() => (onClose(), fn())}>
          {label}
        </button>
      ))}
    </div>
  );
}
