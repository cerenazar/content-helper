import { describe, it, expect } from 'vitest';
import { cleanAnalysis, vttToText, pickSubtitle, ytdlpError, extractNote, frameTimes, metaFromInfo, contextFile } from '../src/analysis';
import { clean } from '../src/ideas';

describe('cleanAnalysis', () => {
  it('geçerli analizi korur, bilinmeyen alanları atar', () => {
    const a = cleanAnalysis({ status: 'done', step: '', startedAt: 1, finishedAt: 2, meta: { title: 'T', viewCount: 10, likeCount: -1, extra: 1 }, frames: ['frame-01.jpg', '../x.jpg', 'frame-1.jpg'], hasSubtitles: true, note: '## Hook', hack: 1 });
    expect(a).toMatchObject({ status: 'done', frames: ['frame-01.jpg'], hasSubtitles: true, note: '## Hook', error: null });
    expect(a!.meta).toEqual({ title: 'T', uploader: '', platform: '', description: '', duration: null, viewCount: 10, likeCount: null });
    expect(a).not.toHaveProperty('hack');
  });
  it('geçersiz durumu reddeder', () => {
    expect(cleanAnalysis({ status: 'bitti' })).toBeNull();
    expect(cleanAnalysis(null)).toBeNull();
  });
  it('hata durumunda mesaj zorunlu, yoksa varsayılan', () => {
    expect(cleanAnalysis({ status: 'error' })!.error).toBe('Analiz başarısız oldu.');
    expect(cleanAnalysis({ status: 'done', error: 'x' })!.error).toBeNull();
  });
  it('fikir doğrulaması analizi yalnızca linkli fikirde tutar', () => {
    const analysis = { status: 'running', step: 'Video indiriliyor…', startedAt: 1 };
    expect(clean({ id: 'idea_1', text: '', url: 'https://youtu.be/x', createdAt: 1, project: null, analysis })!.analysis?.status).toBe('running');
    expect(clean({ id: 'idea_2', text: 'not', url: null, createdAt: 1, project: null, analysis })).not.toHaveProperty('analysis');
    expect(clean({ id: 'idea_3', text: '', url: 'https://youtu.be/x', analysis: { status: 'nope' } })).not.toHaveProperty('analysis');
  });
});

describe('vttToText', () => {
  it('zaman damgalarını, etiketleri ve tekrar eden satırları atar', () => {
    const vtt = `WEBVTT
Kind: captions
Language: tr

NOTE bu bir not
silinecek

00:00:00.000 --> 00:00:01.500 align:start position:0%
merhaba<00:00:00.500><c> herkes</c>

00:00:01.500 --> 00:00:03.000
merhaba herkes
bugün &amp; yarın

1
00:00:03.000 --> 00:00:04.000
bugün &amp; yarın
`;
    expect(vttToText(vtt)).toBe('merhaba herkes\nbugün & yarın');
  });
  it('uzun metni keser', () => {
    expect(vttToText('WEBVTT\n\n00:00.000 --> 00:01.000\n' + 'a'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('pickSubtitle', () => {
  it('önce elle yazılmış altyazı', () => {
    expect(pickSubtitle({ language: 'en', subtitles: { 'en-US': [], live_chat: [] }, automatic_captions: { 'en-orig': [] } })).toEqual({ lang: 'en-US', auto: false });
  });
  it('otomatikte çeviri değil asıl dil', () => {
    expect(pickSubtitle({ language: 'tr', automatic_captions: { 'tr-orig': [], tr: [], en: [] } })).toEqual({ lang: 'tr-orig', auto: true });
    expect(pickSubtitle({ automatic_captions: { de: [], en: [] } })).toEqual({ lang: 'en', auto: true });
  });
  it('hiç yoksa null', () => {
    expect(pickSubtitle({ subtitles: {}, automatic_captions: {} })).toBeNull();
    expect(pickSubtitle({ subtitles: { live_chat: [] } })).toBeNull();
  });
});

describe('ytdlpError', () => {
  it('girişli Instagram linkini açıklar', () => {
    expect(ytdlpError('ERROR: [Instagram] abc: login required to access this content', 'https://www.instagram.com/reel/abc/')).toMatch(/Instagram linki giriş istiyor/);
  });
  it('YouTube bot doğrulaması, gizli video, desteklenmeyen link, yt-dlp yok', () => {
    expect(ytdlpError("ERROR: Sign in to confirm you're not a bot", 'https://youtube.com/shorts/x')).toMatch(/bot doğrulaması/);
    expect(ytdlpError('ERROR: [youtube] x: Private video', 'https://youtube.com/shorts/x')).toMatch(/gizli/);
    expect(ytdlpError('ERROR: Unsupported URL: https://example.com', 'https://example.com')).toMatch(/desteklenmiyor/);
    expect(ytdlpError('ENOENT spawn yt-dlp ENOENT', 'https://youtube.com/x')).toMatch(/brew install yt-dlp/);
  });
  it('bilinmeyen hatada son ERROR satırı', () => {
    expect(ytdlpError('foo\nERROR: tuhaf bir şey', 'https://x.com/a')).toBe('Video alınamadı: tuhaf bir şey');
  });
});

describe('not ve kareler', () => {
  it('giriş cümlesini atar', () => {
    expect(extractNote('İşte not:\n\n## Hook (ilk 3 sn)\nx')).toBe('## Hook (ilk 3 sn)\nx');
    expect(extractNote('## Yapı\ny')).toBe('## Yapı\ny');
  });
  it('kısa videoda 6, uzunda 8 eşit aralıklı kare', () => {
    expect(frameTimes(12)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(frameTimes(40)).toHaveLength(8);
    expect(frameTimes(40)[0]).toBe(2.5);
    expect(frameTimes(0)).toEqual([]);
  });
  it('yt-dlp bilgisinden meta ve context.md', () => {
    const meta = metaFromInfo({ title: 'Başlık', channel: 'kanal', extractor_key: 'Youtube', duration: 31, view_count: 1200, description: 'açıklama' });
    expect(meta).toMatchObject({ title: 'Başlık', uploader: 'kanal', platform: 'Youtube', duration: 31, viewCount: 1200, likeCount: null });
    const ctx = contextFile('https://youtu.be/x', meta, [{ file: 'frame-01.jpg', t: 1.94 }], '');
    expect(ctx).toContain('- frame-01.jpg: 1.9 sn');
    expect(ctx).toContain('(altyazı yok)');
  });
});
