import { describe, it, expect } from 'vitest';
import { extractHooks, cleanRun, cleanHook, researchPrompt, stepFor } from '../src/research-lib';

describe('extractHooks', () => {
  it('son json bloğunu ayırır, özetten çıkarır', () => {
    const text = [
      '## Öne çıkanlar',
      '- Liste formatı çalışıyor',
      '',
      '```json',
      '{"hooks": [{"text": "Claude Code ile 1 günde app", "why": "Somut süre", "source": "https://example.com/a"}, {"text": "Agent mı, otomasyon mu?", "why": "Karşıtlık"}]}',
      '```',
    ].join('\n');
    const r = extractHooks(text);
    expect(r.found).toBe(true);
    expect(r.hooks).toEqual([
      { text: 'Claude Code ile 1 günde app', why: 'Somut süre', source: 'https://example.com/a' },
      { text: 'Agent mı, otomasyon mu?', why: 'Karşıtlık' },
    ]);
    expect(r.summary).toBe('## Öne çıkanlar\n- Liste formatı çalışıyor');
  });
  it('dizi biçimini, sondaki virgülü ve dil etiketsiz bloğu kabul eder', () => {
    const r = extractHooks('özet\n```\n[{"text": "a", "why": "b",},]\n```');
    expect(r.hooks).toEqual([{ text: 'a', why: 'b' }]);
    expect(r.summary).toBe('özet');
  });
  it('hook olmayan kod bloklarını atlar, sonuncuyu tercih eder', () => {
    const text = '```json\n{"hooks":[{"text":"eski"}]}\n```\nara\n```bash\nls\n```\n```json\n{"hooks":[{"text":"yeni"}]}\n```';
    const r = extractHooks(text);
    expect(r.hooks.map((h) => h.text)).toEqual(['yeni']);
    expect(r.summary).toContain('```bash');
  });
  it('bozuk JSON: hook yok, metin özet olarak kalır', () => {
    const r = extractHooks('özet\n```json\n{"hooks": [\n```');
    expect(r).toMatchObject({ found: false, hooks: [] });
    expect(r.summary).toContain('özet');
  });
  it('güvensiz kaynak linkini atar', () => {
    expect(cleanHook({ text: 'x', source: 'javascript:alert(1)' })).toEqual({ text: 'x', why: '' });
    expect(cleanHook({ text: '  ' })).toBeNull();
    expect(cleanHook('düz metin')).toEqual({ text: 'düz metin', why: '' });
  });
});

describe('cleanRun', () => {
  it('geçerli kaydı doğrular', () => {
    const r = cleanRun({ id: 'r_1', kind: 'topic', prompt: 'agent', createdAt: 5, status: 'done', steps: ['a', 3], summary: 's', hooks: [{ text: 'h' }, null] });
    expect(r).toMatchObject({ id: 'r_1', kind: 'topic', status: 'done', steps: ['a'], hooks: [{ text: 'h', why: '' }], error: null });
  });
  it('bilinmeyen tür ve kimliği reddeder', () => {
    expect(cleanRun({ id: 'r_1', kind: 'x' })).toBeNull();
    expect(cleanRun({ id: '../x', kind: 'free' })).toBeNull();
  });
  it('bilinmeyen durum hataya döner', () => {
    expect(cleanRun({ id: 'r_2', kind: 'free', status: '?' })).toMatchObject({ status: 'error', error: 'Araştırma başarısız oldu.' });
  });
});

describe('researchPrompt', () => {
  it('niş, konu ve JSON biçimini içerir', () => {
    const p = researchPrompt('topic', 'Mac verimliliği', 'Raycast', '15 Ekim 2026');
    expect(p).toContain('Mac verimliliği');
    expect(p).toContain('"Raycast"');
    expect(p).toContain('```json');
    expect(p).toContain('Türkçe');
  });
  it('araç adımlarını Türkçe özetler', () => {
    expect(stepFor('WebSearch', { query: 'claude code reels' })).toBe("Web'de aranıyor: claude code reels");
    expect(stepFor('WebFetch', { url: 'https://www.example.com/x' })).toBe('Sayfa okunuyor: example.com');
  });
});
