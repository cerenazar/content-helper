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

/** Carousel kısayolları (sahne ve katmanlar). */
export const CAROUSEL_SHORTCUTS: [string[], string][] = [
  [['Çift tık', '↩'], 'Seçili metni yerinde düzenle'],
  [['⇧-tık'], 'Seçime ekle / çıkar (boş alanda sürükleyerek de seçilir)'],
  [['⌘A'], 'Slayttaki tüm öğeleri seç'],
  [['⌘C', '⌘X', '⌘V'], 'Kopyala / kes / yapıştır (başka slayta da)'],
  [['⌘D'], 'Seçiliyi çoğalt'],
  [['⌫'], 'Seçiliyi sil (kilitli öğeler silinmez)'],
  [['←', '→', '↑', '↓'], '1 px kaydır (⇧ ile 10 px)'],
  [['⌘]', '⌘['], 'Bir katman öne / arkaya (⇧ ile en öne / en arkaya)'],
  [['⌥↑', '⌥↓'], 'Katmanlar listesinde sırayı değiştir'],
  [['⌘+', '⌘−', '⌘0'], 'Yakınlaştır / uzaklaştır / sığdır'],
  [['⌘'], 'Sürüklerken basılı tut: yapışma kapalı'],
  [['⇧'], 'Köşeden boyutlarken oranı koru (görsel, pencere)'],
  [['Esc'], 'Seçimi kaldır'],
  [['⌘Z', '⇧⌘Z'], 'Geri al / yinele'],
  [['?'], 'Bu listeyi aç / kapat'],
];

export function ShortcutsDialog({ onClose, items = SHORTCUTS }: { onClose: () => void; items?: [string[], string][] }) {
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
          {items.map(([keys, label]) => (
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
