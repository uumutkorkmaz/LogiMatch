import { DISPLAY_TIME_ZONE } from '@logimatch/shared';

/** UTC ISO zamanı Europe/Istanbul diliminde gösterir. */
export function formatDateTime(isoUtc: string | null | undefined, locale = 'tr-TR'): string {
  if (!isoUtc) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoUtc));
}

export function formatDate(isoUtc: string | null | undefined, locale = 'tr-TR'): string {
  if (!isoUtc) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: 'medium',
  }).format(new Date(isoUtc));
}

/** Tutar API'den string (Decimal) gelir; gösterim için formatlanır, hesap yapılmaz. */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: 'TRY' | 'EUR' | 'USD' = 'TRY',
  locale = 'tr-TR',
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatNumber(n: number | null | undefined, locale = 'tr-TR', digits = 0): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
}

export function formatKm(km: number | null | undefined, locale = 'tr-TR'): string {
  return km === null || km === undefined ? '—' : `${formatNumber(km, locale)} km`;
}

/** "İstanbul (Tuzla)" */
export function place(city: string, district?: string | null, country?: string): string {
  const base = district ? `${city} (${district})` : city;
  return country && country !== 'TR' ? `${base}, ${country}` : base;
}

/** Datetime-local input değeri ↔ ISO (kullanıcı İstanbul saatiyle girer). */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return parts.replace(' ', 'T');
}

export function fromLocalInput(value: string): string {
  // Europe/Istanbul sabit UTC+3 (yaz saati uygulaması yok).
  return new Date(`${value}:00+03:00`).toISOString();
}

export function scoreTone(score: number): 'success' | 'info' | 'warning' {
  return score >= 75 ? 'success' : score >= 55 ? 'info' : 'warning';
}

/** API'nin imzalı dosya URL'ini aynı origin'deki proxy'ye çevirir (API dışarı açık olmak zorunda değil). */
export function fileHref(url: string): string {
  const i = url.indexOf('/api/v1/files');
  return i >= 0 ? `/api/proxy/files${url.slice(i + '/api/v1/files'.length)}` : url;
}
