/** Canvas yalnızca yüklenmiş fontları kullanır; ilk çizimden önce bekle. */
export async function ensureFonts(doc: Document = document): Promise<void> {
  const specs = [600, 700, 800, 900]
    .map((w) => `${w} 40px "Inter Display"`)
    .concat([400, 500, 600, 700, 800].map((w) => `${w} 40px "Inter"`))
    .concat(['400 26px "DejaVu Sans Mono"', '800 26px "DejaVu Sans Mono"']);
  await Promise.all(specs.map((s) => doc.fonts.load(s, 'AaÇçĞğİıÖöŞşÜü')));
  await doc.fonts.ready;
}
