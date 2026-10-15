import { useEffect, useRef } from 'react';

/** Kısayol listesi: README'deki tabloyla aynı tutulur. */
export const SHORTCUTS: [string[], string][] = [
  [['Boşluk'], 'Oynat / durdur'],
  [['J', 'K', 'L'], 'Geri oynat / durdur / ileri oynat (tekrar basınca 2×, 4×)'],
  [['←', '→'], '1 kare geri / ileri (⇧ ile 1 sn)'],
  [['Home', 'End'], 'Başa / sona git'],
  [['B'], 'Oynatma kafasında kesiti böl (⌘B de olur)'],
  [['⌫'], 'Seçiliyi sil; kesitte boşluk kapanır (ripple)'],
  [['⌥←', '⌥→'], 'Seçili kesiti bir sıra öne / arkaya taşı'],
  [['⌘+', '⌘−'], 'Timeline yakınlaştır / uzaklaştır (ctrl + tekerlek, iki parmak)'],
  [['⌘0'], 'Timeline’ı sığdır'],
  [['N'], 'Yapışmayı aç / kapat'],
  [['Esc'], 'Seçimi kaldır, paneli kapat'],
  [['⌘Z', '⇧⌘Z'], 'Geri al / yinele'],
  [['?'], 'Bu listeyi aç / kapat'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener('keydown', on, true);
    return () => {
      removeEventListener('keydown', on, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog keys-dialog" role="dialog" aria-modal="true" aria-labelledby="keys-h" tabIndex={-1} ref={ref}>
        <div className="row">
          <h2 id="keys-h" className="grow">
            Klavye kısayolları
          </h2>
          <button className="btn ghost small" onClick={onClose}>
            Kapat
          </button>
        </div>
        <dl className="keys">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="keys-row">
              <dt>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
