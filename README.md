# cerenbuilds editör

@cerenbuilds için yerel reel ve carousel editörü. Önizleme, timeline ve elle düzenleme bir arada. Claude yan panelde aynı projeyi düzenler.

## Çalıştır

```sh
npm install
npm run dev
```

`http://127.0.0.1:5180` adresini aç. Sunucu `127.0.0.1:4318` portunda çalışır ve yalnızca bu bilgisayardan erişilebilir.

Projeler `~/cerenbuilds/projects/<proje>/` altında durur (`CB_ROOT` ile değiştirilebilir). Videolar kopyalanmaz, yerinde okunur.

Gerekenler:
- ffmpeg ve ffprobe
- Google Chrome (export bunu headless çalıştırır)
- Claude paneli için giriş yapılmış `claude` CLI

## Nasıl çalışır

| Parça | Yer |
|---|---|
| Proje şeması (reel, carousel) | `packages/schema/src/index.ts` |
| Çizim, skill'in `scene.html`'inden taşındı | `packages/renderer/src/kit.ts`, `splitReel.ts`, `carousel.ts` |
| Caption süre formülü (`captions.py` ile birebir) | `packages/renderer/src/timing.ts` |
| Alt yarı kırpma (4K'da skill değerleri) | `packages/renderer/src/crop.ts` |
| Export pipeline (overlay → segment → compose → `_ig.mp4`) | `apps/server/src/export.ts` |
| Claude köprüsü (`claude -p`, stream-json) | `apps/server/src/claude.ts` |
| Claude'a proje kuralları (her projeye yazılır) | `apps/server/templates/CLAUDE.md` |
| Editör arayüzü | `apps/web/src/` |

- **Önizleme = export.** Önizleme ve export aynı renderer'ı kullanır. Export'ta overlay kareleri headless Chrome'da aynı kodla çizilir, ffmpeg bunları alt yarı videosuyla birleştirir.
- **Proxy.** Önizlemede 4K HEVC yerine 720p H.264 bir kopya oynatılır. İlk eklemede hazırlanır, `cache/` altında saklanır.
- **Claude paneli.** Her turdan önce `.history/` altına snapshot alınır. Claude `project.json` ve `scenes.js` dosyalarını düzenler, editör değişikliği izleyip doğrular ve canlı yeniler. Claude'un değiştirdiği öğeler kısa bir süre turuncu yanar. Geçersiz bir dosya bırakırsa değişiklik otomatik geri alınır.
- **Geri alma.** ⌘Z / ⇧⌘Z elle yapılan değişiklikleri ve Claude'un değişikliklerini geri alır. Ayrıca her Claude turunun altında "Bu değişikliği geri al" düğmesi vardır.

## Kısayollar (reel)

| Tuş | İş |
|---|---|
| Boşluk | Oynat / durdur |
| ← → | 1 kare (⇧ ile 1 sn) |
| Home | Başa dön |
| ⌫ | Seçili caption'ı ya da kesiti sil |
| Esc | Seçimi kaldır |
| ⌘Z / ⇧⌘Z | Geri al / yinele |

## Testler

```sh
npm test              # birim: zamanlama (Python formülüyle birebir), kırpma, şema
npm run typecheck
# Sunucu ve web açıkken:
CB_ROOT=/tmp/cb-test CB_WEB=http://127.0.0.1:5180 npm run test:browser
npm run test:parity   # repodaki cerenbuilds-split-reel.skill ile karşılaştırır
```

`test:parity`, skill'in orijinal `scene.html`'i ile bu renderer'ın aynı kareleri piksel piksel aynı çizdiğini doğrular. Orijinalde sahneler `globalAlpha`'yı geri almıyordu ve crossfade sırasında arka plan ile birleşim gölgesi soluk çiziliyordu. Burada bu hata bilinçli olarak düzeltildi; test bu farkı hesaba katar.

## Sonraki aşamalar
- **A2:** sol panelde fikir notları ve ilham linkleri (yt-dlp, keyframe, transkript, Claude analizi). Konuşmalı videolarda faster-whisper ile caption hizalama.
- **A3:** ses efektleri izi, açıklama ve hashtag metni, şablon kütüphanesi.
