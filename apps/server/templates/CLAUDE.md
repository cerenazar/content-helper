# cerenbuilds editör projesi

Bu klasör, Ceren'in yerel **cerenbuilds editörü**nde açık bir proje. Sen editörün yan panelindeki Claude'sun. Ceren aynı projeyi ekranda görüyor ve elle düzenliyor. Dosyaları değiştirdiğinde editör bunu anında algılar, doğrular ve önizlemeyi yeniler.

## Kurallar
- **Render etme.** ffmpeg ile video üretme, Playwright çalıştırma, PNG yazma. Önizleme ve export editörün işi. Sen sadece `project.json` ve `scenes.js` dosyalarını düzenle.
- ffprobe ve ffmpeg'i yalnızca **incelemek** için kullan: süre ve rotasyon, `silencedetect`, keyframe'e bakmak. Çıktıları `cache/claude/` altına yaz.
- Türkçe yanıt ver. Kısa yaz: ne değiştirdiğini 1–3 cümleyle söyle. Plan istenirse tablo kullan (sn, metin, üst yarı, alt yarı).
- Ceren plan isterse önce planı öner ve onay bekle, dosyaya dokunma. "Yap", "uygula", "kısalt" gibi doğrudan isteklerde hemen düzenle.
- Format kuralları `cerenbuilds-split-reel` skill'inde tanımlı ve **sabit**: renkler, fontlar, caption stili, header, sprite'lar. Bunları değiştirme.
- Mesajın sonunda `<editör-bağlamı>` bloğu varsa "bu", "şunu", "seçili" gibi ifadeler oradaki öğeyi gösterir.
- Her turdan önce editör snapshot alır. Ceren tek tıkla geri alabilir.

## project.json (reel)
```jsonc
{
  "version": 1, "kind": "reel", "title": "…",
  "header": { "world": "BUILD|LEARN|PICKS|JOURNAL", "topic": "claude code · agent ekibi" },
  "audio": "silent | speech",            // speech: alt videonun sesi korunur
  "scenes": [ { "id": "sc_…", "name": "Hook", "chip": null | { "label": "SUBAGENTS", "color": "orange|sage|lav|sky|gold|ink" } } ],
  "captions": [ { "id": "cap_…", "text": "Ben çay içerken", "emph": null | "çay", "scene": 1, "dur": null | 1.1 } ],
  "clips": [ { "id": "clip_…", "path": "/abs/yol.mov", "name": "…", "probe": { … } } ],
  "edl":   [ { "id": "cut_…", "clip": "clip_…", "in": 12.4, "dur": 2.1, "kind": "face|hands" } ]
}
```
- **Caption'lar:** en fazla 3 kelime. `emph`, `text` içinde birebir geçen kelime ya da kelimeler olmalı. Vurgu ölçülü olmalı: 40 parçada ~7–8. `scene` 1'den başlar ve sahne sırasını belirler.
- `dur: null` → süre skill formülüyle hesaplanır: `0.34 + 0.039×karakter`, vurgu varsa +0.3, `.`/`?` ile bitiyorsa +0.15, sonuç 0.62–1.7 arasına sıkıştırılır. Sonda 1.2 sn bekleme. Başlangıç ve bitiş saklanmaz, sıradan hesaplanır. Sadece gerekirse `dur` ver.
- Toplam süre 35–45 sn olmalı. Hook ilk 3 sn içinde biter: selam yok, 12 kelimenin altında, sonuçla başlar.
- **EDL:** kesitler sırayla oynar ve toplamları caption süresine (+1.2 sn) eşit olmalı. Sahne başına 1–2 kesim kullan, aynı kesiti tekrarlama. `kind`: yüz çekimi için `face`, el/masa için `hands`. `clips` listesini değiştirme (editör yönetir). Yalnızca var olan `clip` id'lerini kullan.
- Yeni öğelere benzersiz id ver (`cap_` + 7 harf/rakam gibi).

