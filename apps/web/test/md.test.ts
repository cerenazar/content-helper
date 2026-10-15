import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline } from '../src/md';

describe('parseMarkdown', () => {
  it('başlık, paragraf ve listeler', () => {
    const b = parseMarkdown('## Hook (ilk 3 sn)\nİlk satır\ndevamı\n\n- bir\n- iki\n  sürüyor\n\n1. ilk\n2. ikinci');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol']);
    expect(b[0]).toEqual({ t: 'h', level: 2, c: [{ t: 'text', v: 'Hook (ilk 3 sn)' }] });
    expect(b[1]).toEqual({ t: 'p', c: [{ t: 'text', v: 'İlk satır devamı' }] });
    expect(b[2]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'bir' }], [{ t: 'text', v: 'iki sürüyor' }]] });
  });
  it('kod bloğu düz metin kalır', () => {
    expect(parseMarkdown('```\n<script>x</script>\n```')).toEqual([{ t: 'pre', v: '<script>x</script>' }]);
  });
  it('HTML etiketleri metin olarak kalır', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([{ t: 'p', c: [{ t: 'text', v: '<img src=x onerror=alert(1)>' }] }]);
  });
});

describe('parseInline', () => {
  it('kalın, italik, kod', () => {
    expect(parseInline('**kalın** ve *eğik* `kod`')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'kalın' }] },
      { t: 'text', v: ' ve ' },
      { t: 'i', c: [{ t: 'text', v: 'eğik' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'kod' },
    ]);
  });
  it('yalnızca http(s) linkleri bağlantı olur', () => {
    expect(parseInline('[site](https://example.com/a)')).toEqual([{ t: 'a', href: 'https://example.com/a', c: [{ t: 'text', v: 'site' }] }]);
    expect(parseInline('[tıkla](javascript:alert(1))')[0]).toEqual({ t: 'text', v: 'tıkla' });
  });
  it('çıplak URL bağlantı olur, sondaki noktalama dışarıda kalır', () => {
    expect(parseInline('bak: https://example.com/x.')).toEqual([
      { t: 'text', v: 'bak: ' },
      { t: 'a', href: 'https://example.com/x', c: [{ t: 'text', v: 'https://example.com/x' }] },
      { t: 'text', v: '.' },
    ]);
  });
  it('kelime içi alt çizgi italik değildir', () => {
    expect(parseInline('snake_case_name')).toEqual([{ t: 'text', v: 'snake_case_name' }]);
  });
});
