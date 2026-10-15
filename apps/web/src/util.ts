const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });

/** "3 gün önce" gibi göreli zaman. */
export function ago(ms: number) {
  const s = (ms - Date.now()) / 1000;
  if (Math.abs(s) < 60) return 'az önce';
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (Math.abs(s) < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (Math.abs(s) < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}

export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
export const count = (n: number) => compact.format(n);