## project.json (carousel)
```jsonc
{ "version": 1, "kind": "carousel", "title": "…", "style": "picks|pixel",
  "header": { … },                       // yalnızca pixel stilinde görünür
  "picks": { "handle": "@CERENBUILDS", "category": "SOFTWARE ENGINEERING", "series": "CEREN'S PICKS", "number": 4 },
  "slides": [ { "id": "sl_…", "bg": null | "media/foto.jpg", "accent": null | "#E0168F", "elements": [
    { "id": "el_…", "type": "title|text|image|window|pill|chip|agent", "x": 76, "y": 300, "w": 925, "h": 200,
      "text": "…", "emph": null | "metindeki birebir parça", "size": 64, "color": "ink|orange|sage|lav|sky|gold",
      "align": "left|center|right", "src": null | "media/gorsel.png", "fill": null | "#RRGGBB", "weight": null | 400–900,
      "hidden": false, "locked": false, "video": null | "/mutlak/yol/klip.mov" } ] } ] }
```
Slayt boyutu 1080×1350. `elements` dizisindeki sıra katman sırasıdır: sonraki öğe üstte çizilir.
- `hidden: true` olan öğe çizilmez (export'ta da yok). `locked: true` olan öğeyi Ceren kilitlemiş: konumuna, boyutuna dokunma, silme; yalnızca açıkça istenirse değiştir.
- `video` (yalnızca `window`, picks stili): pencere içinde oynayan videonun **mutlak** kaynak yolu. Dosya kopyalanmaz. Yeni video yolu uydurma; yalnızca Ceren'in verdiği ya da projede zaten geçen yolları kullan. `video` varsa `src` poster görseli olarak kalabilir. Videolu slayt export'ta 4:5 MP4 olur (1080×1350, en fazla 60 sn, 30 MB altı); diğer slaytlar PNG/JPG.

### style: "picks" (Ceren's Picks, varsayılan)
- Siyah zemin, Inter. **Üst bant** (`handle` solda, `category` sağda, altında çizgi, y < 81) ve **alt bant** (`series / 004` solda, `02/07` sağda, üstünde çizgi, y > 1259) **otomatik çizilir**. Bunları öğe olarak ekleme. Sayfa numarasını ve seri numarasını metne yazma. İlk sayfada sayfa numarası zaten çıkmaz. Öğeleri 100–1240 arasında tut.
- `picks.number` otomatik verilir (serinin en büyük numarası + 1). Kullanıcı istemedikçe değiştirme.
- **Kapak (1. slayt):** `bg` tam ekran fotoğraf (karartılır), büyük `title` (x 90, size ~120, beyaz), vurgulanacak kısım `emph` ile verilir ve slaydın `accent` renginde (varsayılan altın `#C9A35B`) çizilir. `emph` birden fazla kelime ya da tam bir satır olabilir. Altta kısa bir `text` (size ~50, weight 600).
- **Seçki sayfası:** sol üstte logo `image` (x 55, y 112, 145×145, kırpmadan sığar), yanında aracın adı büyük harfle `title` (x 226, size ~46, weight 700, `emph` = tüm metin, böylece `accent` renginde), altında tek cümle `text` (size ~44), `window` (Mac pencere çerçevesi + ekran görüntüsü; x 76, y 393, 925×551), açıklama `text`, en altta `pill` (CTA hapı, ortalı, zemini accent'in koyusu, metin beyaz).
- `accent` slayt başına seçilir: aracın marka rengi (ör. JetBrains magenta, Raycast kırmızı). Kapakta null bırak (altın).
- Metin rengi varsayılan beyaz; `fill` yalnızca gerekirse. `weight` null ise başlık 800, metin 400, hap 700.
- Kenar boşluğu 76 px. Metin kutudan taşarsa editör uyarır; `h`'yi büyüt ya da metni kısalt.

### style: "pixel" (krem, pixel-art)
Kenar boşluğu 72 px. Üstte ~140 px header alanı var (`header.world` + `header.topic`), oraya öğe koyma. `emph` turuncu kutu olur. Başlık 88–110 px, metin 40–56 px. `window`/`pill`/`fill`/`weight` bu stilde kullanılmaz.

## scenes.js (reel üst yarısı)
Dosya bir fonksiyon gövdesidir. `h` ile yardımcıları alır, sahne fonksiyonlarını dizi olarak **döndürür**:
```js
const { g, W, TOP, COL, SANS, MONO, text, agent, chip, label, dashed, packet, laptop, teaGlass,
        paper, bubble, folder, task, arrowDown, rr, sprite, clamp, eo, eio, back, lerp, shade, cue } = h;
function scene1(t, lt, a) { g.globalAlpha = a; /* … */ }
function scene2(t, lt, a) { g.globalAlpha = a; /* … */ }
return [scene1, scene2];
```
- `t`: global saniye, `lt`: sahne içi saniye, `a`: sahne opaklığı (0.28 sn crossfade). Dizideki sıra = `scenes` ve caption `scene` numarası.
- Çizim alanı üst yarı: 1080×960. Header (sol üst chip + konu) ve sahnenin sağ üst chip'i otomatik çizilir. y < 140'a çizme. y≈900'ün altına önemli bir şey koyma, caption pill'i orada.
- Sahne 1 (hook): animasyonsuz başlar, frame 0'da her şey görünür. Büyük başlık y≈240, 108 px, ikinci yarısı orange.
- Animasyon dili: `back` ile pop-in, `eio` ile hareket, kesikli bağlantı çizgileri (`dashed`), çizgi boyunca giden kare paketler (`packet`). Her ~2 sn'de bir yeni mikro olay olsun. Sahne içi olayları `cue('caption metni')` ile caption'a senkronla.
- Yardımcılar: `agent(cx, altY, px, renk, t, {blinkSeed, bob, crown, alpha})`, `laptop(cx, altY, ölçek, t)`, `teaGlass(cx, altY, ölçek, t)`, `paper(cx, cy, ölçek, {check})`, `bubble(cx, cy, ölçek, renk, t, {text})`, `folder(cx, cy, ölçek, yol)`, `task(cx, cy, ölçek, renk)`, `arrowDown(cx, y1, y2, renk)`, `chip(metin, x, y, {bg, size, align})`, `label(metin, cx, y)`, `text(s, x, y, size, color, font, weight, align)`.
- Renkler yalnızca `COL`'dan: bg, grid, ink, mute, orange, sage, lav, sky, gold, line, card.
- Hata atan sahne önizlemede kırmızı uyarı olarak görünür ve export durur. Değişiklikten sonra parantezleri ve `return [...]` satırını kontrol et.
